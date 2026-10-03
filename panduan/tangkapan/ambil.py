#!/usr/bin/env python3
"""Take the guide screenshots from the Expo web build, against the mock database.

Run through ambil.sh, which swaps the mock in, starts the web server, runs this
and puts the real files back. Directly:

    python3 ambil.py                 # every scene
    python3 ambil.py K-02 K-09       # some scenes

Writes ../foto/<code>.png.
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from cdp import Browser  # noqa: E402

FOTO = HERE.parent / "foto"
BASE = "http://localhost:8091"
PHONE = (412, 915)
DESKTOP = (1440, 900)

SCENES = {}


def scene(code, role, size=PHONE):
    def wrap(fn):
        SCENES[code] = (role, size, fn)
        return fn
    return wrap


# -- helpers ------------------------------------------------------------------
def start(b, role, size, path="/"):
    w, h = size
    b.viewport(w, h, scale=2 if w < 600 else 1.5, mobile=w < 600)
    b.goto(BASE + "/", settle=0.5)
    b.js(f"localStorage.setItem('mockRole', {json.dumps(role)})")
    b.goto(BASE + path, settle=1)


def icons_beside(b, text):
    """Rects of the icons on the same row as `text`, left to right."""
    return b.js(f"""
      (() => {{
        const want = {json.dumps(text)};
        let target = null;
        for (const el of document.querySelectorAll('body *')) {{
          if ((el.innerText || '').trim() === want) {{
            if (!target || target.contains(el)) target = el;
          }}
        }}
        if (!target) return null;
        const tr = target.getBoundingClientRect();
        const cy = tr.top + tr.height / 2;
        let card = target;
        while (card && card.querySelectorAll('svg').length < 3) card = card.parentElement;
        if (!card) return null;
        return [...card.querySelectorAll('svg')]
          .map(s => s.getBoundingClientRect())
          .filter(r => r.width > 0 && Math.abs(r.top + r.height / 2 - cy) < 22 && r.left > tr.left)
          .sort((a, b) => a.left - b.left)
          .map(r => ({{x: r.left + r.width / 2, y: r.top + r.height / 2}}));
      }})()
    """)


def icons_in_card(b, text, min_icons=4):
    """Every icon in the smallest block around `text` holding min_icons, by position."""
    return b.js(f"""
      (() => {{
        let target = null;
        for (const el of document.querySelectorAll('body *')) {{
          if ((el.innerText || '').trim() === {json.dumps(text)}) {{ if (!target || target.contains(el)) target = el; }}
        }}
        if (!target) return null;
        let card = target;
        while (card && card.querySelectorAll('svg').length < {min_icons}) card = card.parentElement;
        if (!card) return null;
        return [...card.querySelectorAll('svg')]
          .map(s => s.getBoundingClientRect())
          .filter(r => r.width > 0)
          .sort((a, b) => a.top - b.top || a.left - b.left)
          .map(r => ({{x: r.left + r.width / 2, y: r.top + r.height / 2}}));
      }})()
    """)


def click_icon(b, text, index, settle=1.0):
    icons = icons_beside(b, text)
    if not icons or len(icons) <= index:
        raise LookupError(f"icon {index} beside {text!r}: {icons}")
    b.click_xy(icons[index]["x"], icons[index]["y"], settle)


def fill(b, placeholder, value):
    """Focus the input with this placeholder and type into it."""
    r = b.js(f"""
      (() => {{
        const el = [...document.querySelectorAll('input, textarea')]
          .find(i => i.placeholder === {json.dumps(placeholder)});
        if (!el) return null;
        el.scrollIntoView({{block: 'center'}});
        const r = el.getBoundingClientRect();
        return {{x: r.left + r.width / 2, y: r.top + r.height / 2}};
      }})()
    """)
    if not r:
        raise LookupError(f"no input with placeholder {placeholder!r}")
    b.click_xy(r["x"], r["y"], 0.3)
    b.type_text(value)


def fill_nth(b, placeholder, n, value):
    """Like fill, for the n-th input sharing a placeholder."""
    r = b.js(f"""
      (() => {{
        const el = [...document.querySelectorAll('input, textarea')]
          .filter(i => i.placeholder === {json.dumps(placeholder)})[{n}];
        if (!el) return null;
        el.scrollIntoView({{block: 'center'}});
        const r = el.getBoundingClientRect();
        return {{x: r.left + r.width / 2, y: r.top + r.height / 2}};
      }})()
    """)
    if not r:
        raise LookupError(f"no input #{n} with placeholder {placeholder!r}")
    b.click_xy(r["x"], r["y"], 0.3)
    b.type_text(value)


def replace_value(b, current, value):
    """Select the whole of the input now holding `current` and type over it."""
    r = b.js(f"""
      (() => {{
        const el = [...document.querySelectorAll('input, textarea')].find(i => i.value === {json.dumps(current)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {{x: r.left + r.width / 2, y: r.top + r.height / 2}};
      }})()
    """)
    if not r:
        raise LookupError(f"no input holding {current!r}")
    b.click_xy(r["x"], r["y"], 0.3)
    b.js("document.activeElement.select()")
    b.type_text(value)


def scroll_to_text(b, text, block="start", offset=0):
    ok = b.js(f"""
      (() => {{
        let t = null;
        for (const el of document.querySelectorAll('body *')) {{
          if ((el.innerText || '').trim() === {json.dumps(text)}) {{ if (!t || t.contains(el)) t = el; }}
        }}
        if (!t) return false;
        t.scrollIntoView({{block: {json.dumps(block)}}});
        return true;
      }})()
    """)
    if not ok:
        raise LookupError(f"cannot scroll to {text!r}")
    if offset:
        # scrollIntoView moves the nearest scrollable ancestor; nudge it.
        b.js(f"""
          (() => {{
            let t = null;
            for (const el of document.querySelectorAll('body *')) {{
              if ((el.innerText || '').trim() === {json.dumps(text)}) {{ if (!t || t.contains(el)) t = el; }}
            }}
            let p = t.parentElement;
            while (p && !(p.scrollHeight > p.clientHeight + 4 && getComputedStyle(p).overflowY !== 'visible')) p = p.parentElement;
            if (p) p.scrollTop += {offset};
          }})()
        """)
    time.sleep(0.6)


# -- kasir ----------------------------------------------------------------------
@scene("K-01", "none")
def k01(b):
    b.wait_text("Masuk untuk melanjutkan")


@scene("K-02", "cashier")
def k02(b):
    b.wait_text("Pesanan : Bu Aliyah")


@scene("K-03", "cashier")
def k03(b):
    b.wait_text("Pesanan : Bu Aliyah")
    click_icon(b, "Pesanan : Bu Aliyah", 1, settle=2)
    b.wait_text("Pindai Printer")


def add_item(b, name, times=1):
    for _ in range(times):
        icons = icons_beside(b, name)
        b.click_xy(icons[-1]["x"], icons[-1]["y"], 0.4)


def new_order_with_items(b):
    b.wait_text("Tambah order baru")
    b.click_text("Tambah order baru", settle=1.5)
    fill(b, "cth. Bu Aliyah", "Pak Bima")
    fill(b, "cth. A1", "B5")
    b.click_text("Pilih Menu", settle=1.5)
    add_item(b, "Nasi Goreng Papper", 2)
    b.click_text("Ayam", settle=0.8)
    add_item(b, "Ayam Geprek")
    b.click_text("Coffee", settle=0.8)
    add_item(b, "Es Kopi Susu Papper", 3)
    fill(b, "Catatan untuk Es Kopi Susu Papper (opsional)", "es sedikit")


@scene("K-04", "cashier")
def k04(b):
    new_order_with_items(b)
    b.click_text("6 Item", settle=1.2)
    b.wait_text("Konfirmasi Pesanan")


@scene("K-05", "cashier")
def k05(b):
    new_order_with_items(b)
    b.click_text("+ Item Kustom", settle=1.5)
    fill(b, "cth. Nasi Goreng Spesial", "Mie Goreng Spesial")
    fill(b, "Rp 0", "30000")
    time.sleep(0.5)


def edit_aliyah(b):
    b.wait_text("Pesanan : Bu Aliyah")
    click_icon(b, "Pesanan : Bu Aliyah", 2, settle=2)
    b.wait_text("review & simpan", ) if False else b.wait_text("review & simpan")
    b.click_text("Snacks", settle=0.8)
    add_item(b, "Pisang Goreng")


@scene("K-07", "cashier")
def k07(b):
    edit_aliyah(b)
    b.click_text("7 Item", settle=1.2)
    b.wait_text("Simpan Order")


def enter_pin(b):
    time.sleep(1.2)  # let the PIN pad finish animating in, or the first tap is lost
    for d in "482965":  # no 1: a quantity "1" can sit behind the keypad
        b.click_text(d, settle=0.25)
    time.sleep(0.5)


@scene("K-08", "cashier")
def k08(b):
    edit_aliyah(b)
    b.click_text("X", settle=1.2)
    b.click_text("Iya, Batalkan", settle=1.5)
    b.wait_text("Diperlukan Manager PIN")
    enter_pin(b)


@scene("K-09", "cashier", (412, 1180))
def k09(b):
    b.wait_text("Pesanan : Bu Aliyah")
    click_icon(b, "Pesanan : Bu Aliyah", 3, settle=2)
    b.wait_text("Konfirmasi Pembayaran")
    fill_nth(b, "0", 2, "150000")
    b.js("document.activeElement.blur()")
    time.sleep(0.5)


@scene("K-10", "cashier", (412, 1000))
def k10(b):
    b.wait_text("Pesanan : Bu Aliyah")
    click_icon(b, "Pesanan : Bu Aliyah", 3, settle=2)
    b.click_text("Split Bill", settle=2)
    b.wait_text("Rincian per Pembayar")
    for name in ["Ayam Geprek", "Es Teh Manis"]:
        icons = icons_in_card(b, name)
        b.click_xy(icons[0]["x"], icons[0]["y"], 0.5)
        icons = icons_in_card(b, name)
        b.click_xy(icons[3]["x"], icons[3]["y"], 0.5)


@scene("K-11", "cashier", (412, 1000))
def k11(b):
    b.wait_text("Pesanan : Raka")
    click_icon(b, "Pesanan : Raka", 3, settle=2)
    b.wait_text("Cetak Ulang")
    fill(b, "Nama (opsional, untuk struk)", "Dewi")
    b.js("document.activeElement.blur()")
    scroll_to_text(b, "Total : Rp 185.900", block="start", offset=-30)


@scene("K-12", "cashier", (412, 1100))
def k12(b):
    b.wait_text("Pesanan : Pak Yusuf")
    click_icon(b, "Pesanan : Pak Yusuf", 3, settle=2)
    b.wait_text("Metode Pengembalian")


@scene("K-13", "cashier")
def k13(b):
    b.wait_text("Pesanan : Bu Aliyah")
    b.click_text("Ketersediaan", settle=1.5)
    b.click_text("Pilihan Juice", settle=1)
    scroll_to_text(b, "Pilihan Milkshake", block="start")


def open_sales(b):
    b.wait_text("Pesanan : Bu Aliyah")
    b.click_text("Penjualan", settle=2.5)
    b.wait_text("Total Hari Ini")


@scene("K-14", "cashier")
def k14(b):
    open_sales(b)


@scene("K-16", "cashier")
def k16(b):
    open_sales(b)
    scroll_to_text(b, "Koreksi Pesanan Hari Lain", block="start", offset=-20)


@scene("K-15", "cashier")
def k15(b):
    open_sales(b)
    b.click_text("#16 · Ibu Wulan", settle=2.5)
    b.wait_text("Total diterima")


@scene("S-01", "cashier")
def s01(b):
    b.wait_text("Pesanan : Pak Agus")
    click_icon(b, "Pesanan : Pak Agus", 2, settle=1.5)
    b.wait_text("Koreksi Pesanan")
    enter_pin(b)


@scene("A-02", "admin")
def a02(b):
    b.wait_text("Cabai Rawit")
    time.sleep(0.8)


def add_stock_sheet(b):
    b.wait_text("Cabai Rawit")
    b.click_text("tambah stok", settle=1.8)


@scene("A-03", "admin")
def a03(b):
    add_stock_sheet(b)
    fill(b, "Cari item stok...", "Alpu")
    time.sleep(0.6)
    b.click_text("Alpukat", index=1, settle=0.8)
    fill(b, "cth. 3 buah", "24")
    fill(b, "cth. 25.000 (total yang dibayar)", "156000")
    b.js("document.activeElement.blur()")
    time.sleep(0.6)


def open_hpp(b):
    b.wait_text("Cabai Rawit")
    b.click_text("HPP", index=0, settle=2.5)
    b.wait_text("Nasi Goreng Papper")


@scene("A-04", "admin")
def a04(b):
    open_hpp(b)
    b.click_text("▼ tampilkan detail", index=0, settle=1)
    scroll_to_text(b, "Nasi Goreng Papper", block="start", offset=-12)


@scene("A-05", "admin", (412, 1100))
def a05(b):
    open_hpp(b)
    click_icon(b, "Nasi Goreng Papper", 0, settle=2.5)
    b.wait_text("Total HPP")


@scene("A-06", "admin")
def a06(b):
    b.wait_text("Cabai Rawit")
    b.click_text("Pembelian", index=0, settle=2.5)
    b.wait_text("Total Pengeluaran")
    b.click_text("▼ tampilkan detail", index=0, settle=1)


def open_admin_sales(b):
    b.wait_text("Cabai Rawit")
    b.click_text("Penjualan", index=0, settle=3)
    b.wait_text("Metode Bayar")


@scene("A-07", "admin")
def a07(b):
    open_admin_sales(b)


@scene("A-08", "admin")
def a08(b):
    open_admin_sales(b)
    b.click_text("Rincian Pesanan", index=0, settle=2.5)
    b.wait_text("18 pesanan")
    b.click_text("Gita", index=1, settle=1.5)
    scroll_to_text(b, "Pak Agus", block="start", offset=200)


@scene("A-09", "admin")
def a09(b):
    open_admin_sales(b)
    b.click_text("Otorisasi Manager", index=0, settle=2.5)
    b.wait_text("Koreksi pesanan")


@scene("S-02", "superadmin")
def s02(b):
    add_stock_sheet(b)
    fill(b, "Cari item stok...", "Daun Jeruk")
    time.sleep(0.8)
    fill(b, "cth. kg, liter, pcs", "ikat")
    b.js("document.activeElement.blur()")
    time.sleep(0.5)


@scene("S-03", "superadmin")
def s03(b):
    b.wait_text("Cabai Rawit")
    click_icon(b, "Cabai Rawit", 0, settle=1.5)
    b.wait_text("Simpan Koreksi")
    replace_value(b, "1.2", "2.5")
    fill(b, "cth. salah ketik, harusnya 10 bukan 100", "hitung ulang stok di dapur")
    b.js("document.activeElement.blur()")
    time.sleep(0.5)


@scene("S-04", "superadmin")
def s04(b):
    b.wait_text("Cabai Rawit")
    b.click_text("Pemakaian", settle=2.5)
    b.wait_text("dihitung dari resep saat ini")
    time.sleep(0.5)


@scene("S-05", "superadmin")
def s05(b):
    open_hpp(b)
    b.click_text("Menu Baru", settle=2.5)
    b.wait_text("Buat Menu")
    fill(b, "cth. Nasi Goreng", "Nasi Goreng Kampung")
    fill(b, "cth. 25000", "27000")
    b.js("document.activeElement.blur()")
    time.sleep(0.5)


@scene("S-06", "superadmin")
def s06(b):
    open_hpp(b)
    fill(b, "Cari menu...", "Crois")
    time.sleep(1)
    b.js("document.activeElement.blur()")
    click_icon(b, "Croissant", 0, settle=2.5)
    b.wait_text("Tidak ada bahan yang dilacak")


@scene("S-07", "superadmin", (412, 640))
def s07(b):
    b.wait_text("Cabai Rawit")
    b.click_text("Pembelian", index=0, settle=2.5)
    b.click_text("Perbandingan", settle=3)
    b.wait_text("Selisih")
    # August against September: October has only begun.
    arrows = b.js("""
      [...document.querySelectorAll('svg')]
        .map(s => s.getBoundingClientRect())
        .filter(r => r.width > 0 && r.top > 80 && r.top < 140)
        .sort((a, b) => a.left - b.left)
        .map(r => ({x: r.left + r.width / 2, y: r.top + r.height / 2}))
    """)
    b.click_xy(arrows[0]["x"], arrows[0]["y"], 2)
    b.click_xy(arrows[2]["x"], arrows[2]["y"], 2.5)


# -- owner ----------------------------------------------------------------------
def owner_last_month(b, page=None):
    b.wait_text("Penjualan kotor")
    time.sleep(1)
    b.click_text("Bulan ini", settle=1.2)
    b.click_text("Bulan lalu", settle=2.5)
    if page:
        b.click_text(page, index=0, settle=2.5)


@scene("O-01", "owner", DESKTOP)
def o01(b):
    owner_last_month(b)


@scene("O-02", "owner", DESKTOP)
def o02(b):
    b.wait_text("Penjualan kotor")
    time.sleep(1)
    b.click_text("Bulan ini", settle=1.5)


@scene("O-03", "owner", DESKTOP)
def o03(b):
    owner_last_month(b)
    scroll_to_text(b, "Penjualan kotor harian", block="start", offset=-16)


@scene("O-04", "owner", DESKTOP)
def o04(b):
    owner_last_month(b, "Menu")
    b.wait_text("Semua item")
    time.sleep(1)


@scene("O-05", "owner", DESKTOP)
def o05(b):
    owner_last_month(b, "Pembayaran")
    b.wait_text("Metode terbanyak")
    time.sleep(1)


@scene("O-06", "owner", DESKTOP)
def o06(b):
    owner_last_month(b, "Pesanan")
    b.wait_text("Klik pesanan untuk melihat isinya")
    time.sleep(1)
    b.click_text("Ibu Wulan", settle=2)
    scroll_to_text(b, "Ibu Wulan", block="center")


@scene("O-07", "owner", DESKTOP)
def o07(b):
    owner_last_month(b, "Pembelian")
    b.wait_text("Total pembelian")
    time.sleep(1)


# -- runner ---------------------------------------------------------------------
def main():
    import shutil
    import tempfile

    wanted = sys.argv[1:] or list(SCENES)
    FOTO.mkdir(exist_ok=True)
    profile = Path(tempfile.mkdtemp(prefix="papper-chrome-"))
    b = Browser(profile)
    failed = []
    try:
        for code in wanted:
            role, size, fn = SCENES[code]
            try:
                start(b, role, size)
                fn(b)
                time.sleep(0.6)
                b.shot(FOTO / f"{code}.png")
                print(f"{code}: ok")
            except Exception as e:  # keep going; report at the end
                failed.append(code)
                print(f"{code}: GAGAL — {e}")
    finally:
        b.close()
        shutil.rmtree(profile, ignore_errors=True)

    # The admin guide's login screen is the cashier's.
    if (FOTO / "K-01.png").exists() and (not sys.argv[1:] or "A-01" in wanted or "K-01" in wanted):
        shutil.copy(FOTO / "K-01.png", FOTO / "A-01.png")
    # The kitchen ticket comes from the app's own receipt layout
    # (npm run preview:receipt), not from the screen.
    ticket = HERE.parents[1] / "mobile" / ".preview" / "kitchen-ticket-table.png"
    if ticket.exists():
        shutil.copy(ticket, FOTO / "K-06.png")
    if failed:
        print("Gagal:", " ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
