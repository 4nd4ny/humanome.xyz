<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use Humanome\Validation;
use PDO;

/**
 * referentiel_versions access + business invariants (cahier §4.1, P4):
 * published versions are IMMUTABLE, publication requires a STRICTLY
 * increasing semver, every write re-validates against the JSON Schema.
 * Plain PDO, prepared statements — no ORM.
 *
 * T15 (Twin_v9's docs/plan-twin9-php.md, lot 4c): a referential of any
 * structure — poles numbered 1 to N, the levels it declares, each with the
 * motif of its codes (RESPIRE's one level, « \d\.\d{2} », when it declares
 * none) — is imported as a draft at the level that stands for competence,
 * then voted and published as RESPIRE's document versions are. RESPIRE
 * itself is not imported: its competences are edited one by one, and its
 * structure — 7 poles, 61 competences « P.NN », its one level — is the
 * schema's (allOf), so that every path to one of its versions keeps it,
 * its release cut from its competences included.
 */
final class ReferentielRepository
{
    public const DEFAULT_REFERENTIEL_ID = 'respire';

    /** The one level of a referential that declares none: RESPIRE's competences (T15). */
    public const NIVEAU_PAR_DEFAUT = 'compétence';

    /** The motif of its codes, the v9.8's: a pole's digit, then two (T15). */
    public const MOTIF_PAR_DEFAUT = '\d\.\d{2}';

    /** The PCRE backtracking limit while codes (8 characters at most) are matched against their motif (T15). */
    private const LIMITE_RETOUR_ARRIERE = 10000;

    /** The id of an imported referential (T15): lowercase, digits, « . », « _ », « - », 64 characters at most. */
    public const ID_PATTERN = '/^[a-z0-9][a-z0-9._-]{0,63}$/D';


    public function __construct(private readonly PDO $pdo)
    {
    }

    // ------------------------------------------------------------------ reads

    /** Latest published version (semver precedence), or null. */
    public function latestPublished(string $referentielId): ?array
    {
        $versions = $this->publishedVersions($referentielId);

        return $versions[0] ?? null;
    }

    /**
     * Every published referential, by id: its versions, newest first (semver
     * precedence), without content.
     *
     * @return array<string, list<string>>
     */
    public function publishedSemvers(): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT referentiel_id, semver FROM referentiel_versions WHERE status = ? ORDER BY referentiel_id'
        );
        $stmt->execute(['published']);
        $versions = [];
        foreach ($stmt->fetchAll() as $row) {
            $versions[(string) $row['referentiel_id']][] = (string) $row['semver'];
        }
        foreach ($versions as &$liste) {
            usort($liste, static fn (string $a, string $b): int => Semver::compare($b, $a));
        }
        unset($liste);

        return $versions;
    }

    /**
     * Published versions, newest first (semver precedence), content included.
     *
     * @return list<array<string, mixed>>
     */
    public function publishedVersions(string $referentielId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM referentiel_versions WHERE referentiel_id = ? AND status = ?'
        );
        $stmt->execute([$referentielId, 'published']);
        $rows = array_map($this->mapRow(...), $stmt->fetchAll());
        usort($rows, static fn (array $a, array $b): int => Semver::compare($b['semver'], $a['semver']));

        return $rows;
    }

    /**
     * Editable versions (drafts + proposals under vote), newest first.
     * The épistémiarque workbench lists these; published versions are read
     * through the public endpoints.
     *
     * @return list<array<string, mixed>>
     */
    public function editableVersions(?string $referentielId = null): array
    {
        if ($referentielId === null) {
            // every referential's (T15): the workbench lists them all
            $stmt = $this->pdo->query(
                "SELECT * FROM referentiel_versions WHERE status IN ('draft','review') ORDER BY id DESC"
            );

            return array_map($this->mapRow(...), $stmt->fetchAll());
        }
        $stmt = $this->pdo->prepare(
            "SELECT * FROM referentiel_versions
             WHERE referentiel_id = ? AND status IN ('draft','review')
             ORDER BY id DESC"
        );
        $stmt->execute([$referentielId]);

        return array_map($this->mapRow(...), $stmt->fetchAll());
    }

    /**
     * The published referentials (T15), each with the label of its latest
     * version and its versions, newest first; RESPIRE among them.
     *
     * @return list<array{id: string, label: string, versions: list<string>}>
     */
    public function catalogue(): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT referentiel_id, semver, label FROM referentiel_versions WHERE status = ? ORDER BY referentiel_id'
        );
        $stmt->execute(['published']);
        $parId = [];
        foreach ($stmt->fetchAll() as $row) {
            $parId[(string) $row['referentiel_id']][(string) $row['semver']] = (string) $row['label'];
        }
        $out = [];
        foreach ($parId as $id => $labels) {
            $versions = array_map('strval', array_keys($labels));
            usort($versions, static fn (string $a, string $b): int => Semver::compare($b, $a));
            $out[] = ['id' => (string) $id, 'label' => $labels[$versions[0]], 'versions' => $versions];
        }

        return $out;
    }

    /**
     * A user's versions not yet published, by referential (T15): the drafts
     * their test runs may read.
     *
     * @return array<string, list<string>> referential id => semvers, newest first
     */
    public function brouillonsDe(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT referentiel_id, semver FROM referentiel_versions
             WHERE created_by = ? AND status IN ('draft','review') ORDER BY referentiel_id"
        );
        $stmt->execute([$userId]);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(string) $row['referentiel_id']][] = (string) $row['semver'];
        }
        foreach ($out as &$semvers) {
            usort($semvers, static fn (string $a, string $b): int => Semver::compare($b, $a));
        }
        unset($semvers);

        return $out;
    }

    /** A version of a referential, whatever its status (T15: a profile names a draft by its semver). */
    public function findVersion(string $referentielId, string $semver): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM referentiel_versions WHERE referentiel_id = ? AND semver = ?');
        $stmt->execute([$referentielId, $semver]);
        $row = $stmt->fetch();

        return $row === false ? null : $this->mapRow($row);
    }

    public function findPublished(string $referentielId, string $semver): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM referentiel_versions
             WHERE referentiel_id = ? AND semver = ? AND status = ?'
        );
        $stmt->execute([$referentielId, $semver, 'published']);
        $row = $stmt->fetch();

        return $row === false ? null : $this->mapRow($row);
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM referentiel_versions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $this->mapRow($row);
    }

    // ----------------------------------------------------------------- import

    /**
     * Import an already-published document (initial RESPIRE v7 load).
     * Idempotent: same (id, version) with the same content hash is a no-op;
     * a different hash for an existing version is a conflict (immutability).
     *
     * @param array<string, mixed> $doc validated by the caller or here
     * @return array{status: 'imported'|'unchanged', id: int, semver: string, contentHash: string}
     */
    public function importPublishedDocument(array $doc, string $releaseNote, ?int $createdBy = null): array
    {
        $normalized = $this->validateDocument($doc);

        $declared = $doc['contentHash'] ?? null;
        if ($declared !== $normalized['contentHash']) {
            throw new ConflictException(sprintf(
                'contentHash mismatch: document declares %s but canonical content hashes to %s',
                \is_string($declared) ? $declared : '(missing)',
                $normalized['contentHash'],
            ));
        }

        $referentielId = $normalized['id'];
        $semver = $normalized['version'];
        $stmt = $this->pdo->prepare(
            'SELECT id, status, content_hash FROM referentiel_versions WHERE referentiel_id = ? AND semver = ?'
        );
        $stmt->execute([$referentielId, $semver]);
        $existing = $stmt->fetch();

        if ($existing !== false) {
            if ($existing['content_hash'] === $normalized['contentHash'] && $existing['status'] === 'published') {
                return [
                    'status' => 'unchanged',
                    'id' => (int) $existing['id'],
                    'semver' => $semver,
                    'contentHash' => $normalized['contentHash'],
                ];
            }
            throw new ConflictException(sprintf(
                'Version %s of referentiel "%s" already exists with status "%s" and a different content (published versions are immutable)',
                $semver,
                $referentielId,
                $existing['status'],
            ));
        }

        $insert = $this->pdo->prepare(
            'INSERT INTO referentiel_versions
                (referentiel_id, semver, label, status, content, content_hash, release_note, created_by, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
        );
        $insert->execute([
            $referentielId,
            $semver,
            $normalized['label'],
            'published',
            ContentHash::encode($normalized),
            $normalized['contentHash'],
            $releaseNote,
            $createdBy,
        ]);

        return [
            'status' => 'imported',
            'id' => (int) $this->pdo->lastInsertId(),
            'semver' => $semver,
            'contentHash' => $normalized['contentHash'],
        ];
    }

    /**
     * Coupe de RELEASE depuis un document assemblé (SnapshotAssembler) : les
     * changements ayant DÉJÀ été entérinés PAR COMPÉTENCE, il n'y a pas de
     * second vote. Gate de COMPLÉTUDE (validateDocument = schéma 61/7 + intégrité
     * inter-entités) + semver STRICTEMENT croissant. Publie la release immuable
     * et peuple le lockfile (provenance des versions de compétence composées).
     *
     * @param array<string, mixed> $doc document assemblé (contentHash déjà calculé)
     * @return array{status:'imported', id:int, semver:string, contentHash:string}
     */
    public function cutReleaseFromDocument(array $doc): array
    {
        $normalized = $this->validateDocument($doc);
        $referentielId = $normalized['id'];
        $semver = $normalized['version'];

        $stmt = $this->pdo->prepare('SELECT id FROM referentiel_versions WHERE referentiel_id = ? AND semver = ?');
        $stmt->execute([$referentielId, $semver]);
        if ($stmt->fetch() !== false) {
            throw new ConflictException(sprintf('Version %s of referentiel "%s" already exists', $semver, $referentielId));
        }
        foreach ($this->publishedVersions($referentielId) as $published) {
            if (!Semver::greaterThan($semver, $published['semver'])) {
                throw new ConflictException(sprintf(
                    'Semver must be strictly increasing: %s is not greater than published %s',
                    $semver,
                    $published['semver'],
                ));
            }
        }

        $this->pdo->beginTransaction();
        try {
            $insert = $this->pdo->prepare(
                'INSERT INTO referentiel_versions
                    (referentiel_id, semver, label, status, content, content_hash, release_note, published_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())'
            );
            $insert->execute([
                $referentielId, $semver, $normalized['label'], 'published',
                ContentHash::encode($normalized), $normalized['contentHash'],
                'Coupe de release depuis les compétences atomiques publiées',
            ]);
            $snapshotId = (int) $this->pdo->lastInsertId();

            $lock = $this->pdo->prepare(
                'INSERT INTO referentiel_snapshot_competences
                    (snapshot_version_id, competence_code, competence_version_id, content_hash)
                 VALUES (?, ?, ?, ?)'
            );
            foreach ((new CompetenceRepository($this->pdo))->latestPublishedByCode() as $code => $cv) {
                $lock->execute([$snapshotId, $code, $cv['id'], $cv['contentHash']]);
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return ['status' => 'imported', 'id' => $snapshotId, 'semver' => $semver, 'contentHash' => $normalized['contentHash']];
    }

    // ----------------------------------------------------------------- drafts

    /**
     * Import a referential as a draft (T15): its document is validated as it
     * is, then read at the chosen level — that level's elements become the
     * competences (auNiveau) — and validated again. The importer is its
     * author. RESPIRE is not imported: its competences are edited one by one.
     *
     * @param array<string, mixed> $doc the referential, at any of its levels
     * @param string|null $niveau the name of the level that stands for competence; null: the first
     * @return array<string, mixed> the draft
     */
    public function importDraft(array $doc, ?string $niveau, ?int $createdBy): array
    {
        $id = $doc['id'] ?? null;
        if ($id === self::DEFAULT_REFERENTIEL_ID) {
            throw new ConflictException('RESPIRE s’édite compétence par compétence dans son atelier : il ne s’importe pas');
        }
        if (!\is_string($id) || preg_match(self::ID_PATTERN, $id) !== 1) {
            throw new InvalidDocumentException('Identifiant de référentiel invalide', ['/id' => [
                'Minuscules, chiffres, « . », « _ » ou « - », 64 caractères au plus']]);
        }
        $normalized = $this->validateDocument($doc);
        $niveaux = self::niveaux($normalized);
        $noms = array_column($niveaux, 'nom');
        $k = $niveau === null ? 0 : array_search($niveau, $noms, true);
        if ($k === false) {
            throw new InvalidDocumentException('Niveau inconnu', ['/niveau' => [sprintf(
                'Niveau inconnu : « %s » (le référentiel déclare : %s)', $niveau, implode(', ', $noms))]]);
        }
        $normalized = $this->validateDocument(self::auNiveau($normalized, $k));

        $stmt = $this->pdo->prepare('SELECT id FROM referentiel_versions WHERE referentiel_id = ? AND semver = ?');
        $stmt->execute([$normalized['id'], $normalized['version']]);
        if ($stmt->fetch() !== false) {
            throw new ConflictException(sprintf('La version %s du référentiel « %s » existe déjà',
                $normalized['version'], $normalized['id']));
        }
        $this->pdo->prepare(
            'INSERT INTO referentiel_versions
                (referentiel_id, semver, label, status, content, content_hash, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $normalized['id'], $normalized['version'], $normalized['label'], 'draft',
            ContentHash::encode($normalized), $normalized['contentHash'], $createdBy,
        ]);

        return $this->findById((int) $this->pdo->lastInsertId());
    }

    /**
     * A referential read at one of its levels (T15): the elements of level
     * $k become its competences, each under the pole of its competence, its
     * finer elements kept beneath it; the broader levels are not kept. A
     * branch that stops above level $k would vanish without a word: refused,
     * named, as a level without elements.
     *
     * @param array<string, mixed> $doc a valid referential
     * @return array<string, mixed>
     * @throws InvalidDocumentException
     */
    public static function auNiveau(array $doc, int $k): array
    {
        if ($k === 0) {
            return $doc;
        }
        $niveaux = self::niveaux($doc);
        $competences = [];
        $perdus = [];
        $descendre = static function (array $noeuds, int $profondeur, int $pole) use (&$descendre, &$competences, &$perdus, $k): void {
            foreach ($noeuds as $noeud) {
                if ($profondeur === $k) {
                    $c = ['code' => $noeud['code'], 'nom' => $noeud['nom'], 'pole' => $pole];
                    foreach (['description', 'elements'] as $cle) {
                        if (\array_key_exists($cle, $noeud)) {
                            $c[$cle] = $noeud[$cle];
                        }
                    }
                    $competences[] = $c;
                } elseif (($noeud['elements'] ?? []) !== []) {
                    $descendre($noeud['elements'], $profondeur + 1, $pole);
                } else {
                    $perdus[] = $noeud['code'];
                }
            }
        };
        foreach ($doc['competences'] as $competence) {
            $descendre([$competence], 0, (int) $competence['pole']);
        }
        if ($competences === []) {
            throw new InvalidDocumentException('Niveau vide', ['/niveau' => [sprintf(
                'Aucun élément au niveau « %s »', $niveaux[$k]['nom'])]]);
        }
        if ($perdus !== []) {
            throw new InvalidDocumentException('Branches sans élément au niveau choisi', ['/niveau' => [sprintf(
                'Sans élément au niveau « %s », ces éléments disparaîtraient de l’import : %s',
                $niveaux[$k]['nom'], implode(', ', $perdus))]]);
        }
        $doc['competences'] = $competences;
        $doc['niveaux'] = \array_slice($niveaux, $k);

        return $doc;
    }

    /**
     * The levels of a referential (T15): those it declares, else RESPIRE's
     * one level, the competence at the motif « \d\.\d{2} ».
     *
     * @param array<string, mixed> $doc
     * @return list<array{nom: string, motif: string}>
     */
    public static function niveaux(array $doc): array
    {
        $niveaux = $doc['niveaux'] ?? null;

        return \is_array($niveaux) && $niveaux !== []
            ? array_values($niveaux)
            : [['nom' => self::NIVEAU_PAR_DEFAUT, 'motif' => self::MOTIF_PAR_DEFAUT]];
    }

    /**
     * The regex a whole code follows to match a level's motif (T15); null: the
     * motif does not compile, or would not stay inside its anchors — a group
     * closed early (« Z)|(?: ») or a verb such as (*ACCEPT), which ends the
     * match before the end anchor, would let every code through.
     */
    public static function regexDuMotif(string $motif): ?string
    {
        if (str_contains($motif, '(*') || @preg_match("\x01" . $motif . "\x01u", '') === false) {
            return null;
        }
        $regex = "\x01^(?:" . $motif . ")$\x01uD";

        return @preg_match($regex, '') === false ? null : $regex;
    }

    /**
     * New draft forked from an existing version (any status).
     *
     * @return array<string, mixed>|null null when the source version is unknown
     */
    public function createDraft(
        string $referentielId,
        string $fromSemver,
        string $newSemver,
        ?string $label = null,
        ?int $createdBy = null,
    ): ?array {
        if (!Semver::isValid($newSemver)) {
            throw new InvalidDocumentException(
                sprintf('"%s" is not a valid semver version', $newSemver),
                ['/semver' => ['Version semver invalide']],
            );
        }

        $stmt = $this->pdo->prepare(
            'SELECT * FROM referentiel_versions WHERE referentiel_id = ? AND semver = ?'
        );
        $stmt->execute([$referentielId, $fromSemver]);
        $source = $stmt->fetch();
        if ($source === false) {
            return null;
        }

        $stmt->execute([$referentielId, $newSemver]);
        if ($stmt->fetch() !== false) {
            throw new ConflictException(sprintf(
                'Version %s of referentiel "%s" already exists',
                $newSemver,
                $referentielId,
            ));
        }

        $content = json_decode((string) $source['content'], true, 512, JSON_THROW_ON_ERROR);
        $content['version'] = $newSemver;
        if ($label !== null && $label !== '') {
            $content['label'] = $label;
        }
        $normalized = $this->validateDocument($content);

        $insert = $this->pdo->prepare(
            'INSERT INTO referentiel_versions
                (referentiel_id, semver, label, status, content, content_hash, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([
            // the source's id, not the request's: the column ignores case and trailing spaces
            $source['referentiel_id'],
            $newSemver,
            $normalized['label'],
            'draft',
            ContentHash::encode($normalized),
            $normalized['contentHash'],
            $createdBy,
        ]);

        return $this->findById((int) $this->pdo->lastInsertId());
    }

    /**
     * Replace a draft's content. Schema re-validation on EVERY write; a
     * published version is immutable (conflict).
     *
     * @param array<string, mixed> $content full referentiel document
     * @return array<string, mixed>|null null when the draft is unknown
     */
    public function updateDraft(int $id, array $content): ?array
    {
        $row = $this->findById($id);
        if ($row === null) {
            return null;
        }
        if ($row['status'] === 'published') {
            throw new ConflictException(
                'Published versions are immutable: create a new draft instead'
            );
        }
        if ($row['status'] === 'review') {
            // A proposal open for a vote is frozen: editing it would silently
            // invalidate the ballots already cast. Withdraw it first (which
            // clears the votes) to reopen editing.
            throw new ConflictException(
                'This proposal is open for a vote: withdraw it before editing.'
            );
        }

        $normalized = $this->validateDocument($content);

        if ($normalized['id'] !== $row['referentielId']) {
            throw new InvalidDocumentException(
                sprintf('Document id "%s" does not match referentiel "%s"', $normalized['id'], $row['referentielId']),
                ['/id' => ['L\'identifiant du référentiel ne peut pas changer']],
            );
        }

        $newSemver = $normalized['version'];
        if ($newSemver !== $row['semver']) {
            $stmt = $this->pdo->prepare(
                'SELECT id FROM referentiel_versions WHERE referentiel_id = ? AND semver = ? AND id <> ?'
            );
            $stmt->execute([$row['referentielId'], $newSemver, $id]);
            if ($stmt->fetch() !== false) {
                throw new ConflictException(sprintf(
                    'Version %s of referentiel "%s" already exists',
                    $newSemver,
                    $row['referentielId'],
                ));
            }
        }

        $update = $this->pdo->prepare(
            'UPDATE referentiel_versions
             SET semver = ?, label = ?, content = ?, content_hash = ?
             WHERE id = ?'
        );
        $update->execute([
            $newSemver,
            $normalized['label'],
            ContentHash::encode($normalized),
            $normalized['contentHash'],
            $id,
        ]);

        return $this->findById($id);
    }

    /**
     * Publish a draft: semver STRICTLY greater than the latest published
     * version of the referentiel, content hash recomputed, then immutable.
     *
     * @return array<string, mixed>|null null when the draft is unknown
     */
    public function publish(int $id, ?string $releaseNote = null): ?array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM referentiel_versions WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $raw = $stmt->fetch();
            if ($raw === false) {
                $this->pdo->rollBack();

                return null;
            }
            $row = $this->mapRow($raw);
            if ($row['status'] === 'published') {
                throw new ConflictException('This version is already published (published versions are immutable)');
            }
            // Governance gate (cahier §3.5): a proposal is entérinée only after
            // a MAJORITY of the current épistémiarque members has approved it.
            // A draft that was never submitted for a vote cannot be published.
            if ($row['status'] !== 'review') {
                throw new ConflictException(
                    'A proposal must be submitted for a vote before it can be published.'
                );
            }
            $tally = (new ReferentielGovernance($this->pdo))->tally($id);
            if (!$tally['reached']) {
                throw new ConflictException(MajorityMessage::forTally($tally));
            }

            $normalized = $this->validateDocument($row['content']);

            $published = $this->pdo->prepare(
                'SELECT semver FROM referentiel_versions
                 WHERE referentiel_id = ? AND status = ? FOR UPDATE'
            );
            $published->execute([$row['referentielId'], 'published']);
            foreach ($published->fetchAll(PDO::FETCH_COLUMN) as $existingSemver) {
                if (!Semver::greaterThan($row['semver'], (string) $existingSemver)) {
                    throw new ConflictException(sprintf(
                        'Semver must be strictly increasing: %s is not greater than published %s',
                        $row['semver'],
                        $existingSemver,
                    ));
                }
            }

            $update = $this->pdo->prepare(
                'UPDATE referentiel_versions
                 SET status = ?, content = ?, content_hash = ?, release_note = ?, published_at = NOW()
                 WHERE id = ?'
            );
            $update->execute([
                'published',
                ContentHash::encode($normalized),
                $normalized['contentHash'],
                $releaseNote,
                $id,
            ]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return $this->findById($id);
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Normalize then validate a document: JSON Schema (schemas/referentiel)
     * + integrity checks the schema cannot express (unique pole nums, unique
     * competence codes, competence.pole referencing an existing pole).
     *
     * @param array<string, mixed> $doc
     * @return array<string, mixed> normalized document (canonical order + recomputed contentHash)
     */
    public function validateDocument(array $doc): array
    {
        try {
            $normalized = ContentHash::normalize($doc);
        } catch (\InvalidArgumentException) {
            // Not even hashable: let the schema report precise errors.
            $result = Validation::validate('referentiel', $doc);
            throw new InvalidDocumentException(
                'Document does not conform to the referentiel schema',
                $result['errors'] !== [] ? $result['errors'] : ['/' => ['Document malformé']],
            );
        }

        $result = Validation::validate('referentiel', $normalized);
        if (!$result['valid']) {
            throw new InvalidDocumentException(
                'Document does not conform to the referentiel schema',
                $result['errors'],
            );
        }

        $errors = [];
        $poleNums = [];
        foreach ($normalized['poles'] as $i => $pole) {
            if (isset($poleNums[$pole['num']])) {
                $errors["/poles/{$i}/num"][] = sprintf('Numéro de pôle dupliqué : %d', $pole['num']);
            }
            $poleNums[$pole['num']] = true;
        }
        // T15: the poles are their ranks, 1 to N, without a gap (1.0 is an integer for the schema)
        $nums = array_map(static fn (array $pole): int => (int) $pole['num'], $normalized['poles']);
        sort($nums);
        if ($nums !== range(1, \count($nums))) {
            $errors['/poles'][] = sprintf('Les pôles se numérotent de 1 à %d, sans trou', \count($nums));
        }
        // T15: each level's motif, which every code of the level follows in full
        $niveaux = self::niveaux($normalized);
        $regexes = [];
        foreach ($niveaux as $n => $niveau) {
            $regexes[$n] = self::regexDuMotif($niveau['motif']);
            if ($regexes[$n] === null) {
                $errors["/niveaux/{$n}/motif"][] = sprintf('Motif illisible : %s', $niveau['motif']);
            }
        }
        $codes = [];
        // a code has 8 characters at most: a motif that needs more steps than this
        // backtracks catastrophically, and would cost a million steps for each code
        $limite = ini_get('pcre.backtrack_limit');
        ini_set('pcre.backtrack_limit', (string) self::LIMITE_RETOUR_ARRIERE);
        try {
            foreach ($normalized['competences'] as $i => $competence) {
                if (isset($codes[$competence['code']])) {
                    $errors["/competences/{$i}/code"][] = sprintf('Code de compétence dupliqué : %s', $competence['code']);
                }
                $codes[$competence['code']] = true;
                if (!isset($poleNums[$competence['pole']])) {
                    $errors["/competences/{$i}/pole"][] = sprintf(
                        'La compétence %s référence un pôle inexistant (%d)',
                        $competence['code'],
                        $competence['pole'],
                    );
                }
                self::controlerCode($competence, 0, "/competences/{$i}", $niveaux, $regexes, $codes, $errors);
            }
        } finally {
            ini_set('pcre.backtrack_limit', (string) $limite);
        }
        if ($errors !== []) {
            throw new InvalidDocumentException('Document fails referentiel integrity checks', $errors);
        }

        return $normalized;
    }

    /**
     * T15: a code follows its level's motif, an element sits at a level the
     * referential declares, a code is never twice.
     *
     * @param array<string, mixed> $noeud a competence (level 0) or an element
     * @param list<array{nom: string, motif: string}> $niveaux
     * @param list<string|null> $regexes null for a level whose motif is refused (no longer evaluated)
     * @param array<string, true> $codes the codes met so far
     * @param array<string, list<string>> $errors
     */
    private static function controlerCode(array $noeud, int $profondeur, string $pointeur, array $niveaux,
                                          array &$regexes, array &$codes, array &$errors): void
    {
        if (!isset($niveaux[$profondeur])) {
            $errors[$pointeur][] = sprintf('Élément d’un niveau que le référentiel ne déclare pas (il en déclare %d)',
                \count($niveaux));
            return;
        }
        $regex = $regexes[$profondeur];
        $suit = $regex === null ? null : @preg_match($regex, $noeud['code']);
        if ($suit === false) {
            // the backtracking limit: the motif is refused once, and no longer evaluated
            $errors["/niveaux/{$profondeur}/motif"][] = sprintf('Motif trop coûteux à évaluer : %s',
                $niveaux[$profondeur]['motif']);
            $regexes[$profondeur] = null;
        } elseif ($suit === 0) {
            $errors[$pointeur . '/code'][] = sprintf('« %s » ne suit pas le motif %s du niveau « %s »',
                $noeud['code'], $niveaux[$profondeur]['motif'], $niveaux[$profondeur]['nom']);
        }
        foreach ($noeud['elements'] ?? [] as $j => $element) {
            $p = "{$pointeur}/elements/{$j}";
            if (isset($codes[$element['code']])) {
                $errors[$p . '/code'][] = sprintf('Code dupliqué : %s', $element['code']);
            }
            $codes[$element['code']] = true;
            self::controlerCode($element, $profondeur + 1, $p, $niveaux, $regexes, $codes, $errors);
        }
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed> camelCase metadata + decoded, re-normalized content
     */
    private function mapRow(array $row): array
    {
        $content = json_decode((string) $row['content'], true, 512, JSON_THROW_ON_ERROR);
        try {
            // MySQL JSON columns reorder object keys: restore canonical order.
            $content = ContentHash::normalize($content);
        } catch (\InvalidArgumentException) {
            // Keep raw content readable even if a legacy row is malformed.
        }

        return [
            'id' => (int) $row['id'],
            'referentielId' => $row['referentiel_id'],
            'semver' => $row['semver'],
            'label' => $row['label'],
            'status' => $row['status'],
            'contentHash' => $row['content_hash'],
            'releaseNote' => $row['release_note'],
            'createdAt' => $row['created_at'],
            'publishedAt' => $row['published_at'],
            'submittedAt' => $row['submitted_at'] ?? null,
            'submittedBy' => isset($row['submitted_by']) && $row['submitted_by'] !== null
                ? (int) $row['submitted_by']
                : null,
            'createdBy' => isset($row['created_by']) && $row['created_by'] !== null ? (int) $row['created_by'] : null,
            'decidimUrl' => $row['decidim_url'] ?? null,
            'content' => $content,
        ];
    }

    /**
     * @param array<string, mixed> $version as returned by mapRow
     * @return array<string, mixed> metadata only (no content — list endpoints)
     */
    public static function metadata(array $version): array
    {
        return [
            'id' => $version['id'] ?? null,
            'referentielId' => $version['referentielId'],
            'semver' => $version['semver'],
            'label' => $version['label'],
            'status' => $version['status'],
            'contentHash' => $version['contentHash'],
            'releaseNote' => $version['releaseNote'],
            'publishedAt' => $version['publishedAt'],
            'submittedAt' => $version['submittedAt'] ?? null,
            'decidimUrl' => $version['decidimUrl'] ?? null,
        ];
    }
}
