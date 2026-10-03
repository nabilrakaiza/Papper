"""A small driver for headless Chrome over the DevTools protocol.

Used by ambil.py to take the guide screenshots from the Expo web build with
the mock database (supabase.mock.ts) swapped in.
"""
import base64
import json
import subprocess
import time
import urllib.request
from pathlib import Path

import websocket  # websocket-client

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class Browser:
    def __init__(self, profile_dir: Path, port: int = 9333, attach: bool = False):
        self.proc = None
        if attach:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
            page = next(t for t in tabs if t["type"] == "page" and not t["url"].startswith("chrome"))
            self._connect(page, port)
            return
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", f"--remote-debugging-port={port}",
             f"--remote-allow-origins=http://127.0.0.1:{port}",
             f"--user-data-dir={profile_dir}", "--no-first-run", "--hide-scrollbars",
             "--force-color-profile=srgb", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        page = None
        for _ in range(300):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
                page = next(t for t in tabs if t["type"] == "page" and t["url"] == "about:blank")
                break
            except Exception:
                time.sleep(0.1)
        if page is None:
            self.proc.terminate()
            raise RuntimeError("Chrome did not open its debugging port")
        self._connect(page, port)

    def _connect(self, page, port):
        self.ws = websocket.create_connection(
            page["webSocketDebuggerUrl"], timeout=60, origin=f"http://127.0.0.1:{port}"
        )
        self.msg_id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")

    def send(self, method, **params):
        self.msg_id += 1
        mid = self.msg_id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def close(self):
        try:
            self.ws.close()
        finally:
            if self.proc:
                self.proc.terminate()

    # -- page -----------------------------------------------------------------
    def viewport(self, width, height, scale=2, mobile=True):
        self.send("Emulation.setDeviceMetricsOverride", width=width, height=height,
                  deviceScaleFactor=scale, mobile=mobile)
        if mobile:
            self.send("Emulation.setTouchEmulationEnabled", enabled=False)
        # The café's clock, whatever this machine's is.
        try:
            self.send("Emulation.setTimezoneOverride", timezoneId="Asia/Jakarta")
        except RuntimeError:
            pass  # already set on this session

    def goto(self, url, settle=1.5):
        self.send("Page.navigate", url=url)
        time.sleep(settle)

    def js(self, expr):
        r = self.send("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", r["exceptionDetails"]))
        return r.get("result", {}).get("value")

    def wait_text(self, text, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            if self.js(f"document.body && document.body.innerText.includes({json.dumps(text)})"):
                return
            time.sleep(0.2)
        raise TimeoutError(f"text not found: {text!r}")

    # -- input ----------------------------------------------------------------
    def click_xy(self, x, y, settle=0.8):
        # React Native Web ignores a press released in the same instant.
        for kind in ("mouseMoved", "mousePressed"):
            self.send("Input.dispatchMouseEvent", type=kind, x=x, y=y, button="left", clickCount=1)
        time.sleep(0.12)
        self.send("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
        time.sleep(settle)

    def rect_of_text(self, text, index=0, exact=True):
        """Centre of the smallest visible element whose own text matches."""
        return self.js(f"""
          (() => {{
            const want = {json.dumps(text)};
            const exact = {json.dumps(exact)};
            const hits = [];
            const all = document.querySelectorAll('body *');
            for (const el of all) {{
              const t = (el.innerText || '').trim();
              if (!(exact ? t === want : t.includes(want))) continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              const style = getComputedStyle(el);
              if (style.visibility === 'hidden' || style.opacity === '0') continue;
              hits.push({{el, r}});
            }}
            // Innermost matches only: drop any hit that contains another hit.
            const inner = hits.filter(h => !hits.some(o => o !== h && h.el.contains(o.el)));
            inner.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
            const h = inner[{index}];
            if (!h) return null;
            h.el.scrollIntoView({{block: 'nearest', inline: 'center'}});
            const r = h.el.getBoundingClientRect();
            return {{x: r.left + r.width / 2, y: r.top + r.height / 2}};
          }})()
        """)

    def click_text(self, text, index=0, exact=True, settle=0.8):
        r = self.rect_of_text(text, index, exact)
        if not r:
            raise LookupError(f"no element with text {text!r}")
        self.click_xy(r["x"], r["y"], settle)

    def type_text(self, text):
        self.send("Input.insertText", text=text)
        time.sleep(0.3)

    def scroll(self, dy, x=None, y=None):
        w = self.js("window.innerWidth")
        h = self.js("window.innerHeight")
        self.send("Input.dispatchMouseEvent", type="mouseWheel", x=x or w / 2, y=y or h / 2,
                  deltaX=0, deltaY=dy)
        time.sleep(0.6)

    def shot(self, path: Path):
        data = self.send("Page.captureScreenshot", format="png")["data"]
        path.write_bytes(base64.b64decode(data))
