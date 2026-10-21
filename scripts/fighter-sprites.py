#!/usr/bin/env python3
"""
Build STREET CHAMPION's fighter sprite atlases from puffolotti's CC0
"Mustermenschen" fighters (https://opengameart.org/content/musternenschen-v1-complete-collection,
CC0 1.0, "Sprite created by Puffolotti Accident").

Not run in CI. Download and unzip the collection, then:

    python3 scripts/fighter-sprites.py path/to/unzipped/gifs [fighter ...]

For each fighter it takes the source GIF named in FIGHTERS, keeps only the
frames `src/games/fighter/sprite-sets.json` uses, recolours every pixel into
the fighter's own costume (each source colour is classed as cloth, skin,
hair, belt, shoes or ink by its hue and saturation, then given the tone of
the target colour's ramp at the same relative brightness, the same ramp
`figure.ts` shades the portraits with), crops each frame to its pixels,
shelf-packs them into `public/fun/fighter/sprites/<id>.png`, and rewrites
`src/games/fighter/sheets.ts` with every frame's rectangle and its offset
from the feet. Re-running it regenerates both, so edit this script or the
sets file rather than the outputs.

Needs Pillow.
"""
import colorsys
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETS = json.load(open(os.path.join(ROOT, 'src/games/fighter/sprite-sets.json')))
OUT_DIR = os.path.join(ROOT, 'public/fun/fighter/sprites')
OUT_TS = os.path.join(ROOT, 'src/games/fighter/sheets.ts')

# The source bodies, and how each one's colours divide into materials: rules
# of [hue min, hue max, saturation min, saturation max, material], checked in
# order (hue in degrees; 'g' is any grey, saturation under 0.18), falling back
# to `classify`.
SOURCES = {
    'antony': {'gif': 'Antony Nagasaki WrongCookieDo 01AAH009.gif', 'set': 'wcd', 'rules': []},
    'larissa': {
        'gif': 'Larissa Disaster Wrongcookiedo 02ABH009.gif',
        'set': 'wcd',
        'ref': 'antony',
        'rules': [['g', 'cloth'], [0, 8, 0.6, 1, 'cloth'], [340, 360, 0.6, 1, 'cloth'], [200, 260, 0.6, 1, 'legs'], [35, 60, 0.6, 1, 'hair']],
    },
    'george': {
        'gif': 'George Nguyen WrongCookieDo 04AAH009.gif',
        'set': 'wcd',
        'ref': 'antony',
        'rules': [[60, 160, 0, 1, 'cloth'], ['g', 'shirt'], [0, 12, 0, 0.6, 'shoes'], [230, 290, 0.6, 1, 'hair'], [20, 45, 0.3, 1, 'skin'], [0, 12, 0.6, 1, 'belt']],
    },
    'byron': {
        'gif': 'Byron Verlaine WrongCookieDo 04ABH009.gif',
        'set': 'wcd',
        'ref': 'antony',
        'rules': [[60, 160, 0, 1, 'cloth'], ['g', 'shirt'], [270, 320, 0.6, 1, 'hair'], [8, 45, 0, 0.6, 'skin'], [190, 240, 0.6, 1, 'shoes']],
    },
    'danny': {
        'gif': 'Danny Van Damage Thai boxe 06ABH008.gif',
        'set': 'thai',
        'rules': [['g', 'cloth'], [0, 25, 0, 0.6, 'skin'], [190, 240, 0.6, 1, 'shoes'], [35, 60, 0, 0.6, 'hair'], [12, 40, 0.6, 1, 'bands'], [0, 12, 0.6, 1, 'belt'], [340, 360, 0.6, 1, 'belt'], [100, 160, 0.6, 1, 'skin']],
    },
    'kelvinA': {
        'gif': 'Kelvin Area muai thai 06ACH008.gif',
        'set': 'thai',
        'ref': 'danny',
        'rules': [[0, 12, 0.6, 1, 'cloth'], [300, 360, 0.6, 1, 'cloth'], ['g', 'shirt'], [8, 30, 0, 0.6, 'skin'], [35, 65, 0.6, 1, 'belt']],
    },
    'kelvinZ': {
        'gif': 'Kelvin Zone muai thai 06AAH008.gif',
        'set': 'thai',
        'ref': 'danny',
        'rules': [['g', 'cloth'], [170, 220, 0, 1, 'bands'], [8, 30, 0, 0.6, 'skin'], [35, 65, 0.6, 1, 'belt']],
    },
}

# Each fighter: a source body and the colour each of its materials becomes,
# then the second colourway the mirror match wears. A colour naming another
# material takes that material's colour (barefoot fighters' shoes become skin).
FIGHTERS = {
    'kenji': ('antony', {'cloth': '#eeeade', 'skin': '#e0a070', 'hair': '#3a2416', 'belt': '#1c1c22', 'shoes': 'skin'}, {'cloth': '#e8e0a0'}),
    'ace': ('antony', {'cloth': '#d02a24', 'skin': '#eab084', 'hair': '#f0c838', 'belt': '#1c1c22', 'shoes': 'skin'}, {'cloth': '#e8e8e8', 'hair': '#b07030'}),
    'mei': ('larissa', {'cloth': '#2c50c8', 'legs': '#1e2a78', 'skin': '#eab48c', 'hair': '#2a1a14', 'belt': '#f4f4f4'}, {'cloth': '#c82c88', 'legs': '#6a1848'}),
    'duke': ('george', {'cloth': '#6a7c40', 'shirt': '#4e6a2a', 'skin': '#e2a47a', 'hair': '#e8d050', 'shoes': '#2a2620', 'belt': '#3a2a1a'}, {'cloth': '#3a4a6a', 'shirt': '#8a8a8a', 'hair': '#7a4a20'}),
    'varga': ('byron', {'cloth': '#6a2a8a', 'shirt': '#eab48c', 'skin': '#eab48c', 'hair': '#3a1a10', 'shoes': '#e8c040'}, {'cloth': '#204a8a'}),
    'boris': ('danny', {'cloth': '#c02020', 'skin': '#e89a7c', 'hair': '#c02818', 'shoes': '#c02020', 'bands': '#f0c030', 'belt': '#f0c030'}, {'cloth': '#2040b0', 'shoes': '#2040b0', 'hair': '#202020'}),
    'raj': ('danny', {'cloth': '#e88a1c', 'skin': '#8a5434', 'hair': '#2a1a10', 'shoes': 'skin', 'bands': '#e8e0c0', 'belt': '#e8e0c0'}, {'cloth': '#d8d8e0'}),
    'tora': ('kelvinZ', {'cloth': '#1c3070', 'skin': '#eab08a', 'bands': '#1a1a22', 'belt': '#d82828'}, {'cloth': '#7a2020', 'belt': '#2848c8'}),
    'rio': ('kelvinA', {'cloth': '#6a4a26', 'shirt': '#e86a1a', 'skin': '#5a9a3a', 'belt': '#4a4a52'}, {'skin': '#c89a40', 'shirt': '#3a2a8a'}),
    'rocko': ('danny', {'cloth': '#2848b8', 'skin': '#6a3c24', 'hair': '#141414', 'shoes': '#1a1a1a', 'bands': '#d82424', 'belt': '#f0f0f0'}, {'cloth': '#d8d8d8', 'bands': '#2848b8'}),
    'sakda': ('kelvinZ', {'cloth': '#5a2a8a', 'skin': '#b07a4a', 'bands': '#f0ece0', 'belt': '#1a1a1a'}, {'cloth': '#b01818'}),
    'zar': ('kelvinA', {'cloth': '#a01828', 'shirt': '#2a2a2a', 'skin': '#e0a07a', 'belt': '#e8c040'}, {'cloth': '#304878'}),
}


def hex_rgb(h):
    n = int(h[1:], 16)
    return ((n >> 16) & 255, (n >> 8) & 255, n & 255)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


WARM_LIGHT = (255, 244, 214)
WARM_SHADOW = (92, 24, 34)
COOL_SHADOW = (26, 22, 72)


def ramp(hexc):
    """The same five tones `figure.ts`'s ramp() makes: deep, shade, base, light, shine."""
    base = hex_rgb(hexc)
    warm = base[0] > base[1] and base[1] >= base[2] * 0.9 and base[0] - base[2] > 40
    tint = WARM_SHADOW if warm else COOL_SHADOW
    deep = mix(base, tint, 0.62)
    return [deep, mix(base, tint, 0.34), base, mix(base, WARM_LIGHT, 0.3), mix(base, WARM_LIGHT, 0.64)]


def classify(rgb, rules=()):
    r, g, b = (c / 255 for c in rgb)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    deg = h * 360
    if v < 0.035:
        return 'ink'
    for rule in rules:
        if rule[0] == 'g':
            if s < 0.18:
                return rule[1]
        elif rule[0] <= deg <= rule[1] and rule[2] <= s <= rule[3]:
            return rule[4]
    if s < 0.18:
        return 'cloth'
    if 8 <= deg <= 45:
        return 'skin' if s < 0.6 else 'hair'
    if deg < 8 or deg > 340:
        return 'belt'
    if 250 <= deg <= 330:
        return 'shoes'
    return 'cloth'


def recolour_table(frames, colours, rules=()):
    """
    Map every source colour to its fighter colour, tone by tone. A colour's
    tone is its rank by brightness among its material's pixels (the darkest
    15% deep, then shade, base, light, and the brightest 7% shine), so a
    material shaded dark in the source still uses the target's whole ramp.
    """
    counts = {}
    for fr in frames:
        for c, a in zip(fr.get_flattened_data(), fr.getchannel('A').get_flattened_data()):
            if a:
                counts[c[:3]] = counts.get(c[:3], 0) + 1
    by_mat = {}
    for c, n in counts.items():
        by_mat.setdefault(classify(c, rules), []).append((sum(c), c, n))
    table = {}
    for m, cols in by_mat.items():
        target = colours.get(m)
        while target in colours:
            target = colours[target]
        cols.sort()
        total = sum(n for _, _, n in cols)
        run = 0
        for _, c, n in cols:
            mid = (run + n / 2) / total
            run += n
            if m == 'ink':
                table[c] = (16, 12, 16)
            elif target is None:
                table[c] = c
            else:
                idx = 4 if mid > 0.93 else 3 if mid > 0.75 else 2 if mid > 0.45 else 1 if mid > 0.15 else 0
                table[c] = tuple(int(round(x)) for x in ramp(target)[idx])
    return table


def silhouette(img):
    """A frame's alpha, cropped to its pixels and squashed to 24 x 36, for matching poses across bodies."""
    a = img.getchannel('A')
    bb = a.getbbox()
    if not bb:
        return None, (0, 0)
    small = a.crop(bb).resize((24, 36))
    return [1 if v > 64 else 0 for v in small.get_flattened_data()], (bb[2] - bb[0], bb[3] - bb[1])


def aligned(src_dir, source, used):
    """
    The source frame to take for each labelled frame. The move lists were
    labelled on one body per set (`ref`); the other bodies' GIFs carry a few
    extra or missing cels, so each labelled frame is matched to the target
    frame within a dozen either side whose silhouette (and size) is closest.
    """
    if 'ref' not in source:
        return {f: f for f in used}
    ref = Image.open(os.path.join(src_dir, SOURCES[source['ref']]['gif']))
    tgt = Image.open(os.path.join(src_dir, source['gif']))
    cache = {}

    def tsil(i):
        if i not in cache:
            tgt.seek(i)
            cache[i] = silhouette(tgt.convert('RGBA'))
        return cache[i]

    out = {}
    for f in used:
        ref.seek(f)
        rs, rsize = silhouette(ref.convert('RGBA'))
        best, score = f, -1e9
        for i in range(max(0, f - 12), min(tgt.n_frames, f + 13)):
            ts, tsize = tsil(i)
            if rs is None or ts is None:
                continue
            same = sum(1 for x, y in zip(rs, ts) if x == y) / len(rs)
            aspect = abs(rsize[0] / max(1, rsize[1]) - tsize[0] / max(1, tsize[1]))
            sc = same - aspect * 0.5 - abs(i - f) * 0.002
            if sc > score:
                best, score = i, sc
        out[f] = best
    return out


def build(src_dir, key, source, colours):
    gif = Image.open(os.path.join(src_dir, source['gif']))
    sset = SETS[source['set']]
    used = sorted({f for frames in sset['anims'].values() for f in frames} | {sset['anchor']})
    take = aligned(src_dir, source, used)
    frames = {}
    for f in used:
        gif.seek(take[f])
        frames[f] = gif.convert('RGBA')
    table = recolour_table(frames.values(), colours, source['rules'])
    a = frames[sset['anchor']].getchannel('A').getbbox()
    anchor = ((a[0] + a[2]) // 2, a[3])
    crops = []
    for f, fr in frames.items():
        bb = fr.getchannel('A').getbbox()
        if not bb:
            continue
        img = fr.crop(bb)
        px = img.load()
        for y in range(img.height):
            for x in range(img.width):
                p = px[x, y]
                if p[3]:
                    px[x, y] = table[p[:3]] + (255,)
                else:
                    px[x, y] = (0, 0, 0, 0)
        crops.append((f, img, bb[0] - anchor[0], bb[1] - anchor[1]))
    # Shelf-pack, tallest first.
    crops.sort(key=lambda c: -c[1].height)
    width = 1024
    x = y = shelf = 0
    rects = {}
    for f, img, ox, oy in crops:
        if x + img.width > width:
            x, y, shelf = 0, y + shelf + 1, 0
        rects[f] = (x, y, img.width, img.height, ox, oy)
        x += img.width + 1
        shelf = max(shelf, img.height)
    atlas = Image.new('RGBA', (width, y + shelf), (0, 0, 0, 0))
    for f, img, _, _ in crops:
        r = rects[f]
        atlas.paste(img, (r[0], r[1]))
    os.makedirs(OUT_DIR, exist_ok=True)
    atlas.save(os.path.join(OUT_DIR, f'{key}.png'), optimize=True)
    return rects


def write_ts(all_rects):
    lines = [
        '/**',
        ' * GENERATED by scripts/fighter-sprites.py from puffolotti\'s CC0',
        ' * Mustermenschen fighters: do not edit by hand, re-run the script.',
        ' *',
        ' * Per fighter, the move list it follows and, per source frame, its',
        ' * rectangle in `/fun/fighter/sprites/<id>.png` and the offset of that',
        ' * rectangle\'s top-left from the feet: [x, y, w, h, ox, oy].',
        ' */',
        "import type { CharId } from './roster';",
        '',
        'export type SheetFrame = readonly [number, number, number, number, number, number];',
        '',
        "export const SHEETS: Partial<Record<CharId, { set: 'wcd' | 'thai'; frames: Readonly<Record<number, SheetFrame>> }>> = {",
    ]
    blocks = []
    for fid, (sset, rects) in all_rects.items():
        rows = ',\n'.join(f'      {f}: [{", ".join(str(v) for v in rects[f])}]' for f in sorted(rects))
        blocks.append(f"  {fid}: {{\n    set: '{sset}',\n    frames: {{\n{rows}\n    }}\n  }}")
    lines.append(',\n'.join(blocks))
    lines.append('};')
    open(OUT_TS, 'w').write('\n'.join(lines) + '\n')


def main():
    src = sys.argv[1]
    out = {}
    for fid, (sname, main_c, alt_c) in FIGHTERS.items():
        source = SOURCES[sname]
        rects = build(src, fid, source, main_c)
        # The alternate colourway packs identically (same frames, same crops), so one table serves both.
        build(src, f'{fid}-alt', source, {**main_c, **alt_c})
        out[fid] = (source['set'], rects)
        print(fid, len(rects), 'frames')
    write_ts(out)


if __name__ == '__main__':
    main()
