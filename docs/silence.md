# Conversation vocale : version native

La personne parle et peut interrompre le coach. Le seul bouton est **Raccrocher**.

## Ce qui a changé

Les délais fixes de cinq puis trois secondes et le contrôleur JavaScript associé ont été retirés. Le bug `Illegal invocation` provenait de fonctions natives de minuterie appelées avec un objet comme contexte (`this.clearTimer(...)`). Il pouvait interrompre la gestion d’un tour, puis faire échouer le nettoyage de l’appel lui-même.

Realtime gère désormais directement les tours de parole : `semantic_vad`, `eagerness: medium`, `create_response: true`, `interrupt_response: true`. Le navigateur demande seulement l’accueil. Le modèle reprend après la réponse de l’utilisateur sans `response.create` envoyé par le client, sans transcription obligatoire et sans compteur de secondes client.

Ce réglage ne garantit pas une pause précise de cinq secondes. La priorité de cette version est une conversation qui continue. La détection s’appuie sur la fin de l’énoncé ; son comportement doit être essayé avec Séb.

## Script

Les 14 questions originales, attribuées à Kedo Academy by Tirezio, sont dans `public/coaching-protocol.js` et les instructions serveur. Le modèle doit les suivre dans l’ordre, mot pour mot, avec une brève adaptation seulement si la personne demande une explication, une répétition, du temps ou l’arrêt. Le client ne bloque plus la conversation sur une comparaison de transcription.

## Vérification

Les tests d’interface contrôlent plusieurs réponses automatiques successives, une transcription manquante, le raccrochage quand la fermeture du transport échoue et la récupération après absence de réponse. Les minuteries de test rejettent un mauvais contexte d’appel, comme le navigateur.

Le script `scripts/check-voice.py` n’envoie qu’une seule demande de réponse pour l’accueil ; toutes les suivantes doivent venir du transport natif. Il utilise deux réponses audio synthétiques et vérifie les trois premières questions. Il ne remplace pas un essai du code frontend dans un navigateur.

Pour ce dernier essai, un banc local charge le vrai `public/app.js` et les API WebRTC du navigateur. Seule la source du microphone est remplacée par un fichier sonore fictif. On vérifie la progression des questions, l’absence d’erreur JavaScript, puis le bouton Raccrocher et la transcription sauvegardée.

[Documentation officielle : détection native de fin de parole](https://developers.openai.com/api/docs/guides/realtime-vad).
