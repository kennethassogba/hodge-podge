# Après la bulle — Notion (0.4.0)

Le coaching conserve son parcours actuel. Aucun compte personnel ou accès Notion n’est demandé pour une bulle ; le code partagé des essais reste inchangé. Un bouton permanent sur l’accueil ouvre `/notion`, la suite facultative. La page Notion propose aussi un retour direct vers la bulle.

## Activer OAuth

Créer une **connexion publique** dans le portail développeur Notion, nommée **La Bulle**, portée **Any workspace**. Ce choix est fixé lors de la création. Demander **Read content** et **Insert content**, sans Update content ni accès aux emails.

- Site : https://bulle.hodge-podge.workers.dev/
- Retour OAuth exact : https://bulle.hodge-podge.workers.dev/api/notion/callback
- Confidentialité : https://bulle.hodge-podge.workers.dev/privacy.html
- Renseigner Client ID et Client Secret dans `.dev.vars.notion` (ignoré par Git, permissions 600). Ne pas les coller dans un chat ou une issue.
- Un secret serveur indépendant `NOTION_TOKEN_KEY` (32 octets, hexadécimal) chiffre les jetons AES-GCM. Ne pas le renouveler sans migration des jetons existants.
- Charger les trois secrets dans le Worker via `wrangler secret bulk` depuis un fichier JSON protégé. L’URI publique est dans `wrangler.jsonc`.
- Appliquer `npm run db:remote` avant le déploiement (migration 0003).
- En développement, charger les mêmes clés dans `.dev.vars` et définir une URI locale explicitement enregistrée dans Notion. Ne pas remplacer l’URI de production.

L’activation et les éventuelles exigences de validation Notion doivent être vérifiées dans le portail ; l’existence d’un Client ID ne suffit pas à valider le parcours réel. Sans secrets, la page indique que la connexion n’est pas activée et le coach reste disponible.

## Parcours et identité

OAuth sert aussi de connexion personnelle : aucune autre connexion obligatoire. L’identité est l’empreinte du couple utilisateur Notion + workspace, jamais le bot ou le workspace seul. Reconnecter le même couple retrouve les propositions sur un autre navigateur. Un OAuth sans identité utilisateur est refusé. Aucune fusion avec les cookies du coach.

Le départ OAuth est un POST same-origin. `state` est aléatoire, à usage unique, valable dix minutes et associé à un cookie de navigateur HttpOnly/SameSite=Lax. Le cookie de session Notion est distinct, HttpOnly/SameSite=Strict. Les secrets restent chiffrés dans D1 avec une clé Cloudflare et une authentification AES-GCM liée au compte. Les refresh tokens sont renouvelés avec un verrou ; les paramètres d’URL sont masqués dans les logs Cloudflare.

La personne écrit une intention ou choisit explicitement une note approuvée, sélectionne 1–3 pages, et autorise leur analyse par OpenAI. Aucune transcription n’est jointe. Les pages ne sont pas explorées au moment de l’appel vocal. La recherche Notion liste les pages autorisées, avec recherche par titre et pagination.

## Agents et exécution

1. Lecture limitée des pages choisies : cinq requêtes de blocs au plus par page, profondeur deux, 16 000 caractères par page, 3 000 par bloc. Les sous-pages, bases et blocs synchronisés ne sont pas traversés. Une lecture partielle est signalée ; elle ne justifie pas une conclusion d’absence.
2. Enquête : hypothèse organisationnelle, éléments favorables et incertitudes. Chaque citation doit correspondre exactement à un bloc lu ; une citation inventée stoppe la proposition.
3. Vérification indépendante : confrontée aux sources originales, elle peut refuser les conclusions. Dans ce cas, on demande du contexte, sans rédiger de proposition.
4. Rédaction : une nouvelle page concrète à discuter (règle, trame de réunion, clarification), jamais une décision déjà acceptée.

Les trois rôles appellent OpenAI Responses avec `store:false` et une sortie structurée. Les données des documents ne sont pas des instructions. Les agents ne disposent d’aucun outil d’écriture Notion. Pas de recherche web ni de suivi automatique des liens externes.

Les étapes et verrous sont persistés dans D1. L’interface accélère l’avancement ; une tâche Cloudflare chaque minute reprend jusqu’à deux travaux même navigateur fermé. Une étape interrompue devient reprenable après 90 secondes, jusqu’à trois tentatives. Un seul examen actif par compte évite les doublons. Les sources ne sont pas gardées en mémoire globale du Worker.

La personne relit et peut modifier le titre et le texte, choisit une page parente, puis valide la publication et ses sources. Les sources sont revérifiées avant la création. L’API crée une seule nouvelle sous-page ; aucun document existant n’est modifié. Une réponse réseau ambiguë bloque les reprises automatiques pour éviter les doublons et demande de vérifier Notion. Aucun ajout au calendrier ou message à un tiers.

## API et conservation

`/api/notion/status`, POST `/start`, GET `/callback`, POST `/logout`, DELETE `/connection`, GET `/pages`, GET/POST `/jobs`, GET/DELETE `/jobs/:id`, POST `/jobs/:id/advance`, POST `/jobs/:id/publish`.

Les accès aux propositions sont toujours filtrés par compte. Le tableau équipe ne les expose pas. Le compte Notion, les extraits et propositions expirent après 30 jours sans reconnexion. Déconnexion ferme seulement la session ; retrait de connexion efface le compte, toutes ses sessions et travaux et tente la révocation fournisseur. Les pages déjà créées restent dans Notion. Le bouton d’effacement du coach ne supprime pas cet espace distinct. Les limites de conservation fournisseurs restent applicables.

## Recette

Déploiement du 27 septembre 2026 : migration 0003 appliquée, secrets OAuth et clé de chiffrement configurés, pages publiques et départ OAuth vérifiés en production. Les 23 tests automatiques passent. L'autorisation réelle d'un utilisateur et la publication dans son espace Notion restent à vérifier ; aucun document personnel n'a été lu pour ces vérifications.

Tests automatiques avec Notion et OpenAI simulés : state/CSRF/rejeu/refus, comptes distincts dans un même workspace, reconnexion multiappareil, jetons chiffrés et renouvellement, citations, veto du vérificateur, approbation, destination explicite, publication idempotente et incertaine, effacement isolé. Les tests vocaux existants doivent tous passer.

Recette réelle après activation : connecter un compte test, choisir deux pages non sensibles, lancer un examen, fermer la page, revenir, relire les citations puis publier dans une page test. Refuser OAuth puis retirer l’accès à une page pour vérifier les messages d’erreur. Ne pas présenter les tests simulés comme une validation de la connexion réelle.
