#!/usr/bin/env python3
"""Build the Papper user guides (Bahasa Indonesia) into PDFs.

Each guide is an HTML body in sumber/<peran>.html. A photo slot is written as

    <foto id="K-03">Caption shown under the photo</foto>

and is filled from foto/K-03.png (or .jpg / .jpeg / .webp) if that file exists.
Until it does, the PDF shows a dashed box naming the photo, so the guides are
usable before every screenshot is in.

    python3 build.py            # all guides
    python3 build.py kasir      # one guide

Output goes to pdf/. Needs Google Chrome (used headless to print).
"""
import base64
import html
import mimetypes
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "sumber"
FOTO = ROOT / "foto"
OUT = ROOT / "pdf"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# key: (title, platform, pdf name, main source, chapters spliced in at <sisipan/>)
#
# Superadmin is built from the admin source: the same screens, with the
# passages wrapped in <hanya peran="..."> chosen per guide, and its own
# chapters inserted before the troubleshooting chapter.
GUIDES = {
    "kasir": ("Panduan Kasir", "Aplikasi di HP / tablet", "Panduan-Kasir.pdf", "kasir", None),
    "admin": ("Panduan Admin", "Aplikasi di HP / tablet, atau versi web", "Panduan-Admin.pdf", "admin", None),
    "superadmin": ("Panduan Superadmin", "Aplikasi di HP / tablet, atau versi web",
                   "Panduan-Superadmin.pdf", "admin", "superadmin"),
    "owner": ("Panduan Owner", "Versi web, dibuka di browser komputer", "Panduan-Owner.pdf", "owner", None),
}

BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
         "Agustus", "September", "Oktober", "November", "Desember"]

FOTO_TAG = re.compile(r'<foto id="([A-Z]+-\d+)"(?: lebar="(\w+)")?>(.*?)</foto>', re.S)


def find_photo(code: str) -> Path | None:
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".PNG", ".JPG", ".JPEG"):
        p = FOTO / f"{code}{ext}"
        if p.exists():
            return p
    return None


def render_photo(m: re.Match, missing: list[str]) -> str:
    code, width, caption = m.group(1), m.group(2) or "hp", m.group(3).strip()
    photo = find_photo(code)
    if photo is None:
        missing.append(code)
        body = (
            f'<div class="kosong"><span class="kode">{code}</span>'
            f'<span>Foto belum ada</span></div>'
        )
    else:
        mime = mimetypes.guess_type(photo.name)[0] or "image/png"
        data = base64.b64encode(photo.read_bytes()).decode()
        body = f'<img src="data:{mime};base64,{data}" alt="{html.escape(caption)}">'
    return (
        f'<figure class="foto {width}">{body}'
        f'<figcaption><b>{code}</b> · {caption}</figcaption></figure>'
    )


def build(key: str) -> list[str]:
    title, platform, pdf_name, source, extra = GUIDES[key]
    body = (SRC / f"{source}.html").read_text()

    # Passages for one role only.
    body = re.sub(
        r'<hanya peran="(\w+)">(.*?)</hanya>',
        lambda m: m.group(2) if m.group(1) == key else "",
        body,
        flags=re.S,
    )
    body = body.replace("<sisipan/>", (SRC / f"{extra}.html").read_text() if extra else "")

    # The notes that open the guide sit on the contents page.
    m = re.search(r"<pengantar>(.*?)</pengantar>", body, re.S)
    intro = m.group(1) if m else ""
    if m:
        body = body[: m.start()] + body[m.end():]

    chapters = re.findall(r"<h2>(.*?)</h2>", body)
    contents = "".join(f"<li>{c}</li>" for c in chapters)

    missing: list[str] = []
    body = FOTO_TAG.sub(lambda m: render_photo(m, missing), body)
    body = f'<section class="isi"><h2>Daftar Isi</h2><ol>{contents}</ol>{intro}</section>\n{body}'

    today = date.today()
    tanggal = f"{today.day} {BULAN[today.month - 1]} {today.year}"
    css = (ROOT / "gaya.css").read_text()

    page = f"""<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>{title}</title>
<style>{css}</style></head>
<body>
<section class="sampul">
  <div class="logo">✛</div>
  <div class="app">Papper</div>
  <h1>{title}</h1>
  <p class="platform">{platform}</p>
  <p class="tanggal">Versi {tanggal}</p>
</section>
{body}
</body></html>"""

    html_path = OUT / f"{key}.html"
    html_path.write_text(page)
    pdf_path = OUT / pdf_name
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf_path}", html_path.as_uri()],
        check=True, capture_output=True,
    )
    html_path.unlink()
    return missing


# Who takes each photo, by the letter its code starts with.
SUMBER_FOTO = {
    "K": "akun kasir, aplikasi di HP",
    "A": "akun admin atau superadmin, aplikasi di HP (dipakai di Panduan Admin dan Superadmin)",
    "S": "akun superadmin, aplikasi di HP (S-01 diambil di HP kasir)",
    "O": "akun owner, versi web di komputer (tangkapan layar lebar)",
}


def write_checklist() -> None:
    """foto/DAFTAR-FOTO.txt: every photo slot, and whether its file is in yet."""
    seen: dict[str, str] = {}
    for f in sorted(SRC.glob("*.html")):
        for code, _, caption in FOTO_TAG.findall(f.read_text()):
            seen.setdefault(code, " ".join(caption.split()))
    lines = [
        "DAFTAR FOTO PANDUAN PAPPER",
        "",
        "Simpan setiap tangkapan layar di folder ini dengan nama kodenya, misalnya K-01.png",
        "(.png atau .jpg). Lalu jalankan:  python3 build.py",
        "",
        "[x] = sudah ada, [ ] = belum ada",
    ]
    prefix = None
    for code in sorted(seen, key=lambda c: (c[0], int(c.split("-")[1]))):
        if code[0] != prefix:
            prefix = code[0]
            lines += ["", f"{code[0]}: {SUMBER_FOTO.get(code[0], '')}"]
        mark = "x" if find_photo(code) else " "
        lines.append(f"  [{mark}] {code}  {seen[code]}")
    (FOTO / "DAFTAR-FOTO.txt").write_text("\n".join(lines) + "\n")


def main() -> None:
    keys = sys.argv[1:] or list(GUIDES)
    OUT.mkdir(exist_ok=True)
    for key in keys:
        missing = build(key)
        status = f"{len(missing)} foto belum ada" if missing else "semua foto ada"
        print(f"{GUIDES[key][2]}: {status}")
    write_checklist()


if __name__ == "__main__":
    main()
