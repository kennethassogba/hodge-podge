"""Render the public sharing card using the app's bundled Manrope font. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCALE = 2
image = Image.new('RGB', (1200 * SCALE, 630 * SCALE), '#F3F1E8')
draw = ImageDraw.Draw(image)
INK, GREEN, MUTED = '#18352A', '#2D5143', '#66756B'

def font(size, weight=500):
    value = ImageFont.truetype(str(ROOT / 'public/fonts/manrope-latin.woff2'), size * SCALE)
    value.set_variation_by_axes([weight])
    return value

def text(x, y, value, size, color=INK, weight=500):
    draw.text((x*SCALE, y*SCALE), value, font=font(size, weight), fill=color, anchor='lt')

def rounded(box, radius, color):
    draw.rounded_rectangle(tuple(v*SCALE for v in box), radius*SCALE, fill=color)

rounded((66, 62, 126, 122), 19, GREEN)
text(79, 68, 'b.', 44, '#F3F1E8', 650)
text(145, 76, 'la bulle', 34, weight=700)
text(1010, 83, 'FR / EN', 20, MUTED, 600)

text(66, 217, 'Un peu d’espace', 76, weight=500)
text(66, 315, 'pour penser.', 76, weight=500)
text(69, 434, 'Un coach IA. Une question à la fois.', 27, MUTED)

# The five voice bars echo the live call interface.
for radius, color in [(152, '#E9EDE1'), (125, '#DDE6D6')]:
    draw.ellipse(((951-radius)*SCALE, (326-radius)*SCALE,
                  (951+radius)*SCALE, (326+radius)*SCALE), fill=color)
for x, height in [(897, 39), (922, 70), (947, 102), (972, 70), (997, 39)]:
    rounded((x, 326-height/2, x+12, 326+height/2), 6, GREEN)

draw.line((66*SCALE, 543*SCALE, 1134*SCALE, 543*SCALE), fill='#D5DACD', width=SCALE)
text(68, 566, 'Hodge Podge', 19, MUTED)
text(823, 566, 'bulle.hodge-podge.workers.dev', 18, MUTED)

image.resize((1200, 630), Image.Resampling.LANCZOS).save(
    ROOT / 'public/social-card-v1.jpg', quality=92, optimize=True, progressive=True)
