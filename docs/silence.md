# Une conversation sans commandes

L’utilisateur parle et peut reprendre sa phrase naturellement. Aucun bouton **À toi**, **Je réfléchis** ou **Couper le micro**. Le seul contrôle de l’appel est **Raccrocher**.

## Rythme

Après une fin de parole détectée : cinq secondes de silence pour les trois premières questions, puis trois secondes. Chaque reprise de parole annule le délai et le redémarre à la fin de la nouvelle phrase. Ce sont des réglages initiaux à ajuster avec Séb, pas des normes de coaching. Le détecteur ajoute environ 400 ms et le réseau sa propre latence.

La réponse ne dépend pas de l’arrivée de la transcription écrite. Realtime reçoit déjà l’audio. Les expressions ordinaires telles que « je réfléchis à mon problème » ne sont plus interprétées comme des commandes de pause permanente.

Le logiciel conserve le tour de l’utilisateur si une ancienne réponse est encore en cours d’annulation : il réessaie dès que la génération se libère. Une erreur bloquante termine l’appel avec un message explicite au lieu de laisser un faux état d’écoute.

## Fidélité au PDF

Les 14 questions originales, attribuées à Kedo Academy by Tirezio, se trouvent dans `public/coaching-protocol.js`. Une question à la fois, dans leur ordre et mot pour mot. Le curseur n’avance qu’après la lecture complète de la question attendue. Une demande explicite d’explication ou de répétition peut être traitée brièvement sans sauter une étape. Après la dernière réponse, un remerciement, sans nouvelle question.

La génération vocale reste effectuée par un modèle : le suivi d’ordre est contrôlé par le code, la fidélité du texte prononcé doit aussi être éprouvée en conditions réelles.

## Vérifications

- Contrôleur : pauses, reprise à 4,8 secondes, absence totale de transcription, annulation lente et déconnexion.
- Interface réelle exécutée avec un transport simulé : accueil, deux réponses successives, transcription en échec, phrase contenant « je réfléchis », progression des questions et interruption.
- Protocole : toutes les questions dans l’ordre, refus des paraphrases comme preuve d’avancement, clarification sans saut et fin après la question 14.
- Essai audio réseau : trois questions et deux réponses synthétiques, avec pauses réelles.

À refaire avec Séb : répondre à la première question, hésiter, reprendre, laisser le silence, demander de répéter une question, puis aller jusqu’au bilan final. Vérifier aussi sur téléphone et avec un bruit ambiant modéré.
