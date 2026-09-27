# L’après-bulle, version 0.5.0

## Parcours

Un appel terminé normalement ouvre `/notion?thread=…&call=…`, après sauvegarde réussie du fil.
Le coach peut demander la fin avec `finish_bubble`. Le navigateur demande alors un bref au revoir
et attend sa lecture complète avant de raccrocher. Une nouvelle prise de parole annule cette fin.
La coupure à vingt minutes et le raccrochage manuel ouvrent aussi l’après-bulle. Une erreur audio
reste sur le coach ; une sauvegarde échouée propose de réessayer avant de changer de page.

Par écrit, la décision `cloturer` ou le bouton « Terminer ma bulle » ouvre le récap du fil.
La page reste accessible sans connexion Notion. Le récap est produit par OpenAI, à partir de la
conversation entière sélectionnée, et distingue les décisions des idées envisagées. Sans action
ni décision, il résume le thème et le dit explicitement. Il ne réserve ni n’envoie rien lui-même.

Le récap initial est conservé dans D1, avec les mêmes règles d’appartenance et d’expiration que
la conversation. Une empreinte invalide ce cache quand la transcription est corrigée. Les
modifications locales restent dans `sessionStorage`, y compris pendant l’aller-retour OAuth.
Le contenu de l’email et l’intention Notion sont toujours lus dans le champ modifié.

Le questionnaire NPS se trouve sous le récap. Les bulles écrites comptent aussi dans le tableau
équipe. Un envoi du questionnaire est définitif dans l’interface, sans confirmation supplémentaire.

## Email avec Resend

1. Créer un compte gratuit sur [Resend](https://resend.com).
2. Ajouter un sous-domaine d’envoi, par exemple `bulle.amata.coffee`.
3. Ajouter uniquement les DNS demandés pour ce sous-domaine, puis attendre sa vérification.
   Les MX du domaine principal et les boîtes existantes ne doivent pas être remplacés.
4. Créer une clé limitée à l’envoi sur ce domaine. Mettre les deux valeurs dans `.dev.vars.email`,
   fichier local ignoré par Git :

```dotenv
RESEND_API_KEY=la-cle-privee
EMAIL_FROM="La Bulle <bonjour@bulle.amata.coffee>"
```

5. Après validation du domaine, publier ces variables avec :

```sh
npx wrangler secret bulk .dev.vars.email
```

En local, recopier ces variables dans `.dev.vars`. Wrangler ne fusionne pas automatiquement les
fichiers `.dev.vars.*` : ils servent ici à préparer séparément les secrets à déployer.

Le bouton ouvre un champ email. La case de retranscription est cochée par défaut et reste visible.
Un clic sur « Envoyer » transmet le récap modifié et, si demandé, une pièce jointe texte UTF-8 avec
tous les messages de la bulle sélectionnée, au-delà de la fenêtre de 40 messages du coach.

L’API vérifie le propriétaire de la conversation et une seule adresse. Une empreinte du contenu
sert de clé d’idempotence Resend : un clic répété ou une reprise après erreur n’envoie pas deux
fois le même email. La base ne garde ni l’adresse du destinataire ni le corps envoyé. Un statut
accepté par Resend ne prouve pas la livraison dans la boîte finale. Les tests automatisés utilisent
un fournisseur simulé ; une vérification réelle nécessite une adresse de test autorisée.

L’offre gratuite Resend limite l’envoi à 100 emails par jour. L’application borne aussi les envois
à ce volume et à cinq tentatives par minute par espace. Les appels de coaching ne sont pas concernés.
Cloudflare Email Sending nécessite Workers Paid pour des destinataires arbitraires ; Resend permet
de garder l’hébergement Workers gratuit. Vérifier les tarifs des fournisseurs avant un usage élargi.

## API

| Route | Rôle |
| --- | --- |
| `GET /api/after?thread=…&call=…&language=fr` | Conversation sélectionnée, récap en cache, état du retour |
| `POST /api/recap` | Génération ou réutilisation du récap, selon la source et la langue |
| `POST /api/recap/email` | Envoi du texte modifié, avec ou sans pièce jointe |
| `POST /api/feedback` | Retour d’appel (`callId`) ou de bulle écrite (`threadId`) |

Les trois POST attendent le cookie de l’espace de coaching et vérifient l’origine. OAuth Notion
reste indépendant. Les agents Notion ne reçoivent que le récap et les précisions au clic sur
« Examiner ces documents » ; la retranscription du coaching n’est pas jointe.
