<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Auth\Audit;
use PDO;

/**
 * An account's Twin9 runs in its export (T10, ADR-011 §5; the archive's
 * `analysesTwin9`, docs/contrats.md §8.5): each run with its settings, its
 * portfolio, its attestation, its journal — the responses, never a prompt
 * (the journal keeps their SHA-256 only), never a key —, its outputs and its
 * evaluation (T8, Evaluations); the memory of each of its maps. A run done
 * keeps its counters only, its journal gone (ADR-011 §5).
 *
 * What the models and the engine wrote passes the leak filter (ADR-010 §2),
 * against every template set its runs took and the fiches of every
 * referential their engine read (T16): a recitation is redacted, the count
 * of redactions goes to the audit. The JSON is written piece by
 * piece, a run or a map at a time.
 */
final class RunExport
{
    private const JSON = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        | JSON_PRESERVE_ZERO_FRACTION;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @param \Closure(string): void $ecrire told each piece of the JSON document {runs, cartes}
     */
    public function ecrire(int $userId, \Closure $ecrire): void
    {
        $stmt = $this->pdo->prepare('SELECT id FROM twin9_runs WHERE user_id = ? ORDER BY id');
        $stmt->execute([$userId]);
        $runs = array_map(intval(...), $stmt->fetchAll(PDO::FETCH_COLUMN));
        $stmt = $this->pdo->prepare('SELECT id FROM twin9_cartes WHERE user_id = ? ORDER BY id');
        $stmt->execute([$userId]);
        $cartes = array_map(intval(...), $stmt->fetchAll(PDO::FETCH_COLUMN));

        $index = Resultats::index($this->gabarits($userId));
        $fuites = 0;
        $ecrire('{"runs":[');
        foreach ($runs as $i => $id) {
            $ecrire(($i > 0 ? ',' : '') . json_encode($this->run($id, $index, $fuites), self::JSON));
        }
        $ecrire('],"cartes":[');
        foreach ($cartes as $i => $id) {
            $ecrire(($i > 0 ? ',' : '') . json_encode($this->carte($id, $index, $fuites), self::JSON));
        }
        $ecrire(']}');
        if ($fuites > 0) {
            Audit::record($this->pdo, $userId, 'twin9_fuite_expurgee', ['export' => true, 'fuites' => $fuites]);
        }
    }

    /**
     * @param array<mixed> $index
     * @return array<string, mixed>
     */
    private function run(int $id, array $index, int &$fuites): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT r.id, c.portfolio AS journal, r.statut, r.attente, r.visibilite, r.reglages, r.portfolio,
                    r.attestation, r.compteurs, r.created_at, r.finished_at, r.accord_at
               FROM twin9_runs r JOIN twin9_cartes c ON c.id = r.carte_id WHERE r.id = ?'
        );
        $stmt->execute([$id]);
        $r = $stmt->fetch();
        $portfolio = json_decode(RunRepository::uncompress((string) $r['portfolio']), true, 512, JSON_THROW_ON_ERROR);

        $stmt = $this->pdo->prepare(
            'SELECT appel, etape, modele, modele_envoye, modele_servi, statut, tentatives, reponse, panne, stop_reason,
                    jetons_entree, jetons_sortie, cout_microusd, duree_ms, envoye_at, repondu_at
               FROM twin9_appels WHERE run_id = ? ORDER BY appel'
        );
        $stmt->execute([$id]);
        $appels = [];
        foreach ($stmt->fetchAll() as $a) {
            $reponse = $a['reponse'] === null ? null : RunRepository::uncompress((string) $a['reponse']);
            $appels[] = [
                'appel' => (string) $a['appel'], 'etape' => (string) $a['etape'], 'modele' => (string) $a['modele'],
                'modele_envoye' => $a['modele_envoye'], 'modele_servi' => $a['modele_servi'],
                'statut' => (string) $a['statut'], 'tentatives' => (int) $a['tentatives'],
                'reponse' => $reponse === null ? null : Resultats::filtrer($index, $reponse, false, $fuites),
                'panne' => $a['panne'], 'stop_reason' => $a['stop_reason'],
                'jetons_entree' => $a['jetons_entree'] === null ? null : (int) $a['jetons_entree'],
                'jetons_sortie' => $a['jetons_sortie'] === null ? null : (int) $a['jetons_sortie'],
                'cout_microusd' => $a['cout_microusd'] === null ? null : (int) $a['cout_microusd'],
                'duree_ms' => $a['duree_ms'] === null ? null : (int) $a['duree_ms'],
                'envoye_at' => $a['envoye_at'], 'repondu_at' => $a['repondu_at'],
            ];
        }

        $sorties = [];
        foreach ((new RunRepository($this->pdo))->sorties($id) as $chemin => $texte) {
            $sorties[$chemin] = Resultats::filtrer($index, $texte, str_ends_with($chemin, '.json'), $fuites);
        }

        return [
            'id' => (int) $r['id'],
            'journal' => (string) $r['journal'],
            'statut' => (string) $r['statut'],
            'attente' => $r['attente'],
            'visibilite' => (string) $r['visibilite'],
            'created_at' => (string) $r['created_at'],
            'finished_at' => $r['finished_at'],
            'accord_at' => $r['accord_at'],
            'attestation' => $r['attestation'] === null ? null : json_decode((string) $r['attestation'], true, 512,
                JSON_THROW_ON_ERROR),
            // the copy of its profile; the engine's settings are drawn from it
            'profil' => json_decode(RunRepository::uncompress((string) $r['reglages']), false, 512,
                JSON_THROW_ON_ERROR)->profil,
            'portfolio' => ['nom' => (string) $portfolio['nom'], 'texte' => (string) $portfolio['texte']],
            'compteurs' => $r['compteurs'] === null ? null : json_decode((string) $r['compteurs'], true, 512,
                JSON_THROW_ON_ERROR),
            'appels' => $appels,
            'sorties' => (object) $sorties,
            'evaluation' => $this->evaluation($id),
        ];
    }

    /**
     * @return array<string, mixed>|null what a run done left to foresee the next ones (T8): sizes, costs, worst
     *         cases, settings
     */
    private function evaluation(int $runId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT reglages, journees, cout_journees_microusd, cout_fusion_microusd, pire_cas_journee_microusd,
                    pire_cas_fusion_microusd, cout_microusd, duree_s, created_at
               FROM twin9_evaluations WHERE run_id = ?'
        );
        $stmt->execute([$runId]);
        $e = $stmt->fetch();
        if ($e === false) {
            return null;
        }

        return [
            'reglages' => json_decode((string) $e['reglages'], true, 64, JSON_THROW_ON_ERROR),
            'journees' => json_decode((string) $e['journees'], true, 64, JSON_THROW_ON_ERROR),
            'cout_journees_microusd' => (int) $e['cout_journees_microusd'],
            'cout_fusion_microusd' => (int) $e['cout_fusion_microusd'],
            'pire_cas_journee_microusd' => $e['pire_cas_journee_microusd'] === null ? null
                : (int) $e['pire_cas_journee_microusd'],
            'pire_cas_fusion_microusd' => $e['pire_cas_fusion_microusd'] === null ? null
                : (int) $e['pire_cas_fusion_microusd'],
            'cout_microusd' => (int) $e['cout_microusd'],
            'duree_s' => (int) $e['duree_s'],
            'created_at' => (string) $e['created_at'],
        ];
    }

    /**
     * @param array<mixed> $index
     * @return array<string, mixed>
     */
    private function carte(int $id, array $index, int &$fuites): array
    {
        $stmt = $this->pdo->prepare('SELECT portfolio, referentiel, gabarits, created_at FROM twin9_cartes WHERE id = ?');
        $stmt->execute([$id]);
        $c = $stmt->fetch();
        $stmt = $this->pdo->prepare('SELECT cle, valeur FROM twin9_memoire WHERE carte_id = ? ORDER BY cle');
        $stmt->execute([$id]);
        $memoire = [];
        foreach ($stmt->fetchAll() as $m) {
            $memoire[(string) $m['cle']] = Resultats::filtrer($index, RunRepository::uncompress((string) $m['valeur']),
                true, $fuites);
        }

        return ['journal' => (string) $c['portfolio'], 'referentiel' => (string) $c['referentiel'],
                'gabarits' => (string) $c['gabarits'], 'created_at' => (string) $c['created_at'],
                'memoire' => (object) $memoire];
    }

    /**
     * Every template its runs took, and every fiche and preamble of the
     * referentials their engine read (T16), once each: what their outputs may
     * recite.
     *
     * @return array<string, string>
     */
    private function gabarits(int $userId): array
    {
        $stmt = $this->pdo->prepare('SELECT gabarits, reglages FROM twin9_runs WHERE user_id = ?');
        $stmt->execute([$userId]);

        return Resultats::textes($stmt->fetchAll());
    }
}
