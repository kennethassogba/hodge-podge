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
