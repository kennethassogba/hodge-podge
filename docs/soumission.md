# Kit de démonstration et de soumission

Statut : trame préparée le 26 septembre 2026. Adapter au logiciel réellement livré ; ne pas annoncer une intégration non terminée.

## Description courte proposée

> Hodge Podge crée une bulle de coaching vocal autour d’une situation managériale réelle. L’application protège les temps de réflexion, aide la personne à préciser ce qu’elle veut retenir ou essayer et reprend la séance suivante à partir de ce qu’elle a réellement essayé. Les modèles OpenAI conduisent l’échange et proposent une mémoire validée par l’utilisateur. On écrit ou on appelle depuis une page web, puis on retrouve ses notes à la séance suivante.

## Scénario de vidéo — 1 min 55, marge de 5 secondes

| Temps | À montrer | Message |
|---|---|---|
| 0:00–0:12 | Une situation : « Je reprends toujours les tâches que je délègue » | Le problème apparaît dans une conversation réelle |
| 0:12–0:25 | Message de contexte puis bouton Appeler | L’utilisateur choisit ce que le coach sait |
| 0:25–0:55 | Une question, réponse, 5 secondes de silence réel et reprise spontanée | La personne peut poursuivre sa pensée sans être coupée |
| 0:55–1:15 | Quelques notes corrigées puis conservées avec accord | Le prochain pas vient de la personne |
| 1:15–1:38 | Deuxième séance, explicitement simulée dans le temps, avec retour saisi | Le coach repart de ce qui a été tenté, pas d’un résumé générique |
| 1:38–1:48 | Vue technique concise : décision LLM, outil, résultat persistant | On voit la logique agentique derrière l’expérience |
| 1:48–1:55 | Équipe, repo et accès de test | Produit testable, périmètre clair |

Conserver un vrai silence audible dans la vidéo. Afficher « Quelques jours plus tard — scénario de démonstration » à la transition ; ne pas prétendre avoir mesuré un progrès sur plusieurs jours pendant le week-end. L’appel se déroule dans le navigateur.

## Jeu de données fictif

Manager : Camille. Interlocuteur : Alex. Situation : Camille reprend systématiquement les solutions proposées par Alex. Contexte : un prochain entretien individuel et un message de préparation fictif.

Séance 1 : Camille explore son besoin de contrôle et choisit de demander une proposition avant de donner la sienne. Le système n’affirme pas une cause psychologique ; il conserve uniquement ce que Camille valide.

Retour : « J’ai posé la question, mais j’ai répondu à sa place presque aussitôt. »

Séance 2 : le coach rappelle précisément l’essai, demande ce qui s’est passé et aide Camille à choisir si elle veut l’ajuster. Variante de test : Camille n’a rien essayé. Autre variante : elle ne veut pas créer d’action. Dans les deux cas, aucune réussite fictive n’est enregistrée.

## Lecture des critères du jury

| Critère officiel | Poids | Preuve à montrer |
|---|---|---|
| Impact et utilité réelle | 30 % | Une situation précise, une expérience choisie et un retour utile |
| Innovation et originalité | 20 % | Silence protégé et adaptation à ce qui a été réellement tenté |
| Qualité de réalisation | 20 % | Silences automatiques, fidélité au script, mémoire persistante, erreurs prises en charge |
| Expérience utilisateur | 15 % | Parcours court, utilisateur maître du rythme et de ses données |
| Clarté de la démo et du pitch | 15 % | Une histoire complète, compréhensible en moins de deux minutes |

Source : [règlement officiel, sections 6–7](https://app.notion.com/p/X-IA-Hackathon-Agents-Rise-of-Agents-X-3c6bf8dd0b1081ba8f52eb9bbd061ea0). La notation ne dépend pas des outils utilisés ni du volume de crédits consommés.

## Checklist de dépôt

- [ ] Vidéo accessible, durée vérifiée ≤ 2 minutes, son compréhensible.
- [ ] Description alignée sur les fonctionnalités réellement présentes.
- [ ] URL du repo accessible au jury.
- [ ] README : installation propre, configuration sans secrets, démarrage, test vocal et deuxième séance.
- [ ] Prérequis d’accès aux API et limites de l’essai explicités.
- [ ] Noms complets : Kenneth, Séb, Fano.
- [ ] Travail antérieur déclaré : questions du PDF Kedo du 24 septembre intégrées à la demande de l’équipe, et tout code ou bibliothèque réutilisé ; contribution du week-end identifiée.
- [ ] Autorisation confirmée pour tout contenu tiers inclus ; ne pas publier le PDF intégral par défaut.
- [ ] Données fictives, aucun secret ou compte rendu personnel dans le dépôt ou la vidéo.
- [ ] Modalités exactes de dépôt confirmées sur le Discord officiel.
- [ ] Dépôt effectué avec marge avant le 27 septembre à 23 h 59 ; conserver la confirmation.

