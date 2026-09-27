# La Bulle — Hodge Podge

Une application de coaching par messages et appel vocal. Les questions du protocole Kedo, une à la fois, du temps pour réfléchir, et des notes que la personne choisit de garder pour la prochaine séance. Projet du hackathon X-IA, construit avec OpenAI et Cloudflare.

## Essayer

**Application : https://bulle.hodge-podge.workers.dev**

**Dépôt : https://github.com/kennethassogba/hodge-podge**

L’application utilise réellement OpenAI : aucun mode découverte ni réponse préenregistrée. Le code d’accès de l’équipe est la valeur `APP_ACCESS_CODE` du fichier local `.dev.vars` ; il se partage séparément du dépôt. Chaque navigateur reçoit son espace personnel.

1. Écrire une situation dans le champ de message et entrer le code d’accès.
2. Envoyer le message, ou choisir **Appeler** et autoriser le microphone.
3. Pendant l’appel, parle naturellement : OpenAI détecte quand tu as terminé et répond directement. Les minuteries de silence ajoutées dans le navigateur ont été retirées. Il n’y a aucun bouton de prise de parole ; seul **Raccrocher** reste affiché.
4. Raccrocher, choisir **Garder quelques notes**, corriger la proposition puis **Conserver**.
5. Ouvrir une **Nouvelle séance** : les notes conservées accompagnent le nouvel échange.

Un casque est conseillé. L’appel s’arrête après vingt minutes dans l’interface. Le navigateur doit rester ouvert. Le test de confort vocal avec Séb reste indispensable : les tests automatiques ne remplacent pas une conversation humaine.

## Développement local

Prérequis : Node.js 22 ou supérieur, npm, une clé API OpenAI disposant de crédits. ChatGPT Pro ne remplace pas les crédits API.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Renseigner OPENAI_API_KEY, APP_ACCESS_CODE (12 caractères minimum)
# et ADMIN_ACCESS_CODE distinct (20 caractères minimum) pour le tableau équipe.
npm run types
npm run db:local
npm run dev
```

Ouvrir http://127.0.0.1:8787. Les modèles configurés dans `wrangler.jsonc` sont `gpt-4.1-mini` pour le texte et les notes, `gpt-realtime-2.1` pour la voix et `gpt-4o-transcribe` pour la transcription. L’accès à ces modèles a été vérifié avec le compte de l’équipe.

```sh
npm run check
npm test
npm run build
```

Les tests utilisent une vraie base D1 locale et un fournisseur OpenAI simulé, sans consommer de crédits. Ils couvrent l’isolation des espaces, les permissions, les décisions du coach, l’approbation de la mémoire et les reprises de conversation et le raccrochage. `build` vérifie le déploiement sans publier.

Un test audio réseau optionnel rejoue trois questions avec deux réponses synthétiques, sans activer le microphone. Il consomme un peu de crédit OpenAI et utilise `.dev.vars`. Dans un environnement Python disposant de `aiohttp` et `aiortc`, et avec Node.js sur le PATH :

```sh
python scripts/check-voice.py http://127.0.0.1:8787
python scripts/check-voice.py http://127.0.0.1:8787 en
# Ou passer l’URL du déploiement à vérifier.
```

Pour vérifier aussi le code frontend dans le navigateur, après avoir généré le fichier audio avec ce test :

```sh
node scripts/browser-voice-test.mjs
```

Ouvrir http://127.0.0.1:8790, se connecter, puis **Appeler**. Le bouton de test **Envoyer une réponse audio fictive** injecte une phrase dans le vrai canal WebRTC du navigateur ; aucun microphone humain n’est ouvert. Répéter après chaque question, puis raccrocher. Les événements et questions s’affichent au-dessus de l’application. Ce banc n’est jamais déployé. Il vise le backend local par défaut ; `VOICE_TEST_UPSTREAM` peut désigner l’URL déployée.

L’espace fictif créé par le test Python est supprimé à la fin. Les tests `npm test` restent entièrement locaux et sans crédit API.

## Hébergement

Cloudflare Workers sert la page et l’API ; D1 conserve les données. Pas de serveur à louer, de numéro de téléphone ni de domaine à acheter : une adresse `workers.dev` suffit. Le projet reste compatible avec les quotas gratuits Workers et D1. Les appels OpenAI sont payants, couverts d’abord par les crédits disponibles ; ce n’est pas un service IA gratuit illimité.

Pour redéployer sur le compte de l’équipe :

```sh
npx wrangler login
npm run db:remote
npx wrangler secret bulk .dev.vars
npm run deploy
```

Pour un autre compte, créer d’abord une base avec `npx wrangler d1 create hodge-podge` et remplacer `database_id` dans `wrangler.jsonc`. Aucun secret ne doit entrer dans Git. Les déploiements sont manuels ; pousser sur GitHub ne publie pas automatiquement.

## Ce qui est implémenté

Messages et appel WebRTC OpenAI, silences automatiques, reprise après interruption, historique, notes modifiables et supprimables, mémoire entre séances, effacement de l’espace et code d’accès. Le modèle texte choisit entre clarifier, reformuler, explorer et clôturer ; ce choix reste interne et n’apparaît pas dans l’interface. Un second appel au modèle prépare une note, dont la sauvegarde exige une action de la personne.

L’agent vocal reçoit le fil récent et les notes approuvées. Realtime gère directement les tours de parole et les interruptions avec `semantic_vad`. Les 14 questions du PDF sont dans les instructions du modèle, qui doit les suivre dans l’ordre et mot pour mot, sauf demande explicite de répétition, explication, temps, passage de question, arrêt ou envie de passer à l’action. Le logiciel ne prétend ni lire un agenda ni envoyer un rappel. L’agenda, Telegram et les autres fournisseurs restent hors de cette version.

## Version 0.4.0 : suite facultative dans Notion

La navigation de l’accueil ouvre `/notion`. La personne connecte Notion uniquement si elle souhaite poursuivre. Elle choisit une intention et quelques pages ; trois agents examinent les documents, vérifient les conclusions et préparent une nouvelle page à relire avant publication. Aucune transcription n’est jointe automatiquement. La connexion Notion sert aussi à retrouver cet espace sur plusieurs appareils. Configuration, limites, API et recette : [docs/notion.md](docs/notion.md).

Sans identifiants OAuth configurés, cette suite indique qu’elle n’est pas encore activée ; le coach fonctionne normalement. La migration `0003_notion.sql` est nécessaire avant déploiement.

## Coaching en français et anglais

- Choix FR/EN avant l’appel : interface, protocole, voix, transcription et brouillons de notes. Les notes et échanges existants ne sont pas traduits automatiquement. Les deux scripts originaux Kedo (FR et EN, 24 septembre 2026) sont dans `public/coaching-protocol.js`.
- Filtrage OpenAI `far_field` pour micro intégré et `near_field` pour casque, en complément des traitements du navigateur. Une consigne privilégie le français de France et évite de répondre aux conversations lointaines. Cela ne garantit pas une immunité au bruit ni un accent parfait.
- Après l’appel, formulaire facultatif en quatre questions : recommandation 0–10, raison, valeur estimée et suggestions. Un seul envoi, sans case de partage ni commandes de modification. Le NPS apparaît dans le tableau équipe ; les anciens avis restent lisibles et ne sont pas comptés dans le NPS.
- Les passages de transcription utilisateur sont corrigeables et supprimables avant préparation des notes. Les notes déjà approuvées restent à modifier séparément.
- Tableau `/team.html`, code administrateur distinct, cookie HttpOnly de huit heures et déconnexion. Il affiche uniquement les avis explicitement partagés et des statistiques techniques agrégées : appels, fins enregistrées, durée, erreurs, interruptions détectées, échecs de transcription. Il n’expose pas les conversations ou notes. Les administrateurs de l’hébergement gardent un accès technique à la base.
- Retours et métriques sont supprimés avec l’espace et expirent avec lui ; les chiffres du tableau peuvent donc diminuer. Une interruption n’est pas forcément un bug, et un avis n’est pas une mesure causale d’impact.

Le code administrateur de cette installation est dans `.dev.vars.admin`, ignoré par Git. Pour une autre installation, définir `ADMIN_ACCESS_CODE` dans `.dev.vars` puis dans les secrets Cloudflare. Voir [le guide des essais](docs/essais.md).

## Données et limites

- Le fil écrit et les transcriptions restent dans D1. L’application ne stocke pas les fichiers audio. Texte et audio sont transmis à OpenAI pour traitement.
- Un espace est lié à un cookie de navigateur et expire après 30 jours ; une purge quotidienne supprime ensuite ses données. Perdre le cookie fait perdre l’accès : pas de compte ni de synchronisation entre appareils.
- Seules les notes validées passent automatiquement d’une séance à l’autre. Dans une séance, le modèle reçoit au plus les 40 derniers messages ; la voix reçoit au plus les huit derniers messages écrits par la personne, sans anciennes questions de coaching. Maximum 20 notes.
- Les transcriptions d’appel sont sauvegardées à la fin. En cas d’échec, laisser la page ouverte pour réessayer. Fermer brutalement peut perdre la transcription.
- Aucun quota applicatif de messages, notes proposées ou appels et coupure automatique après vingt minutes dans le navigateur. OpenAI limite une session Realtime à 60 minutes ; ses limites de débit/crédit et les capacités Cloudflare continuent de s’appliquer. Les tentatives de connexion restent limitées contre le bruteforce. Un seul appel simultané par espace.
- Effacer l’espace supprime la base active, pas instantanément les journaux des fournisseurs. OpenAI : pas d’entraînement par défaut sauf partage volontaire ; journaux de surveillance des abus jusqu’à 30 jours avec exceptions. `store: false` pour les réponses texte ne signifie pas Zero Data Retention. D1 Time Travel : 7 jours en Free, 30 en Paid. Ces règles sont expliquées dans l’interface et dans [le guide des essais](docs/essais.md).
- Le code partagé protège un petit essai d’équipe ; ce prototype n’a pas une authentification de produit public. Ne pas publier ce code d’accès.

## Dossier d’équipe

| Document | Contenu |
|---|---|
| [L’idée](docs/positionnement.md) | Parcours et exemple Camille/Alex, sans jargon |
| [Architecture](docs/architecture.md) | Modèles, échanges, stockage et logique agentique |
| [Silences](docs/silence.md) | Comportements et tests à faire avec Séb |
| [Plan](docs/plan.md) | Travail fait et prochaine étape pour chacun |
| [Soumission](docs/soumission.md) | Description, vidéo de deux minutes et dépôt |
| [Décisions et sources](docs/decisions-et-sources.md) | Choix et références |

Ce dépôt est le point central pour les trois membres. Les documents sont modifiables depuis GitHub. Les noms complets, la vidéo et le dépôt au hackathon restent à compléter. Échéance annoncée : 27 septembre 2026 à 23 h 59, fuseau à confirmer auprès de l’organisation.

Référence de coaching : exemple Kedo transmis par Séb, daté du 24 septembre 2026. À la demande explicite de l’équipe, les 14 questions originales sont intégrées dans `public/coaching-protocol.js` avec leur attribution. Leur ordre et leur formulation servent de référence stricte. La fidélité vocale et la qualité de l’écoute restent à valider avec Séb. Police Manrope distribuée avec sa licence OFL dans `public/fonts/LICENSE-manrope.txt`.

## Version 0.4.1

Navigation permanente entre le coach et l’après-bulle, textes allégés, nouveau questionnaire FR/EN et NPS. Appliquer la migration additive `0004_nps.sql` avant déploiement. Le stockage des échanges reste côté serveur, lié au navigateur ; aucun stockage local exclusif n’est annoncé.
