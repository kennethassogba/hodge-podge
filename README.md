# La Bulle — Hodge Podge

Une application de coaching par messages et appel vocal. Les questions du protocole Kedo, une à la fois, du temps pour réfléchir, et des notes que la personne choisit de garder pour la prochaine séance. Projet du hackathon X-IA, construit avec OpenAI et Cloudflare.

## Essayer

**Application : https://hodge-podge.kennethassogba.workers.dev**

**Dépôt : https://github.com/kennethassogba/hodge-podge**

L’application utilise réellement OpenAI : aucun mode découverte ni réponse préenregistrée. Le code d’accès de l’équipe est la valeur `APP_ACCESS_CODE` du fichier local `.dev.vars` ; il se partage séparément du dépôt. Chaque navigateur reçoit son espace personnel.

1. Écrire une situation dans le champ de message et entrer le code d’accès.
2. Envoyer le message, ou choisir **Appeler** et autoriser le microphone.
3. Pendant l’appel, parle naturellement : le coach attend cinq secondes après tes premières réponses, puis trois secondes dans la suite de la bulle. Toute reprise de parole recommence ce délai. Il n’y a aucun bouton de prise de parole ; seul **Raccrocher** reste affiché.
4. Raccrocher, choisir **Garder quelques notes**, corriger la proposition puis **Conserver**.
5. Ouvrir une **Nouvelle séance** : les notes conservées accompagnent le nouvel échange.

Un casque est conseillé. L’appel s’arrête après dix minutes dans l’interface. Le navigateur doit rester ouvert. Le test de confort vocal avec Séb reste indispensable : les tests automatiques ne remplacent pas une conversation humaine.

## Développement local

Prérequis : Node.js 22 ou supérieur, npm, une clé API OpenAI disposant de crédits. ChatGPT Pro ne remplace pas les crédits API.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Renseigner OPENAI_API_KEY et un APP_ACCESS_CODE d’au moins 12 caractères.
npm run types
npm run db:local
npm run dev
```

Ouvrir http://127.0.0.1:8787. Les modèles configurés dans `wrangler.jsonc` sont `gpt-4.1-mini` pour le texte et les notes, `gpt-realtime-2.1` pour la voix et `gpt-4o-mini-transcribe` pour la transcription. L’accès à ces modèles a été vérifié avec le compte de l’équipe.

```sh
npm run check
npm test
npm run build
```

Les tests utilisent une vraie base D1 locale et un fournisseur OpenAI simulé, sans consommer de crédits. Ils couvrent l’isolation des espaces, les permissions, les décisions du coach, l’approbation de la mémoire et les silences. `build` vérifie le déploiement sans publier.

Un test audio réseau optionnel rejoue trois questions avec deux réponses synthétiques, sans activer le microphone. Il consomme un peu de crédit OpenAI et utilise `.dev.vars`. Dans un environnement Python disposant de `aiohttp` et `aiortc`, et avec Node.js sur le PATH :

```sh
python scripts/check-voice.py http://127.0.0.1:8787
# Ou passer l’URL du déploiement à vérifier.
```

L’espace fictif créé par ce test est supprimé à la fin. Les tests `npm test` restent entièrement locaux et sans crédit API.

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

Messages et appel WebRTC OpenAI, silences automatiques, reprise après interruption, historique, notes modifiables et supprimables, mémoire entre séances, effacement de l’espace et code d’accès. Le modèle texte choisit entre clarifier, reformuler, explorer et clôturer ; son choix est visible dans le volet technique. Un second appel au modèle prépare une note, dont la sauvegarde exige une action de la personne.

L’agent vocal reçoit le fil récent et les notes approuvées. Le code décide **quand** il peut répondre et indique la prochaine question du PDF. Le modèle la prononce mot pour mot, sauf demande explicite de répétition, explication, temps ou arrêt. Le logiciel ne prétend ni lire un agenda ni envoyer un rappel. Notion, Telegram et les autres fournisseurs sont hors de cette version.

## Données et limites

- Le fil écrit et les transcriptions restent dans D1. L’application ne stocke pas les fichiers audio. Texte et audio sont transmis à OpenAI pour traitement.
- Un espace est lié à un cookie de navigateur et expire après 30 jours ; une purge quotidienne supprime ensuite ses données. Perdre le cookie fait perdre l’accès : pas de compte ni de synchronisation entre appareils.
- Seules les notes validées passent automatiquement d’une séance à l’autre. Dans une séance, le modèle reçoit au plus les 40 derniers messages ; la voix reçoit les 16 derniers. Maximum 20 notes.
- Les transcriptions d’appel sont sauvegardées à la fin. En cas d’échec, laisser la page ouverte pour réessayer. Fermer brutalement peut perdre la transcription.
- Limites serveur : 150 demandes texte/notes et 12 ouvertures d’appel par jour au total ; 60 messages et 4 appels par espace. Les essais échoués peuvent compter. Le minuteur vocal est côté navigateur : ces limites ne constituent pas un plafond financier garanti.
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
