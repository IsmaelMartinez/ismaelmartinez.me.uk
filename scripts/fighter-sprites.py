#!/usr/bin/env python3
"""
Build STREET CHAMPION's fighter sprite atlases from puffolotti's CC0
"Mustermenschen" fighters (https://opengameart.org/content/musternenschen-v1-complete-collection,
CC0 1.0, "Sprite created by Puffolotti Accident").

The male fighters come from puffolotti's 171 px "Mustermann 2" karate
template (https://opengameart.org/content/fighting-character-template-mustermann-2-a001aaaa001-karate,
CC0 1.0), which is drawn at twice the arcade's scale: it is downscaled to
each fighter's height with the arcade's look applied on the way (each
material's mask taken at full size, its shading averaged down and
re-sharpened, a six-tone hue-shifted ramp per material, and the silhouette's
edge in the material's own darkest tone instead of a black line, which is how
the 1991 sprites were finished). The heroic bulk of the arcade's figures is
a horizontal stretch (`WIDEN`).

Not run in CI. Download and unzip both packs, then:

    python3 scripts/fighter-sprites.py dir-with-gifs [another-dir ...]

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
    'mustermann': {
        'gif': '1_8.gif',
        'set': 'mm',
        'hires': True,
        'rules': [['g', 'vest'], [15, 40, 0.6, 1, 'cloth'], [200, 260, 0, 1, 'belt'], [0, 15, 0.5, 1, 'hair'], [340, 360, 0.5, 1, 'hair']],
    },
    'antony': {'gif': 'Antony Nagasaki WrongCookieDo 01AAH009.gif', 'set': 'wcd', 'rules': []},
    'larissa': {
        'gif': 'Larissa Disaster Wrongcookiedo 02ABH009.gif',
        'set': 'wcd',
        'ref': 'antony',
        'rules': [['g', 'cloth'], [0, 8, 0.6, 1, 'cloth'], [340, 360, 0.6, 1, 'cloth'], [200, 260, 0.6, 1, 'legs'], [35, 60, 0.6, 1, 'hair']],
    },
}

# Each fighter: a source body and the colour each of its materials becomes,
# then the second colourway the mirror match wears. A colour naming another
# material takes that material's colour (barefoot fighters' shoes become skin).
FIGHTERS = {
    'kenji': ('mustermann', {'cloth': '#eeeade', 'vest': '#eeeade', 'skin': '#e0a070', 'hair': '#3a2416', 'belt': '#1c1c22', 'shoes': 'skin', 'headband': '#d02828'}, {'cloth': '#e8e0a0', 'vest': '#e8e0a0'}),
    'ace': ('mustermann', {'cloth': '#d02a24', 'vest': '#d02a24', 'skin': '#eab084', 'hair': '#f0c838', 'belt': '#1c1c22', 'shoes': 'skin'}, {'cloth': '#e8e8e8', 'vest': '#e8e8e8', 'hair': '#b07030'}),
    'mei': ('larissa', {'cloth': '#2c50c8', 'legs': '#1e2a78', 'skin': '#eab48c', 'hair': '#2a1a14', 'belt': '#f4f4f4'}, {'cloth': '#c82c88', 'legs': '#6a1848'}),
    'duke': ('mustermann', {'cloth': '#6a7c40', 'vest': '#4e6a2a', 'skin': '#e2a47a', 'hair': '#e8d050', 'belt': '#3a2a1a', 'shoes': '#2a2620'}, {'cloth': '#3a4a6a', 'vest': '#8a8a8a', 'hair': '#7a4a20'}),
    'varga': ('mustermann', {'cloth': '#6a2a8a', 'vest': 'skin', 'skin': '#eab48c', 'hair': '#3a1a10', 'belt': '#d82424', 'shoes': '#e8c040'}, {'cloth': '#204a8a', 'belt': '#e8c040'}),
    'boris': ('mustermann', {'cloth': '#c02020', 'vest': 'skin', 'skin': '#e89a7c', 'hair': '#c02818', 'belt': '#f0c030', 'shoes': '#c02020'}, {'cloth': '#2040b0', 'shoes': '#2040b0', 'hair': '#202020'}),
    'raj': ('mustermann', {'cloth': '#e88a1c', 'vest': 'skin', 'skin': '#8a5434', 'hair': '#2a1a10', 'belt': '#e8e0c0', 'shoes': 'skin'}, {'cloth': '#d8d8e0'}),
    'tora': ('mustermann', {'cloth': '#1c3070', 'vest': 'skin', 'skin': '#eab08a', 'hair': '#1a1a22', 'belt': '#d82828', 'shoes': 'skin'}, {'cloth': '#7a2020', 'belt': '#2848c8'}),
    'rio': ('mustermann', {'cloth': '#6a4a26', 'vest': 'skin', 'skin': '#5a9a3a', 'hair': '#e86a1a', 'belt': '#4a4a52', 'shoes': 'skin'}, {'skin': '#c89a40', 'hair': '#3a2a8a'}),
    'rocko': ('mustermann', {'cloth': '#2848b8', 'vest': 'skin', 'skin': '#6a3c24', 'hair': '#141414', 'belt': '#f0f0f0', 'shoes': '#1a1a1a'}, {'cloth': '#d8d8d8'}),
    'sakda': ('mustermann', {'cloth': '#5a2a8a', 'vest': 'skin', 'skin': '#b07a4a', 'hair': '#1a1a1a', 'belt': '#f0ece0', 'shoes': 'skin', 'headband': '#f0ece0'}, {'cloth': '#b01818'}),
    'zar': ('mustermann', {'cloth': '#a01828', 'vest': '#a01828', 'skin': '#e0a07a', 'hair': '#1a1a1a', 'belt': '#e8c040', 'shoes': '#242424'}, {'cloth': '#304878', 'vest': '#304878'}),
}


# Each fighter's drawn height, px: the rules' `Fighter.height` and a touch, as the arcade drew its figures a head over their hurtboxes.
HEIGHTS = {'kenji': 98, 'ace': 98, 'mei': 92, 'boris': 108, 'raj': 104, 'tora': 100, 'rio': 96, 'duke': 102, 'rocko': 104, 'varga': 100, 'sakda': 116, 'zar': 104}
# The arcade's figures are bulkier than a person: a horizontal stretch on the downscale.
WIDEN = 1.14
# The source model's height in its idle frame, px.
MM_HEIGHT = 171


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


SEARCH = []


def find(name):
    for d in SEARCH:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


def ramp6(hexc):
    """An outline tone under the five-tone ramp: the silhouette's edge, darker than any shading."""
    r = ramp(hexc)
    return [mix(r[0], (10, 6, 12), 0.45)] + r


def build_hires(key, source, colours, height):
    """
    One fighter from the 171 px model: materials at full size, shading
    averaged down and re-sharpened, tones by brightness rank per material
    over the whole sheet, and the silhouette's edge in the material's own
    outline tone.
    """
    from PIL import ImageFilter

    gif = Image.open(find(source['gif']))
    sset = SETS[source['set']]
    used = sorted({f for frames in sset['anims'].values() for f in frames} | {sset['anchor']})
    k = height / MM_HEIGHT
    W, H = gif.size
    W2, H2 = round(W * k * WIDEN), round(H * k)
    names = ['skin', 'vest', 'cloth', 'belt', 'hair', 'shoes', 'ink']
    small = {}
    for f in used:
        gif.seek(f)
        fr = gif.convert('RGBA')
        bb = fr.getchannel('A').getbbox()
        mat = Image.new('L', fr.size)
        lum = Image.new('L', fr.size)
        px, mp, lp = fr.load(), mat.load(), lum.load()
        cache = {}
        for y in range(H):
            for x in range(W):
                p = px[x, y]
                if p[3] < 128:
                    continue
                c = p[:3]
                if c not in cache:
                    cache[c] = classify(c, source['rules'])
                m = cache[c]
                mp[x, y] = names.index(m) + 1
                lp[x, y] = int(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2])
        # The model's belt and its ankle cuffs share a blue; a blue with bare foot just under it is a cuff.
        belt, shoe, skin_i = names.index('belt') + 1, names.index('shoes') + 1, names.index('skin') + 1
        for y in range(H):
            for x in range(W):
                if mp[x, y] == belt and any(y + d < H and mp[x, y + d] == skin_i for d in range(1, 14)):
                    mp[x, y] = shoe
        # A majority vote over each pixel's neighbourhood: the model's near-white highlights read as grey, and grey is the vest.
        m2 = mat.filter(ImageFilter.ModeFilter(5)).resize((W2, H2), Image.NEAREST)
        l2 = lum.resize((W2, H2), Image.BOX).filter(ImageFilter.UnsharpMask(1, 90, 2))
        a2 = fr.getchannel('A').resize((W2, H2), Image.BOX).point(lambda a: 255 if a > 110 else 0)
        small[f] = (m2, l2, a2)
    # Brightness quantiles per material over every frame, so a tone means the same thing on every cel.
    vals = {}
    for m2, l2, a2 in small.values():
        for mv, lv, av in zip(m2.get_flattened_data(), l2.get_flattened_data(), a2.get_flattened_data()):
            if av and mv:
                vals.setdefault(mv, []).append(lv)
    cuts = {}
    for mv, v in vals.items():
        v.sort()
        cuts[mv] = [v[int(len(v) * q)] for q in (0.12, 0.36, 0.66, 0.9)]
    ramps = {}
    for i, n in enumerate(names):
        target = colours.get(n)
        while target in colours:
            target = colours[target]
        ramps[i + 1] = [tuple(int(round(c)) for c in t) for t in ramp6(target or '#202020')]
    a = small[sset['anchor']][2].getbbox()
    anchor = ((a[0] + a[2]) // 2, a[3])
    band = colours.get('headband')
    band_ramp = [tuple(int(round(c)) for c in t) for t in ramp6(band)] if band else None
    crops = []
    for f, (m2, l2, a2) in small.items():
        bb = a2.getbbox()
        if not bb:
            continue
        out = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
        op, mp, lp, ap = out.load(), m2.load(), l2.load(), a2.load()
        for y in range(bb[1], bb[3]):
            for x in range(bb[0], bb[2]):
                if not ap[x, y]:
                    continue
                mv = mp[x, y] or 1
                edge = any(not (0 <= x + dx < W2 and 0 <= y + dy < H2) or not ap[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                if edge or mv == 7:
                    t = 0
                else:
                    c = cuts.get(mv, [64, 96, 128, 192])
                    lv = lp[x, y]
                    t = 1 if lv < c[0] else 2 if lv < c[1] else 3 if lv < c[2] else 4 if lv < c[3] else 5
                op[x, y] = ramps[mv][t] + (255,)
        if band_ramp:
            # A headband: the two rows of hair just above the forehead's skin, in every column of the head.
            hair, skin = names.index('hair') + 1, names.index('skin') + 1
            for x in range(bb[0], bb[2]):
                for y in range(bb[1], bb[3] - 1):
                    if mp[x, y] == hair and ap[x, y] and mp[x, y + 1] == skin and ap[x, y + 1]:
                        for dy, t in ((-1, 3), (-2, 4)):
                            if y + dy >= 0 and ap[x, y + dy] and mp[x, y + dy] == hair:
                                op[x, y + dy] = band_ramp[t] + (255,)
                        break
        crops.append((f, out.crop(bb), bb[0] - anchor[0], bb[1] - anchor[1]))
    return pack(key, crops)


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
    ref = Image.open(find(SOURCES[source['ref']]['gif']))
    tgt = Image.open(find(source['gif']))
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
    gif = Image.open(find(source['gif']))
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
    return pack(key, crops)


def pack(key, crops):
    """Shelf-pack the cels, tallest first, into the fighter's atlas; return each cel's rectangle and offset."""
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
    # A few dozen colours per sheet: saved palettised, which is exact and a fraction of the size.
    colours = atlas.getcolors(256)
    path = os.path.join(OUT_DIR, f'{key}.png')
    if colours is not None and len(colours) <= 255:
        # Index 0 is the transparent background; every opaque colour gets its own slot.
        solid = sorted({c[:3] for _, c in colours if c[3]})
        index = {c: i + 1 for i, c in enumerate(solid)}
        pal = Image.new('P', atlas.size, 0)
        pal.putpalette([0, 0, 0] + [v for c in solid for v in c])
        pal.putdata([index[p[:3]] if p[3] else 0 for p in atlas.get_flattened_data()])
        pal.save(path, optimize=True, transparency=0)
    else:
        atlas.save(path, optimize=True)
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
        "export const SHEETS: Partial<Record<CharId, { set: " + ' | '.join(f"'{k}'" for k in SETS) + '; frames: Readonly<Record<number, SheetFrame>> }>> = {',
    ]
    blocks = []
    for fid, (sset, rects) in all_rects.items():
        rows = ',\n'.join(f'      {f}: [{", ".join(str(v) for v in rects[f])}]' for f in sorted(rects))
        blocks.append(f"  {fid}: {{\n    set: '{sset}',\n    frames: {{\n{rows}\n    }}\n  }}")
    lines.append(',\n'.join(blocks))
    lines.append('};')
    open(OUT_TS, 'w').write('\n'.join(lines) + '\n')


def main():
    SEARCH.extend(sys.argv[1:])
    src = sys.argv[1]
    out = {}
    for fid, (sname, main_c, alt_c) in FIGHTERS.items():
        source = SOURCES[sname]
        if source.get('hires'):
            rects = build_hires(fid, source, main_c, HEIGHTS[fid])
            build_hires(f'{fid}-alt', source, {**main_c, **alt_c}, HEIGHTS[fid])
        else:
            rects = build(src, fid, source, main_c)
            # The alternate colourway packs identically (same frames, same crops), so one table serves both.
            build(src, f'{fid}-alt', source, {**main_c, **alt_c})
        out[fid] = (source['set'], rects)
        print(fid, len(rects), 'frames')
    write_ts(out)


if __name__ == '__main__':
    main()
