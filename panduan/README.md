# Panduan pengguna

User guides for each role, in Bahasa Indonesia, built to PDF.

| Guide | Source | Output |
| --- | --- | --- |
| Kasir | `sumber/kasir.html` | `pdf/Panduan-Kasir.pdf` |
| Admin | `sumber/admin.html` | `pdf/Panduan-Admin.pdf` |
| Superadmin | `sumber/admin.html` + `sumber/superadmin.html` | `pdf/Panduan-Superadmin.pdf` |
| Owner | `sumber/owner.html` | `pdf/Panduan-Owner.pdf` |

```sh
python3 build.py          # every guide
python3 build.py kasir    # one guide
```

Needs Python 3.10+ and Google Chrome, which prints the PDFs headless.

## Writing

- A chapter is an `<h2>`. Chapters are numbered and the contents page is built
  automatically, so cross-references ("lihat bab 10") must follow the final
  numbering of each guide.
- `<pengantar>…</pengantar>` holds the notes shown on the contents page.
- `<span class="t">Simpan</span>` marks an on-screen button or label.
  `ol.langkah` is a numbered step list; `div.catatan` and `div.awas` are a note
  and a warning.
- The superadmin guide is the admin source with `sumber/superadmin.html` spliced
  in at `<sisipan/>`. Wrap text that applies to only one of the two in
  `<hanya peran="admin">` or `<hanya peran="superadmin">`.

## Photos

`<foto id="K-03">Caption</foto>` is filled from `foto/K-03.png` (or `.jpg`). Add
`lebar="lebar"` for a wide desktop screenshot. A missing photo renders as a
labelled empty box, so the guides can be built before every screenshot exists.
Each build rewrites `foto/DAFTAR-FOTO.txt`, the checklist of every photo and
whether its file is in.

### Retaking the screenshots

The photos are real screens from the app's web build, filled with made-up data:

```sh
PYTHONPATH=<dir with websocket-client> tangkapan/ambil.sh          # every photo
PYTHONPATH=<dir with websocket-client> tangkapan/ambil.sh K-02 A-03  # some
```

`ambil.sh` never touches the real database. For the length of the run it swaps
`mobile/lib/supabase.ts` for `tangkapan/supabase.mock.ts`, an in-memory database
of invented orders, stock and purchases with the clock pinned to Saturday
3 Oct 2026, 14:32 WIB. It also lets every role into the web build so the cashier
screens can be captured. Both files are restored from git when the script exits,
and it refuses to start if either has uncommitted changes.

`tangkapan/ambil.py` holds one scene per photo (which account, what to tap);
`tangkapan/cdp.py` drives headless Chrome. K-06, the kitchen ticket, comes from
`npm run preview:receipt` rather than the screen. Needs Chrome, Python 3.10+ with
`websocket-client` and Pillow, and the app's npm dependencies.

