"""Authoring rig for PRIME TIME's bitmaps (src/games/primetime/sprites.ts).

Not part of the build or CI: a drawing aid. Shapes (circles, polygons,
rectangles) go onto a one-letter-per-pixel grid, `outline()` draws the black
rim every sprite wears, `shade()` places highlights and shadows by rule, and
the small figures are typed as rows directly. The rig renders every sprite
to a gallery PNG for a look against the arcade and SNES screenshots, and
emits the rows as literals to paste into sprites.ts, which is the thing the
page ships and the tests check. Needs Pillow.

    python3 scripts/primetime-sprite-rig.py gallery.png rows.txt sprites.json
"""
from PIL import Image, ImageDraw
import math, json, sys

class G:
    def __init__(s, w, h): s.w, s.h, s.g = w, h, [['.']*w for _ in range(h)]
    def put(s, x, y, c):
        if 0 <= x < s.w and 0 <= y < s.h: s.g[y][x] = c
    def get(s, x, y): return s.g[y][x] if 0 <= x < s.w and 0 <= y < s.h else '.'
    def rect(s, x0, y0, x1, y1, c):
        for y in range(y0, y1+1):
            for x in range(x0, x1+1): s.put(x, y, c)
    def ell(s, cx, cy, rx, ry, c):
        for y in range(s.h):
            for x in range(s.w):
                if ((x+0.5-cx)/rx)**2 + ((y+0.5-cy)/ry)**2 <= 1: s.put(x, y, c)
    def circ(s, cx, cy, r, c): s.ell(cx, cy, r, r, c)
    def poly(s, pts, c):
        # scanline fill
        for y in range(s.h):
            yy = y + 0.5; xs = []
            n = len(pts)
            for i in range(n):
                (x0, y0), (x1, y1) = pts[i], pts[(i+1) % n]
                if (y0 <= yy < y1) or (y1 <= yy < y0):
                    xs.append(x0 + (yy - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs)-1, 2):
                for x in range(int(math.floor(xs[i])), int(math.ceil(xs[i+1]))): s.put(x, y, c)
    def outline(s, k='k'):
        out = [row[:] for row in s.g]
        for y in range(s.h):
            for x in range(s.w):
                if s.g[y][x] == '.': continue
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    if s.get(x+dx, y+dy) == '.': out[y][x] = k; break
        s.g = out
    def shade(s, pred, frm, to):
        for y in range(s.h):
            for x in range(s.w):
                if s.g[y][x] == frm and pred(x, y): s.g[y][x] = to
    def rows(s): return [''.join(r) for r in s.g]
    def mirror(s):
        for y in range(s.h):
            for x in range(s.w // 2):
                s.g[y][s.w-1-x] = s.g[y][x]

SPRITES = {}  # name -> (rows, palette, scale)
def add(name, rows, pal, scale):
    w = len(rows[0])
    for r in rows: assert len(r) == w, (name, r, len(r), w)
    for r in rows:
        for c in r: assert c == '.' or c in pal, (name, c)
    SPRITES[name] = (rows, pal, scale)

K = '#0b0b12'
SKIN, SKIN_D, SKIN_L = '#f1b98a', '#c98a5a', '#ffd9bd'

# ---------------- player ----------------
PP = dict(k=K, h='#2f5fe0', H='#1d3fa8', s=SKIN, d=SKIN_D, e='#ffffff', r='#d9342b', R='#9c1f18', j='#2a4fc9', J='#1a3390')
add('PLAYER_FRONT', [
 '.....kkkk.....',
 '....khhhhhk...',
 '....khhhhhk...',
 '....kssssdk...',
 '....ksesedk...',
 '.....kssdk....',
 '......kdk.....',
 '..kkkkrrrkkkk.',
 '.ksskrrrrrkssk',
 'kssskRrrrRkssk',
 'kssskrrrrrkssk',
 'kdddkRRrRRkddk',
 '.kkkkkRRRkkkk.',
 '.....kjjjk....'], PP, 2)
add('PLAYER_BACK', [
 '.....kkkk.....',
 '....khhhhhk...',
 '....khhhhhk...',
 '....kHhhhhk...',
 '....kHHhhHk...',
 '.....kHHHk....',
 '......kdk.....',
 '..kkkkrrrkkkk.',
 '.ksskrrrrrkssk',
 'kssskrrrrrkssk',
 'kssskrrRrrkssk',
 'kdddkRRRRRkddk',
 '.kkkkkRRRkkkk.',
 '.....kjjjk....'], PP, 2)
add('PLAYER_SIDE', [
 '.....kkkk.....',
 '....khhhhhk...',
 '....khhhhhsk..',
 '....khhsssdk..',
 '....kHssesdk..',
 '.....kssddk...',
 '......kdk.....',
 '....kkrrrkk...',
 '...krrrrkssssk',
 '...kRrrrkssssk',
 '...krrrrkkkkk.',
 '...kRRRRk.....',
 '....kkkkk.....',
 '.....kjjjk....'], PP, 2)
add('PLAYER_DOWN', [
 '.......................',
 '..kkkk.....kkkkkkkkkk..',
 '.khhhhk..kkrrrrrrrrjjk.',
 'khhssskkksRrrrrrrRRjjjk'[:23],
 'khssesskksrrrrrrrrRjjjk'[:23],
 '.khsssk..kkRRRRRRRRjjk.',
 '..kkkk.....kkkkkkkkkk..',
 '.......................'], PP, 2)

# ---------------- grunt (3 frames, kit palette filled later) ----------------
GRUNT_ROWS = [[
 '....kkkk..kk',
 '...kssssk.kw',
 '...ksdsdk.kw',
 '...kssssk.kw',
 '....kddk..kw',
 '..kkggggkkkw',
 '.kskgLggkssk',
 'ksskggggksk.',
 'kskkggggkk..',
 'kdkkGggGk...',
 '.k.kGGGGk...',
 '...kggggk...',
 '..kggkkggk..',
 '.kggk..kggk.',
 '.kbbk..kbbk.',
 '.kkkk..kkkk.'],[
 '....kkkk....',
 '...kssssk...',
 '...ksdsdk...',
 '...kssssk...',
 '....kddk....',
 '..kkggggkk..',
 '.kskgLggksk.',
 'ksskggggksww',
 'kskkggggkkkk',
 'kdkkGggGk...',
 '.k.kGGGGk...',
 '...kggggk...',
 '...kggggk...',
 '...kggggk...',
 '...kbbbbk...',
 '...kkkkkk...'],[
 '....kkkk....',
 '...kssssk...',
 '...ksdsdk...',
 '...kssssk...',
 '....kddk....',
 '..kkggggkk..',
 '.kskgLggkskk',
 'ksskggggkskw',
 'kskkggggkkkw',
 'kdkkGggGk..w',
 '.k.kGGGGk..W',
 '...kggggk...',
 '..kggkkggk..',
 '.kggk..kggk.',
 '.kbbk..kbbk.',
 '.kkkk..kkkk.']]
GP = dict(k=K, s=SKIN, d=SKIN_D, g='#3cb84a', G='#1f7a2c', L='#7ee08a', w='#a16a2b', W='#6b4219', b='#1a1a22')
for i, r in enumerate(GRUNT_ROWS): add(f'GRUNT_{i}', r, GP, 2)

# ---------------- orb ----------------
OP = dict(k=K, m='#8c80b0', M='#4a4066', L='#c8c0e0', w='#ffffff', r='#e03030', R='#7a1010')
ORB = [
 '....kkkk....',
 '..kkLLmmkk..',
 '.kLLLLmmmMk.',
 '.kLLLmmmmMk.',
 'kLLmmmmmmMMk',
 'kLmmmmmmmMMk',
 'kmmmmmmmMMMk',
 'kmmmmmmMMMMk',
 '.kmmmmMMMMk.',
 '.kMmmMMMMMk.',
 '..kkMMMMkk..',
 '....kkkk....']
ORB_ARMED = ORB[:]
ORB_ARMED[5] = 'kLmkRrrRkMMk'
ORB_ARMED[6] = 'kmmkrrrrkMMk'
ORB_CHARGE = ORB[:]
ORB_CHARGE[5] = 'kLmkwwwwkMMk'
ORB_CHARGE[6] = 'kmmkwrrwkMMk'
add('ORB_QUIET', ORB, OP, 2); add('ORB_ARMED', ORB_ARMED, OP, 2); add('ORB_CHARGE', ORB_CHARGE, OP, 2)

# ---------------- mine (jacks) ----------------
MP = dict(k=K, m='#9a9aa4', M='#5a5a66', r='#e03030', d='#2a2a30')
add('MINE', [
 'kk.......kk',
 'krk.....krk',
 '.kmk...kmk.',
 '..kmk.kmk..',
 '...kMMMk...',
 '...kMdMk...',
 '...kMMMk...',
 '..kmk.kmk..',
 '.kmk...kmk.',
 'krk.....krk',
 'kk.......kk'], MP, 2)

# ---------------- shrapnel (walking bomb robot) ----------------
SP = dict(k=K, m='#9a9aa4', M='#5a5a66', r='#e03030', d='#2a2a30', e='#fde047')
SH0 = [
 '....kkkk....',
 '...kmmmmk...',
 '...kmeemk...',
 '...kMMMMk...',
 '....kMMk....',
 '.kkkmmmmkkk.',
 'kmkmmrrmmkmk',
 'kmkmrrrrmkmk',
 'kMkmmrrmmkMk',
 'kMkkMMMMkkMk',
 '.k.kMMMMk.k.',
 '...kmmmmk...',
 '..kmmkkmmk..',
 '.kmmk..kmmk.',
 '.kMMk..kMMk.',
 '.kkkk..kkkk.']
SH1 = SH0[:12] + [
 '...kmmmmk...',
 '...kmmmmk...',
 '...kMMMMk...',
 '...kkkkkk...']
add('SHRAPNEL_0', SH0, SP, 2); add('SHRAPNEL_1', SH1, SP, 2)

# ---------------- tank (grey hover tank with pilot) ----------------
TP = dict(k=K, m='#9a9aa4', M='#5a5a66', d='#2a2a30', o='#e8742a', s=SKIN, b='#2a4fc9')
add('TANK', [
 'kkkkkkkkkkkkkkkkkk',
 'kdMdMdMdMdMdMdMdMk',
 'kkkkkkkkkkkkkkkkkk',
 '.kMmmmmmmmmmmmmMk.',
 '.kmmmmmkkkkmmmmmk.',
 '.kmmmmkossokmmmmk.',
 '.kmmmmkobbokmmmmk.',
 '.kmmmmMkkkkMmmmmk.',
 '.kMMMmmmmmmmmMMMk.',
 'kkkkkkkkkkkkkkkkkk',
 'kdMdMdMdMdMdMdMdMk',
 'kkkkkkkkkkkkkkkkkk'], TP, 2)

# ---------------- snake (cyan) ----------------
NP = dict(k=K, p='#38bdf8', P='#0c6aa8', y='#ffffff', e='#111827', t='#f87171')
add('SNAKE_HEAD', [
 '..kkkkkk.....',
 '.kPppppppk...',
 'kPpppkykppk..',
 'kppppkekpppk.',
 'kppppppppppkt',
 'kppppppppppkt',
 'kppppkekpppk.',
 'kPpppkykppk..',
 '.kPppppppk...',
 '..kkkkkk.....'], NP, 2)
add('SNAKE_SEGMENT', [
 '.kkkkkk.',
 'kPppppPk',
 'kpppyppk',
 'kppyyppk',
 'kpppyppk',
 'kPppppPk',
 '.kkkkkk.'], NP, 2)

# ---------------- Mutoid Man ----------------
MUP = dict(k=K, s='#f2a784', S='#c4704f', L='#ffd0b0', g='#2fa84a', G='#1b6b2e', V='#6fd47f',
           m='#a3a3ad', M='#5f5f6b', r='#d9342b', d='#2a2a30', y='#f0c040', w='#ffffff', t='#3a3a42', e='#3a1a10', p='#a855f7')
def mutoid(hurt=False):
    g = G(36, 46)
    # tank base: hull, cockpit, treads, gun pods
    g.rect(6, 33, 29, 42, 'M')
    g.rect(8, 34, 27, 40, 'm')
    g.rect(13, 35, 22, 39, 'd')
    g.rect(15, 36, 20, 38, 'y')
    g.rect(4, 39, 31, 45, 't')
    for x in range(5, 31, 3): g.rect(x, 40, x, 44, 'd')
    g.rect(1, 35, 7, 38, 'M'); g.rect(28, 35, 34, 38, 'M')
    g.rect(0, 36, 2, 37, 'd'); g.rect(33, 36, 35, 37, 'd')
    # biceps bulging over the shoulder line, forearms down to the fists
    g.ell(6.5, 17, 6.5, 6.5, 'g'); g.ell(29.5, 17, 6.5, 6.5, 'g')
    g.rect(2, 17, 9, 25, 'g'); g.rect(26, 17, 33, 25, 'g')
    g.ell(5, 28.5, 5, 4.5, 's'); g.ell(31, 28.5, 5, 4.5, 's')
    # torso tapering into the hull
    g.poly([(7, 12), (29, 12), (27, 34), (9, 34)], 'g')
    # steel shoulder yoke and chest plate
    g.poly([(5, 11), (31, 11), (29, 15), (7, 15)], 'm')
    g.rect(13, 15, 22, 22, 'm')
    g.poly([(14, 16), (22, 16), (18, 22)], 'r')
    # head: bald, round, heavy jaw, sitting in the yoke
    g.ell(18, 6.5, 6, 6.5, 's')
    g.rect(14, 9, 21, 12, 's')
    g.outline()
    g.shade(lambda x, y: x > 20 and y < 13, 's', 'S')
    g.shade(lambda x, y: x < 17 and y < 5, 's', 'L')
    g.shade(lambda x, y: x > 22 and 10 < y < 35, 'g', 'G')
    g.shade(lambda x, y: x < 12 and 10 < y < 24, 'g', 'V')
    g.shade(lambda x, y: x > 29 and 24 < y < 33, 's', 'S')
    g.shade(lambda x, y: (x + y) % 5 == 0 and 33 <= y <= 40, 'm', 'M')
    # face
    g.rect(14, 5, 21, 5, 'S')
    g.put(15, 6, 'k'); g.put(16, 6, 'e'); g.put(19, 6, 'e'); g.put(20, 6, 'k')
    g.put(17, 8, 'S'); g.put(18, 8, 'S')
    g.rect(15, 10, 20, 10, 'k'); g.rect(15, 11, 20, 11, 'w'); g.put(17, 11, 'k')
    # knuckles
    for x in (2, 4, 6): g.put(x, 27, 'S')
    for x in (29, 31, 33): g.put(x, 27, 'S')
    if hurt:
        g.rect(10, 24, 12, 30, 'M'); g.rect(24, 22, 26, 27, 'M')
        g.put(11, 27, 'r'); g.put(25, 24, 'r')
        g.shade(lambda x, y: (x * 7 + y * 3) % 11 == 0 and 12 < y < 34, 'g', 'd')
        g.shade(lambda x, y: (x * 7 + y * 3) % 11 == 0 and 12 < y < 34, 'G', 'd')
    return g.rows()
add('MUTOID', mutoid(), MUP, 3)
add('MUTOID_HURT', mutoid(True), MUP, 3)

# ---------------- Scarface ----------------
SCP = dict(k=K, m='#a3a3ad', M='#5f5f6b', d='#2a2a30', r='#e03030', f='#b8b830', F='#7a7a20', l='#e0e050',
           e='#ffffff', E='#d9342b', p='#111827', t='#ffffff', s='#8a1a1a', b='#ff7ab6', B='#c0407a', w='#ffffff')
def scarface(mode):
    g = G(34, 34)
    g.circ(17, 17, 16.5, 'm')          # steel sphere
    g.circ(17, 17, 12.5, 'f')          # face
    g.outline()
    g.shade(lambda x, y: x + y > 40, 'm', 'M')
    g.shade(lambda x, y: x + y > 36 and (x - 17) ** 2 + (y - 17) ** 2 > 100, 'f', 'F')
    g.shade(lambda x, y: x + y < 22 and (x - 17) ** 2 + (y - 17) ** 2 > 60, 'f', 'l')
    # rivets round the ring
    for i in range(16):
        a = i * math.pi * 2 / 16
        x, y = int(17 + math.cos(a) * 14.5), int(17 + math.sin(a) * 14.5)
        g.put(x, y, 'r' if i % 2 else 'd')
    # plate seams on the ring
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        for rr in (13, 14, 15, 16):
            g.put(int(17 + math.cos(a) * rr), int(17 + math.sin(a) * rr), 'k')
    # brow + eyes
    g.rect(9, 11, 14, 11, 'F'); g.rect(20, 11, 25, 11, 'F')
    g.rect(10, 13, 13, 14, 'e'); g.rect(21, 13, 24, 14, 'e')
    g.rect(11, 13, 12, 14, 'E' if mode == 'rage' else 'p'); g.rect(22, 13, 23, 14, 'E' if mode == 'rage' else 'p')
    # nose
    g.rect(16, 15, 17, 18, 'F')
    # scar down the left cheek
    for i, (x, y) in enumerate([(8, 8), (9, 10), (9, 12), (10, 15), (10, 17), (11, 19)]): g.put(x, y, 's')
    # mouth
    if mode == 'rage':
        g.rect(11, 21, 22, 25, 'p'); g.rect(12, 21, 21, 21, 't'); g.rect(12, 25, 21, 25, 't')
        for x in range(12, 22, 2): g.put(x, 22, 't'); g.put(x + 1, 24, 't')
    else:
        g.rect(11, 22, 22, 23, 'p'); g.rect(12, 22, 21, 22, 't')
        for x in range(12, 22, 3): g.put(x, 23, 't')
    if mode == 'hurt':
        # the top plate blown off: brain showing
        g.rect(9, 3, 24, 8, '.'); g.rect(8, 4, 25, 4, 'k')
        g.ell(17, 7, 7, 4, 'b'); g.outline()
        g.shade(lambda x, y: (x + y) % 3 == 0 and y < 10, 'b', 'B')
    return g.rows()
add('SCARFACE_CALM', scarface('calm'), SCP, 3)
add('SCARFACE_RAGE', scarface('rage'), SCP, 3)
add('SCARFACE_HURT', scarface('hurt'), SCP, 3)

# ---------------- Cobra Death ----------------
CP = dict(k=K, g='#2a8a2a', G='#176117', V='#45c045', p='#7a2aa0', P='#b060d8', r='#c0281c', R='#7a1410', o='#e85a3a', m='#ffb0a0', e='#fde047', w='#ffffff')
def cobra_seg():
    g = G(20, 20)
    g.circ(10, 10, 9.5, 'g'); g.outline()
    g.shade(lambda x, y: x + y > 24, 'g', 'G')
    g.shade(lambda x, y: x + y < 13 and (x-10)**2+(y-10)**2 > 30, 'g', 'V')
    for (x, y) in [(5, 6), (13, 5), (7, 13), (14, 12), (10, 9)]:
        g.put(x, y, 'P'); g.put(x+1, y, 'p'); g.put(x, y+1, 'p'); g.put(x+1, y+1, 'p')
    return g.rows()
def cobra_head():
    g = G(26, 24)
    lumps = [(10, 12, 8.5), (16, 8, 6), (17, 16, 6.5), (20, 12, 5.5), (6, 7, 4.5), (6, 17, 4.5), (13, 4, 3.5), (13, 20, 3.5)]
    for (cx, cy, r) in lumps: g.circ(cx, cy, r, 'R')
    for (cx, cy, r) in lumps: g.circ(cx, cy, r - 1.2, 'r')
    g.outline()
    g.shade(lambda x, y: (x * 3 + y * 5) % 7 == 0, 'r', 'o')
    g.ell(22, 12, 3, 3.5, 'm'); g.put(21, 10, 'w'); g.put(21, 14, 'w')
    g.put(14, 9, 'e'); g.put(14, 15, 'e'); g.put(15, 9, 'k'); g.put(15, 15, 'k')
    return g.rows()
add('COBRA_SEGMENT', cobra_seg(), CP, 2)
add('COBRA_HEAD', cobra_head(), CP, 2)

# ---------------- items (10x10, framed plaques for gear) ----------------
IP = dict(k=K, g='#2fa84a', G='#1b6b2e', w='#ffffff', m='#9a9aa4', M='#5a5a66', d='#1a1a22', y='#f0c040', Y='#b8860b',
          r='#d9342b', R='#9c1f18', b='#2a4fc9', B='#1a3390', c='#22d3ee', o='#e8742a', s=SKIN, p='#f472b6', e='#38bdf8')
add('ITEM_cash', [   # a bundle of green notes with a white band
 '..........',
 '.kkkkkkkk.',
 'kggggggggk',
 'kgGwwwwGgk',
 'kgGwwwwGgk',
 'kggggggggk',
 'kGGGGGGGGk',
 '.kkkkkkkk.',
 '..........',
 '..........'], IP, 2)
add('ITEM_toaster', [
 '..........',
 '.kkkkkkkk.',
 'kmmkkkkmmk',
 'kmmmmmmmmk',
 'kmMmmmmMmk',
 'kmmmmmmmmk',
 'kMMMMMMMMk',
 '.kkkkkkkk.',
 '..k....k..',
 '..........'], IP, 2)
add('ITEM_vcr', [
 '..........',
 '..........',
 'kkkkkkkkkk',
 'kddddddddk',
 'kdMMMMMddk',
 'kdkkkkkrdk',
 'kddddddddk',
 'kkkkkkkkkk',
 '..........',
 '..........'], IP, 2)
add('ITEM_car', [
 '..........',
 '...kkkk...',
 '..krrrrk..',
 '.kkrccrkk.',
 'krrrrrrrrk',
 'krrrrrrrrk',
 '.kkrccrkk.',
 '..krrrrk..',
 '...kkkk...',
 '..........'], IP, 2)
add('ITEM_key', [
 'kkkkkkkkkk',
 'kbbbbbbbbk',
 'kbbkkkbbbk',
 'kbkyyykbbk',
 'kbkykykbbk',
 'kbkyyykbbk',
 'kbbkykbbbk',
 'kbbkyykbbk',
 'kbbbkkbbbk',
 'kkkkkkkkkk'], IP, 2)
add('ITEM_spread', [
 'kkkkkkkkkk',
 'kggggggggk',
 'kgwggwggwk'[:10],
 'kgkwgwgwgk',
 'kggkwwwggk',
 'kgggkwkggk',
 'kgggkwkggk',
 'kgggkwkggk',
 'kggggggggk',
 'kkkkkkkkkk'], IP, 2)
add('ITEM_grenade', [
 'kkkkkkkkkk',
 'kbbbbbbbbk',
 'kbbbbkkbbk',
 'kbbbkddkbk',
 'kbbkddddkk',
 'kbbkdwddkk',
 'kbbkddddkk',
 'kbbbkddkbk',
 'kbbbbkkbbk',
 'kkkkkkkkkk'], IP, 2)
add('ITEM_rocket', [
 'kkkkkkkkkk',
 'kooooooook',
 'koookwkook',
 'kookwwwkok',
 'kookwwwkok',
 'kookwrwkok',
 'kookwwwkok',
 'kokwwkwwkk',
 'kooooooook',
 'kkkkkkkkkk'], IP, 2)
add('ITEM_shield', [
 'kkkkkkkkkk',
 'kmmmmmmmmk',
 'kmkkkkkkmk',
 'kmkccccckk'[:10],
 'kmkcwcccmk',
 'kmkccccmmk',
 'kmmkcccmmk',
 'kmmmkckmmk',
 'kmmmmkmmmk',
 'kkkkkkkkkk'], IP, 2)
add('ITEM_boots', [
 'kkkkkkkkkk',
 'kyyyyyyyyk',
 'kyyykkkyyk',
 'kyyykddkyk',
 'kyyykddkyk',
 'kyykkddkyk',
 'kykddddkyk',
 'kykddddkyk',
 'kyykkkkkyk',
 'kkkkkkkkkk'], IP, 2)
add('ITEM_bomb', [
 'kkkkkkkkkk',
 'krrrrrkyrk',
 'krrrrkyrrk',
 'krrkkkkrrk',
 'krkddddkrk',
 'krkdwdddkk'[:10],
 'krkddddkrk',
 'krkddddkrk',
 'krrkkkkrrk',
 'kkkkkkkkkk'], IP, 2)
add('ITEM_life', [
 'kkkkkkkkkk',
 'kppppppppk',
 'kpkkpkkppk',
 'kkwwkwwkpk',
 'kkwwwwwkpk',
 'kpkwwwkppk',
 'kppkwkpppk',
 'kpppkppppk',
 'kppppppppk',
 'kkkkkkkkkk'], IP, 2)
add('SKULL', [
 '..kkkkk..',
 '.kwwwwwk.',
 'kwwwwwwwk',
 'kwkwwwkwk',
 'kwkkwkkwk',
 '.kwwwwwk.',
 '.kkwkwkk.',
 '..kwkwk..',
 '...kkk...'], dict(k=K, w='#ffffff'), 2)

# ---------------- gallery ----------------
def render(rows, pal, scale, zoom):
    w, h = len(rows[0]), len(rows)
    im = Image.new('RGBA', (w*scale*zoom, h*scale*zoom), (0,0,0,0))
    d = ImageDraw.Draw(im)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == '.': continue
            d.rectangle((x*scale*zoom, y*scale*zoom, (x+1)*scale*zoom-1, (y+1)*scale*zoom-1), fill=pal[c])
    return im
def gallery(path, zoom=3):
    ims = [(n, render(*SPRITES[n], zoom)) for n in SPRITES]
    x = y = 8; rowh = 0; W = 1500
    sheet = Image.new('RGB', (W, 1400), '#2e2e30'); d = ImageDraw.Draw(sheet)
    for n, im in ims:
        if x + im.width + 8 > W: x = 8; y += rowh + 26; rowh = 0
        sheet.paste(im, (x, y + 14), im); d.text((x, y), n, fill='#ffd000')
        x += max(im.width, 70) + 12; rowh = max(rowh, im.height + 14)
    sheet = sheet.crop((0, 0, W, y + rowh + 30)); sheet.save(path); print('gallery', sheet.size)
def emit(path):
    out = []
    for n, (rows, pal, scale) in SPRITES.items():
        out.append(f"// {n} {len(rows[0])}x{len(rows)} scale {scale}")
        out.append("[\n" + ",\n".join("    '" + r + "'" for r in rows) + "\n]")
    open(path, 'w').write("\n".join(out))
if __name__ == '__main__':
    gallery(sys.argv[1]); emit(sys.argv[2])
    json.dump({n: dict(rows=r, palette=p, scale=s) for n, (r, p, s) in SPRITES.items()}, open(sys.argv[3], 'w'))
