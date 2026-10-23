---
titre: Confidentialité et protection des données
maj: 2026-10-22
---

# Confidentialité et protection des données

humanome.xyz est un service de l'écosystème RESPIRE, porté par **Harmonia
Éducation**. Cette page explique, en clair, quelles données nous traitons,
pourquoi, où elles sont conservées et quels sont vos droits. Le principe de
conception est simple : **par défaut, vos données ne quittent pas votre
navigateur** ; tout stockage sur nos serveurs est un choix explicite de votre
part (opt-in), que vous pouvez retirer à tout moment.

Responsable du traitement : Harmonia Éducation. Contact : voir la section
« Contact et réclamation » en bas de page.

## En bref

- Votre **portfolio** (votre journal réflexif) reste dans votre navigateur tant que vous ne demandez pas explicitement à le déposer sur le serveur.
- Vos **cartographies** ne sont enregistrées sur le serveur que si vous cochez l'option de stockage serveur, cartographie par cartographie.
- Vous pouvez à tout moment **exporter** l'ensemble de vos données en un fichier local, et **supprimer** votre compte en un clic (effacement réel).
- Nous ne déposons **aucun traceur** ni cookie publicitaire : seul un cookie de session strictement nécessaire est utilisé quand vous êtes connecté.
- Nos **journaux techniques** ne contiennent jamais le texte de votre portfolio, de vos cartographies, ni vos mots de passe ou vos clés d'API.

## Quelles données, et pourquoi

Selon votre usage, nous pouvons traiter :

- **Compte** : votre adresse email, un nom affiché de votre choix, et une empreinte de votre mot de passe (jamais le mot de passe en clair). Finalité : vous authentifier et rattacher vos données à votre profil.
- **Portfolio** : le texte de votre journal réflexif. Par défaut il reste **dans votre navigateur** (stockage local IndexedDB) et ne transite par nos serveurs que le temps d'un traitement que vous déclenchez, s'il est déposé dans une cohorte d'établissement, ou si vous lancez une analyse approfondie Twin9, qui le garde avec votre accord (voir plus bas). Finalité : produire votre cartographie de compétences.
- **Cartographies** : le résultat JSON de l'analyse de votre portfolio. Enregistré sur le serveur **uniquement si vous l'y autorisez** (opt-in daté), sinon conservé localement et dans vos exports.
- **Progression de formation** : les chapitres de formation que vous avez parcourus, pour afficher votre avancement.
- **Clés d'API personnelles** : si vous choisissez d'utiliser votre propre clé d'un fournisseur de modèle de langage, **elle reste dans votre navigateur** : nous ne la gardons jamais sur nos serveurs. Seule une école peut y garder la sienne, chiffrée au repos, pour ses élèves. Si vous aviez gardé une clé sur nos serveurs avant le 22 octobre 2026, elle ne sert plus à aucune analyse : vous pouvez la recopier dans votre navigateur ou la supprimer dès maintenant dans « Mon compte » ; sinon, elle sera supprimée après un avis par courriel, 30 jours au moins après cet avis.
- **Crédits** : seules les écoles achètent des crédits (paiement chez PayPal : nous ne voyons ni ne gardons aucune donnée bancaire). Un particulier n'achète rien, ce qui nous évite d'avoir à vérifier l'âge des apprenants ; un solde acheté avant le 22 octobre 2026 reste utilisable jusqu'à épuisement, et remboursable sur demande. Nous ne gardons que des compteurs : solde, mouvements, identifiant de l'ordre. Si vous êtes membre d'une cohorte d'une école, votre école peut payer vos analyses payantes (l'analyse approfondie, la cartographie ouverte sur crédits), sur son crédit ou avec sa propre clé, sous un plafond mensuel qu'elle règle : elle voit alors le montant de ce qu'elle paie pour vous, mois par mois, jamais le contenu de vos analyses. Avec la clé de votre école, les résultats des appels envoyés par lots restent lisibles par l'école dans son compte chez Anthropic : la page de lancement vous le dit.
- **Liens de partage** : lorsque vous partagez une cartographie avec un employeur, nous conservons une empreinte (hachage) du lien et, s'il y en a un, du mot de passe de partage — jamais leur valeur en clair. Depuis le 14 octobre 2026, on partage une version partagée (ci-dessous) ; les liens créés avant vers une cartographie restent valables jusqu'à leur échéance, et vous pouvez les révoquer.
- **Versions partagées (adultes uniquement)** : depuis l'espace Partage de la cartographie, une personne majeure peut publier une version de sa cartographie qu'elle compose elle-même (compétences retenues, dates au jour, au mois ou masquées, extraits choisis et relus) — jamais son portfolio. Nous conservons cette version, la date à laquelle vous avez attesté être majeur·e (aucune date de naissance, aucun justificatif), et la date de chaque consultation de vos liens, que vous seul·e voyez.
- **Versions garanties** : vous pouvez aussi demander au cartographe qui a relu votre cartographie avec vous de publier lui-même une version, avec sa garantie. Vous lui remettez pour cela un code de demande (une seule fois, 30 jours au plus) ; nous conservons ce code jusqu'à son usage, puis le nom affiché du cartographe et la date de sa garantie, que lit toute personne qui ouvre vos liens. La version reste la vôtre : vous seul·e décidez de la partager. Si vous la remplacez vous-même, ou si le cartographe supprime son compte, la garantie en est retirée.
- **Journaux et compteurs anti-abus** : des compteurs techniques (par exemple le nombre d'appels par heure), avec des identifiants **hachés** — jamais votre adresse IP en clair, jamais le contenu de vos textes.

## Où sont vos données : local par défaut, serveur sur option

C'est le cœur de notre approche « RGPD dès la conception » :

- **Par défaut, local.** Portfolio et cartographies vivent dans votre navigateur. Si vous videz votre navigateur sans avoir exporté, ces données sont perdues — d'où l'export local systématique que nous proposons.
- **Sur option, serveur.** Vous pouvez décider d'enregistrer une cartographie sur nos serveurs (pour la partager, la faire relire par un cartographe, ou la retrouver ailleurs). Ce choix est explicite, daté, et réversible.
- **En établissement.** Si vous rejoignez la cohorte d'un établissement de formation, vous donnez un **consentement explicite** au moment de rejoindre, puis, en déposant votre portfolio, vous autorisez son traitement côté serveur au sein de cette cohorte. L'établissement voit les cartographies produites dans ce cadre, et le montant de ce qu'il paie pour vos analyses (jamais leur contenu). Quitter la cohorte retire ce partage et efface le portfolio déposé ; l'école cesse alors de payer vos analyses.

## Base légale

- **Consentement** (RGPD art. 6.1.a) pour tout stockage serveur de votre portfolio et de vos cartographies, pour l'adhésion à une cohorte d'établissement, et pour le partage d'une cartographie avec un employeur.
- **Exécution du service** (art. 6.1.b) pour la gestion de votre compte (email, nom affiché, authentification) dès lors que vous en créez un.
- **Intérêt légitime** (art. 6.1.f), strictement limité, pour la sécurité du service : compteurs anti-abus à identifiants hachés, journaux techniques minimisés.

Vous pouvez **retirer votre consentement** à tout moment : en dé-cochant le
stockage serveur d'une cartographie, en quittant une cohorte, en révoquant un
lien de partage, ou en supprimant votre compte.

## Durées de conservation

- **Compte et données rattachées** : conservés jusqu'à ce que vous supprimiez votre compte. La suppression est un **effacement réel**, pas une simple désactivation.
- **Liens de partage** : un lien de partage est valable **90 jours par défaut** (durée réglable de 1 à 365 jours au moment du partage), et peut être révoqué à tout moment. Une fois expiré ou révoqué, il est **purgé** par une tâche d'entretien au plus tard 30 jours après.
- **Versions partagées** : conservées jusqu'à ce que vous les retiriez (effacement immédiat), que vous publiiez une nouvelle version à leur place (l'ancienne est effacée, le lien reste) ou que vous supprimiez votre compte. Retirer votre attestation de majorité les efface aussitôt du serveur, avec leurs liens. Les pages partagées ne sont pas indexées par les moteurs de recherche. Une demande de publication garantie est effacée à son usage, à son annulation ou au bout de 30 jours.
- **Sessions** : un cookie de session strictement nécessaire, expirant après une période d'inactivité ; l'enregistrement serveur de la session disparaît avec votre compte.
- **Compteurs anti-abus** : fenêtres courtes (à l'heure ou à la journée), à identifiants hachés, sans lien avec votre profil.
- **Analyses approfondies Twin9** : votre portfolio et l'état de chaque analyse restent sur le serveur jusqu'à ce que vous les effaciez — la suppression de votre compte les efface ; chez Anthropic, un lot de requêtes est supprimé dès que ses réponses sont relevées, et n'y reste jamais plus de 29 jours ; chez un autre fournisseur, ce qu'il conserve est dit plus bas (« Analyse approfondie Twin9 »).

## Vos droits

Conformément au RGPD, vous disposez des droits d'**accès**, de **rectification**,
d'**effacement**, de **limitation**, d'**opposition** et de **portabilité**.
Concrètement, sur humanome.xyz :

- **Accès et portabilité** : depuis votre [espace](#/espace) ou la page [Mon compte](#/compte), vous **exportez** en un clic une archive locale contenant votre portfolio, vos cartographies et le référentiel associé, et vos analyses approfondies Twin9 gardées sur le serveur, dans un format JSON réutilisable.
- **Effacement** : depuis [Mon compte](#/compte), vous **supprimez votre compte** en un clic. Toutes vos données personnelles sont réellement effacées. Seule subsiste une trace d'audit **anonyme** et datée (le fait qu'une suppression a eu lieu), sans aucune donnée permettant de vous identifier.
- **Rectification** : votre nom affiché et le contenu de vos portfolios/cartographies sont modifiables directement depuis votre espace.

## Sous-traitants et fournisseurs de modèles de langage

L'analyse d'un portfolio fait appel à un **modèle de langage (LLM)**. Selon le
mode d'usage, le texte transmis et le destinataire changent :

- **Démonstration publique** : le proxy de la plateforme transmet le texte que vous collez à **Anthropic** (modèle Claude) pour produire la démonstration. Aucune donnée n'est conservée côté serveur au-delà de compteurs anonymes.
- **Assistant tuteur** : l'assistant (bouton « 💬 ») transmet à **Anthropic** (modèle Claude Haiku) **uniquement votre question et la rubrique que vous consultez** — jamais votre portfolio ni vos cartographies. **Aucune conversation n'est stockée côté serveur** (compteurs anonymes seulement) ; l'historique n'existe que dans votre navigateur, le temps de la session.
- **Clé personnelle** : si vous utilisez votre propre clé d'API, **vous choisissez** votre fournisseur (Anthropic, OpenAI, Google, etc.). Le texte part de votre navigateur vers le fournisseur que vous avez sélectionné, sous votre propre relation contractuelle avec lui ; la clé ne passe jamais par nos serveurs.
- **Établissement** : le traitement utilise soit la **clé de l'établissement**, soit la clé de la plateforme, selon la configuration choisie par l'établissement ; le texte est transmis au fournisseur correspondant.
- **Analyse approfondie Twin9** : votre portfolio est transmis aux **fournisseurs des modèles de votre profil** — **Anthropic** (modèles Claude) par défaut ; OpenAI, Mistral AI, Google (Gemini), xAI (Grok) ou OpenRouter seulement si l'administrateur de la plateforme les a ouverts et si votre profil les choisit —, que l'accord demandé à chaque lancement nomme. Avec la clé de la plateforme : l'analyse tourne sur nos serveurs, qui ne peuvent pas garder la clé de votre navigateur ; par lots, Anthropic garde chaque lot de requêtes jusqu'à sa suppression, 29 jours au plus (détails ci-dessous).
- **Dialogue d'accompagnement** (espace Dialogue de la cartographie) : il fonctionne **sans modèle de langage**, entièrement dans votre navigateur. Si vous choisissez d'activer les relances et donnez votre accord, chaque relance que vous demandez transmet **uniquement la question, votre réponse et le passage cité**, directement depuis votre navigateur, au fournisseur que vous avez choisi (avec votre propre clé) ou à Ollama sur votre ordinateur — jamais par nos serveurs. Vos réponses restent dans votre carnet, dans votre navigateur.

Ces fournisseurs agissent comme sous-traitants : ils traitent le texte pour
produire la réponse, puis le conservent selon leurs propres règles — Anthropic
efface requêtes et réponses dans les 30 jours (davantage en cas de signalement
d'abus ; 29 jours au plus pour un lot), et les autres fournisseurs de l'analyse
approfondie selon les durées décrites plus bas. Plusieurs sont établis hors de
l'Union européenne (voir « Transferts hors de l'Union européenne »). Nous ne
leur transmettons jamais votre mot de passe ni vos identifiants de compte, et
nous ne stockons pas votre texte au-delà de ce que vous avez explicitement
autorisé.

### Analyse approfondie Twin9

L'**analyse approfondie Twin9** est une exception au principe « tout reste dans
le navigateur » : elle s'exécute **sur notre serveur**, par étapes, et y garde
ce dont elle a besoin. À chaque lancement, vous donnez votre **accord
explicite**, daté, pour que votre **portfolio** et **l'état de l'analyse** — ses
réglages, le journal de ses appels au modèle, ses résultats et la mémoire de
votre carte, qui évite de refaire une journée inchangée — **restent sur le
serveur jusqu'à ce que vous les effaciez** ; la suppression de votre compte les
efface. Sans cet accord, l'analyse ne part pas. Avant de la lancer, la page vous
dit les journées qu'elle instruira, son coût et sa durée estimés, sans rien
garder. L'export de vos données contient vos analyses : réglages, portfolio,
journal des appels, résultats et mémoire de vos cartes. Nos journaux techniques
n'en gardent que des compteurs (nombre d'appels, jetons, coût, durée — jamais de
contenu).

Le texte de votre portfolio est transmis aux fournisseurs des modèles que votre
profil choisit, étape par étape : **Anthropic** (modèles Claude) par défaut,
avec la clé de la plateforme (une analyse lancée avant le 22 octobre 2026 sur
votre propre clé va au bout sur elle). Par la **voie par lots**,
Anthropic garde chaque lot de requêtes jusqu'à ce que notre serveur le supprime,
dès ses réponses relevées ; un lot qui n'aurait pas été supprimé n'y reste jamais
plus de **29 jours**. La suppression de votre compte annule et supprime aussi vos
lots encore chez Anthropic ; un lot envoyé avec votre propre clé dont
l'annulation n'est pas finie à ce moment-là, votre clé partant avec votre
compte, est effacé par Anthropic dans ce même délai.

D'autres fournisseurs ne reçoivent votre texte que si l'administrateur de la
plateforme les a ouverts **et** si votre profil les choisit ; l'accord que vous
donnez à chaque lancement les nomme, avec leur voie et leur étiquette RGPD, et
vaut pour eux seuls. Ils sont appelés **en direct** (jamais par lots), avec la
clé de la plateforme seulement — jamais avec votre propre clé — et selon ce que
disent leurs documentations officielles (relevées le 22 octobre 2026) :

- **OpenAI** : appelé sans conservation des réponses (`store: false`) ; ses
  journaux de lutte contre les abus peuvent garder requêtes et réponses jusqu'à
  30 jours.
- **Mistral AI** : sa documentation ne donne pas de durée de conservation
  standard pour son API ; la conservation nulle s'y obtient sur demande.
- **Google (Gemini)** : seule l'offre payante, la seule permise pour des
  utilisateurs de l'Espace économique européen, et sans journalisation des
  échanges (`store: false`) ; Google garde requêtes et réponses 55 jours pour la
  lutte contre les abus.
- **xAI (Grok)** : requêtes et réponses conservées 30 jours pour audit, sans
  entraînement des modèles.
- **OpenRouter** : un intermédiaire qui transmet la requête au fournisseur du
  modèle ; nous lui demandons de n'employer que des fournisseurs qui ne
  collectent pas les données, sans repli vers un autre ; la conservation est
  alors celle du fournisseur final.

#### Transferts hors de l'Union européenne

Anthropic, OpenAI, Google, xAI et OpenRouter sont des entreprises américaines :
le texte qui leur est transmis peut être traité hors de l'Union européenne,
notamment aux États-Unis. Pour chacun, le pays où il est traité et la garantie
qui encadre ce transfert (décision d'adéquation, dont le cadre de protection des
données UE–États-Unis, ou clauses contractuelles types) **n'ont pas encore été
vérifiés** ; ils le seront avant qu'un fournisseur autre qu'Anthropic soit
ouvert, et cette page le dira. Mistral AI est une entreprise française ; le lieu
où elle traite le texte n'est pas encore vérifié non plus. OpenRouter, un
intermédiaire, transmet en outre la requête au fournisseur du modèle : le pays
dépend alors de ce dernier. Avec votre propre clé, c'est votre relation
contractuelle avec votre fournisseur qui s'applique.

Chaque fournisseur porte une **étiquette RGPD** — « oui » (Mistral AI), « sous
conditions » (Anthropic, OpenAI), « non » (Google, xAI, OpenRouter) — tirée d'une
recherche de juillet 2026 : elle est indicative et ne vaut pas avis juridique.
Un fournisseur étiqueté « non » ne s'ouvre que sur décision expresse de
l'administrateur, par un réglage distinct ; il est à éviter pour des journaux
d'élèves réels.

Les résultats d'une analyse ne sont lus que par vous, et par le cartographe
auquel vous êtes lié si vous le décidez (« Mon cartographe peut lire les
résultats », réversible). L'administrateur de la plateforme ne voit que des
compteurs, jamais votre portfolio ni vos résultats. Pour des journaux d'élèves
réels soumis à des exigences renforcées de protection des données, l'outil
local (hors ligne) reste la réponse appropriée.

## Cookies

- **Cookie de session** : strictement nécessaire, déposé uniquement lorsque vous êtes connecté, pour maintenir votre session authentifiée. Sans lui, vous ne pourriez pas rester connecté.
- **Aucun traceur** : pas de cookie publicitaire, pas de mesure d'audience tierce, pas de pistage inter-sites.

## Sécurité

Les échanges sont chiffrés en transit (HTTPS). Les mots de passe sont conservés
sous forme d'empreintes robustes (Argon2id). Les clés d'API qu'une école garde
sur nos serveurs, et celles qu'un utilisateur y avait gardées avant le 22
octobre 2026 jusqu'à leur suppression, sont **chiffrées au repos**. Les secrets du service sont conservés hors de la racine
web, inaccessibles publiquement.

## Contact et réclamation

Pour exercer vos droits ou pour toute question relative à vos données, contactez
Harmonia Éducation via [respire.school](https://respire.school) ou l'espace
participatif [participer.harmonia.education](https://participer.harmonia.education).
Vous avez également le droit d'introduire une réclamation auprès de l'autorité de
protection des données compétente.

*Dernière mise à jour : 12 juillet 2026.*
