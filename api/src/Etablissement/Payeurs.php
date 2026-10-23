<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

use Humanome\Twin9\CreditService;
use Humanome\Twin9\Twin9Exception;
use PDO;

/**
 * Who may pay a learner's paid usage — a Twin9 run, a call of the open
 * cartography on credits —, and who does (ADR-013 §4, « Le choix du
 * payeur »).
 *
 * - The possible payers: each of their schools (Ecoles::de(): the accounts
 *   with the `etablissement` habilitation one of whose cohorts counts them,
 *   and themselves when they are a school), and their own remaining balance
 *   (the instance's key, the contribution of private persons; ADR-013 §2 c).
 * - The choice, as a request names it: null (the default), "personnel", or a
 *   school's id. By default, their school when they have only one; with
 *   several, they choose (422 otherwise); with none, their own balance. The
 *   server checks it again: a school that does not pay for them is refused
 *   (422), the `ecole` lane asks for a school with a key, and a school never
 *   pays as a private person (« personnel » refused to it, 422).
 * - A learner of two schools chooses at each launch; nothing is shared
 *   between their schools: each school's cap counts what it pays only.
 * - A run of type `ecole` never falls back on the learner's balance: if its
 *   school no longer pays (encorePaie()), it stops, and its owner chooses
 *   again at its resumption.
 */
final class Payeurs
{
    public const CHOISIR = 'Choisissez qui paie cette analyse : vous êtes membre de plusieurs écoles';

    public const NE_PAIE_PAS = 'Cette école ne paie pas pour vous : vous n’êtes membre d’aucune de ses cohortes';

    public const SANS_CLE = 'Votre école n’a pas de clé : choisissez la clé de l’instance, que paie son crédit';

    public const CLE_SANS_ECOLE = 'La clé d’école demande une école qui paie pour vous';

    public const INVALIDE = 'Payeur invalide : « personnel », l’identifiant d’une de vos écoles, ou null';

    /** A school's balance is its school credit, at its surtax — never at the contribution of private persons. */
    public const ECOLE_PERSONNEL = 'Une école paie ses usages sur son crédit d’école, à sa surtaxe : choisissez votre école';

    /** Why a run of type `ecole` stops when its school no longer pays (ADR-013 §3). */
    public const NE_PAIE_PLUS = 'votre école ne paie plus cette analyse';

    private readonly Ecoles $ecoles;

    public function __construct(private readonly PDO $pdo)
    {
        $this->ecoles = new Ecoles($pdo);
    }

    /**
     * The payer of a Twin9 run, on its lane (its profile's `cle`): checked,
     * its factor frozen.
     *
     * @param mixed $choix the request's `payeur`: null, "personnel" or a school's id
     * @param string $cle "instance" or "ecole"
     * @throws Twin9Exception 422
     */
    public function resoudre(int $userId, mixed $choix, string $cle): Payeur
    {
        if ($choix !== null && $choix !== Payeur::PERSONNEL && !\is_int($choix)) {
            throw new Twin9Exception(self::INVALIDE, 422);
        }
        if ($choix === Payeur::PERSONNEL) {
            // a school pays for itself as a school (ADR-013 §2 d, §4): its own balance is its school credit, at its
            // surtax — possibles() never offers it « personnel », and the server checks it again
            if (Ecole::est($this->pdo, $userId)) {
                throw new Twin9Exception(self::ECOLE_PERSONNEL, 422);
            }
            if ($cle === 'ecole') {
                throw new Twin9Exception(self::CLE_SANS_ECOLE, 422);
            }

            return Payeur::personnel();
        }
        $ecoles = $this->ecoles->de($userId);
        if (\is_int($choix)) {
            $ecole = current(array_filter($ecoles, static fn (array $e): bool => $e['id'] === $choix));
            if ($ecole === false) {
                throw new Twin9Exception(self::NE_PAIE_PAS, 422);
            }
        } else {
            $candidates = $cle === 'ecole'
                ? array_values(array_filter($ecoles, fn (array $e): bool => EcoleCles::presente($this->pdo, $e['id'])))
                : $ecoles;
            if ($candidates === []) {
                if ($cle === 'ecole') {
                    throw new Twin9Exception($ecoles === [] ? self::CLE_SANS_ECOLE : self::SANS_CLE, 422);
                }

                return Payeur::personnel();
            }
            if (\count($candidates) > 1) {
                throw new Twin9Exception(self::CHOISIR, 422);
            }
            $ecole = $candidates[0];
        }
        if ($cle === 'ecole' && !EcoleCles::presente($this->pdo, $ecole['id'])) {
            throw new Twin9Exception(self::SANS_CLE, 422);
        }

        return Payeur::ecole($ecole['id'], $this->ecoles->facteur($ecole['id'], $cle), $ecole['nom']);
    }

    /**
     * The payer of a Twin9 run and the lane of its calls (ADR-013 §2 d, §4,
     * §6), at its launch or at a resumption that names its payer: resolved
     * on the lane its profile asks (resoudre()); then a school that has its
     * own Anthropic key pays with it — nothing to the platform, factor 1.0 —
     * for a run that reaches Anthropic alone, as the open cartography does
     * (pourCartographieOuverte()): the profile's `instance`, its default,
     * says « not my own key », never « not my school's ». A run that reaches
     * another provider stays on the instance's key, its school's credit
     * paying (a school's key serves Anthropic only).
     *
     * @param string $cle the lane the profile asks: "instance" or "ecole"
     * @param list<string> $fournisseurs the providers the run's calls reach (CallSettings::fournisseurs())
     * @return array{payeur: Payeur, cle: string} cle: the lane the run's calls take, "instance" or "ecole"
     * @throws Twin9Exception 422
     */
    public function pourRun(int $userId, mixed $choix, string $cle, array $fournisseurs): array
    {
        $payeur = $this->resoudre($userId, $choix, $cle);
        if ($cle !== 'instance' || !$payeur->estEcole() || $fournisseurs !== EcoleCles::FOURNISSEURS
            || !EcoleCles::presente($this->pdo, (int) $payeur->ecoleId)) {
            return ['payeur' => $payeur, 'cle' => $cle];
        }

        return ['payeur' => Payeur::ecole((int) $payeur->ecoleId, 1.0, (string) $payeur->nom), 'cle' => 'ecole'];
    }

    /**
     * The payer of a call of the open cartography on credits (ADR-013 §4):
     * chosen as a run's is, its lane the school's key when it has one, else
     * the instance's, paid from its credit.
     *
     * @return array{payeur: Payeur, cle: string} cle: "instance" or "ecole"
     * @throws Twin9Exception 422
     */
    public function pourCartographieOuverte(int $userId, mixed $choix): array
    {
        $payeur = $this->resoudre($userId, $choix, 'instance');
        if (!$payeur->estEcole() || !EcoleCles::presente($this->pdo, (int) $payeur->ecoleId)) {
            return ['payeur' => $payeur, 'cle' => 'instance'];
        }

        return ['payeur' => Payeur::ecole((int) $payeur->ecoleId, 1.0, (string) $payeur->nom), 'cle' => 'ecole'];
    }

    /**
     * Whether the school of a run of type `ecole` still pays for it, as each
     * slice reads it (ADR-013 §4): its school exists and holds the
     * habilitation, its owner is still itself or a member of one of its
     * cohorts, its factor is there and, on the `ecole` lane, the school still
     * has its key. Null when it does; why it no longer does otherwise.
     */
    public function encorePaie(int $userId, ?int $ecoleId, string $cle, ?float $facteur): ?string
    {
        if ($ecoleId === null || $facteur === null || !$this->ecoles->paiePour($ecoleId, $userId)) {
            return self::NE_PAIE_PLUS;
        }
        if ($cle === 'ecole' && !EcoleCles::presente($this->pdo, $ecoleId)) {
            return self::NE_PAIE_PLUS . ' : elle a retiré sa clé';
        }

        return null;
    }

    /**
     * What a page offers its user (the launch of a run, the open cartography,
     * the credit page): each of their schools — whether it has a key, what it
     * may still pay for them this month (what remains of their cap; for a
     * school paying for itself, its credit) and, for a learner, whether its
     * credit covers that much (`credit_suffisant`), never its balance: not
     * even bounded by it, which would tell it whenever it is the lower —,
     * and their own balance, when they have one or no school pays for them.
     * The first is the default when there is a single school.
     *
     * @return list<array<string, mixed>>
     */
    public function possibles(int $userId): array
    {
        $mois = Ecoles::mois();
        $credits = new CreditService($this->pdo);
        $possibles = [];
        foreach ($this->ecoles->de($userId) as $ecole) {
            $credit = $credits->balance($ecole['id']);
            $reglages = $this->ecoles->reglages($ecole['id']);
            $engage = $ecole['soi'] ? 0 : $this->ecoles->engage($ecole['id'], $userId, $mois);
            $reste = $ecole['soi'] ? null : max(0, $reglages['plafond_eleve_microusd'] - $engage);
            $possibles[] = [
                'type' => Payeur::ECOLE,
                'id' => $ecole['id'],
                'nom' => $ecole['nom'],
                'soi' => $ecole['soi'],
                'cle' => EcoleCles::presente($this->pdo, $ecole['id']),
                'mois' => $mois,
                'plafond_microusd' => $ecole['soi'] ? null : $reglages['plafond_eleve_microusd'],
                'engage_microusd' => $ecole['soi'] ? null : $engage,
                // what it may still pay for them this month, on its credit as on its key: their cap left — a school
                // paying for itself reads its own credit
                'reste_credit_microusd' => $reste ?? $credit,
                'reste_cle_microusd' => $reste,
            ] + ($ecole['soi'] ? [] : [
                // whether its credit covers that much: one bit, never the credit — the 402 of a call, and the refusal
                // of a launch, say so without an amount either
                'credit_suffisant' => $credit >= (int) $reste,
            ]);
        }
        $solde = $credits->balance($userId);
        // a school pays for itself as a school (its surtax), never at the contribution of private persons
        $ecoleElleMeme = array_filter($possibles, static fn (array $p): bool => $p['soi']) !== [];
        if (!$ecoleElleMeme && ($solde > 0 || $possibles === [])) {
            $possibles[] = ['type' => Payeur::PERSONNEL, 'solde_microusd' => $solde];
        }

        return $possibles;
    }
}
