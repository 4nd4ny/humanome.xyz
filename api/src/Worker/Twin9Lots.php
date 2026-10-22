<?php

declare(strict_types=1);

namespace Humanome\Worker;

use Humanome\Twin9\AnthropicBatches;
use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\BatchApi;
use Humanome\Twin9\CallJournal;
use Humanome\Twin9\Fournisseurs\Fournisseurs;
use Humanome\Twin9\RunCosts;
use Humanome\Twin9\RunKey;
use Humanome\Twin9\RunRepository;
use Humanome\Twin9\SoldeInsuffisantException;
use PDO;
use Twin9\Run\Call;

/**
 * Twin9's batch lane (ADR-011 §3, Twin_v9's docs/plan-twin9-php.md, T8): the
 * calls a run waits for leave together through Anthropic's Message Batches
 * API, at half price; a slice submits the batch, a later one collects it.
 *
 * - A batch is bounded (about ten megabytes) and written as its calls come;
 *   each request carries a short fingerprint of its call's id (custom_id),
 *   which the journal keeps with the batch.
 * - Before a run's first batch, a minimal direct call per combination of
 *   model and settings checks that the API accepts it: a batch is validated
 *   only once it has ended, hours later.
 * - A batch's row is written before it leaves: one whose answer was lost is
 *   found again among the workspace's batches, by its size and its time, then
 *   by its custom_ids; never submitted twice.
 * - An ended batch is collected: each answer goes to the journal, its cost
 *   the usage at half price; a request in error leaves again in a next batch,
 *   its attempt spent (the v9.8's three, then a failure), an expired one too,
 *   its attempt given back. Then the batch is deleted at Anthropic, which
 *   would keep it 29 days otherwise.
 * - The batches of a run no longer in progress are cancelled, then deleted.
 * - Each call holds its worst case, at half price, when its batch is written
 *   (T10, RunCosts): a batch holds no more than its run's budget and its
 *   owner's credit leave room for, the rest waits for a next one.
 * - The batches of an account erased, submitted with the instance's key, are
 *   cancelled and deleted from twin9_lots_a_effacer.
 * - In a mixed run (P1-5), only Anthropic's calls go by batches, at most
 *   one submission a run and a slice, at its head, before its direct calls
 *   leave; while its requests wait, the slice reads the direct calls in
 *   flight. A suspension of another provider never holds its batches back.
 *
 * No transaction stays open while Anthropic answers. Logging: counters only.
 */
final class Twin9Lots
{
    /** A batch's bound, in bytes: about ten megabytes. */
    public const OCTETS = 10_000_000;

    /** What a run's page reads while its batches are at Anthropic. */
    public const EN_COURS = 'lot en cours chez Anthropic';

    /** … while some of its calls are still to submit (the slice ended meanwhile, or the tick died). */
    public const A_SOUMETTRE = 'lots à soumettre';

    /** … while a batch whose answer was lost is looked for. */
    public const PERDU = 'lot à retrouver chez Anthropic';

    /** The time a submission needs at least, in seconds; a quarter of a shorter slice. */
    private const TEMPS_SOUMISSION = 8.0;

    /**
     * How far from its submission a lost batch is looked for, in seconds
     * (Anthropic's clock is another); past it, not found, it never left.
     */
    public const FENETRE = 600.0;

    private const ENVELOPPE = '{"requests":[]}';

    public function __construct(
        private readonly PDO $pdo,
        private readonly BatchApi $api,
        private readonly RunKey $cles,
        private readonly RunCosts $couts,
        private readonly int $octets = self::OCTETS,
        private readonly float $fenetre = self::FENETRE,
    ) {
    }

    /** A call's custom_id: a short fingerprint of its id, which the API limits to 64 letters, digits, - and _. */
    public static function customId(string $appel): string
    {
        return substr(hash('sha256', $appel), 0, 32);
    }

    /**
     * A run's batches at Anthropic, before the slice opens it: an ended batch
     * is collected, a collected one deleted, a lost one looked for. Whether
     * the slice must play the run: answers came, nothing is at Anthropic any
     * more, or calls are still to submit.
     *
     * @param array<string, int> $compteurs the slice's
     * @return array{jouer: bool, attente: string|null}
     */
    public function relever(int $runId, int $userId, ?string $attente, float $fin, array &$compteurs): array
    {
        $jouer = $attente === self::A_SOUMETTRE;
        $enVol = 0;
        $raison = null;
        foreach ($this->lots('l.run_id = ? AND l.statut IN ("soumission", "en_cours", "releve")', [$runId]) as $lot) {
            $cle = $this->cles->pour($userId, $lot['cle']);
            if ($cle === null || microtime(true) >= $fin) {
                $raison = $cle === null ? 'clé Anthropic indisponible' : null;
                $enVol += $lot['statut'] === 'releve' ? 0 : 1;
                continue;
            }
            if ($lot['statut'] === 'soumission') {
                $issue = $this->retrouver($lot, $cle, $fin);
                if ($issue === 'abandonne') {
                    $jouer = true;
                    continue;
                }
                if ($issue === 'attendre') {
                    $enVol++;
                    $raison = self::PERDU;
                    continue;
                }
                $lot['statut'] = 'en_cours';
                $lot['lot'] = $issue;
            }
            if ($lot['statut'] === 'en_cours') {
                $issue = $this->achever($lot, $cle, $fin, $compteurs);
                if ($issue === null) {
                    $enVol++;
                    continue;
                }
                $jouer = true;
                if ($issue === 'rendu') {
                    continue;
                }
            }
            $this->supprimer($lot, $cle, $fin, true);
        }

        return ['jouer' => $jouer || $enVol === 0,
                'attente' => $enVol === 0 ? null : ($raison ?? self::EN_COURS)];
    }

    /**
     * The calls a run waits for by batches, into bounded batches; before its
     * first batch, its settings are checked. Each request to Anthropic is
     * bounded by the slice's last departure, and before each one the slice
     * reads the direct calls in flight ($pendant: Twin9Slice), which would
     * otherwise wait for it.
     *
     * @param array<string, int> $compteurs the slice's
     * @param (\Closure(): void)|null $pendant reads the direct calls in flight, between two requests
     * @return string|null why the run fails (the API refuses its settings or its batch), or null
     */
    public function soumettre(Twin9Run $run, float $debut, float $dernierDepart, float $fin, array &$compteurs,
                              ?\Closure $pendant = null): ?string
    {
        $avantLaFin = min(self::TEMPS_SOUMISSION, 0.25 * ($fin - $debut));
        // a request waits until the slice's last departure at the latest: the direct calls in flight then have the
        // rest of it to come back
        $borne = $dernierDepart;
        $pendant ??= static function (): void {
        };
        $run->passeSoumise = max(1, $run->passes);
        if ($run->horsDuree()) {
            $run->bloque = RunCosts::DUREE;
            $run->attenteLots = $this->enVol($run->id) > 0 ? self::EN_COURS : null;

            return null;
        }
        $candidats = $this->candidats($run);
        if ($candidats === []) {
            $run->attenteLots = $this->enVol($run->id) > 0 ? self::EN_COURS : null;

            return null;
        }
        $cle = $this->cles->pour($run->userId, $run->cle);
        if ($cle === null) {
            $run->suspendre('lots', 'clé Anthropic indisponible');

            return null;
        }
        // a tick that dies before its batches have left leaves its run to play again
        $this->pdo->prepare('UPDATE twin9_runs SET attente = ? WHERE id = ?')->execute([self::A_SOUMETTRE, $run->id]);
        $run->attenteLots = self::A_SOUMETTRE;
        if (!$this->dejaSoumis($run->id)) {
            $refus = $this->verifier($run, $cle, $dernierDepart, $borne, $compteurs, $pendant);
            if ($refus !== null || $run->suspendu('lots')) {
                return $refus;
            }
        }
        // the room the owner's credit leaves, with the instance's key, and what their other runs in progress may
        // still spend of it, read together (T8); the budget's is the run's to count
        ['solde' => $solde, 'autres' => $autres] = $run->credits()
            ? (new RunRepository($this->pdo))->disponible($run->userId, $run->id) : ['solde' => null, 'autres' => 0];
        $corps = '';
        $membres = [];
        foreach ($candidats as [$call, $tentative, $detenu]) {
            $reglage = $run->reglages->pour($call->step, $call->id);
            // a call already holding its worst case goes with it; a new one holds its own, if there is room
            $reserve = null;
            if ($detenu === null) {
                if ($run->bloque !== null) {
                    continue;
                }
                $reserve = $this->couts->pireCas(Fournisseurs::DEFAUT, $reglage['modele'], $call->prompt,
                    $reglage['budget_sortie'], true, $run->credits());
                if ($reserve === null) {
                    return 'aucun prix pour ' . $reglage['modele'] . ' sur cette instance';
                }
                // never into the merge's reserve for a day's call, nor into what the owner's other runs may
                // still spend (T8)
                $retenue = $run->retenue($call, $reserve, $solde, $autres);
                if ($retenue !== null) {
                    $run->bloque = $retenue;
                    continue;
                }
            }
            $ligne = json_encode(['custom_id' => self::customId($call->id),
                                  'params' => AnthropicCaller::params($reglage['modele'], $call->prompt,
                                      $reglage['budget_sortie'], $reglage['reflexion'], $reglage['effort'])],
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
            if ($membres !== [] && \strlen(self::ENVELOPPE) + \strlen($corps) + 1 + \strlen($ligne) > $this->octets) {
                $refus = $this->envoyer($run, $cle, $corps, $membres, $fin - $avantLaFin, $borne, $compteurs, $pendant);
                if ($refus !== null || $run->suspendu('lots')) {
                    return $refus;
                }
                $corps = '';
                $membres = [];
            }
            $corps .= ($corps === '' ? '' : ',') . $ligne;
            $membres[] = [$call, $reglage['modele'], $tentative, $reserve];
            if ($reserve !== null) {
                $run->engage += $reserve;
                $solde = $solde === null ? null : $solde - $reserve;
            }
        }
        $refus = $this->envoyer($run, $cle, $corps, $membres, $fin - $avantLaFin, $borne, $compteurs, $pendant);
        if ($refus === null && !$run->suspendu('lots')) {
            $run->attenteLots = $this->enVol($run->id) > 0 ? self::EN_COURS : null;
        }

        return $refus;
    }

    /**
     * The batches of runs no longer in progress (cancelled, failed, done):
     * cancelled at Anthropic, their calls given back, then deleted once
     * ended; a lost one, once found, deleted.
     *
     * @param array<string, int> $compteurs the slice's
     * @param int|null $utilisateur those of one user's runs only, when the page of their run advances them (T9)
     */
    public function menage(float $fin, array &$compteurs, ?int $utilisateur = null): void
    {
        $sien = $utilisateur === null ? '' : ' AND r.user_id = ?';
        $params = $utilisateur === null ? [] : [$utilisateur];
        $this->pdo->prepare(
            'DELETE l FROM twin9_lots l JOIN twin9_runs r ON r.id = l.run_id
              WHERE l.statut = "supprime" AND r.statut <> "en_cours"' . $sien
        )->execute($params);
        if ($utilisateur === null) {
            $this->effacer($fin, $compteurs);
        }
        foreach ($this->lots('r.statut <> "en_cours"' . $sien, $params, 20) as $lot) {
            if (microtime(true) >= $fin) {
                return;
            }
            $cle = $this->cles->pour($lot['user_id'], $lot['cle']);
            if ($cle === null) {
                continue;
            }
            if ($lot['statut'] === 'soumission') {
                $issue = $this->retrouver($lot, $cle, $fin);
                if ($issue === 'attendre' || $issue === 'abandonne') {
                    continue;
                }
                $lot['statut'] = 'releve'; // found once ended: nothing left to cancel
                $lot['lot'] = $issue;
            }
            if ($lot['statut'] === 'en_cours') {
                $issue = $this->api->annuler($cle, (string) $lot['lot'], $fin);
                if (!$issue['ok'] && !\in_array($issue['http'] ?? null, [400, 404, 409], true)) {
                    continue; // to cancel at the next slice
                }
                (new CallJournal($this->pdo, $lot['run_id']))->rendreLeLot($lot['id']);
                $this->pdo->prepare('UPDATE twin9_lots SET statut = "annulation" WHERE id = ?')->execute([$lot['id']]);
                // its calls given back, what they held goes back too
                $compteurs['depassements'] = ($compteurs['depassements'] ?? 0) + $this->couts->liberer($lot['run_id']);
                $compteurs['annules']++;
                $lot['statut'] = 'annulation';
            }
            if ($lot['statut'] === 'annulation') {
                $etat = $this->api->etat($cle, (string) $lot['lot'], $fin);
                $fini = $etat['ok'] ? ($etat['lot']['processing_status'] ?? '') === 'ended' : ($etat['http'] ?? null) === 404;
                if (!$fini) {
                    continue;
                }
            }
            $this->supprimer($lot, $cle, $fin, false);
        }
    }

    /**
     * The batches of accounts erased, submitted with the instance's key
     * (twin9_lots_a_effacer): cancelled while in progress, deleted once
     * ended; gone, forgotten.
     *
     * @param array<string, int> $compteurs the slice's
     */
    private function effacer(float $fin, array &$compteurs): void
    {
        $lots = $this->pdo->query('SELECT lot FROM twin9_lots_a_effacer ORDER BY depose_at, lot LIMIT 20')
            ->fetchAll(PDO::FETCH_COLUMN);
        if ($lots === []) {
            return;
        }
        $cle = $this->cles->pour(0, 'instance');
        if ($cle === null) {
            return;
        }
        foreach ($lots as $lot) {
            if (microtime(true) >= $fin) {
                return;
            }
            $etat = $this->api->etat($cle, (string) $lot, $fin);
            if (!$etat['ok'] && ($etat['http'] ?? null) !== 404) {
                continue;
            }
            if ($etat['ok'] && ($etat['lot']['processing_status'] ?? '') !== 'ended') {
                $this->api->annuler($cle, (string) $lot, $fin);
                $compteurs['annules']++;
                continue;
            }
            if ($etat['ok'] && !$this->api->supprimer($cle, (string) $lot, $fin)['ok']) {
                continue;
            }
            $this->pdo->prepare('DELETE FROM twin9_lots_a_effacer WHERE lot = ?')->execute([(string) $lot]);
        }
    }

    /**
     * A batch at Anthropic: ended, it is collected; gone (404), its calls are
     * given back.
     *
     * @param array<string, mixed> $lot
     * @param array<string, int> $compteurs
     * @return 'releve'|'rendu'|null collected, given back, or still at Anthropic
     */
    private function achever(array $lot, string $cle, float $fin, array &$compteurs): ?string
    {
        $etat = $this->api->etat($cle, (string) $lot['lot'], $fin);
        if (!$etat['ok']) {
            if (($etat['http'] ?? null) !== 404) {
                return null;
            }
            (new CallJournal($this->pdo, $lot['run_id']))->rendreLeLot($lot['id']);
            $this->pdo->prepare('DELETE FROM twin9_lots WHERE id = ?')->execute([$lot['id']]);

            return 'rendu';
        }
        if (($etat['lot']['processing_status'] ?? '') !== 'ended') {
            return null;
        }

        return $this->collecter($lot, $cle, $fin, $compteurs) ? 'releve' : null;
    }

    /**
     * An ended batch's results into the journal. Interrupted by the slice's
     * end, the next slice reads them again: a call already written is left as
     * it is.
     *
     * @param array<string, mixed> $lot
     * @param array<string, int> $compteurs
     */
    private function collecter(array $lot, string $cle, float $fin, array &$compteurs): bool
    {
        $resultats = $this->api->resultats($cle, (string) $lot['lot'], $fin);
        if (!$resultats['ok']) {
            return false;
        }
        $journal = new CallJournal($this->pdo, $lot['run_id']);
        $appels = $journal->duLot($lot['id']);
        foreach (AnthropicBatches::lignes((string) $resultats['jsonl']) as $ligne) {
            $customId = (string) ($ligne['custom_id'] ?? '');
            $appel = $appels[$customId] ?? null;
            if ($appel === null || $appel['statut'] !== 'envoye') {
                continue;
            }
            if (microtime(true) >= $fin) {
                return false;
            }
            $this->inscrire($journal, $appel, (array) ($ligne['result'] ?? []), $lot['cle'] === 'instance', $compteurs);
            $appels[$customId]['statut'] = 'inscrit';
        }
        foreach ($appels as $appel) {
            if ($appel['statut'] === 'envoye') { // no result for it: it leaves again
                $journal->aResoumettre($appel['appel'], $appel['tentatives'] - 1);
                $compteurs['reprises']++;
            }
        }
        $this->pdo->prepare('UPDATE twin9_lots SET statut = "releve", fini_at = NOW(3) WHERE id = ?')->execute([$lot['id']]);
        $compteurs['releves']++;

        return true;
    }

    /**
     * One result of a batch, as a direct call's outcome is written: its real
     * cost at half price, the margin included with the instance's key.
     *
     * @param array{appel: string, tentatives: int, modele: string} $appel
     * @param array<string, mixed> $resultat
     * @param array<string, int> $compteurs
     */
    private function inscrire(CallJournal $journal, array $appel, array $resultat, bool $marge,
                              array &$compteurs): void
    {
        $type = $resultat['type'] ?? null;
        if ($type === 'succeeded' && \is_array($resultat['message'] ?? null)) {
            $lu = AnthropicCaller::lireMessage($resultat['message']);
            $mesure = ['modele_servi' => $lu['modele_servi'], 'stop_reason' => $lu['stop_reason'],
                       'tokens_in' => $lu['tokens_in'], 'tokens_out' => $lu['tokens_out'],
                       'cout_microusd' => $this->couts->cout(Fournisseurs::DEFAUT, $appel['modele'], $lu['tokens_in'],
                           $lu['tokens_out'], true, $marge)];
            if ($lu['ok']) {
                $journal->reponseDuLot($appel['appel'], $lu['texte'], $mesure);
                $compteurs['reponses']++;
            } else { // refused or cut (P0-2): a failure, never submitted again
                $journal->panneDuLot($appel['appel'], (string) ($lu['erreur'] ?? 'refus du modèle'), $mesure);
                $compteurs['pannes']++;
                if (!empty($lu['tronque'])) {
                    $compteurs['tronques']++;
                }
            }

            return;
        }
        if ($type === 'errored') {
            if ($appel['tentatives'] >= Twin9Slice::TENTATIVES) {
                $journal->panneDuLot($appel['appel'], 'échec après ' . Twin9Slice::TENTATIVES . ' tentatives : erreur du '
                    . 'fournisseur (' . self::typeErreur($resultat['error'] ?? null) . ')');
                $compteurs['pannes']++;
            } else {
                $journal->aResoumettre($appel['appel'], $appel['tentatives']);
                $compteurs['reprises']++;
            }

            return;
        }
        // expired or canceled: it never reached the model, its attempt is given back
        $journal->aResoumettre($appel['appel'], $appel['tentatives'] - 1);
        $compteurs['reprises']++;
    }

    /**
     * A batch whose answer was lost: looked for among the workspace's
     * batches by its size and its time, and taken back, once ended, if its
     * custom_ids are its calls'. Not found long after its submission, it never
     * reached Anthropic: its calls leave again.
     *
     * @param array<string, mixed> $lot
     * @return string Anthropic's id of the batch found, 'attendre', or 'abandonne'
     */
    private function retrouver(array $lot, string $cle, float $fin): string
    {
        $soumis = (float) $lot['soumis'];
        $liste = $this->api->lister($cle, $soumis - $this->fenetre, $fin);
        if (!$liste['ok']) {
            return 'attendre';
        }
        $connus = array_flip($this->pdo->query('SELECT lot FROM twin9_lots WHERE lot IS NOT NULL')
            ->fetchAll(PDO::FETCH_COLUMN));
        $candidats = [];
        foreach ($liste['lots'] ?? [] as $l) {
            $id = (string) ($l['id'] ?? '');
            $cree = AnthropicBatches::instant($l['created_at'] ?? null);
            if ($id === '' || isset($connus[$id]) || $cree === null || abs($cree - $soumis) > $this->fenetre
                || array_sum(array_map(intval(...), (array) ($l['request_counts'] ?? []))) !== $lot['requetes']) {
                continue;
            }
            $candidats[] = [abs($cree - $soumis), $l];
        }
        usort($candidats, static fn (array $a, array $b): int => $a[0] <=> $b[0]);
        $journal = new CallJournal($this->pdo, $lot['run_id']);
        $nos = array_keys($journal->duLot($lot['id']));
        sort($nos, SORT_STRING);
        foreach ($candidats as [, $l]) {
            if (($l['processing_status'] ?? '') !== 'ended') {
                return 'attendre'; // its custom_ids are read once it has ended
            }
            $resultats = $this->api->resultats($cle, (string) $l['id'], $fin);
            if (!$resultats['ok']) {
                return 'attendre';
            }
            $siens = [];
            foreach (AnthropicBatches::lignes((string) $resultats['jsonl']) as $ligne) {
                $siens[] = (string) ($ligne['custom_id'] ?? '');
            }
            sort($siens, SORT_STRING);
            if ($siens === $nos) {
                $this->pdo->prepare('UPDATE twin9_lots SET lot = ?, statut = "en_cours" WHERE id = ?')
                    ->execute([(string) $l['id'], $lot['id']]);

                return (string) $l['id'];
            }
        }
        if (microtime(true) - $soumis < $this->fenetre) {
            return 'attendre';
        }
        $journal->rendreLeLot($lot['id']);
        $this->pdo->prepare('DELETE FROM twin9_lots WHERE id = ?')->execute([$lot['id']]);

        return 'abandonne';
    }

    /**
     * Each combination of model and settings the run sends by batches, by a
     * minimal direct call; before each, the slice reads the direct calls in
     * flight ($pendant).
     *
     * @param float $borne when a check must be done at the latest
     * @param array<string, int> $compteurs
     * @param \Closure(): void $pendant
     * @return string|null why the run fails, or null
     */
    private function verifier(Twin9Run $run, string $cle, float $dernierDepart, float $borne, array &$compteurs,
                              \Closure $pendant): ?string
    {
        foreach ($run->reglages->combinaisons('lots') as $reglage) {
            $pendant();
            if (microtime(true) >= $dernierDepart) {
                $run->suspendre('lots');

                return null;
            }
            $issue = $this->api->verifier($cle, $reglage, $borne);
            $compteurs['verifications']++;
            if ($issue['ok']) {
                continue;
            }
            $http = $issue['http'] ?? null;
            if ($http === 400) {
                return 'l\'API refuse les réglages de ' . $reglage['modele'] . ' : ' . ($issue['erreur'] ?? 'HTTP 400');
            }
            $run->suspendre('lots', $http === 401 || $http === 403 ? 'clé Anthropic refusée'
                : 'vérification des réglages : ' . ($issue['erreur'] ?? 'fournisseur indisponible'));

            return null;
        }

        return null;
    }

    /**
     * One batch: its row and its calls written, each new worst case debited
     * from the owner's credits with the instance's key, in one transaction;
     * then it leaves. Refused, it did not leave: its calls wait again,
     * holding their worst cases. Without an answer, it may have left all the
     * same: it is to find.
     *
     * @param list<array{0: Call, 1: string, 2: int, 3: int|null}> $membres each call, its model, its attempt and the
     *                                                                       worst case it newly holds
     * @param float $dernier the latest a batch may leave in this slice
     * @param float $borne when its submission must be answered at the latest
     * @param array<string, int> $compteurs
     * @param \Closure(): void $pendant reads the direct calls in flight (Twin9Slice)
     * @return string|null why the run fails, or null
     */
    private function envoyer(Twin9Run $run, string $cle, string $corps, array $membres, float $dernier, float $borne,
                             array &$compteurs, \Closure $pendant): ?string
    {
        if ($membres === []) {
            return null;
        }
        if (microtime(true) > $dernier) {
            $run->suspendre('lots');

            return null;
        }
        $corps = '{"requests":[' . $corps . ']}';
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare(
                'INSERT INTO twin9_lots (run_id, statut, cle, requetes, octets, soumis_at) VALUES (?, "soumission", ?, ?, ?, NOW(3))'
            )->execute([$run->id, $run->cle, \count($membres), \strlen($corps)]);
            $lotId = (int) $this->pdo->lastInsertId();
            foreach ($membres as [$call, $modele, $tentative, $reserve]) {
                if ($reserve !== null && $run->credits()) {
                    $this->couts->debiter($run->userId, $run->id, $call->step, $modele, $reserve);
                }
                $run->journal->envoye($call, $modele, $tentative, $lotId, self::customId($call->id), $reserve);
            }
            $this->pdo->commit();
        } catch (SoldeInsuffisantException) {
            // the credit moved meanwhile: the batch waits for a next slice
            $this->pdo->rollBack();
            $run->journal->oublier();
            $run->bloque = RunCosts::CREDIT;
            $run->suspendre('lots');

            return null;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            $run->journal->oublier();
            throw $e;
        }
        $run->envoyes += \count($membres);
        // its row and its calls written, the transaction closed: the direct calls in flight are read first
        $pendant();
        $issue = $this->api->creer($cle, $corps, max(microtime(true) + 0.1, $borne));
        if ($issue['ok']) {
            $this->pdo->prepare('UPDATE twin9_lots SET lot = ?, statut = "en_cours" WHERE id = ?')
                ->execute([(string) $issue['lot']['id'], $lotId]);
            $compteurs['lots']++;
            $compteurs['appels'] += \count($membres);

            return null;
        }
        $http = $issue['http'] ?? null;
        $run->suspendre('lots');
        if ($http === null) {
            $run->attenteLots = self::PERDU;

            return null;
        }
        $run->journal->rendreLeLot($lotId);
        $this->pdo->prepare('DELETE FROM twin9_lots WHERE id = ?')->execute([$lotId]);
        if ($http === 401 || $http === 403) {
            $run->attenteLots = 'clé Anthropic refusée';
        } elseif ($http === 429 || $http === 529) {
            $run->attenteLots = 'débit du fournisseur';
        } elseif ($http >= 400 && $http < 500) {
            return 'lot refusé par l\'API (HTTP ' . $http . ')';
        } else {
            $run->attenteLots = 'fournisseur indisponible';
        }

        return null;
    }

    /**
     * Deletes a collected or cancelled batch at Anthropic. A run in progress
     * keeps its row (its batches are counted when it ends); another's goes.
     *
     * @param array<string, mixed> $lot
     */
    private function supprimer(array $lot, string $cle, float $fin, bool $enCours): void
    {
        if (!$this->api->supprimer($cle, (string) $lot['lot'], $fin)['ok']) {
            if ($lot['statut'] !== 'releve' && $lot['statut'] !== 'annulation') {
                $this->pdo->prepare('UPDATE twin9_lots SET statut = "releve" WHERE id = ?')->execute([$lot['id']]);
            }

            return; // deleted at a next slice
        }
        $this->pdo->prepare($enCours ? 'UPDATE twin9_lots SET statut = "supprime" WHERE id = ?'
            : 'DELETE FROM twin9_lots WHERE id = ?')->execute([$lot['id']]);
    }

    /**
     * The calls of a run's pass that go into batches: Anthropic's, its lane
     * « lots » (CallSettings::pour()) — another provider's leave directly —,
     * of the days it leads abreast, neither answered, failed, nor in a batch
     * already.
     *
     * @return list<array{0: Call, 1: int, 2: int|null}> each call with its attempt and the worst case it holds
     */
    private function candidats(Twin9Run $run): array
    {
        $jours = $run->joursDeFront();
        $candidats = [];
        $vus = [];
        foreach ($run->attendus as $call) {
            $jour = Twin9Run::jour($call->id);
            if (isset($vus[$call->id]) || ($jour !== null && !isset($jours[$jour]))
                || $run->reglages->pour($call->step, $call->id)['voie'] !== 'lots') {
                continue;
            }
            $vus[$call->id] = true;
            $tentative = 1;
            $detenu = null;
            $etat = $run->journal->etat($call->id);
            if ($etat !== null && $etat['sha256'] === $call->sha256) {
                if (\in_array($etat['statut'], ['repondu', 'panne', 'envoye'], true)) {
                    continue;
                }
                $tentative = $etat['tentatives'] + 1;
                $detenu = $etat['reserve'];
            }
            $candidats[] = [$call, $tentative, $detenu];
        }

        return $candidats;
    }

    private function dejaSoumis(int $runId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM twin9_lots WHERE run_id = ? LIMIT 1');
        $stmt->execute([$runId]);

        return $stmt->fetchColumn() !== false;
    }

    /** A run's batches at Anthropic, or whose submission is under way. */
    public function enVol(int $runId): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM twin9_lots WHERE run_id = ? AND statut IN ("soumission", "en_cours")');
        $stmt->execute([$runId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * Batches, with their run's owner.
     *
     * @param list<mixed> $params
     * @return list<array{id: int, run_id: int, user_id: int, lot: string|null, statut: string, cle: string,
     *                    requetes: int, soumis: float}>
     */
    private function lots(string $ou, array $params, int $max = 1000): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT l.id, l.run_id, r.user_id, l.lot, l.statut, l.cle, l.requetes, UNIX_TIMESTAMP(l.soumis_at) AS soumis
               FROM twin9_lots l JOIN twin9_runs r ON r.id = l.run_id
              WHERE ' . $ou . ' ORDER BY l.id LIMIT ' . $max
        );
        $stmt->execute($params);

        return array_map(static fn (array $l): array => [
            'id' => (int) $l['id'], 'run_id' => (int) $l['run_id'], 'user_id' => (int) $l['user_id'],
            'lot' => $l['lot'] === null ? null : (string) $l['lot'], 'statut' => (string) $l['statut'],
            'cle' => (string) $l['cle'], 'requetes' => (int) $l['requetes'], 'soumis' => (float) $l['soumis'],
        ], $stmt->fetchAll());
    }

    /** The type of an error a batch's result carries ({type: error, error: {type…}}), as a word. */
    private static function typeErreur(mixed $erreur): string
    {
        $type = \is_array($erreur) ? ($erreur['error']['type'] ?? $erreur['type'] ?? null) : null;

        return \is_string($type) && preg_match('/^[a-z_]{1,40}$/', $type) === 1 ? $type : 'erreur';
    }
}
