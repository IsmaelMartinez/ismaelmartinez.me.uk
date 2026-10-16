"""Authoring rig for PRIME TIME's bitmaps (src/games/primetime/sprites.ts).

Not part of the build or CI: a drawing aid. Shapes (circles, polygons,
rectangles) go onto a grid of *materials* (skin, steel, green suit...), and
`shade()` lights every material the way Williams' digitised sprites read:
five tones per material from deep to highlight, picked per pixel from how
far it sits inside its shape and how squarely it faces a top-left light,
with a checker dither between tone bands and no black outline anywhere.
Fine details (eyes, teeth, lamps) are placed after the lighting pass. The
rig renders every sprite to a gallery PNG for a look against the arcade and
SNES screenshots, and writes sprites.ts itself (the rows, the palettes and
the module's helpers), which is the thing the page ships and the tests
check; the prizes and gear are hand-typed rows kept here too. Needs Pillow.

    python3 scripts/primetime-sprite-rig.py gallery.png sprites.json src/games/primetime/sprites.ts
"""
from PIL import Image, ImageDraw
from collections import deque
import math, json, sys, string

# ------------------------------------------------------------ materials
# Five tones each: deep, dark, mid, light, highlight.
MATS = {
    'skin':    ['#8a3a1a', '#c0683a', '#e8955e', '#f6b98a', '#ffd9bd'],
    'green':   ['#0f4a1a', '#1e7a2c', '#2fb044', '#5fd86a', '#a8f0a8'],
    'hair':    ['#102060', '#1c3aa8', '#2f5fe0', '#5a8aff', '#a8c4ff'],
    'shirt':   ['#5a0c0c', '#9c1f18', '#d9342b', '#f06050', '#ffb0a0'],
    'jeans':   ['#0e1e4a', '#1a3390', '#2a4fc9', '#4a74e8', '#9ab4ff'],
    'sleeve':  ['#5a5a66', '#8a8a96', '#b8b8c4', '#dcdce4', '#ffffff'],
    'steel':   ['#2a2a32', '#55555e', '#8a8a94', '#b8b8c2', '#e8e8f0'],
    'dark':    ['#000000', '#111118', '#222230', '#3a3a48', '#55556a'],
    'gold':    ['#5a3a08', '#9a6a14', '#d9a02a', '#f0c860', '#ffe8a0'],
    'orb':     ['#201c30', '#3d3550', '#6a6080', '#9a90b8', '#d0c8e8'],
    'red':     ['#4a0808', '#7a1410', '#c0281c', '#e85a3a', '#ffb0a0'],
    'olive':   ['#3a3a08', '#7a7a20', '#b8b830', '#dcdc50', '#f4f4a0'],
    'cgreen':  ['#0a3a0a', '#176117', '#2a8a2a', '#45c045', '#90e890'],
    'purple':  ['#2a0a40', '#5a1a80', '#7a2aa0', '#b060d8', '#e0a0ff'],
    'yellow':  ['#5a4000', '#a07a10', '#f0c040', '#ffe070', '#fff8c0'],
    'brain':   ['#6a1040', '#a83068', '#ff7ab6', '#ffa0d0', '#ffd0e8'],
    'white':   ['#808090', '#b0b0c0', '#ffffff', '#ffffff', '#ffffff'],
    'cyan':    ['#083a5a', '#0c6aa8', '#38bdf8', '#7ad8ff', '#c8f0ff'],
    'maw':     ['#5a1030', '#a02050', '#e04070', '#ff80a8', '#ffc0d8'],
    # A second red with the same tones: adjacent lumps drawn in alternating
    # reds shade as separate volumes instead of fusing into one blob.
    'red2':    ['#4a0808', '#7a1410', '#c0281c', '#e85a3a', '#ffb0a0'],
}

class G:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.m = [[None] * w for _ in range(h)]      # material name or None
        s.fixed = {}                               # (x,y) -> (material, tone) placed after shading
    def put(s, x, y, mat):
        if 0 <= x < s.w and 0 <= y < s.h: s.m[y][x] = mat
    def get(s, x, y): return s.m[y][x] if 0 <= x < s.w and 0 <= y < s.h else None
    def rect(s, x0, y0, x1, y1, mat):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1): s.put(x, y, mat)
    def ell(s, cx, cy, rx, ry, mat):
        for y in range(s.h):
            for x in range(s.w):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1: s.put(x, y, mat)
    def circ(s, cx, cy, r, mat): s.ell(cx, cy, r, r, mat)
    def poly(s, pts, mat):
        for y in range(s.h):
            yy = y + 0.5; xs = []
            n = len(pts)
            for i in range(n):
                (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
                if (y0 <= yy < y1) or (y1 <= yy < y0):
                    xs.append(x0 + (yy - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(math.floor(xs[i])), int(math.ceil(xs[i + 1]))): s.put(x, y, mat)
    def line(s, x0, y0, x1, y1, r, mat):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(n + 1):
            t = i / n
            s.circ(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, mat)
    def detail(s, x, y, mat, tone):
        if 0 <= x < s.w and 0 <= y < s.h: s.fixed[(x, y)] = (mat, tone)
    def mirror(s):
        for y in range(s.h):
            for x in range(s.w // 2): s.m[y][s.w - 1 - x] = s.m[y][x]

def shade(g, light=(-0.55, -0.83), lit_bias=0.0, flat=()):
    """Returns a grid of (material, tone) per pixel."""
    out = [[None] * g.w for _ in range(g.h)]
    seen = [[False] * g.w for _ in range(g.h)]
    for y0 in range(g.h):
        for x0 in range(g.w):
            if g.m[y0][x0] is None or seen[y0][x0]: continue
            mat = g.m[y0][x0]
            # flood the component
            comp = []; q = deque([(x0, y0)]); seen[y0][x0] = True
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < g.w and 0 <= ny < g.h and not seen[ny][nx] and g.m[ny][nx] == mat:
                        seen[ny][nx] = True; q.append((nx, ny))
            cs = set(comp)
            # depth: distance to the component's boundary
            depth = {}
            dq = deque()
            for (x, y) in comp:
                edge = any(((x + dx, y + dy) not in cs) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                if edge: depth[(x, y)] = 1; dq.append((x, y))
            while dq:
                x, y = dq.popleft()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (x + dx, y + dy)
                    if n in cs and n not in depth:
                        depth[n] = depth[(x, y)] + 1; dq.append(n)
            maxd = max(depth.values())
            cx = sum(p[0] for p in comp) / len(comp) + 0.5
            cy = sum(p[1] for p in comp) / len(comp) + 0.5
            rad = max(1.0, math.sqrt(len(comp) / math.pi))
            for (x, y) in comp:
                d = depth[(x, y)]
                if mat in flat:
                    out[y][x] = (mat, 2); continue
                vx, vy = (x + 0.5 - cx) / rad, (y + 0.5 - cy) / rad
                lit = (vx * light[0] + vy * light[1]) + lit_bias
                check = (x + y) % 2 == 0
                if d == 1 and maxd >= 3:
                    tone = 0 if lit < -0.15 else (1 if lit < 0.6 else 2)
                elif lit > 0.85 and d >= 2:
                    tone = 4
                elif lit > 0.45:
                    tone = 3 if (lit > 0.6 or check) else 2
                elif lit > -0.3:
                    tone = 2 if (lit > -0.15 or check) else 1
                elif lit > -0.75:
                    tone = 1
                else:
                    tone = 0 if d <= 2 else 1
                out[y][x] = (mat, tone)
    for (x, y), v in g.fixed.items(): out[y][x] = v
    return out

SPRITES = {}   # name -> dict(cells=grid of (mat,tone)|None, scale, order=[materials])
def add(name, g, scale, **kw):
    cells = shade(g, **{k: v for k, v in kw.items() if k in ('light', 'lit_bias', 'flat')})
    SPRITES[name] = dict(cells=cells, scale=scale, order=kw.get('order'))

# ------------------------------------------------------------ the contestant
def player(view, frame):
    g = G(28, 40)
    # legs: jeans, boots; two frames of stride
    if frame == 0:
        g.rect(8, 28, 12, 37, 'jeans'); g.rect(15, 28, 19, 37, 'jeans')
        g.rect(8, 38, 12, 39, 'dark'); g.rect(15, 38, 19, 39, 'dark')
    else:
        g.poly([(7, 28), (12, 28), (10, 38), (5, 38)], 'jeans'); g.poly([(15, 28), (20, 28), (23, 38), (18, 38)], 'jeans')
        g.rect(4, 38, 9, 39, 'dark'); g.rect(18, 38, 23, 39, 'dark')
    if view == 'front':
        g.poly([(5, 14), (22, 14), (20, 28), (7, 28)], 'shirt')       # torso
        g.rect(7, 27, 20, 28, 'dark')                                  # belt
        g.ell(4.5, 19, 3.5, 5, 'sleeve'); g.ell(23.5, 19, 3.5, 5, 'sleeve')   # sleeves
        g.circ(4.5, 25, 2.5, 'skin'); g.circ(23.5, 25, 2.5, 'skin')          # hands
        g.rect(12, 11, 15, 13, 'skin')                                 # neck
        g.ell(14, 8.5, 5, 4.5, 'skin')                                 # face
        g.ell(14, 5.5, 6, 4.5, 'hair')                                 # hair cap
        g.rect(8, 5, 19, 6, 'hair')
        g.detail(11, 8, 'dark', 1); g.detail(16, 8, 'dark', 1)         # eyes
        g.detail(13, 11, 'skin', 1); g.detail(14, 11, 'skin', 1)       # mouth shadow
    elif view == 'back':
        g.poly([(5, 14), (22, 14), (20, 28), (7, 28)], 'shirt')
        g.rect(7, 27, 20, 28, 'dark')
        g.ell(4.5, 19, 3.5, 5, 'sleeve'); g.ell(23.5, 19, 3.5, 5, 'sleeve')
        g.circ(4.5, 25, 2.5, 'skin'); g.circ(23.5, 25, 2.5, 'skin')
        g.rect(12, 11, 15, 13, 'skin')
        g.ell(14, 7, 6, 6, 'hair')
        for y in range(15, 27): g.detail(13, y, 'shirt', 1)            # spine seam
    else:  # side, facing right
        g.poly([(8, 14), (19, 14), (18, 28), (9, 28)], 'shirt')
        g.rect(9, 27, 18, 28, 'dark')
        g.ell(20, 17.5, 5, 3, 'sleeve'); g.ell(24.5, 17.5, 2.5, 2.5, 'skin')  # arm forward + hand
        g.ell(16, 20, 4, 2.5, 'sleeve'); g.circ(19.5, 20.5, 2, 'skin')        # near arm + hand
        g.rect(12, 11, 15, 13, 'skin')
        g.ell(15.5, 8.5, 4.5, 4.5, 'skin')
        g.ell(13.5, 6, 6, 4.5, 'hair'); g.rect(8, 6, 15, 9, 'hair')
        g.detail(18, 8, 'dark', 1)                                     # eye
    return g
for v in ('front', 'back', 'side'):
    for f in (0, 1): add(f'PLAYER_{v.upper()}_{f}', player(v, f), 1)

def player_down():
    g = G(44, 18)
    g.rect(14, 5, 34, 13, 'shirt'); g.rect(32, 4, 42, 14, 'jeans'); g.rect(41, 5, 43, 13, 'dark')
    g.ell(8, 9, 6, 5.5, 'skin'); g.ell(5, 9, 4, 5.5, 'hair')
    g.ell(20, 3.5, 5, 2.5, 'sleeve'); g.ell(22, 15, 5, 2.5, 'sleeve')
    g.detail(10, 8, 'dark', 1)
    return g
add('PLAYER_DOWN', player_down(), 1)

# ------------------------------------------------------------ clubbers
def grunt(frame):
    g = G(26, 32)
    # legs: dark trousers, a running stride
    if frame == 0:
        g.poly([(8, 20), (13, 20), (9, 30), (4, 30)], 'dark'); g.poly([(14, 20), (19, 20), (23, 30), (18, 30)], 'dark')
    elif frame == 1:
        g.rect(9, 20, 13, 30, 'dark'); g.rect(14, 20, 18, 30, 'dark')
    else:
        g.poly([(8, 20), (13, 20), (14, 30), (9, 30)], 'dark'); g.poly([(14, 20), (19, 20), (17, 30), (12, 30)], 'dark')
    # torso leaning into the run
    g.poly([(6, 9), (19, 9), (21, 22), (7, 22)], 'green')
    # far arm swinging back
    g.ell(5.5, 15, 2.5, 4, 'green'); g.circ(5.5, 19.5, 2, 'skin')
    # near arm forward along the club
    g.ell(17, 13, 4, 2.5, 'green')
    # the club, held level in front, gold with a dark grip
    y = 13 if frame != 1 else 12
    g.rect(13, y, 25, y + 2, 'gold'); g.rect(13, y, 15, y + 2, 'dark')
    g.circ(20.5, y + 1, 1.5, 'skin')                                  # hand on the club
    # bald head, bowed forward
    g.ell(13.5, 5.5, 4.5, 5, 'skin')
    g.detail(12, 6, 'dark', 1); g.detail(15, 6, 'dark', 1)
    g.detail(13, 8, 'skin', 0); g.detail(14, 8, 'skin', 0)
    return g
for f in range(3): add(f'GRUNT_{f}', grunt(f), 1, order=['green', 'skin', 'dark', 'gold'])

# ------------------------------------------------------------ orbs
def orb(state, frame):
    g = G(24, 26)
    g.ell(12, 21, 9, 3.5, 'red')                                       # saucer base
    g.ell(12, 20, 6, 2, 'steel')
    g.circ(12, 11, 9.5, 'orb')
    if state == 'armed':
        for x in range(4, 21): g.detail(x, 12, 'red', 3 if (x + frame) % 3 else 4)
    if state == 'charging':
        for x in range(3, 22):
            g.detail(x, 11, 'white', 2); g.detail(x, 12, 'white', 2); g.detail(x, 13, 'red', 4)
    a = -2.15 + frame * 0.25
    return g, (math.cos(a), math.sin(a))
for st in ('quiet', 'armed', 'charging'):
    for f in range(4):
        g, light = orb(st, f)
        add(f'ORB_{st}_{f}', g, 1, light=light)

# ------------------------------------------------------------ mines (jacks)
def mine():
    g = G(22, 22)
    for (x0, y0, x1, y1) in [(3, 3, 11, 11), (19, 3, 11, 11), (3, 19, 11, 11), (19, 19, 11, 11)]:
        g.line(x0, y0, x1, y1, 1.6, 'steel')
    g.circ(11, 11, 3.5, 'dark')
    for (x, y) in [(3, 3), (18, 3), (3, 18), (18, 18)]:
        g.detail(x, y, 'red', 3); g.detail(x + 1, y, 'red', 2); g.detail(x, y + 1, 'red', 2)
    return g
add('MINE', mine(), 1)

# ------------------------------------------------------------ Mr Shrapnel
def shrapnel(frame):
    g = G(24, 32)
    if frame == 0:
        g.poly([(7, 22), (11, 22), (8, 31), (4, 31)], 'dark'); g.poly([(13, 22), (17, 22), (20, 31), (16, 31)], 'dark')
    else:
        g.rect(8, 22, 11, 31, 'dark'); g.rect(13, 22, 16, 31, 'dark')
    g.rect(5, 10, 18, 22, 'steel')                                     # chest plate
    g.ell(3.5, 15, 2.5, 5, 'steel'); g.ell(20.5, 15, 2.5, 5, 'steel')  # arms
    g.circ(12, 15.5, 3.5, 'red')                                       # the core
    g.rect(10, 8, 13, 9, 'steel')
    g.ell(12, 5, 4.5, 4, 'steel')                                      # head
    g.detail(10, 5, 'yellow', 3); g.detail(13, 5, 'yellow', 3)
    g.detail(12, 15, 'red', 4)
    return g
for f in range(2): add(f'SHRAPNEL_{f}', shrapnel(f), 1)

# ------------------------------------------------------------ tank
def tank():
    g = G(36, 26)
    g.rect(2, 1, 33, 5, 'dark'); g.rect(2, 20, 33, 24, 'dark')         # treads
    g.ell(18, 13, 15, 7.5, 'steel')                                    # hull
    g.rect(4, 11, 31, 15, 'steel')
    g.ell(18, 11.5, 4.5, 4, 'red')                                     # pilot's saddle / suit
    g.circ(18, 8.5, 2.5, 'skin')                                       # pilot's head
    for x in range(3, 33, 3):
        g.detail(x, 2, 'dark', 3); g.detail(x, 22, 'dark', 3)          # tread links
    g.detail(17, 8, 'dark', 1); g.detail(19, 8, 'dark', 1)
    return g
add('TANK', tank(), 1)

# ------------------------------------------------------------ snake
def snake_head():
    g = G(26, 20)
    g.ell(11, 10, 10, 8, 'cyan'); g.ell(19, 10, 6, 5, 'cyan')
    g.detail(14, 6, 'white', 2); g.detail(14, 13, 'white', 2); g.detail(15, 6, 'dark', 0); g.detail(15, 13, 'dark', 0)
    g.rect(24, 9, 25, 10, 'red')
    return g
def snake_seg():
    g = G(16, 14); g.ell(8, 7, 7.5, 6.5, 'cyan'); g.detail(8, 7, 'cyan', 4); return g
add('SNAKE_HEAD', snake_head(), 1); add('SNAKE_SEGMENT', snake_seg(), 1)

# ------------------------------------------------------------ Mutoid Man (54 x 69 at scale 2)
def mutoid(hurt=False):
    g = G(54, 69); k = 1.5
    def R(x0, y0, x1, y1, m): g.rect(x0 * k, y0 * k, x1 * k + k - 1, y1 * k + k - 1, m)
    def E(cx, cy, rx, ry, m): g.ell(cx * k, cy * k, rx * k, ry * k, m)
    def P(pts, m): g.poly([(x * k, y * k) for x, y in pts], m)
    # tank base
    R(6, 33, 29, 42, 'steel'); R(8, 34, 27, 40, 'steel')
    R(13, 35, 22, 39, 'dark'); R(15, 36, 20, 38, 'yellow')
    R(4, 39, 31, 45, 'dark')
    R(1, 35, 7, 38, 'steel'); R(28, 35, 34, 38, 'steel')
    R(0, 36, 2, 37, 'dark'); R(33, 36, 35, 37, 'dark')
    # arms and fists
    E(6.5, 17, 6.5, 6.5, 'green'); E(29.5, 17, 6.5, 6.5, 'green')
    R(2, 17, 9, 25, 'green'); R(26, 17, 33, 25, 'green')
    E(5, 28.5, 5, 4.5, 'skin'); E(31, 28.5, 5, 4.5, 'skin')
    # torso into the hull
    P([(7, 12), (29, 12), (27, 34), (9, 34)], 'green')
    # steel yoke, chest plate, red emblem
    P([(5, 11), (31, 11), (29, 15), (7, 15)], 'steel')
    R(13, 15, 22, 22, 'steel')
    P([(14, 16), (22, 16), (18, 22)], 'red')
    # head
    E(18, 6.5, 6, 6.5, 'skin'); R(14, 9, 21, 12, 'skin')
    # details after shading
    for x in range(21, 33): g.detail(x, 8, 'skin', 1)                  # brow
    g.detail(23, 10, 'dark', 0); g.detail(24, 10, 'dark', 0); g.detail(29, 10, 'dark', 0); g.detail(30, 10, 'dark', 0)
    for x in range(23, 31): g.detail(x, 16, 'dark', 0)                 # mouth line
    for x in range(23, 31): g.detail(x, 17, 'white', 2 if x % 2 else 1)  # teeth
    for x in range(20, 44, 4):
        for y in range(60, 68, 2): g.detail(x, y, 'dark', 3)           # tread links
    for x in (4, 7, 10): g.detail(x, 41, 'skin', 0)
    for x in (43, 46, 49): g.detail(x, 41, 'skin', 0)
    if hurt:
        R(10, 24, 12, 30, 'steel'); R(24, 22, 26, 27, 'steel')
        g.detail(16, 40, 'red', 3); g.detail(37, 36, 'red', 3)
        for (x, y) in [(18, 30), (34, 28), (22, 44), (36, 46), (14, 38), (40, 40)]:
            g.detail(x, y, 'dark', 1); g.detail(x + 1, y, 'dark', 2)
    return g
add('MUTOID', mutoid(), 2); add('MUTOID_HURT', mutoid(True), 2)

# ------------------------------------------------------------ Scarface (50 x 50 at scale 2)
def scarface(mode):
    g = G(50, 50); c = 25
    g.circ(c, c, 24.5, 'steel')
    g.circ(c, c, 18.5, 'olive')
    # rivets and plate seams on the ring
    for i in range(20):
        a = i * math.pi * 2 / 20
        x, y = int(c + math.cos(a) * 21.5), int(c + math.sin(a) * 21.5)
        g.detail(x, y, 'red' if i % 2 else 'dark', 3 if i % 2 else 1)
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        for rr in (19, 20, 21, 22, 23, 24): g.detail(int(c + math.cos(a) * rr), int(c + math.sin(a) * rr), 'steel', 0)
    # brow, eyes
    for x in range(13, 22): g.detail(x, 16, 'olive', 0)
    for x in range(28, 37): g.detail(x, 16, 'olive', 0)
    for x in range(14, 21):
        for y in (19, 20): g.detail(x, y, 'white', 2)
    for x in range(29, 36):
        for y in (19, 20): g.detail(x, y, 'white', 2)
    pupil = ('red', 3) if mode == 'rage' else ('dark', 0)
    for (x, y) in [(16, 19), (17, 19), (16, 20), (17, 20), (32, 19), (33, 19), (32, 20), (33, 20)]: g.detail(x, y, *pupil)
    # nose
    for y in range(22, 28): g.detail(24, y, 'olive', 1); g.detail(25, y, 'olive', 0)
    # scar down the left cheek
    for (x, y) in [(11, 12), (12, 14), (12, 16), (13, 18), (13, 21), (14, 24), (14, 27), (15, 29)]:
        g.detail(x, y, 'red', 1); g.detail(x + 1, y, 'red', 2)
    # mouth
    if mode == 'rage':
        for x in range(16, 34):
            for y in range(31, 38): g.detail(x, y, 'dark', 0)
        for x in range(17, 33, 2): g.detail(x, 31, 'white', 2); g.detail(x, 32, 'white', 1); g.detail(x + 1, 37, 'white', 2); g.detail(x + 1, 36, 'white', 1)
    else:
        for x in range(16, 34): g.detail(x, 33, 'dark', 0); g.detail(x, 34, 'dark', 0)
        for x in range(17, 33, 3): g.detail(x, 33, 'white', 2); g.detail(x, 34, 'white', 1)
    if mode == 'hurt':
        for y in range(0, 11):
            for x in range(10, 40): g.put(x, y, None)
        g.ell(25, 10, 11, 6, 'brain')
    return g
for m in ('calm', 'rage', 'hurt'): add(f'SCARFACE_{m.upper()}', scarface(m), 2)

# ------------------------------------------------------------ Cobra Death (scale 2)
def cobra_seg():
    g = G(24, 24); g.circ(12, 12, 11.5, 'cgreen')
    for (x, y) in [(6, 7), (15, 5), (8, 16), (17, 14), (12, 10), (18, 19)]:
        g.ell(x, y, 1.6, 1.6, 'purple')
    return g
def cobra_head():
    g = G(30, 27)
    lumps = [(11, 13.5, 9.5), (18, 9, 6.5), (19.5, 18, 7), (23, 13.5, 6), (7, 7.5, 5), (7, 19.5, 5), (15, 4.5, 4), (15, 22.5, 4)]
    for i, (cx, cy, r) in enumerate(lumps): g.circ(cx, cy, r, 'red' if i % 2 else 'red2')
    g.ell(25.5, 13.5, 3.5, 4, 'maw')
    g.detail(24, 11, 'white', 2); g.detail(24, 16, 'white', 2)
    for (x, y) in [(16, 10), (16, 17)]:
        g.detail(x, y, 'yellow', 3); g.detail(x + 1, y, 'yellow', 3); g.detail(x + 1, y + 1, 'dark', 0); g.detail(x, y + 1, 'yellow', 2)
    return g
add('COBRA_SEGMENT', cobra_seg(), 2); add('COBRA_HEAD', cobra_head(), 2)

# ------------------------------------------------------------ prizes and gear (hand rows, framed plaques)
ITEM_PALETTE = {"k": "#0b0b12", "g": "#2fa84a", "G": "#1b6b2e", "w": "#ffffff", "m": "#9a9aa4", "M": "#5a5a66", "d": "#1a1a22", "y": "#f0c040", "Y": "#b8860b", "r": "#d9342b", "R": "#9c1f18", "b": "#2a4fc9", "B": "#1a3390", "c": "#22d3ee", "o": "#e8742a", "s": "#f1b98a", "p": "#f472b6", "e": "#38bdf8"}
ITEMS = {
    "cash": ["..........", ".kkkkkkkk.", "kggggggggk", "kgGwwwwGgk", "kgGwwwwGgk", "kggggggggk", "kGGGGGGGGk", ".kkkkkkkk.", "..........", ".........."],
    "toaster": ["..........", ".kkkkkkkk.", "kmmkkkkmmk", "kmmmmmmmmk", "kmMmmmmMmk", "kmmmmmmmmk", "kMMMMMMMMk", ".kkkkkkkk.", "..k....k..", ".........."],
    "vcr": ["..........", "..........", "kkkkkkkkkk", "kddddddddk", "kdMMMMMddk", "kdkkkkkrdk", "kddddddddk", "kkkkkkkkkk", "..........", ".........."],
    "car": ["..........", "...kkkk...", "..krrrrk..", ".kkrccrkk.", "krrrrrrrrk", "krrrrrrrrk", ".kkrccrkk.", "..krrrrk..", "...kkkk...", ".........."],
    "key": ["kkkkkkkkkk", "kbbbbbbbbk", "kbbkkkbbbk", "kbkyyykbbk", "kbkykykbbk", "kbkyyykbbk", "kbbkykbbbk", "kbbkyykbbk", "kbbbkkbbbk", "kkkkkkkkkk"],
    "spread": ["kkkkkkkkkk", "kggggggggk", "kgwggwggwk", "kgkwgwgwgk", "kggkwwwggk", "kgggkwkggk", "kgggkwkggk", "kgggkwkggk", "kggggggggk", "kkkkkkkkkk"],
    "grenade": ["kkkkkkkkkk", "kbbbbbbbbk", "kbbbbkkbbk", "kbbbkddkbk", "kbbkddddkk", "kbbkdwddkk", "kbbkddddkk", "kbbbkddkbk", "kbbbbkkbbk", "kkkkkkkkkk"],
    "rocket": ["kkkkkkkkkk", "kooooooook", "koookwkook", "kookwwwkok", "kookwwwkok", "kookwrwkok", "kookwwwkok", "kokwwkwwkk", "kooooooook", "kkkkkkkkkk"],
    "shield": ["kkkkkkkkkk", "kmmmmmmmmk", "kmkkkkkkmk", "kmkccccckk", "kmkcwcccmk", "kmkccccmmk", "kmmkcccmmk", "kmmmkckmmk", "kmmmmkmmmk", "kkkkkkkkkk"],
    "boots": ["kkkkkkkkkk", "kyyyyyyyyk", "kyyykkkyyk", "kyyykddkyk", "kyyykddkyk", "kyykkddkyk", "kykddddkyk", "kykddddkyk", "kyykkkkkyk", "kkkkkkkkkk"],
    "bomb": ["kkkkkkkkkk", "krrrrrkyrk", "krrrrkyrrk", "krrkkkkrrk", "krkddddkrk", "krkdwdddkk", "krkddddkrk", "krkddddkrk", "krrkkkkrrk", "kkkkkkkkkk"],
    "life": ["kkkkkkkkkk", "kppppppppk", "kpkkpkkppk", "kkwwkwwkpk", "kkwwwwwkpk", "kpkwwwkppk", "kppkwkpppk", "kpppkppppk", "kppppppppk", "kkkkkkkkkk"]
}
SKULL = ["..kkkkk..", ".kwwwwwk.", "kwwwwwwwk", "kwkwwwkwk", "kwkkwkkwk", ".kwwwwwk.", ".kkwkwkk.", "..kwkwk..", "...kkk..."]

# ------------------------------------------------------------ gallery + emit
POOL = string.ascii_lowercase + string.ascii_uppercase + string.digits
def encode(entry):
    cells = entry['cells']
    order = list(entry['order'] or [])
    for row in cells:
        for c in row:
            if c and c[0] not in order: order.append(c[0])
    letters = {}
    palette = {}
    for i, mat in enumerate(order):
        for t in range(5):
            L = POOL[i * 5 + t]; letters[(mat, t)] = L; palette[L] = MATS[mat][t]
    rows = [''.join('.' if c is None else letters[c] for c in row) for row in cells]
    used = {ch for r in rows for ch in r if ch != '.'}
    palette = {k: v for k, v in palette.items() if k in used}
    return dict(rows=rows, palette=palette, scale=entry['scale'], order=order)
def render(enc, zoom):
    rows, pal, scale = enc['rows'], enc['palette'], enc['scale']
    w, h = len(rows[0]), len(rows)
    im = Image.new('RGBA', (w * scale * zoom, h * scale * zoom), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == '.': continue
            d.rectangle((x * scale * zoom, y * scale * zoom, (x + 1) * scale * zoom - 1, (y + 1) * scale * zoom - 1), fill=pal[c])
    return im
HEADER = """/**
 * PRIME TIME's pixel art: every figure on the floor as an authored bitmap
 * after Smash TV's own digitised sprites (Williams, 1990), rendered once
 * into an offscreen canvas per sprite (`sprite()`) and blitted with
 * smoothing off so every block stays a block at any device-pixel ratio.
 *
 * THIS FILE IS GENERATED by `scripts/primetime-sprite-rig.py`; edit the rig
 * and re-run it rather than the rows. The rig draws each figure from shapes
 * on a grid of materials and lights it the way the arcade's sprites read:
 * five tones per material from deep to highlight, chosen per pixel from how
 * far it sits inside its shape and how squarely it faces a top-left light,
 * a checker dither between tone bands, and no black outline anywhere. The
 * contestant is the blue-haired, red-shirted first player with pale sleeves
 * and jeans, two stride frames per facing; the clubbers hunch into their
 * run with a gold club held level; the orbs are lilac spheres on a red
 * saucer; the mines grey jacks with red tips; Mutoid Man a bald flesh head
 * on a steel yoke over green bulk and fists, bolted to a grey tank; Scarface
 * an olive face in a riveted steel sphere whose crown blows off to show the
 * brain; Cobra Death a lumpy red head over green segments with purple
 * spots. The prizes and the gear are hand rows: framed plaques as the
 * arcade drew every pick-up that was not loot.
 *
 * `validateSprite` checks every row's width and every letter's colour;
 * `sprite()` runs it before drawing and `tests/games/primetime.test.ts`
 * runs it over `ALL_SPRITES` without a DOM, so a slipped pixel fails a test
 * rather than drawing a sheared figure. `.` is transparent.
 */

import type { ItemId } from './items';

export interface SpriteDef {
  rows: string[];
  palette: Record<string, string>;
  /** Logical pixels per bitmap pixel. */
  scale: number;
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

/** Throws on a row of the wrong width or a letter with no colour. */
export function validateSprite(name: string, def: SpriteDef): void {
  const w = def.rows[0].length;
  for (const row of def.rows) {
    if (row.length !== w) throw new Error(`sprite ${name}: row "${row}" is ${row.length} wide, not ${w}`);
    for (const c of row) {
      if (c !== '.' && !def.palette[c]) throw new Error(`sprite ${name}: no colour for "${c}"`);
    }
  }
}

const cache = new Map<string, Sprite>();

/** The rendered sprite, built on first use and kept; null until a canvas context exists. */
export function sprite(name: string, def: SpriteDef): Sprite | null {
  const hit = cache.get(name);
  if (hit) return hit;
  validateSprite(name, def);
  const w = def.rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w * def.scale;
  canvas.height = def.rows.length * def.scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  def.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '.') continue;
      ctx.fillStyle = def.palette[c];
      ctx.fillRect(x * def.scale, y * def.scale, def.scale, def.scale);
    }
  });
  const built = { canvas, w: canvas.width, h: canvas.height };
  cache.set(name, built);
  return built;
}

/** The same bitmap in solid white, for the flash on an enemy that has just been hit. */
export function flashDef(def: SpriteDef): SpriteDef {
  return { ...def, palette: Object.fromEntries(Object.keys(def.palette).map(k => [k, '#ffffff'])) };
}

/** Blits a sprite centred on (x, y), optionally mirrored, with no smoothing. */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite | null, x: number, y: number, flipX = false, angle = 0): void {
  if (!s) return;
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (angle) ctx.rotate(angle);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2);
  ctx.restore();
  ctx.imageSmoothingEnabled = smoothing;
}

/** Five tones of a material, deep to highlight, as the rig lights them. */
export type Tones = [string, string, string, string, string];
"""

def ts_def(enc, indent='  '):
    rows = ',\n'.join(f"{indent}  '{r}'" for r in enc['rows'])
    pal = ', '.join(f"{k}: '{v}'" for k, v in enc['palette'].items())
    return f"{{\n{indent}scale: {enc['scale']},\n{indent}palette: {{ {pal} }},\n{indent}rows: [\n{rows}\n{indent}]\n{indent[:-2]}}}"

def emit_ts(enc, path):
    out = [HEADER]
    w = out.append
    w("/** The contestant: two stride frames for each facing, chosen by his aim and his walk. */")
    w("export const PLAYER: Record<'front' | 'back' | 'side', SpriteDef[]> = {")
    for v in ('front', 'back', 'side'):
        w(f"  {v}: [" + ", ".join(ts_def(enc[f'PLAYER_{v.upper()}_{f}'], '    ') for f in (0, 1)) + "],")
    w("};")
    w("/** The fallen contestant for the death. */")
    w("export const PLAYER_DOWN: SpriteDef = " + ts_def(enc['PLAYER_DOWN']) + ";")
    w("""
/**
 * The clubbers' three stride frames. Letters a to e are the suit's five
 * tones and f to j the skin's, so a studio's kit recolours the figure by
 * swapping those two blocks: the first studio's is the arcade's green grunt
 * with a flesh head, the second's orange with a blue-skinned head, the
 * third's purple with a yellow one.
 */
export const GRUNT_KITS: { suit: Tones; skin: Tones }[] = [
  { suit: ['#0f4a1a', '#1e7a2c', '#2fb044', '#5fd86a', '#a8f0a8'], skin: ['#8a3a1a', '#c0683a', '#e8955e', '#f6b98a', '#ffd9bd'] },
  { suit: ['#6a2a08', '#a8481a', '#e8742a', '#ffa050', '#ffd0a0'], skin: ['#1a2a6a', '#3a5acc', '#8fb0ff', '#b8ccff', '#e0ecff'] },
  { suit: ['#2a1050', '#5a2a99', '#8a4bd6', '#b080f0', '#d8c0ff'], skin: ['#6a5010', '#b89a20', '#f0d040', '#f8e080', '#fff8c0'] }
];""")
    w("const GRUNT_FRAMES: SpriteDef[] = [" + ", ".join(ts_def(enc[f'GRUNT_{f}'], '  ') for f in range(3)) + "];")
    w("""/** The clubber's frame in a studio's kit. */
export function gruntSprite(kit: number, frame: number): SpriteDef {
  const k = GRUNT_KITS[kit % GRUNT_KITS.length];
  const base = GRUNT_FRAMES[frame];
  const palette = { ...base.palette };
  'abcde'.split('').forEach((c, i) => (palette[c] = k.suit[i]));
  'fghij'.split('').forEach((c, i) => (palette[c] = k.skin[i]));
  return { ...base, palette };
}
export const GRUNT: SpriteDef[] = GRUNT_FRAMES.map((_, f) => gruntSprite(0, f));

/**
 * An orb: the lilac sphere on its red saucer. A quiet orb is plain; one
 * that shoots wears a red band, which goes white for the charge before a
 * shot. The highlight walks round the top over four frames.
 */
export const ORB_FRAMES = 4;""")
    w("const ORB_SPRITES: Record<'quiet' | 'armed' | 'charging', SpriteDef[]> = {")
    for st in ('quiet', 'armed', 'charging'):
        w(f"  {st}: [" + ", ".join(ts_def(enc[f'ORB_{st}_{f}'], '    ') for f in range(4)) + "],")
    w("};")
    w("export const orbSprite = (state: 'quiet' | 'armed' | 'charging', frame: number): SpriteDef => ORB_SPRITES[state][frame % ORB_FRAMES];")
    w("/** A mine: Smash TV's grey four-pronged jack with a red lamp on each tip; the renderer blinks them. */")
    w("export const MINE: SpriteDef = " + ts_def(enc['MINE']) + ";")
    w("/** Mr Shrapnel: a walking steel robot with a red core that bursts into shards, two frames. */")
    w("export const SHRAPNEL: SpriteDef[] = [" + ", ".join(ts_def(enc[f'SHRAPNEL_{f}'], '  ') for f in range(2)) + "];")
    w("/** A tank: the arcade's grey hover-tank with its pilot in the saddle; the turret is the renderer's. */")
    w("export const TANK: SpriteDef = " + ts_def(enc['TANK']) + ";")
    w("/** A snake's head, facing right to be turned along its heading, and its body segment. */")
    w("export const SNAKE_HEAD: SpriteDef = " + ts_def(enc['SNAKE_HEAD']) + ";")
    w("export const SNAKE_SEGMENT: SpriteDef = " + ts_def(enc['SNAKE_SEGMENT']) + ";")
    w("/** Mutoid Man, whole, 108 x 138 at scale 2; the hurt variant has his hide torn to the steel beneath. */")
    w("export const MUTOID: SpriteDef = " + ts_def(enc['MUTOID']) + ";")
    w("export const MUTOID_HURT: SpriteDef = " + ts_def(enc['MUTOID_HURT']) + ";")
    w("/** Scarface: his float, the red-eyed open-mouthed wind-up and charge, and his second stage with the brain showing. */")
    w("export const SCARFACE: Record<'calm' | 'rage' | 'hurt', SpriteDef> = {")
    for m in ('calm', 'rage', 'hurt'):
        w(f"  {m}: " + ts_def(enc[f'SCARFACE_{m.upper()}'], '    ') + ",")
    w("};")
    w("/** Cobra Death's head, facing right to be turned along its heading, and a body segment. */")
    w("export const COBRA_HEAD: SpriteDef = " + ts_def(enc['COBRA_HEAD']) + ";")
    w("export const COBRA_SEGMENT: SpriteDef = " + ts_def(enc['COBRA_SEGMENT']) + ";")
    w("""
/**
 * The prizes and the gear, ten pixels square: cash is a banded bundle of
 * notes, the toaster and the VCR are the boxes they are, the car a red
 * roof; everything else is a framed plaque with a glyph, which is how the
 * arcade drew every pick-up that was not loot. Drawn at scale 2 on the
 * floor and at scale 1 on the map and over the doors.
 */""")
    pal = ', '.join(f"{k}: '{v}'" for k, v in ITEM_PALETTE.items())
    w(f"const ITEM_PALETTE = {{ {pal} }};")
    w("export const ITEM_SPRITES: Record<ItemId, SpriteDef> = {")
    for k, rows in ITEMS.items():
        r = ', '.join(f"'{x}'" for x in rows)
        w(f"  {k}: {{ scale: 2, palette: ITEM_PALETTE, rows: [{r}] }},")
    w("};")
    r = ', '.join(f"'{x}'" for x in SKULL)
    w("/** The boss marker on the map and over a door that leads to him. */")
    w(f"export const SKULL: SpriteDef = {{ scale: 2, palette: {{ k: '#0b0b12', w: '#ffffff' }}, rows: [{r}] }};")
    w("""
/** Every bitmap the module ships, for the width-and-palette test. */
export const ALL_SPRITES: Record<string, SpriteDef> = {
  ...Object.fromEntries((['front', 'back', 'side'] as const).flatMap(v => PLAYER[v].map((d, f) => [`PLAYER_${v}_${f}`, d]))),
  PLAYER_DOWN,
  ...Object.fromEntries(GRUNT_KITS.flatMap((_, kit) => [0, 1, 2].map(f => [`GRUNT_${kit}_${f}`, gruntSprite(kit, f)]))),
  ...Object.fromEntries((['quiet', 'armed', 'charging'] as const).flatMap(s => [0, 1, 2, 3].map(f => [`ORB_${s}_${f}`, orbSprite(s, f)]))),
  MINE,
  SHRAPNEL_0: SHRAPNEL[0],
  SHRAPNEL_1: SHRAPNEL[1],
  TANK,
  SNAKE_HEAD,
  SNAKE_SEGMENT,
  MUTOID,
  MUTOID_HURT,
  SCARFACE_CALM: SCARFACE.calm,
  SCARFACE_RAGE: SCARFACE.rage,
  SCARFACE_HURT: SCARFACE.hurt,
  COBRA_HEAD,
  COBRA_SEGMENT,
  ...Object.fromEntries(Object.entries(ITEM_SPRITES).map(([k, v]) => [`ITEM_${k}`, v])),
  SKULL
};
""")
    open(path, 'w').write('\n'.join(out))

if __name__ == '__main__':
    encoded = {n: encode(e) for n, e in SPRITES.items()}
    zoom = 3; x = y = 8; rowh = 0; W = 1600
    sheet = Image.new('RGB', (W, 1800), '#3a3a3e'); d = ImageDraw.Draw(sheet)
    for n, enc in encoded.items():
        im = render(enc, zoom)
        if x + im.width + 8 > W: x = 8; y += rowh + 26; rowh = 0
        sheet.paste(im, (x, y + 14), im); d.text((x, y), n, fill='#ffd000')
        x += max(im.width, 80) + 12; rowh = max(rowh, im.height + 14)
    sheet.crop((0, 0, W, y + rowh + 30)).save(sys.argv[1])
    json.dump(encoded, open(sys.argv[2], 'w'))
    if len(sys.argv) > 3: emit_ts(encoded, sys.argv[3])
    print('sprites', len(encoded))
