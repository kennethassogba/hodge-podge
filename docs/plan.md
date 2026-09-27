# Plan d’équipe

Mise à jour : 27 septembre 2026.

## Déjà réalisé

- [x] Parcours web retenu : messages, appel immédiat, notes.
- [x] Interface responsive et accès par code d’équipe.
- [x] Backend Cloudflare, stockage D1 et intégration OpenAI.
- [x] Tours de parole natifs et reprise après interruption.
- [x] Notes proposées, approuvées, corrigées, supprimées et transmises à la prochaine séance.
- [x] Tests des réponses natives, du raccrochage et de l’isolation des espaces.
- [x] Documentation d’installation et scénario de vidéo.
- [x] Site Cloudflare en ligne et dépôt GitHub privé créé.
- [x] Chat, notes puis reprise réelle de la mémoire vérifiés dans le navigateur.
- [x] Connexion WebRTC réelle et réception audio OpenAI vérifiées sans microphone humain.

- [x] Version bilingue FR/EN, réglage micro et filtrage audio OpenAI.
- [x] Exceptions au script : passer une question, refuser le débrief, terminer pour agir.
- [x] Correction et suppression des passages de transcription.
- [x] Formulaire facultatif en quatre questions, avec NPS dans le tableau équipe.
- [x] Tableau équipe protégé par un code distinct, sans accès aux conversations ni aux notes.
- [x] Suppression des quotas quotidiens ; coupure des appels portée à vingt minutes en version
      0.3.2.
- [x] Mentions de conservation précisant OpenAI et les sauvegardes Cloudflare.

- [x] Après-bulle avec récap modifiable, copie et email avec transcription facultative.
- [x] Retour à une question précédente et pauses demandées pendant le coaching.
- [x] Reprise d’une réponse vocale tronquée ou d’une panne temporaire sans couper tout l’appel.
- [x] Description de soumission et positionnement harmonisés autour des deux usages.
- [x] Vidéo de présentation de 1 min 50 montée avec un scénario fictif.

## Ensuite, dans cet ordre

1. **Séb : essayer une séance et vérifier la fidélité au script anglais original.** Juger si les
   questions aident, si le rythme convient, si le coach impose une action. Noter les phrases
   précises à corriger.
2. **Kenneth et Fano : vérifier sur leurs appareils.** Micro, casque, plusieurs réponses
   successives, silences, interruption, respect du script, notes puis nouvelle séance. Le résultat
   attendu est dans `silence.md`.
3. **Inviter quelques testeurs et lire leurs retours dans /team.html, puis ajuster les prompts et le
   rythme.** Rejouer les scénarios concernés ; valider séparément le nouveau parcours Notion avant
   de l’ouvrir aux testeurs.
4. **Relire et déposer la vidéo préparée.** Vérifier le son, les sous-titres et les liens. Le
   montage utilise un scénario fictif et rejoue des résultats produits par les modèles ; le détail
   est dans [le kit de soumission](soumission.md).
5. **Déposer.** Compléter les trois noms, vérifier l’accès au repo et à la vidéo, remettre les
   quatre livrables avant l’échéance.

Répartition proposée, à adapter entre les trois membres. Le README et ce dossier sont le point
central ; les corrections peuvent être discutées dans les Issues GitHub avec un responsable et un
résultat attendu.

## Ce qui reste hors de cette version

Agenda, prise de rendez-vous, rappels, Telegram, WhatsApp, téléphone, plugin ChatGPT, autres
fournisseurs de modèles. Ces pistes pourront être réexaminées à partir des retours des testeurs.

## Suite retenue : Notion

- [x] Parcours facultatif séparé, OAuth, identité personnelle Notion et isolation des comptes.
- [x] Examen documenté par trois agents, reprise en arrière-plan et publication après relecture.
- [x] Activer les identifiants OAuth et déployer la version 0.4.0 sur Cloudflare.
- [ ] Réaliser un essai réel dans un espace Notion de test : autorisation, analyse puis publication.

Guide d’activation et recette : `notion.md`.
