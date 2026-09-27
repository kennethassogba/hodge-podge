# Conversation vocale et pauses demandées

La personne parle et peut interrompre le coach. Le seul bouton est **Raccrocher**.
Les 14 questions originales françaises et anglaises de Kedo restent inchangées.

## Conversation ordinaire

Realtime gère les tours de parole avec `semantic_vad`, `eagerness: medium`, `create_response: true`
et `interrupt_response: true`. Les silences ordinaires ne déclenchent aucun chronomètre client.
La conversation ne dépend pas de la transcription. Le navigateur demande l’accueil ; les réponses
ordinaires suivantes viennent de la détection native de fin de parole.

## Revenir à une question

Une demande de retour est prioritaire sur l’avancement du protocole. Le coach accepte brièvement et
laisse la personne compléter sa réponse. Il répète la question uniquement si elle le demande ; il
clarifie la question visée si nécessaire. Il reprend ensuite à la première question restée sans
réponse, sans recommencer les étapes déjà répondues ni relancer l’accueil d’un nouvel appel.

## Demander du temps

Le modèle appelle `pause_coaching` uniquement sur demande explicite, sans avancer le protocole.
L’application fait dire « Bien sûr, prends ton temps. » une seule fois puis attend la fin de cette
phrase pour démarrer le délai. En anglais : « Of course, take your time. »

- « Attends, je note », « une minute » ou « deux minutes » : 20 secondes par défaut.
- Une durée en secondes, ou une durée expressément exacte : respecter cette durée.
- « Je te dirai quand reprendre » ou « ne me relance pas » : aucune relance automatique.
- Si la personne reprend la parole, annuler la relance prévue et laisser Realtime répondre.
- Sinon, demander une seule fois « Est-ce qu’on peut continuer ? », puis attendre la réponse.
- Un accord pour continuer ne compte pas comme réponse à la question Kedo encore en attente.
- Une nouvelle demande de temps peut créer une nouvelle pause. Pas de relances répétitives.

Le délai utilise une minuterie de l’application, pas une estimation du modèle. Les protections contre
une connexion bloquée restent actives pendant une réponse, mais ne coupent pas une pause demandée.
La limite globale de 20 minutes continue de s’appliquer. Le raccrochage annule toute relance.
L’outil est proposé seulement aux clients qui déclarent `pauseSupport: true`, afin de préserver les
onglets ouverts avec une ancienne version de l’application.

Par écrit, le coach accepte aussi les retours et les pauses, puis attend le prochain message ; il
n’envoie pas de relance chronométrée.

## Réponses interrompues et reprise

La limite de sortie vocale est de 2 048 tokens par réponse ; les consignes continuent de demander
une seule question courte. L’ancien plafond de 300 tokens pouvait couper une explication parlée.

Le navigateur lit `response.status_details`. Une réponse tronquée par `max_output_tokens` ou une
panne `server_error` déclenche au maximum une reprise par tour, avec un plafond de 4 096 tokens.
La sortie inachevée est retirée du contexte Realtime et de la transcription, puis la même demande
est relancée. L’accueil, l’accusé de réception d’une pause et la clôture gardent leurs consignes.
Toute nouvelle prise de parole annule la reprise prévue. Une interruption normale n’est pas une
panne. Les refus du filtre de contenu et les erreurs de quota ne sont pas retentés.

Si la reprise échoue aussi, l’appel se ferme proprement et conserve les échanges reçus. Le navigateur
transmet les catégories techniques à `/api/call/diagnostic`, uniquement pour son propre appel.
Les logs Cloudflare `voice_response_issue` contiennent des catégories autorisées, le nombre de tokens
et l’indication de reprise prévue. Aucun texte, audio ou message brut du fournisseur n’y est ajouté.
Ces journaux suivent l’échantillonnage configuré ; ils ne sont pas un historique exhaustif.

## Sauvegarde à la fin de l’appel

La fermeture du micro est immédiate. La sauvegarde et le rechargement du fil sont ensuite retentés
jusqu’à trois fois en cas d’erreur réseau ou temporaire du serveur, avec des attentes de 750 ms
puis 1 750 ms. Chaque requête expire au bout de quinze secondes. Les tentatives simultanées
(bouton, retour en ligne) partagent le même travail ; le serveur déduplique par identifiant d’appel.

Une écriture confirmée n’est pas renvoyée si seul le rechargement du fil échoue. Dans ce cas, le
message indique que l’échange est sauvegardé et propose d’actualiser le fil. Après trois échecs de
sauvegarde, la transcription reste en mémoire dans l’onglet et le bouton de reprise reste disponible,
y compris si une reprise manuelle échoue aussi. L’onglet doit rester ouvert. Le passage à
l’après-bulle attend une sauvegarde confirmée et le chargement du fil.

## Téléphone et mise en veille

Pendant un appel actif, l’application demande un Screen Wake Lock pour empêcher la veille
automatique de l’écran. Elle le libère au raccrochage, à la limite de vingt minutes et à la sortie
de la page. Une autorisation reçue après la fin de l’appel est immédiatement libérée.

Le retour sur une page visible redemande cette protection. Si le navigateur a suspendu la lecture
audio, l’application tente de la reprendre ; si un geste est nécessaire, une courte indication
invite à toucher l’écran. Ce retour n’envoie aucune nouvelle question au modèle.

Une API absente ou un refus du système ne bloque pas l’appel : l’indication invite à garder
l’écran ouvert. Un verrouillage manuel, un changement d’application ou une batterie faible peut
suspendre le navigateur. Ce correctif ne garantit pas un appel écran verrouillé, ni la récupération
d’une connexion WebRTC coupée. Un essai sur iPhone reste nécessaire pour valider le comportement
réel du système, au-delà des tests simulés de visibilité et de refus.

Références : [Screen Wake Lock](https://www.w3.org/TR/screen-wake-lock/) et
[suspension des pages par WebKit](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/).

## Vérification

Les tests de `tests/voice-ui.test.js` exécutent le vrai contrôleur avec des événements WebRTC fictifs.
Ils couvrent la fin de lecture de l’accusé de réception, les délais, la reprise anticipée, les outils
arrivant en retard, l’absence de relances répétées et le raccrochage pendant une pause. Ils gardent
les tests des réponses natives, interruptions, erreurs de transcription et sauvegarde.

`tests/api.test.js` vérifie les paramètres Realtime et la compatibilité des anciens clients.

Le test facultatif payant `scripts/check-coach-controls.py` utilise le modèle Realtime réel avec des
messages fictifs pour vérifier les durées et le retour à une question en français et en anglais :

```sh
python scripts/check-coach-controls.py
```

Il nécessite Node.js sur PATH, Python avec `aiohttp` et `.dev.vars` configuré. Il ne prend pas le
microphone et ne sauvegarde aucune conversation dans l’application. Ce test de compréhension ne
remplace pas les tests du contrôleur ni un essai vocal humain.

`scripts/check-voice.py` vérifie les trois premières questions avec deux réponses audio synthétiques.
Avec `--finish`, il vérifie aussi la clôture. `scripts/browser-voice-test.mjs` permet un essai du vrai
frontend avec un microphone synthétique dans le navigateur.

[Détection native](https://developers.openai.com/api/docs/guides/realtime-vad) ·
[Outils Realtime](https://developers.openai.com/api/docs/guides/realtime-mcp)

`scripts/check-voice-recovery.py` reproduit, sur le modèle réel et avec une explication fictive, une
réponse audio tronquée à 300 tokens, puis sa reprise complète dans la même session. Ce contrôle
facultatif est payant et nécessite le même environnement Python que les autres contrôles Realtime.
