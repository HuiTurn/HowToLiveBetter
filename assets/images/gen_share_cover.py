# 生成「适合我的建议」分享封面 assets/images/share-survey.png（800x640，微信分享图 5:4）。
# 依赖 Pillow + macOS 系统中文字体：.autotmp/venv/bin/python assets/images/gen_share_cover.py
# 说明：分享图会被微信按 5:4 展示，这里就按 5:4 出图，避免默认截图或竖图被裁切。
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 800, 640
SS = 2  # 超采样后缩回，边缘更平滑

# 品牌色（取自 styles/variables.wxss）
GREEN = (75, 162, 100)
GREEN_DARK = (61, 139, 82)
GREEN_LIGHT = (233, 244, 236)
BG_TOP = (243, 250, 245)
BG_BOT = (214, 238, 221)
TEXT = (34, 38, 43)
TEXT_SUB = (120, 132, 124)

TINTS = {  # 分类瓦片底色，沿用首页 CATEGORY_TINTS
    'lifestyle': (220, 239, 216),
    'learning': (219, 239, 254),
    'mental': (254, 227, 228),
}

FONT_BOLD = '/System/Library/Fonts/STHeiti Medium.ttc'
FONT_REG = '/System/Library/Fonts/Hiragino Sans GB.ttc'
ICONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')


def font(path, size):
    return ImageFont.truetype(path, size * SS)


def vgrad(w, h, top, bot):
    im = Image.new('RGB', (w, h), top)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    return im


def paste_glyph(base, cid, cx, cy, tile, glyph_frac=0.5):
    """在 (cx,cy) 画一块圆角瓦片并把分类字形居中贴上去。"""
    r = tile // 2
    tint = TINTS[cid]
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([cx - r, cy - r, cx + r, cy + r], radius=int(tile * 0.22), fill=tint + (255,))
    g = Image.open(os.path.join(ICONS_DIR, f'glyph-{cid}.png')).convert('RGBA')
    gs = int(tile * glyph_frac)
    g = g.resize((gs, gs), Image.LANCZOS)
    layer.alpha_composite(g, (cx - gs // 2, cy - gs // 2))
    base.alpha_composite(layer)


def main():
    im = vgrad(W * SS, H * SS, BG_TOP, BG_BOT).convert('RGBA')
    d = ImageDraw.Draw(im)

    # 右上角柔和光晕
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * SS - 260 * SS, -120 * SS, W * SS + 160 * SS, 260 * SS], fill=(255, 255, 255, 90))
    im.alpha_composite(glow)
    d = ImageDraw.Draw(im)

    m = 64 * SS  # 左边距

    # 顶部品牌眉标
    d.text((m, 56 * SS), '人生指南库', font=font(FONT_BOLD, 26), fill=GREEN_DARK)
    d.rounded_rectangle([m, 100 * SS, m + 44 * SS, 106 * SS], radius=3 * SS, fill=GREEN)

    # 主标题（两行）
    d.text((m, 150 * SS), '哪几条建议', font=font(FONT_BOLD, 58), fill=TEXT)
    d.text((m, 230 * SS), '最适合现在的你？', font=font(FONT_BOLD, 58), fill=TEXT)

    # 副标题（不写死总条数——静态图不会随上游同步更新，改用无数字措辞）
    d.text((m, 326 * SS), '6 道题 · 从循证建议库为你挑出最相关的几条', font=font(FONT_REG, 26), fill=TEXT_SUB)

    # CTA 胶囊（面向收到分享的对方，邀请他也来测）
    pill_txt = '点我，测测你的人生建议'
    pf = font(FONT_BOLD, 28)
    tw = d.textlength(pill_txt, font=pf)
    px, py, ph = m, 396 * SS, 76 * SS
    pw = tw + 72 * SS
    d.rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2, fill=GREEN)
    d.text((px + 36 * SS, py + (ph - 28 * SS * 1.25) // 2), pill_txt, font=pf, fill=(255, 255, 255))

    # 右侧一列分类瓦片，紧贴右边缘，避免压到左侧文字
    tile = 96 * SS
    paste_glyph(im, 'lifestyle', (W - 92) * SS, 150 * SS, tile)
    paste_glyph(im, 'learning', (W - 112) * SS, 320 * SS, tile)
    paste_glyph(im, 'mental', (W - 92) * SS, 490 * SS, tile)

    # 底部英文品牌
    d = ImageDraw.Draw(im)
    d.text((m, (H - 56) * SS), 'HowToLiveBetter', font=font(FONT_REG, 20), fill=(150, 160, 152))

    im = im.resize((W, H), Image.LANCZOS).convert('RGB')
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'share-survey.png')
    im.save(out, optimize=True)
    print('Generated:', out, im.size)


if __name__ == '__main__':
    main()
