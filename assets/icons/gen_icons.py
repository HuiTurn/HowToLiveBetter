# 生成小程序全部 PNG 图标（线性/面性风格）。
# 依赖 Pillow：python3 -m venv .venv && .venv/bin/pip install Pillow && .venv/bin/python gen_icons.py
import math
import os

from PIL import Image, ImageDraw

SIZE = 81          # 输出尺寸（微信 tabBar 建议 81x81）
SS = 4             # 超采样倍数，抗锯齿
N = SIZE * SS
ST = 5 * SS        # 默认描边宽度

GRAY = (143, 148, 152, 255)
GREEN = (75, 162, 100, 255)
ORANGE = (250, 135, 0, 255)
BLUE = (43, 140, 224, 255)
PURPLE = (138, 99, 232, 255)
BLACK = (36, 41, 47, 255)
SLATE = (91, 107, 122, 255)
LIGHT = (196, 201, 206, 255)
WHITE = (255, 255, 255, 255)

CATEGORY_COLORS = {
    'lifestyle': (61, 139, 64, 255),
    'learning': (43, 140, 224, 255),
    'work': (224, 106, 31, 255),
    'relationships': (155, 108, 232, 255),
    'mental': (208, 53, 60, 255),
    'finance': (230, 162, 60, 255),
    'time': (31, 95, 214, 255),
    'life': (201, 116, 58, 255),
}


def canvas():
    return Image.new('RGBA', (N, N), (0, 0, 0, 0))


def P(pts):
    return [(x * SS, y * SS) for x, y in pts]


def line(d, pts, color, width=ST, closed=False, caps=True):
    d.line(P(pts), width=width, fill=color, joint='curve')
    if closed:
        p0, p1 = pts[0], pts[-1]
        d.line(P([p1, p0]), width=width, fill=color, joint='curve')
    if caps:
        r = width / 2
        ends = pts if not closed else pts
        for x, y in ends:
            d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=color)


def circle(d, cx, cy, r, color, width=ST):
    d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], outline=color, width=width)


def circle_fill(d, cx, cy, r, color):
    d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=color)


def rrect(d, box, radius, color, width=ST):
    d.rounded_rectangle([c * SS for c in box], radius=radius * SS, outline=color, width=width)


def rrect_fill(d, box, radius, color):
    d.rounded_rectangle([c * SS for c in box], radius=radius * SS, fill=color)


def poly(d, pts, color, width=ST, closed=True, fill=None):
    if fill:
        d.polygon(P(pts), fill=fill)
    else:
        line(d, pts, color, width=width, closed=closed, caps=False)
        if closed:
            r = width / 2
            for x, y in pts:
                d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=color)


def heart_pts(cx, cy, s):
    pts = []
    for t in range(0, 360, 3):
        rad = math.radians(t)
        x = 16 * math.sin(rad) ** 3
        y = -(13 * math.cos(rad) - 5 * math.cos(2 * rad) - 2 * math.cos(3 * rad) - math.cos(4 * rad))
        pts.append((cx + x * s, cy + y * s))
    return pts


def star_pts(cx, cy, r_out, r_in, rot=-90):
    pts = []
    for i in range(10):
        r = r_out if i % 2 == 0 else r_in
        a = math.radians(rot + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def half_ellipse(d, box, color, mode='fill', width=ST):
    """只保留椭圆上半部分。"""
    tmp = Image.new('L', (N, N), 0)
    td = ImageDraw.Draw(tmp)
    b = [c * SS for c in box]
    if mode == 'fill':
        td.ellipse(b, fill=255)
    else:
        td.ellipse(b, outline=255, width=width)
    td.rectangle([0, box[3] * SS - (box[3] - box[1]) * SS // 2, N, N], fill=0)
    out = canvas()
    out.putalpha(tmp)
    fill_im = Image.new('RGBA', (N, N), color)
    fill_im.putalpha(tmp)
    return fill_im


def rotate_paste(base, layer):
    base.alpha_composite(layer)
    return base


# ---------- 图标绘制 ----------

def ic_eye(color):
    im = canvas(); d = ImageDraw.Draw(im)
    d.ellipse([12 * SS, 26 * SS, 68 * SS, 54 * SS], outline=color, width=ST)
    circle_fill(d, 40, 40, 8, color)
    return im


def ic_heart(color, filled=False):
    im = canvas(); d = ImageDraw.Draw(im)
    pts = heart_pts(40, 42, 1.62)
    if filled:
        d.polygon(P(pts), fill=color)
    else:
        poly(d, pts, color, closed=True)
    return im


def ic_star(color, filled=False):
    im = canvas(); d = ImageDraw.Draw(im)
    pts = star_pts(40, 41, 29, 12)
    if filled:
        d.polygon(P(pts), fill=color)
    else:
        poly(d, pts, color, closed=True)
    return im


def ic_share(color):
    im = canvas(); d = ImageDraw.Draw(im)
    tmp = Image.new('L', (N, N), 0)
    td = ImageDraw.Draw(tmp)
    td.rounded_rectangle([14 * SS, 32 * SS, 66 * SS, 68 * SS], radius=10 * SS, outline=255, width=ST)
    td.rectangle([30 * SS, 26 * SS, 50 * SS, 40 * SS], fill=0)
    im.putalpha(tmp)
    layer = Image.new('RGBA', (N, N), color)
    layer.putalpha(tmp)
    im = layer
    d = ImageDraw.Draw(im)
    line(d, [(40, 46), (40, 14)], color, caps=True)
    line(d, [(28, 26), (40, 14), (52, 26)], color, caps=False)
    r = ST / 2
    for x, y in [(28, 26), (52, 26)]:
        d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=color)
    return im


def ic_refresh(color):
    im = canvas(); d = ImageDraw.Draw(im)
    d.arc([16 * SS, 16 * SS, 64 * SS, 64 * SS], start=-40, end=250, fill=color, width=ST)
    a = math.radians(-40)
    x, y = 40 + 24 * math.cos(a), 40 + 24 * math.sin(a)
    poly(d, [(x - 7, y - 4), (x + 6, y - 6), (x + 1, y + 8)], color, fill=color)
    return im


def ic_search(color):
    im = canvas(); d = ImageDraw.Draw(im)
    circle(d, 34, 34, 17, color)
    line(d, [(47, 47), (63, 63)], color)
    return im


def ic_clear(color):
    im = canvas(); d = ImageDraw.Draw(im)
    circle_fill(d, 40, 40, 25, color)
    line(d, [(31, 31), (49, 49)], WHITE, width=int(4.5 * SS))
    line(d, [(49, 31), (31, 49)], WHITE, width=int(4.5 * SS))
    return im


def ic_pencil(color):
    tmp = canvas(); d = ImageDraw.Draw(tmp)
    rrect(d, (30, 10, 50, 50), 6, color)
    poly(d, [(30, 50), (50, 50), (40, 66)], color, closed=True)
    tmp = tmp.rotate(45, resample=Image.BICUBIC, expand=False, center=(N / 2, N / 2))
    return tmp


def ic_chevron(color):
    im = canvas(); d = ImageDraw.Draw(im)
    line(d, [(32, 22), (50, 40), (32, 58)], color)
    return im


def ic_clock(color, filled=False):
    im = canvas(); d = ImageDraw.Draw(im)
    if filled:
        circle_fill(d, 40, 40, 26, color)
        line(d, [(40, 40), (40, 25)], WHITE, width=int(4.5 * SS))
        line(d, [(40, 40), (51, 40)], WHITE, width=int(4.5 * SS))
    else:
        circle(d, 40, 40, 26, color)
        line(d, [(40, 40), (40, 25)], color, width=int(4.5 * SS))
        line(d, [(40, 40), (51, 40)], color, width=int(4.5 * SS))
    return im


def ic_book(color, filled=False):
    im = canvas(); d = ImageDraw.Draw(im)
    left = [(40, 24), (14, 30), (14, 58), (40, 52)]
    right = [(40, 24), (66, 30), (66, 58), (40, 52)]
    for pts in (left, right):
        if filled:
            d.polygon(P(pts), fill=color)
        else:
            poly(d, pts, color, closed=True)
    if filled:
        line(d, [(40, 24), (40, 52)], (255, 255, 255, 255), width=int(3 * SS), caps=False)
    return im


def ic_info(color):
    im = canvas(); d = ImageDraw.Draw(im)
    circle(d, 40, 40, 26, color)
    circle_fill(d, 40, 26, 3.5, color)
    line(d, [(40, 36), (40, 54)], color, width=int(4.5 * SS))
    return im


def ic_chat(color):
    im = canvas(); d = ImageDraw.Draw(im)
    rrect(d, (14, 14, 66, 52), 10, color)
    line(d, [(28, 52), (24, 64)], color, caps=False)
    line(d, [(24, 64), (40, 52)], color, caps=False)
    r = ST / 2
    d.ellipse([24 * SS - r, 64 * SS - r, 24 * SS + r, 64 * SS + r], fill=color)
    line(d, [(26, 28), (54, 28)], color, width=int(4 * SS))
    line(d, [(26, 38), (46, 38)], color, width=int(4 * SS))
    return im


def ic_download(color):
    im = canvas(); d = ImageDraw.Draw(im)
    r = ST / 2
    # 托盘
    line(d, [(16, 52), (16, 64), (64, 64), (64, 52)], color, caps=False)
    for x, y in [(16, 52), (64, 52)]:
        d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=color)
    # 箭头杆
    line(d, [(40, 14), (40, 46)], color, caps=True)
    # 箭头头
    line(d, [(28, 36), (40, 48), (52, 36)], color, caps=False)
    for x, y in [(28, 36), (52, 36)]:
        d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=color)
    return im


def ic_github(color):
    im = canvas(); d = ImageDraw.Draw(im)
    circle_fill(d, 40, 42, 25, color)
    poly(d, [(22, 26), (28, 12), (36, 24)], color, fill=color)
    poly(d, [(58, 26), (52, 12), (44, 24)], color, fill=color)
    poly(d, [(16, 62), (26, 52), (32, 60), (24, 68)], color, fill=color)
    return im


def ic_home(color, filled=False):
    im = canvas(); d = ImageDraw.Draw(im)
    if filled:
        poly(d, [(40, 12), (70, 40), (61, 40), (61, 68), (19, 68), (19, 40), (10, 40)], color, fill=color)
    else:
        line(d, [(12, 38), (40, 14), (68, 38)], color)
        rrect(d, (20, 34, 60, 66), 6, color)
    return im


def ic_grid(color, filled=False):
    im = canvas(); d = ImageDraw.Draw(im)
    boxes = [(12, 12, 36, 36), (45, 12, 69, 36), (12, 45, 36, 69), (45, 45, 69, 69)]
    for b in boxes:
        if filled:
            rrect_fill(d, b, 5, color)
        else:
            rrect(d, b, 5, color)
    return im


def ic_person(color, filled=False):
    im = canvas()
    if filled:
        d = ImageDraw.Draw(im)
        circle_fill(d, 40, 26, 12, color)
        im = rotate_paste(im, half_ellipse(None, (16, 42, 64, 78), color, mode='fill'))
    else:
        d = ImageDraw.Draw(im)
        circle(d, 40, 26, 12, color)
        im = rotate_paste(im, half_ellipse(None, (16, 42, 64, 78), color, mode='outline'))
    return im


def ic_leaf(color):
    tmp = canvas(); d = ImageDraw.Draw(tmp)
    d.ellipse([14 * SS, 27 * SS, 66 * SS, 53 * SS], fill=color)
    tmp = tmp.rotate(-35, resample=Image.BICUBIC, expand=False, center=(N / 2, N / 2))
    d = ImageDraw.Draw(tmp)
    line(d, [(40, 56), (52, 66)], color, width=int(4.5 * SS))
    return tmp


def ic_briefcase(color):
    im = canvas(); d = ImageDraw.Draw(im)
    rrect_fill(d, (14, 30, 66, 62), 8, color)
    d.rounded_rectangle([30 * SS, 18 * SS, 50 * SS, 34 * SS], radius=6 * SS, outline=color, width=ST)
    return im


def ic_people(color):
    im = canvas(); d = ImageDraw.Draw(im)
    circle_fill(d, 30, 26, 9, color)
    im = rotate_paste(im, half_ellipse(None, (14, 38, 46, 62), color, mode='fill'))
    d = ImageDraw.Draw(im)
    circle_fill(d, 53, 26, 9, color)
    im = rotate_paste(im, half_ellipse(None, (37, 38, 69, 62), color, mode='fill'))
    return im


def ic_coin(color):
    im = canvas(); d = ImageDraw.Draw(im)
    for y in (20, 34, 48):
        d.ellipse([22 * SS, y * SS, 58 * SS, (y + 12) * SS], fill=color)
    return im


def ic_coffee(color):
    im = canvas(); d = ImageDraw.Draw(im)
    rrect_fill(d, (18, 28, 52, 56), 6, color)
    d.arc([48 * SS, 34 * SS, 66 * SS, 50 * SS], start=-70, end=70, fill=color, width=ST)
    line(d, [(16, 64), (54, 64)], color, width=int(4.5 * SS))
    return im


ICONS = [
    ('eye.png', lambda c: ic_eye(c), GRAY),
    ('heart.png', lambda c: ic_heart(c), GRAY),
    ('star.png', lambda c: ic_star(c), GRAY),
    ('star-orange.png', lambda c: ic_star(c, filled=True), ORANGE),
    ('share-white.png', lambda c: ic_share(c), WHITE),
    ('refresh-white.png', lambda c: ic_refresh(c), WHITE),
    ('search.png', lambda c: ic_search(c), GRAY),
    ('clear.png', lambda c: ic_clear(c), LIGHT),
    ('pencil.png', lambda c: ic_pencil(c), GRAY),
    ('chevron.png', lambda c: ic_chevron(c), LIGHT),
    ('menu-star.png', lambda c: ic_star(c), ORANGE),
    ('menu-clock.png', lambda c: ic_clock(c), BLUE),
    ('menu-book.png', lambda c: ic_book(c), BLUE),
    ('menu-info.png', lambda c: ic_info(c), PURPLE),
    ('menu-github.png', lambda c: ic_github(c), BLACK),
    ('menu-download.png', lambda c: ic_download(c), GREEN),
    ('menu-chat.png', lambda c: ic_chat(c), SLATE),
    ('home.png', lambda c: ic_home(c), GRAY),
    ('home-active.png', lambda c: ic_home(c, filled=True), GREEN),
    ('category.png', lambda c: ic_grid(c), GRAY),
    ('category-active.png', lambda c: ic_grid(c, filled=True), GREEN),
    ('favorite.png', lambda c: ic_star(c), GRAY),
    ('favorite-active.png', lambda c: ic_star(c, filled=True), GREEN),
    ('mine.png', lambda c: ic_person(c), GRAY),
    ('mine-active.png', lambda c: ic_person(c, filled=True), GREEN),
    ('glyph-lifestyle.png', lambda c: ic_leaf(c), CATEGORY_COLORS['lifestyle']),
    ('glyph-learning.png', lambda c: ic_book(c, filled=True), CATEGORY_COLORS['learning']),
    ('glyph-work.png', lambda c: ic_briefcase(c), CATEGORY_COLORS['work']),
    ('glyph-relationships.png', lambda c: ic_people(c), CATEGORY_COLORS['relationships']),
    ('glyph-mental.png', lambda c: ic_heart(c, filled=True), CATEGORY_COLORS['mental']),
    ('glyph-finance.png', lambda c: ic_coin(c), CATEGORY_COLORS['finance']),
    ('glyph-time.png', lambda c: ic_clock(c, filled=True), CATEGORY_COLORS['time']),
    ('glyph-life.png', lambda c: ic_coffee(c), CATEGORY_COLORS['life']),
]


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    for name, drawer, color in ICONS:
        im = drawer(color)
        im = im.resize((SIZE, SIZE), Image.LANCZOS)
        path = os.path.join(out_dir, name)
        im.save(path)
        print('Generated:', name)


if __name__ == '__main__':
    main()
