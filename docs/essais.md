# Essais — version 0.3.2

## Partager l’application

Adresse : https://bulle.hodge-podge.workers.dev/

Partager le code APP_ACCESS_CODE uniquement aux testeurs invités. Ne pas partager ADMIN_ACCESS_CODE : il ouvre le tableau équipe /team.html. Le code administrateur local est dans .dev.vars.admin, ignoré par Git. Les données restent propres à chaque navigateur ; pas de compte multiappareil.

Choisir Français ou English avant de parler. Sélectionner micro intégré ou casque selon l’équipement. En cas de transcription erronée, corriger ou effacer le passage avant « Garder quelques notes ». Les consignes d’accent et la réduction de bruit demandent encore des essais humains avec plusieurs microphones et environnements.

## Protocole

Chaque langue suit les 14 questions de son PDF original Kedo du 24 septembre 2026, reprises dans public/coaching-protocol.js. Respecter un souhait explicite de passer une question, de terminer, de passer à l’action ou de ne pas faire le débrief. Ne pas confondre terminer la conversation oralement avec raccrocher techniquement : la personne garde le bouton Raccrocher.

## Avis et mesures

Après raccrochage, le formulaire est proposé sans s’ouvrir automatiquement. Deux notes obligatoires pour envoyer un avis : clarté gagnée, qualité ressentie (0–10), plus commentaire libre facultatif. Aucun partage tant que la case explicite n’est pas cochée et le bouton de partage activé. La personne peut modifier ou retirer son avis, y compris pour un appel précédent de la même séance.

Le tableau équipe affiche les avis et des chiffres agrégés. Il n’envoie pas les avis à OpenAI et ne lit pas les transcriptions pour calculer des scores. Il ne comporte pas d’API d’accès aux conversations ni aux notes. L’absence de nom n’est pas une garantie d’anonymat : un commentaire libre peut identifier quelqu’un. Ne pas recopier les avis hors du tableau sans nécessité.

La durée et les incidents sont déclarés par le navigateur en fin d’appel ; une fermeture brutale peut laisser ces chiffres manquants. Les interruptions mesurent une détection, pas nécessairement une erreur. Les échecs de transcription comptent les erreurs API, pas les hallucinations. Les chiffres couvrent les espaces non expirés et disparaissent lors d’un effacement. Ils ne constituent pas une preuve d’impact du coaching.

## Conservation

Les espaces expirent 30 jours après leur création. La purge quotidienne et « Effacer mon espace » suppriment conversations, notes, retours et enregistrements d’appels de la base active. L’application ne conserve pas de fichiers audio. Les sauvegardes D1 et journaux des fournisseurs ont leurs propres délais. Aucun engagement de suppression immédiate de toutes les traces chez tous les prestataires ni de conformité RGPD automatique.

- OpenAI API : pas d’entraînement par défaut, sauf partage volontaire activé sur le compte ; journaux de surveillance des abus pouvant contenir des échanges, jusqu’à 30 jours avec exceptions légales ou de sécurité. Le mode Zero Data Retention nécessite une approbation spécifique et n’est pas présumé actif.
- Cloudflare D1 : historique de restauration de 7 jours sur l’offre gratuite, 30 sur l’offre payante. Une restauration peut réintroduire des données effacées : ne pas restaurer une base de production sans traiter les demandes d’effacement antérieures.
- Le code évite de journaliser audio, conversations, notes, mots de passe et commentaires. Des métadonnées techniques de requêtes sont conservées par l’infrastructure selon sa configuration.

Sources consultées le 26 septembre 2026 : [OpenAI — données](https://developers.openai.com/api/docs/guides/your-data), [D1 — restauration](https://developers.cloudflare.com/d1/reference/time-travel/), [Realtime — sessions](https://developers.openai.com/api/docs/guides/realtime-conversations).

## Consommation

Aucun quota applicatif quotidien pour les appels, le texte ou les notes proposées, coupure automatique après vingt minutes dans le navigateur. OpenAI impose toujours sa durée maximale de session de 60 minutes et ses limites de crédit/débit. Les protections contre les tentatives répétées de connexion et les connexions bloquées sont conservées. Aucun abonnement Cloudflare payant n’a été ajouté.

## Administration

Ouvrir /team.html ou le lien « Espace équipe » en pied de page. Utiliser ADMIN_ACCESS_CODE dans le fichier local .dev.vars.admin, et non le code destiné aux testeurs. Le code administrateur a été installé sur Cloudflare avec l’accord explicite de Kenneth. Il est réservé à Kenneth, Séb et Fano.

La coupure à vingt minutes ferme le micro et le transport, sauvegarde le fil et propose le retour facultatif. C’est une fin normale, pas une erreur dans les statistiques. Elle dépend de l’exécution du navigateur ; elle n’est pas un plafond financier côté serveur.

## Changement d’adresse du 26 septembre 2026

La Bulle est désormais sur https://bulle.hodge-podge.workers.dev/ et l’administration sur `/team.html`, avec les mêmes codes. Le Worker existant a été renommé ; la base D1, les secrets et la purge quotidienne sont conservés. Les cookies ne passent pas d’un domaine à l’autre : les espaces personnels précédents ne sont pas automatiquement accessibles depuis la nouvelle adresse. Les retours partagés restent consultables par l’équipe.

Le sous-domaine du compte Cloudflare est `hodge-podge`. Amata conserve ses domaines personnalisés `amata.coffee` et `www.amata.coffee` ; son accès workers.dev était et reste désactivé.
