#!/usr/bin/env python3
"""Draw an ESC/POS byte stream as the paper it would produce.

    python3 scripts/render_escpos.py in.escpos out.png

Driven by scripts/previewReceipt.ts, but it will render any 58mm ESC/POS
capture — it knows nothing about this app.

Fidelity notes
--------------
Dot-exact: the raster bitmaps (GS v 0), every paper feed, and therefore all the
vertical whitespace, which is the thing worth measuring.

Approximated: glyph shapes. Real font A is a 12x24 dot ROM font; this draws a
monospace TTF into the same 12x24 cell, so character *positions*, column
alignment and wrapping are right while the letterforms are merely close. Default
line spacing is taken as 30 dots, which is the common default but is firmware
dependent, so total receipt length is indicative rather than exact.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER_WIDTH = 384  # 58mm at 203dpi
DEFAULT_LINE_SPACING = 30

# Font A is 12x24, font B is 9x17 (ESC M 0 / ESC M 1).
FONT_CELLS = {0: (12, 24), 1: (9, 17)}

FONT_CANDIDATES = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]


def load_font(pixel_height: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, pixel_height)
    return ImageFont.load_default()


class Paper:
    """An append-only strip of paper. Grows as the stream feeds it."""

    def __init__(self) -> None:
        self.rows: list[bytearray] = []
        self.y = 0

    def _ensure(self, y: int) -> None:
        while len(self.rows) < y:
            self.rows.append(bytearray(b"\xff" * PAPER_WIDTH))

    def feed(self, dots: int) -> None:
        self.y += dots
        self._ensure(self.y)

    def blit(self, x: int, y: int, bitmap: Image.Image) -> None:
        self._ensure(y + bitmap.height)
        pixels = bitmap.load()
        for row in range(bitmap.height):
            line = self.rows[y + row]
            for col in range(bitmap.width):
                if x + col < PAPER_WIDTH and pixels[col, row] == 0:
                    line[x + col] = 0

    def image(self) -> Image.Image:
        self._ensure(self.y)
        img = Image.new("L", (PAPER_WIDTH, max(1, len(self.rows))), 255)
        img.putdata(b"".join(bytes(r) for r in self.rows))
        return img


class Interpreter:
    def __init__(self) -> None:
        self.paper = Paper()
        self.reset()
        self.line = ""
        self.cuts: list[int] = []

    def reset(self) -> None:
        self.align = 0
        self.font = 0
        self.width_mag = 1
        self.height_mag = 1
        self.line_spacing = DEFAULT_LINE_SPACING

    # -- text -------------------------------------------------------------

    def cell(self) -> tuple[int, int]:
        w, h = FONT_CELLS[self.font]
        return w * self.width_mag, h * self.height_mag

    def flush_line(self) -> None:
        base_w, base_h = FONT_CELLS[self.font]
        cell_w, cell_h = self.cell()
        text = self.line.rstrip("\r")
        self.line = ""

        if text:
            # Draw at the font's natural 1x cell, then scale up by the
            # magnification factors. GS ! really is pixel doubling of the ROM
            # glyph, so a double-height line genuinely is tall and narrow —
            # scaling afterwards reproduces that, where picking a larger point
            # size would quietly widen the glyphs instead.
            bitmap = Image.new("L", (base_w * len(text), base_h), 255)
            draw = ImageDraw.Draw(bitmap)
            font = load_font(int(min(base_w / 0.6, base_h * 0.82)))
            for i, ch in enumerate(text):
                if ch != " ":
                    draw.text((i * base_w + base_w // 2, base_h // 2), ch,
                              font=font, fill=0, anchor="mm")
            bitmap = bitmap.point(lambda v: 0 if v < 160 else 255)
            if (self.width_mag, self.height_mag) != (1, 1):
                bitmap = bitmap.resize(
                    (bitmap.width * self.width_mag, bitmap.height * self.height_mag),
                    Image.NEAREST,
                )

            x = {0: 0,
                 1: (PAPER_WIDTH - bitmap.width) // 2,
                 2: PAPER_WIDTH - bitmap.width}[self.align]
            self.paper.blit(max(0, x), self.paper.y, bitmap)

        # A line advances by the line spacing, or by the glyph height when
        # magnification makes the glyphs taller than the spacing.
        self.paper.feed(max(self.line_spacing, cell_h))

    # -- raster -----------------------------------------------------------

    def raster(self, data: bytes, bytes_per_line: int, rows: int) -> None:
        width = bytes_per_line * 8
        bitmap = Image.new("L", (width, rows), 255)
        pixels = bitmap.load()
        for row in range(rows):
            for b in range(bytes_per_line):
                byte = data[row * bytes_per_line + b]
                for bit in range(8):
                    if byte & (0x80 >> bit):
                        pixels[b * 8 + bit, row] = 0
        # GS v 0 always starts at the left margin; centring is baked into the
        # bitmap as white padding by the library.
        self.paper.blit(0, self.paper.y, bitmap)
        self.paper.feed(rows)

    # -- stream -----------------------------------------------------------

    def run(self, data: bytes) -> None:
        i = 0
        n = len(data)
        while i < n:
            b = data[i]

            if b == 0x1B:  # ESC
                op = data[i + 1]
                if op == 0x40:  # ESC @  initialise
                    self.flush_pending()
                    self.reset()
                    i += 2
                elif op == 0x61:  # ESC a n  align
                    self.align = data[i + 2] % 3
                    i += 3
                elif op == 0x4D:  # ESC M n  font
                    self.font = 1 if data[i + 2] == 1 else 0
                    i += 3
                elif op == 0x74:  # ESC t n  codepage
                    i += 3
                elif op == 0x4A:  # ESC J n  feed n dots
                    self.flush_pending()
                    self.paper.feed(data[i + 2])
                    i += 3
                elif op == 0x32:  # ESC 2  default line spacing
                    self.line_spacing = DEFAULT_LINE_SPACING
                    i += 2
                elif op == 0x33:  # ESC 3 n  set line spacing
                    self.line_spacing = data[i + 2]
                    i += 3
                elif op == 0x64:  # ESC d n  feed n lines
                    self.flush_pending()
                    self.paper.feed(data[i + 2] * self.line_spacing)
                    i += 3
                else:
                    raise SystemExit(f"unhandled ESC {op:#04x} at byte {i}")

            elif b == 0x1D:  # GS
                op = data[i + 1]
                if op == 0x21:  # GS ! n  character size
                    n_ = data[i + 2]
                    self.width_mag = ((n_ >> 4) & 0x07) + 1
                    self.height_mag = (n_ & 0x07) + 1
                    i += 3
                elif op == 0x76 and data[i + 2] == 0x30:  # GS v 0  raster
                    bpl = data[i + 4] | (data[i + 5] << 8)
                    rows = data[i + 6] | (data[i + 7] << 8)
                    start = i + 8
                    length = bpl * rows
                    self.flush_pending()
                    self.raster(data[start:start + length], bpl, rows)
                    i = start + length
                elif op == 0x56:  # GS V  cut
                    mode = data[i + 2]
                    self.flush_pending()
                    if mode in (0x41, 0x42):  # A/B: feed to cutter, then cut
                        # The head-to-cutter distance is mechanical, not
                        # commanded. ~20mm is typical for a 58mm unit.
                        self.paper.feed(160 + data[i + 3])
                        self.cuts.append(self.paper.y)
                        i += 4
                    else:
                        self.cuts.append(self.paper.y)
                        i += 3
                else:
                    raise SystemExit(f"unhandled GS {op:#04x} at byte {i}")

            elif b == 0x0A:  # LF
                self.flush_line()
                i += 1
            elif b == 0x0D:  # CR
                i += 1
            else:
                self.line += chr(b)
                i += 1

        self.flush_pending()

    def flush_pending(self) -> None:
        if self.line:
            self.flush_line()


def annotate(paper: Image.Image, cuts: list[int]) -> Image.Image:
    """Put the paper on a backdrop with a scale down the side."""
    margin = 56
    canvas = Image.new("RGB", (paper.width + margin * 2, paper.height + 40), (232, 232, 235))
    canvas.paste(paper.convert("RGB"), (margin, 20))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([margin - 1, 19, margin + paper.width, 20 + paper.height], outline=(150, 150, 155))

    ruler = load_font(11)
    for mm in range(0, int(paper.height / 203 * 25.4) + 1, 10):
        y = 20 + round(mm / 25.4 * 203)
        if y > 20 + paper.height:
            break
        draw.line([margin - 8, y, margin - 2, y], fill=(120, 120, 130))
        draw.text((4, y - 6), f"{mm}mm", font=ruler, fill=(110, 110, 120))

    for y in cuts:
        draw.line([margin, 20 + y, margin + paper.width, 20 + y], fill=(200, 60, 60))
        draw.text((margin + paper.width + 6, 20 + y - 6), "cut", font=ruler, fill=(200, 60, 60))

    return canvas


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source, target = Path(sys.argv[1]), Path(sys.argv[2])

    interp = Interpreter()
    interp.run(source.read_bytes())
    paper = interp.paper.image()
    annotate(paper, interp.cuts).save(target)

    print(f"{target.name}: {paper.height} dots ({paper.height / 203 * 25.4:.0f}mm) of paper")


if __name__ == "__main__":
    main()
