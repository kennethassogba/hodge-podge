# La Bulle : Hodge Podge

Un temps pour réfléchir, puis une façon de donner suite à ses idées.

Projet de l’équipe Hodge Podge pour le hackathon X-IA, construit avec OpenAI et Cloudflare.

La Bulle aide à prendre du recul face à une situation professionnelle : une conversation à préparer,
une décision difficile, une idée à démêler. Le coach IA accompagne la réflexion, une question à la
fois. L’après-bulle permet ensuite de retrouver ce qui en ressort et d’agir dans ses outils du
quotidien. L’interface reste simple ; les agents travaillent en coulisses, et la personne garde la
main.

## Deux usages

### La Bulle : le coaching

Par messages ou appel vocal, en français ou en anglais, la personne dispose d’un espace pour
réfléchir à son rythme. Le coach suit le protocole de micro-coaching Kedo, apporté par Séb, coach de
dirigeants. Il laisse de la place aux silences et s’adapte quand la personne souhaite revenir sur
une question ou prendre son temps. Elle choisit les notes à garder pour reprendre le fil à la
prochaine séance. Repartir avec une idée plus claire suffit ; une action n’est pas obligatoire.

### L’après-bulle : passer à l’action

À la fin de la bulle, un récap modifiable rassemble les décisions, les pistes envisagées et les
points à préciser. Il peut être copié vers n’importe quel assistant ou envoyé par email, avec ou
sans la retranscription complète. Le questionnaire de retour est juste en dessous.

Pour aller plus loin, la personne peut connecter Notion. Le récap devient son intention ; elle peut
ajouter une précision et choisir quelques pages. Trois agents examinent les documents, vérifient les
conclusions et préparent une proposition concrète. La personne la relit, la modifie et choisit de
publier une nouvelle page dans Notion.

Le bouton **L’après-bulle** est accessible dès l’accueil. Aucune connexion Notion n’est nécessaire
pour le coaching ou le récap. La transcription n’est jamais jointe à l’analyse Notion.

## Les agents derrière le parcours

Le coach suit le fil de la conversation et traite les demandes de la personne. Dans Notion, trois
agents prennent ensuite le relais, chacun avec un rôle précis :

1. **Explorer** les pages choisies et relever les éléments qui éclairent l’intention de la personne.
2. **Vérifier** les conclusions à partir des sources. Si elles ne sont pas assez étayées, arrêter la
   préparation et demander du contexte.
3. **Préparer** une proposition à discuter : une trame de réunion, une règle de décision ou une
   clarification des responsabilités.

La personne relit et peut modifier la proposition avant de publier une nouvelle page dans Notion.
Les documents existants ne sont pas modifiés. Voir [l’architecture](docs/architecture.md) pour le
fonctionnement et [le positionnement](docs/positionnement.md) pour un exemple de parcours complet.

## Essayer

**Application : https://bulle.hodge-podge.workers.dev**

**Dépôt : https://github.com/kennethassogba/hodge-podge**

L’application utilise réellement OpenAI : aucun mode découverte ni réponse préenregistrée. Le code
d’accès de l’équipe est la valeur `APP_ACCESS_CODE` du fichier local `.dev.vars` ; il se partage
séparément du dépôt. Chaque navigateur reçoit son espace personnel.

Un lien d’invitation peut ouvrir directement cet espace :
`https://bulle.hodge-podge.workers.dev/#access=CODE_ENCODE`. Remplacer `CODE_ENCODE` par la valeur
encodée de `APP_ACCESS_CODE`. Le fragment est retiré immédiatement de l’URL puis le code est vérifié
par le serveur. Ce lien donne accès aux essais : le partager avec les personnes invitées.

1. Écrire une situation dans le champ de message et entrer le code d’accès.
2. Envoyer le message, ou choisir **Appeler** et autoriser le microphone.
3. Pendant l’appel, parle naturellement : le coach détecte quand tu as terminé et répond
   directement. Tu peux revenir à une question précédente ou demander une pause. Par défaut, le
   coach attend 20 secondes avant de demander s’il peut continuer. Aucun bouton de prise de parole.
4. À la fin du script ou après **Raccrocher**, l’après-bulle s’ouvre après la sauvegarde. Pour un
   échange écrit, le coach peut clore la bulle ; le bouton **Terminer ma bulle** permet aussi de
   finir.
5. Modifier le récap, le copier ou se l’envoyer, puis donner son avis si on le souhaite.
6. Revenir au coach pour une **Nouvelle séance**. Les notes enregistrées avec **Garder quelques
   notes** restent la mémoire approuvée du coach ; le récap ne les remplace pas automatiquement.

Un casque est conseillé. L’appel s’arrête après vingt minutes dans l’interface. Le navigateur doit
rester ouvert.

Pour essayer les agents Notion, ouvrir **Continuer dans Notion** dans l’après-bulle, connecter son
espace, compléter le récap si nécessaire et sélectionner 1 à 3 pages. Cliquer sur **Examiner ces
documents**, puis relire la proposition avant de la publier.

## Développement local

Prérequis : Node.js 22 ou supérieur, npm, une clé API OpenAI disposant de crédits. ChatGPT Pro ne
remplace pas les crédits API.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Renseigner OPENAI_API_KEY, APP_ACCESS_CODE (12 caractères minimum)
# et ADMIN_ACCESS_CODE distinct (20 caractères minimum) pour le tableau équipe.
npm run types
npm run db:local
npm run dev
```

Ouvrir http://127.0.0.1:8787. Les modèles configurés dans `wrangler.jsonc` sont `gpt-4.1-mini` pour
le texte et les notes, `gpt-realtime-2.1` pour la voix et `gpt-4o-transcribe` pour la transcription.
L’accès à ces modèles a été vérifié avec le compte de l’équipe.

Pour activer l’intégration Notion, configurer les identifiants OAuth Notion selon [le guide
Notion](docs/notion.md). Sans cette configuration, le coach fonctionne normalement. La migration
`0003_notion.sql`, incluse dans les commandes de migration ci-dessus, ajoute les tables nécessaires.
Le guide détaille aussi les agents, les limites de lecture et les essais à réaliser. La migration
`0005_after_bubble.sql` ajoute les récaps, les retours des bulles écrites et le suivi des envois.

L’email utilise Resend avec un domaine vérifié : voir [le guide de
l’après-bulle](docs/apres-bulle.md). Sans configuration email, le récap, la copie, le questionnaire
et Notion restent disponibles.

```sh
npm run check
npm test
npm run build
```

Les tests utilisent une vraie base D1 locale et un fournisseur OpenAI simulé, sans consommer de
crédits. Ils couvrent l’isolation des espaces, les permissions, les décisions du coach,
l’approbation de la mémoire, les reprises et le raccrochage. Ils vérifient aussi les invitations,
les récaps complets, les modifications avant OAuth, les pièces jointes et les doublons d’email.
`build` vérifie le déploiement sans publier.

Un test audio réseau optionnel rejoue trois questions avec deux réponses synthétiques, sans activer
le microphone. Il consomme un peu de crédit OpenAI et utilise `.dev.vars`. Dans un environnement
Python disposant de `aiohttp` et `aiortc`, et avec Node.js sur le PATH :

```sh
python scripts/check-voice.py http://127.0.0.1:8787
python scripts/check-voice.py http://127.0.0.1:8787 en
# Vérifier aussi la demande de fin de séance et son au revoir :
python scripts/check-voice.py http://127.0.0.1:8787 fr --finish
# Ou passer l’URL du déploiement à vérifier.
```

Pour vérifier aussi le code frontend dans le navigateur, après avoir généré le fichier audio avec ce
test :

```sh
node scripts/browser-voice-test.mjs
```

Ouvrir http://127.0.0.1:8790, se connecter, puis **Appeler**. Le bouton de test **Envoyer une
réponse audio fictive** injecte une phrase dans le vrai canal WebRTC du navigateur ; aucun
microphone humain n’est ouvert. Répéter après chaque question, puis raccrocher. Les événements et
questions s’affichent au-dessus de l’application. Ce banc n’est jamais déployé. Il vise le backend
local par défaut ; `VOICE_TEST_UPSTREAM` peut désigner l’URL déployée.

L’espace fictif créé par le test Python est supprimé à la fin. Les tests `npm test` restent
entièrement locaux et sans crédit API.

## Hébergement

Cloudflare Workers sert la page et l’API ; D1 conserve les données. Pas de serveur à louer, de
numéro de téléphone ni de domaine à acheter : une adresse `workers.dev` suffit. Le projet reste
compatible avec les quotas gratuits Workers et D1. Les appels OpenAI sont payants, couverts d’abord
par les crédits disponibles ; ce n’est pas un service IA gratuit illimité.

Pour redéployer sur le compte de l’équipe :

```sh
npx wrangler login
npm run db:remote
npx wrangler secret bulk .dev.vars
npm run deploy
```

Pour un autre compte, créer d’abord une base avec `npx wrangler d1 create hodge-podge` et remplacer
`database_id` dans `wrangler.jsonc`. Aucun secret ne doit entrer dans Git. Les déploiements sont
manuels ; pousser sur GitHub ne publie pas automatiquement.

## Ce qui est implémenté

Messages et appel WebRTC OpenAI, silences automatiques, reprise après interruption, historique,
notes modifiables et supprimables, mémoire entre séances, effacement de l’espace et code d’accès. Le
modèle texte choisit entre clarifier, reformuler, explorer et clôturer ; ce choix reste interne et
n’apparaît pas dans l’interface. Un second appel au modèle prépare une note, dont la sauvegarde
exige une action de la personne.

L’agent vocal reçoit le fil récent et les notes approuvées. Realtime gère directement les tours de
parole et les interruptions avec `semantic_vad`. Les 14 questions du PDF sont dans les instructions
du modèle, qui doit les suivre dans l’ordre et mot pour mot, sauf demande explicite de répétition,
explication, retour en arrière, temps, passage de question, arrêt ou envie de passer à l’action.
L’agenda, les rappels, Telegram et les autres fournisseurs restent hors de cette version.

## Coaching en français et anglais

- Choix FR/EN avant l’appel : interface, protocole, voix, transcription et brouillons de notes. Les
  notes et échanges existants ne sont pas traduits automatiquement. Les deux scripts originaux Kedo
  (FR et EN, 24 septembre 2026) sont dans `public/coaching-protocol.js`.
- Filtrage OpenAI `far_field` pour micro intégré et `near_field` pour casque, en complément des
  traitements du navigateur. Une consigne privilégie le français de France et évite de répondre aux
  conversations lointaines. Cela ne garantit pas une immunité au bruit ni un accent parfait.
- Après l’appel, formulaire facultatif en quatre questions : recommandation 0–10, raison, valeur
  estimée et suggestions. Un seul envoi, sans case de partage ni commandes de modification. Le NPS
  apparaît dans le tableau équipe ; les anciens avis restent lisibles et ne sont pas comptés dans le
  NPS.
- Les passages de transcription utilisateur sont corrigeables et supprimables avant préparation des
  notes. Les notes déjà approuvées restent à modifier séparément.
- Tableau `/team.html`, code administrateur distinct, cookie HttpOnly de huit heures et déconnexion.
  Il affiche uniquement les avis explicitement partagés et des statistiques techniques agrégées :
  appels, fins enregistrées, durée, erreurs, interruptions détectées, échecs de transcription. Il
  n’expose pas les conversations ou notes. Les administrateurs de l’hébergement gardent un accès
  technique à la base.
- Retours et métriques sont supprimés avec l’espace et expirent avec lui ; les chiffres du tableau
  peuvent donc diminuer. Une interruption n’est pas forcément un bug, et un avis n’est pas une
  mesure causale d’impact.

Le code administrateur de cette installation est dans `.dev.vars.admin`, ignoré par Git. Pour une
autre installation, définir `ADMIN_ACCESS_CODE` dans `.dev.vars` puis dans les secrets Cloudflare.
Voir [le guide des essais](docs/essais.md).

## Données et limites

- Le fil écrit et les transcriptions restent dans D1. L’application ne stocke pas les fichiers
  audio. Texte et audio sont transmis à OpenAI pour traitement.
- L’espace de coaching est lié à un cookie de navigateur et expire après 30 jours ; une purge
  quotidienne supprime ensuite ses données. Perdre le cookie fait perdre l’accès à cet espace.
  L’après-bulle possède un compte Notion distinct, accessible sur plusieurs appareils ; voir [sa
  conservation des données](docs/notion.md#api-et-conservation).
- Seules les notes validées passent automatiquement d’une séance à l’autre. Dans une séance, le
  modèle reçoit au plus les 40 derniers messages ; la voix reçoit au plus les huit derniers messages
  écrits par la personne, sans anciennes questions de coaching. Maximum 20 notes.
- Les transcriptions d’appel sont sauvegardées à la fin. En cas d’échec, laisser la page ouverte
  pour réessayer. Fermer brutalement peut perdre la transcription.
- Aucun quota applicatif de messages, notes proposées ou appels et coupure automatique après vingt
  minutes dans le navigateur. OpenAI limite une session Realtime à 60 minutes ; ses limites de
  débit/crédit et les capacités Cloudflare continuent de s’appliquer. Les tentatives de connexion
  restent limitées contre le bruteforce. Un seul appel simultané par espace.
- Effacer l’espace supprime la base active, pas instantanément les journaux des fournisseurs. OpenAI
  : pas d’entraînement par défaut sauf partage volontaire ; journaux de surveillance des abus
  jusqu’à 30 jours avec exceptions. `store: false` pour les réponses texte ne signifie pas Zero Data
  Retention. D1 Time Travel : 7 jours en Free, 30 en Paid. Ces règles sont expliquées dans
  l’interface et dans [le guide des essais](docs/essais.md).
- Le code partagé protège un petit essai d’équipe ; ce prototype n’a pas une authentification de
  produit public. Ne pas publier ce code d’accès.

## Dossier d’équipe

| Document | Contenu |
|---|---|
| [Positionnement](docs/positionnement.md) | Les deux usages, leur intérêt et un parcours concret |
| [Architecture](docs/architecture.md) | Modèles, échanges, stockage et logique agentique |
| [L’après-bulle](docs/apres-bulle.md) | Récap, email et questionnaire |
| [Notion](docs/notion.md) | Connexion, trois agents et publication |
| [Silences](docs/silence.md) | Comportements et tests à faire avec Séb |
| [Plan](docs/plan.md) | Travail fait et prochaine étape pour chacun |
| [Soumission](docs/soumission.md) | Texte de présentation validé, vidéo de deux minutes et dépôt |
| [Décisions et sources](docs/decisions-et-sources.md) | Choix et références |

Ce dépôt est le point central pour les trois membres. Les documents sont modifiables depuis GitHub.
Les noms complets, la vidéo et le dépôt au hackathon restent à compléter. Échéance annoncée : 27
septembre 2026 à 23 h 59, fuseau à confirmer auprès de l’organisation.

Référence de coaching : exemple Kedo transmis par Séb, daté du 24 septembre 2026. À la demande
explicite de l’équipe, les 14 questions originales sont intégrées dans `public/coaching-protocol.js`
avec leur attribution. Leur ordre et leur formulation servent de référence stricte. Police Manrope
distribuée avec sa licence OFL dans `public/fonts/LICENSE-manrope.txt`.

## Version 0.4.1

Navigation permanente entre le coach et l’après-bulle, textes allégés, nouveau questionnaire FR/EN
et NPS. Appliquer la migration additive `0004_nps.sql` avant déploiement. Le stockage des échanges
reste côté serveur, lié au navigateur ; aucun stockage local exclusif n’est annoncé.
