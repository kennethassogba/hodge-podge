# Le silence, concrètement

Implémentation : `public/turn-controller.js` et gestion WebRTC dans `public/app.js`.

## Règles actuelles

| Situation | Comportement |
|---|---|
| Fin de parole détectée | Démarrer cinq secondes de silence protégé |
| Reprise avant l’échéance | Annuler le délai ; repartir après la nouvelle fin de parole |
| Transcription encore en cours | Attendre, même si les cinq secondes sont écoulées |
| **Je réfléchis** | Interrompre le coach et suspendre les relances sans limite de silence |
| La personne reparle pendant cette pause | Écouter ; la pause reste active après sa phrase |
| **À toi** | Autoriser une réponse lorsque la parole et la transcription sont terminées |
| Reprise pendant la réponse | Annuler la génération, vider le tampon audio et couper immédiatement la lecture locale |
| Micro coupé ou appel terminé | Annuler les réponses en attente |
| Aucun mot après l’accueil | Rester à l’écoute, sans relance automatique en boucle |

Le détecteur OpenAI attend environ 400 ms pour signaler une fin de parole ; notre fenêtre de cinq secondes commence à cet événement. Le délai réel depuis le dernier son est donc plus long, avec la latence réseau. Il s’agit d’un choix à ajuster avec Séb, pas d’une norme de coaching.

Les expressions « attends », « laisse-moi réfléchir » et « je réfléchis » peuvent aussi déclencher la pause après transcription. « À toi » ou « tu peux répondre », seuls dans une phrase, rendent la main. Les boutons sont plus fiables que la reconnaissance de ces expressions, qui peut se tromper sur une citation ou une négation.

## Pourquoi ce n’est pas uniquement un prompt

Realtime a `create_response: false`. Le logiciel pilote `response.create`, invalide les minuteries périmées et contrôle la lecture audio. La consigne donnée au modèle porte sur la qualité de la question ; elle n’assure pas le silence à elle seule.

## Tests

Les tests déterministes vérifient les cinq secondes, une reprise à 4,8 secondes, une pause volontaire de vingt secondes, la persistance de cette pause, une transcription retardée, le micro coupé et la déconnexion. L’horloge est simulée ; cela ne mesure pas la latence d’un vrai microphone.

Recette à réaliser avec Séb, sur ordinateur puis téléphone :

1. Parler, faire une pause de deux secondes, reprendre : le coach ne doit pas commencer sa réponse.
2. Après une question, choisir **Je réfléchis**, attendre vingt secondes et reparler : aucune relance jusqu’à **À toi**.
3. Interrompre le coach au milieu d’une phrase : vérifier ce qu’on entend et le fil enregistré.
4. Couper le micro, puis raccrocher : pas de réponse retardée ni de micro laissé actif.
5. Refuser le microphone et tester une coupure réseau : pouvoir continuer par écrit ou réessayer la sauvegarde.

Le bruit ambiant, les permissions du navigateur et les interruptions pendant la génération restent à éprouver dans les conditions de démo. Ne pas présenter les tests automatiques comme une validation de tout le trajet audio.
