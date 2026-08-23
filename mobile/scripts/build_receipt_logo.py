#!/usr/bin/env python3
"""Rebuild lib/printerLogo.ts from assets/images/logonabawi.png.

Run this if the artwork changes:

    python3 scripts/build_receipt_logo.py

Why the source image can't just be resized and embedded
-------------------------------------------------------
The printer library binarises whatever bitmap it is handed using
PrintPicture.format_K_threshold, which takes the *mean* grey of the image as
its threshold and does no dithering at all. A normal grayscale logo averages
around 200, so every pixel darker than that — the pastel pineapple fill, the
green leaves, the insides of the letters — floods to solid black and the logo
prints as a blob.

So we binarise it ourselves and ship pure black and white. A mean threshold is
a no-op on an image that only contains 0 and 255 (every 0 is <= the mean and
every 255 is > it, for any mean strictly under 255), so the library's
destructive step reproduces our bitmap exactly. verify() below asserts that
rather than trusting it.

Two other details that matter:

* Grey comes from the value channel, max(r, g, b), not from luma. The artwork's
  orange and green fills have low luma and would threshold to black, but they
  are light in value, so the fills drop out and the ink lines survive.
* The output width must be a multiple of 8 (ESC/POS packs raster data 8 dots to
  the byte) and must equal the `width` passed to printPic, or the native side
  rescales with a smoothing filter and undoes all of this.
"""

from __future__ import annotations

import base64
import io
import textwrap
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/images/logonabawi.png"
TARGET = ROOT / "lib/printerLogo.ts"

# 240 of the 384 dots a 58mm head can print. At 144 the wordmark broke up; at
# 288 the logo crowds out the rest of the header.
WIDTH_DOTS = 240

# Ink darker than this survives, fills lighter than it drop out. Tuned by eye
# against the wordmark: lower and the letters thin out, higher and the leaves
# and letter interiors fill in solid.
INK_THRESHOLD = 160


def crop_to_ink(image: Image.Image, threshold: int = 245) -> Image.Image:
    """Trim the blank canvas around the artwork so no dots are spent on paper."""
    mask = image.convert("L").point(lambda v: 255 if v < threshold else 0)
    box = mask.getbbox()
    if box is None:
        raise SystemExit(f"{SOURCE} looks blank")
    return image.crop(box)


def value_channel(image: Image.Image) -> Image.Image:
    r, g, b = image.split()
    return ImageChops.lighter(ImageChops.lighter(r, g), b)


def build() -> Image.Image:
    source = crop_to_ink(Image.open(SOURCE).convert("RGB"))

    # Height rounded up to a multiple of 8 to match POS_PrintBMP, which rounds
    # it the same way; letting it do the rounding would mean it also rescales.
    height = round(source.height * WIDTH_DOTS / source.width)
    height = ((height + 7) // 8) * 8

    resized = source.resize((WIDTH_DOTS, height), Image.LANCZOS)
    return value_channel(resized).point(lambda v: 255 if v > INK_THRESHOLD else 0)


def verify(bitmap: Image.Image) -> None:
    """Replay the library's own conversion and assert it changes nothing."""
    levels = set(bitmap.getdata())
    if not levels <= {0, 255}:
        raise SystemExit(f"bitmap is not pure black and white: {sorted(levels)[:8]}...")
    if levels != {0, 255}:
        raise SystemExit("bitmap is entirely one colour")

    pixels = list(bitmap.getdata())
    mean = sum(pixels) // len(pixels)  # format_K_threshold's integer division
    printed = bitmap.point(lambda v: 255 if v > mean else 0)
    if list(printed.getdata()) != pixels:
        raise SystemExit("the library's mean threshold would alter this bitmap")


def encode(bitmap: Image.Image) -> str:
    buffer = io.BytesIO()
    bitmap.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def render_module(bitmap: Image.Image, b64: str) -> str:
    chunks = textwrap.wrap(b64, 100)
    literal = "\n".join(f'  "{chunk}" +' for chunk in chunks[:-1])
    literal += f'\n  "{chunks[-1]}";'

    return f'''// Receipt logo for the customer receipt, base64-encoded PNG
// ({bitmap.width}x{bitmap.height}), generated from assets/images/logonabawi.png by
// scripts/build_receipt_logo.py. Edit that script, not this file.
//
// The bitmap is pure black and white on purpose. The printer library binarises
// with the image's mean grey as the threshold and no dithering, which turns an
// ordinary grayscale logo into a black blob; a bitmap that is already 0/255
// passes through that step unchanged. The generator asserts this.
//
// Embedded rather than loaded through expo-asset + expo-file-system because on
// Android release builds a bundled image becomes an APK drawable resource:
// Asset.localUri comes back null and Asset.uri is a bare resource name
// ("assets_images_logonabawi"), which readAsStringAsync rejects with
// "Unsupported scheme". It works under Metro only because dev builds serve
// assets over HTTP, so this only ever broke in production.

/**
 * The bitmap's own width in dots, exported so printPic is always told the
 * truth. If the two disagree the native side rescales the image with a
 * smoothing filter, which reintroduces grey pixels and undoes the work above.
 */
export const RECEIPT_LOGO_WIDTH_DOTS = {bitmap.width};

export const RECEIPT_LOGO_BASE64 =
{literal}
'''


def main() -> None:
    bitmap = build()
    verify(bitmap)
    b64 = encode(bitmap)
    TARGET.write_text(render_module(bitmap, b64))

    ink = sum(1 for v in bitmap.getdata() if v == 0) / (bitmap.width * bitmap.height)
    print(
        f"{TARGET.relative_to(ROOT)}: {bitmap.width}x{bitmap.height}, "
        f"{len(b64) / 1024:.1f}KB base64, {ink:.0%} ink"
    )


if __name__ == "__main__":
    main()
