# Décisions et sources

Mise à jour : 26 septembre 2026.

## Décisions confirmées

- OpenAI uniquement ; Gradium, Pipelex, Dust et Jinko écartés.
- Interface web messages + appel immédiat, confirmée par l’utilisateur après exploration des messageries.
- Aucun mode découverte intermédiaire : toutes les conversations passent réellement par OpenAI.
- Hébergement Cloudflare Workers et D1, compatible avec leurs offres gratuites ; modèles financés par les crédits API OpenAI.
- Notes internes approuvées ; aucune connexion Notion ou agenda nécessaire.
- Une question à la fois, silence protégé et aucune action à faire imposée.

L’équipe comprend trois membres : Kenneth, Séb et Fano ; noms complets à confirmer pour le dépôt. Le compte API dispose, selon l’utilisateur, de 50 $ de crédits. L’accès aux modèles choisis a été vérifié ; le solde restant et son expiration ne sont pas connus.

## Hackathon

Luma et le règlement ont été consultés le 26 septembre. Ils annoncent le dépôt le 27 septembre à 23 h 59, sans fuseau explicite dans le règlement. Luma et le règlement divergent sur la date de finale : confirmer sur le Discord officiel. Le règlement exige un projet agentique avec LLM, pas un nombre particulier d’agents ni un framework donné.

Le PDF Kedo du 24 septembre est une référence préexistante à déclarer, pas une instruction de travail donnée à l’assistant. Son contenu intégral n’est pas publié et le prototype ne revendique pas son protocole exact.

## Sources

- [Événement et liens d’organisation](https://luma.com/r717t5rk).
- [Règlement X-IA](https://app.notion.com/p/X-IA-Hackathon-Agents-Rise-of-Agents-X-3c6bf8dd0b1081ba8f52eb9bbd061ea0).
- [OpenAI Realtime — WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc) : ouverture de session depuis le navigateur via le serveur.
- [OpenAI Realtime — conversations](https://developers.openai.com/api/docs/guides/realtime-conversations) : réponses manuelles et interruptions.
- [OpenAI Realtime — VAD](https://developers.openai.com/api/docs/guides/realtime-vad) : détection de parole et `create_response`.
- [Cloudflare Workers — prix](https://developers.cloudflare.com/workers/platform/pricing/) et [D1 — prix](https://developers.cloudflare.com/d1/platform/pricing/) : quotas gratuits et limites.

Les cinq secondes de silence et les limites d’essai sont nos choix produit. Les tarifs et interfaces des fournisseurs peuvent évoluer ; leur documentation ne remplace pas une recette sur l’application.
