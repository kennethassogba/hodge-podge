# La Bulle : vidéo de présentation

Pitch français de 1 min 50, pour le hackathon X-IA. Voix off énergique, captures de l’application,
animations et sous-titres. Kenneth, Séb et Fano, équipe Hodge Podge.

## Fichiers

- `la-bulle-hackathon.mp4` : vidéo finale en 1080p, H.264 + AAC, sous-titres incrustés.
- `la-bulle-hackathon.fr.srt` : sous-titres français séparés.
- `affiche.png` : image de couverture.
- `storyboard.json` : texte de la voix off et titres des huit séquences.
- `timeline.json` : minutage précis du montage.
- `captions.json` : sous-titres minutés pour le moteur de rendu.
- `assets/` : voix, captures, polices et résultats du scénario de démonstration.

La vidéo, les images et les fichiers de travail volumineux sont conservés localement, hors Git.
La vidéo est prête à être téléversée sur la plateforme choisie pour le dépôt au hackathon.

## Ce qui a été filmé

Le scénario utilise le projet Atlas, entièrement fictif. Les captures viennent des véritables pages
de La Bulle et de l’après-bulle, servies localement. Le code du Worker a réalisé de vrais appels
OpenAI pour les réponses du coach, les notes et les trois agents. Le serveur de capture rejoue les
résultats obtenus. L’API Notion et la connexion OAuth sont simulées dans cette base de démonstration.
Aucune page Notion réelle n’a été publiée. Aucun témoignage ou résultat mesuré n’est revendiqué.

La voix off est générée avec `gpt-4o-mini-tts`, voix `cedar`. La mention correspondante est visible
au début et à la fin du film. Pas de musique ni de média tiers ajouté. Police Manrope sous licence
OFL, déjà fournie par le projet.

## Reprendre le montage

Utiliser Python 3 avec `pillow`, `fonttools[woff]` et `imageio-ffmpeg` :

```bash
python3 scripts/video-audio.py
python3 scripts/video-render.py --preview
python3 scripts/video-render.py
```

Ces commandes sont locales et ne consomment aucun crédit API. Le moteur de rendu lit les captures
et les WAV de `assets/`, les assemble, incruste les sous-titres et normalise la voix à −16 LUFS.
Les WAV sont lus jusqu’à leur fin réelle pour gérer les en-têtes de flux audio.

Pour générer de nouveaux éléments, ces commandes utilisent la clé locale `.dev.vars` et consomment
des crédits OpenAI. La clé n’est jamais incluse dans les livrables :

```bash
node scripts/video-narration.mjs
python3 scripts/video-audio.py
node scripts/video-transcribe.mjs
node scripts/video-demo.mjs
```

La narration réutilise les WAV déjà présents. Pour modifier une séquence, archiver son ancien WAV
avant de la régénérer. La transcription sert au minutage ; la comparer au script et corriger les
éventuelles erreurs avant de finaliser les sous-titres.

Le dernier script sert l’application de démonstration sur `http://127.0.0.1:8791`. Faire les captures
de `/`, `/demo-session` et `/notion` avec le navigateur. Il ne lance aucune capture automatiquement.
Ne pas exposer ce serveur local sur Internet.

Le script de rendu définit le graphisme, les cadrages et les transitions. Le mode `--preview` génère
une planche de contrôle et l’affiche avant l’encodage complet.
