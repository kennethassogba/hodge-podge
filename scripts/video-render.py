"""Render the hackathon film from real UI captures and a synthetic French voiceover.

Requires Pillow, numpy, fonttools[woff], imageio-ffmpeg. Run video-audio.py first.
No browser automation, remote assets, private data or network calls in this renderer.
"""
from pathlib import Path
from functools import lru_cache
import bisect
import json
import math
import re
import subprocess
import sys
import textwrap
import unicodedata

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / 'livrables/video'
ASSETS = ROOT / 'assets'
W, H, FPS = 1920, 1080, 24
PAPER = '#F3F1E8'
INK = '#19372B'
GREEN = '#2B5540'
MUTED = '#66756B'
SAGE = '#DCE7D5'
LIME = '#D8EF9D'
WHITE = '#FEFDF8'
LINE = '#D7DCCF'
DARK = '#173A2B'
timeline = json.loads((ROOT / 'timeline.json').read_text())
total = timeline[-1]['start'] + timeline[-1]['duration']
starts = [s['start'] for s in timeline]

for weight in [400, 500, 600, 700, 800]:
    target = ASSETS / f'Manrope-{weight}.ttf'
    if not target.exists():
        font = TTFont(REPO / 'public/fonts/manrope-latin.woff2')
        font = instantiateVariableFont(font, {'wght': weight}, inplace=True)
        font.flavor = None
        font.save(target)


@lru_cache(maxsize=128)
def font(size, weight=600):
    return ImageFont.truetype(str(ASSETS / f'Manrope-{weight}.ttf'), size)


def clamp(n, a=0., b=1.):
    return max(a, min(b, n))


def ease(n):
    n = clamp(n)
    return 1 - (1 - n) ** 3


@lru_cache(maxsize=256)
def text_tile(value, size, color, weight, anchor, spacing):
    dummy = ImageDraw.Draw(Image.new('RGBA', (1,1)))
    box = dummy.multiline_textbbox((0,0), value, font=font(size,weight),
                                    anchor=anchor, spacing=spacing)
    left, top, right, bottom = map(math.floor, box)
    tile = Image.new('RGBA', (right-left+2,bottom-top+2))
    draw = ImageDraw.Draw(tile)
    if '\n' in value:
        draw.multiline_text((-left,-top), value, font=font(size, weight), fill=color,
                            spacing=spacing, anchor=anchor)
    else:
        draw.text((-left,-top), value, font=font(size, weight), fill=color, anchor=anchor)
    return tile, left, top


def text(im, xy, value, size=36, color=INK, weight=500, anchor=None, spacing=12):
    tile,left,top = text_tile(value,size,color,weight,anchor,spacing)
    im.paste(tile,(round(xy[0]+left),round(xy[1]+top)),tile)


def rounded(im, box, fill, radius=24, outline=None, width=1):
    ImageDraw.Draw(im).rounded_rectangle(box, radius=radius, fill=fill,
                                         outline=outline, width=width)


def pill(im, xy, label, dark=False, size=23, fill=None):
    tw = ImageDraw.Draw(im).textlength(label, font=font(size, 600))
    x, y = xy
    rounded(im, (x, y, x + tw + 42, y + 46), fill or (SAGE if not dark else '#345541'), 23)
    text(im, (x + 21, y + 8), label, size, LIME if dark else INK, 600)
    return tw + 42


def brand(im, dark=False):
    color = WHITE if dark else INK
    rounded(im, (84, 50, 142, 108), LIME if dark else GREEN, 15)
    text(im, (95, 44), 'b.', 48, DARK if dark else WHITE, 700)
    text(im, (158, 61), 'la bulle', 30, color, 800)
    text(im, (1835, 69), 'HODGE PODGE  /  X-IA 2026', 20,
         '#B5CBB7' if dark else MUTED, 600, anchor='ra')


def base(dark=False, chapter=None, title=None, demo=False):
    im = Image.new('RGB', (W, H), DARK if dark else PAPER)
    brand(im, dark)
    if chapter:
        text(im, (87, 159), chapter, 23, LIME if dark else GREEN, 700)
    if title:
        text(im, (83, 199), title, 64, WHITE if dark else INK, 700)
    footer = 'Captures de l’application · scénario fictif' if demo else 'La Bulle + L’après-bulle'
    text(im, (86, 908), footer, 21, '#B5CBB7' if dark else MUTED, 500)
    return im


@lru_cache(maxsize=32)
def screenshot(name, crop=None):
    im = Image.open(ASSETS / (name + '.png')).convert('RGB')
    return im.crop(crop) if crop else im.crop((0, 0, im.width - 16, im.height))


@lru_cache(maxsize=96)
def resized_screen(name, crop, width, height):
    return screenshot(name,crop).resize((width,height),Image.Resampling.BICUBIC)


def screen(im, name, box, p=0, crop=None, zoom=1.025):
    """Slow camera movement inside a framed real application capture."""
    x, y, bw, bh = map(int, box)
    raw = screenshot(name, crop)
    scale = min((bw-36) / raw.width, (bh-36) / raw.height) * (1 + (zoom - 1) * clamp(p))
    sw, sh = math.ceil(raw.width * scale), math.ceil(raw.height * scale)
    scaled = resized_screen(name,crop,sw,sh)
    content = Image.new('RGB', (bw,bh), '#F4F2E9')
    content.paste(scaled, ((bw-sw)//2, (bh-sh)//2))
    mask = Image.new('L', (bw, bh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, bw-1, bh-1), radius=20, fill=255)
    rounded(im, (x + 6, y + 12, x + bw + 6, y + bh + 12), '#E2E4D8', 23)
    im.paste(content, (x, y), mask)
    rounded(im, (x, y, x + bw, y + bh), None, 20, LINE, 2)


def arrow(im, start, end, color=GREEN, width=4):
    d = ImageDraw.Draw(im)
    d.line([start, end], fill=color, width=width)
    dx, dy = end[0] - start[0], end[1] - start[1]
    angle = math.atan2(dy, dx)
    r = 15
    d.polygon([end, (end[0]-r*math.cos(angle-.5), end[1]-r*math.sin(angle-.5)),
               (end[0]-r*math.cos(angle+.5), end[1]-r*math.sin(angle+.5))], fill=color)


def scene_hook(t, dur):
    im = base(True)
    text(im, (85, 215), 'UNE SITUATION TRÈS CONCRÈTE', 24, LIME, 700)
    y = 293 + 35 * (1 - ease(t / .7))
    text(im, (78, y), 'Tout repasse\npar vous ?', 118, WHITE, 700, spacing=2)
    tasks = [('Une décision.', 1090, 300), ('Une validation.', 1180, 445),
             ('Puis une autre.', 1070, 590)]
    for i, (label, x, cy) in enumerate(tasks):
        a = ease((t - .4 - i*.65) / .65)
        if a > 0:
            x = round(x + 150 * (1 - a))
            rounded(im, (x, cy, x + 610, cy + 108), '#2B4C3A', 22, '#507059', 2)
            text(im, (x + 30, cy + 27), label, 37, WHITE, 600)
            arrow(im, (x+572,cy+38), (x+546,cy+65), LIME, 3)
    if t > 4.9:
        text(im, (87, 686 + 28*(1-ease((t-4.9)/.6))), 'Et si ça changeait ?', 43, LIME, 500)
    text(im, (87, 859), 'Voix off générée par IA', 21, '#B5CBB7', 500)
    return im


def scene_coach(t, dur):
    im = base(chapter='01  /  LA BULLE', demo=True)
    text(im, (81, 242), 'Prendre\ndu recul.', 87, INK, 700, spacing=0)
    badges = [(2.0, 'Message ou appel'), (5.7, 'Français + English'), (8.7, 'Protocole Kedo')]
    for i, (delay, label) in enumerate(badges):
        if t >= delay:
            pill(im, (87, 517 + i*68 + 15*(1-ease((t-delay)/.5))), label)
    screen(im, 'coach-home', (607, 181, 1222, 687), t/dur, zoom=1.012)
    if 4 < t < 8.3:
        # The call button in the real screenshot is highlighted, not re-created.
        rounded(im, (1416, 298, 1560, 359), None, 14, GREEN, 4)
    return im


def scene_memory(t, dur):
    im = base(chapter='01  /  LA BULLE', demo=True)
    if t < 5.2:
        text(im, (81, 242), 'Trouver\nses mots.', 82, INK, 700, spacing=0)
        text(im, (88, 491), '« Laisser mon équipe\ndécider davantage. »', 35, GREEN, 500)
        screen(im, 'coach-session', (607, 181, 1222, 687), t/5.2,
               crop=(205, 93, 1234, 695), zoom=1.02)
    elif t < 10.4:
        text(im, (81, 242), 'Relire.\nAjuster.\nGarder.', 82, INK, 700, spacing=0)
        screen(im, 'coach-note', (865, 159, 690, 716), (t-5.2)/5.2,
               crop=(384, 103, 868, 612), zoom=1.0)
    else:
        text(im, (81, 242), 'Retrouver\nle fil.', 82, INK, 700, spacing=0)
        pill(im, (88, 484), 'À la prochaine séance')
        screen(im, 'coach-session', (926, 166, 624, 714), (t-10.4)/(dur-10.4),
               crop=(995, 112, 1240, 535), zoom=1.0)
    return im


def scene_notion(t, dur):
    im = base(chapter='02  /  L’APRÈS-BULLE', demo=True)
    text(im, (81, 242), 'Faire évoluer\nla façon de\ntravailler.', 74, INK, 700, spacing=0)
    pill(im, (88, 606), 'Une intention + des pages')
    if t < 4.0:
        screen(im, 'notion-overview', (674, 181, 1155, 687), t/4,
               crop=(98, 134, 1150, 660), zoom=1.01)
    else:
        screen(im, 'notion-select', (764, 171, 997, 704), (t-4)/(dur-4),
               crop=(104, 0, 784, 490), zoom=1.012)
    return im


def scene_agents(t, dur):
    im = base(True, 'DANS LES COULISSES', 'Trois agents. Des décisions.')
    labels = ['Enquêter', 'Vérifier', 'Proposer']
    subs = ['Les documents et leurs sources.', 'Les conclusions face aux faits.', 'Une nouvelle règle à discuter.']
    current = 0 if t < 4.0 else 1 if t < 10.1 else 2
    xs = [88, 718, 1348]
    for i, x in enumerate(xs):
        active = i == current
        completed = i < current
        fill = LIME if active else '#2A4B39'
        fg = DARK if active else WHITE
        rounded(im, (x, 383, x+480, 644), fill, 24,
                LIME if completed else '#55735B', 3 if completed else 1)
        text(im, (x+30, 414), f'AGENT 0{i+1}', 24, DARK if active else LIME, 700)
        text(im, (x+27, 464), labels[i], 55, fg, 700)
        text(im, (x+30, 566), subs[i], 22, fg, 500)
        if i < 2:
            arrow(im, (x+496, 510), (xs[i+1]-26, 510), LIME if i < current else '#60816A', 4)
    if current == 0:
        text(im, (92, 727), 'Une conclusion doit s’appuyer sur un extrait précis.', 36, WHITE, 500)
    elif current == 1:
        arrow(im, (958, 660), (958, 712), '#E4B7A4', 4)
        pill(im, (748, 735), 'Preuves insuffisantes ? Arrêt.', True, 24, '#664F42')
    else:
        pill(im, (750, 744), 'Vérification passée : proposition', True, 24)
    return im


def scene_proposal(t, dur):
    im = base(chapter='02  /  L’APRÈS-BULLE', demo=True)
    if t < 5.3:
        text(im, (82, 236), 'Le constat.', 77, INK, 700)
        text(im, (88, 381), '« Toutes les décisions\n[...] doivent être\nvalidées par le\nmanager. »', 41, GREEN, 500, spacing=15)
        text(im, (88, 666), 'Extrait des règles du projet Atlas', 22, MUTED, 500)
        screen(im, 'notion-sources', (688, 214, 1140, 620), t/5.3,
               crop=(106, 158, 1142, 640), zoom=1.015)
    elif t < 9.6:
        text(im, (82, 235), 'La proposition.', 68, INK, 700)
        text(im, (88, 363), 'Clarifier qui peut\ndécider de quoi.', 47, GREEN, 500)
        pill(im, (88, 551), 'Une règle à discuter en équipe')
        screen(im, 'notion-proposal', (741, 180, 1087, 693), (t-5.3)/4.3,
               crop=(103, 46, 1143, 536), zoom=1.01)
    else:
        text(im, (82, 235), 'Vous gardez\nla main.', 80, INK, 700, spacing=0)
        text(im, (88, 491), 'Relire. Ajuster.\nPuis publier.', 43, GREEN, 500)
        screen(im, 'notion-ready', (783, 211, 981, 631), (t-9.6)/(dur-9.6),
               crop=(105, 219, 1141, 535), zoom=1.0)
        text(im, (789, 852), 'Publication à l’initiative de la personne.', 23, MUTED, 500)
    return im


def scene_system(t, dur):
    im = base(chapter='UNE APPLICATION COMPLÈTE', title='Simple à utiliser. Du travail en arrière-plan.')
    # Two explicit, independent paths. Diagram, not simulated app UI.
    rounded(im, (87, 370, 737, 763), WHITE, 28, LINE, 2)
    rounded(im, (829, 370, 1828, 763), WHITE, 28, LINE, 2)
    pill(im, (118, 400), 'LA BULLE')
    text(im, (117, 491), 'Écrire ou appeler.', 48, INK, 700)
    text(im, (118, 570), 'Le coaching reste indépendant.', 28, MUTED, 500)
    text(im, (118, 681), 'OpenAI Realtime + Responses', 26, GREEN, 600)
    pill(im, (860, 400), 'L’APRÈS-BULLE')
    text(im, (858, 491), 'L’analyse continue.', 48, INK, 700)
    labels = ['Enquête', 'Vérification', 'Proposition']
    for i, label in enumerate(labels):
        x = 862+i*309
        rounded(im, (x, 586, x+270, 644), SAGE, 15)
        text(im, (x+135, 601), label, 25, INK, 600, anchor='ma')
        if i < 2:
            arrow(im, (x+278, 614), (x+303, 614), GREEN, 3)
    p = clamp(t/6)
    ImageDraw.Draw(im).line((866, 665, 866+894*p, 665), fill=GREEN, width=5)
    text(im, (860, 696), 'Étapes sauvegardées · OpenAI + Cloudflare D1', 25, GREEN, 600)
    return im


def scene_outro(t, dur):
    im = base(True)
    text(im, (81, 231), 'Prendre du recul.', 107, WHITE, 700)
    text(im, (81, 363), 'Passer à l’action.', 107, LIME, 700)
    rounded(im, (87, 557, 1210, 666), LIME, 23)
    text(im, (121, 582), 'bulle.hodge-podge.workers.dev', 51, DARK, 700)
    text(im, (90, 722), 'Kenneth · Séb · Fano', 37, WHITE, 600)
    text(im, (90, 783), 'github.com/kennethassogba/hodge-podge', 29, '#B5CBB7', 500)
    text(im, (1833, 912), 'Voix off générée par IA', 21, '#B5CBB7', 500, anchor='ra')
    return im


SCENES = dict(hook=scene_hook, coach=scene_coach, memory=scene_memory,
              notion=scene_notion, agents=scene_agents, proposal=scene_proposal,
              system=scene_system, outro=scene_outro)


def make_subtitles():
    transcription = json.loads((ASSETS/'transcription.json').read_text())
    captions = []
    for segment in transcription['segments']:
        # Whisper occasionally hallucinates credits in the silent end hold.
        if segment['start'] > 108:
            continue
        content = segment['text'].strip().replace("l'après-Bulle", "l’après-bulle")
        content = content.replace("L'après-Bulle", "L’après-bulle")
        content = content.replace('la Bulle', 'La Bulle').replace('Seb', 'Séb').replace('XIA', 'X-IA')
        start, end = segment['start'], segment['end']
        # Respect the independently measured WAV boundaries.
        scene = timeline[max(0, bisect.bisect_right(starts, (start+end)/2)-1)]
        start = max(start, scene['audio_start'])
        end = min(end, scene['audio_start']+scene['audio_duration'])
        lines = textwrap.wrap(content, width=48, break_long_words=False, break_on_hyphens=False)
        groups = ['\n'.join(lines[i:i+2]) for i in range(0,len(lines),2)]
        lengths = [len(g) for g in groups]
        cursor = start
        for group, length in zip(groups, lengths):
            stop = cursor+(end-start)*length/sum(lengths)
            captions.append(dict(start=cursor,end=stop,text=group))
            cursor = stop
    def stamp(t):
        n = round(t*1000)
        return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
    srt = '\n\n'.join(f"{i+1}\n{stamp(s['start'])} --> {stamp(s['end'])}\n{s['text']}"
                      for i,s in enumerate(captions))+'\n'
    (ROOT/'la-bulle-hackathon.fr.srt').write_text(srt)
    (ROOT/'captions.json').write_text(json.dumps(captions,ensure_ascii=False,indent=2)+'\n')
    return captions


captions = make_subtitles()
caption_starts = [c['start'] for c in captions]


def render(t, subtitles=True):
    index = max(0, min(len(timeline)-1, bisect.bisect_right(starts, t)-1))
    scene = timeline[index]
    local = t-scene['start']
    im = SCENES[scene['id']](local, scene['duration'])
    # Brief dissolves between major chapters, crisp cuts within each chapter.
    if index and local < .28:
        prev = timeline[index-1]
        old = SCENES[prev['id']](prev['duration']-.001, prev['duration'])
        im = Image.blend(old, im, ease(local/.28))
    if subtitles:
        ci = bisect.bisect_right(caption_starts,t)-1
        if ci >= 0 and t < captions[ci]['end']:
            tile, xy = subtitle_tile(captions[ci]['text'])
            im.paste(tile,xy,tile)
    # A quiet progress line, not player chrome.
    ImageDraw.Draw(im).rectangle((0,H-5,round(W*t/total),H),fill=LIME if scene['id'] in ['hook','agents','outro'] else GREEN)
    return im


@lru_cache(maxsize=96)
def subtitle_tile(caption):
    f=font(33,600)
    d=ImageDraw.Draw(Image.new('RGBA',(1,1)))
    bounds=d.multiline_textbbox((0,0),caption,font=f,spacing=8,align='center')
    tw,th = math.ceil(bounds[2]-bounds[0]),math.ceil(bounds[3]-bounds[1])
    tile=Image.new('RGBA',(tw+58,th+37))
    rounded(tile,(0,0,tw+57,th+36),INK,15)
    ImageDraw.Draw(tile).multiline_text((29,18-bounds[1]),caption,font=f,fill=WHITE,
                                       spacing=8,align='center')
    return tile,(round((W-tw)/2-29),round(1000-th/2-18))


if '--preview' in sys.argv:
    shots = [2.5,13,30,44,57,72,86,101]
    sheet = Image.new('RGB',(1280,4*360),PAPER)
    for i,t in enumerate(shots):
        frame=render(t)
        frame.save(ASSETS/f'frame-{i+1:02}.jpg',quality=94)
        sheet.paste(frame.resize((640,360),Image.Resampling.LANCZOS),((i%2)*640,(i//2)*360))
    sheet.save(ROOT/'contact-sheet.jpg',quality=94)
    render(101,False).save(ROOT/'affiche.png')
    print('Preview frames ready.')
    sys.exit(0)

outfile = ROOT/'la-bulle-hackathon.mp4'
command = [imageio_ffmpeg.get_ffmpeg_exe(),'-y','-hide_banner','-loglevel','warning',
           '-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}',
           '-r',str(FPS),'-i','-', '-i',str(ASSETS/'narration.wav'),
           '-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast',
           '-crf','19','-pix_fmt','yuv420p','-threads','4',
           '-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','192k',
           '-ar','48000','-movflags','+faststart','-t',f'{total:.6f}',
           '-metadata','title=La Bulle | Hodge Podge | X-IA Hackathon',
           '-metadata','comment=French AI-generated voiceover. Real application captures; fictitious demonstration data.',
           str(outfile)]
process = subprocess.Popen(command,stdin=subprocess.PIPE)
try:
    for frame in range(round(total*FPS)):
        process.stdin.write(render(frame/FPS).tobytes())
        if frame%(FPS*10)==0:
            print(f'Rendered {frame//FPS}s / {total:.0f}s',flush=True)
finally:
    process.stdin.close()
if process.wait():
    raise SystemExit('Video encoding failed')
print(f'Finished: {outfile} ({outfile.stat().st_size/1024/1024:.1f} MB)')
