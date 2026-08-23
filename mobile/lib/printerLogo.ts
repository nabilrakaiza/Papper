// Receipt logo for the customer receipt, base64-encoded PNG
// (240x304), generated from assets/images/logonabawi.png by
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
export const RECEIPT_LOGO_WIDTH_DOTS = 240;

export const RECEIPT_LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAPAAAAEwCAAAAACsoaNOAAAXwElEQVR42u1d25blqA5DrPz/L+s8JAEbzDWQneoz/TLT1VW74gDG" +
  "lmUZdC/8gfzLK7+x/Ch8yU7Kr/DfNBjmouK3Jh87P5wOjqCxowH+iwaDyfGNVlcs3rsF/N73yfPJke1zFt5E+AYAwN8z2JHJcrFh" +
  "Bhzvb+dfW2EWD3ZtiemIa2sQf+wMG7cT2LFwOx2af8Hg+/kBIC5a+RTH97Rhid8wWJ1Ooms3YNc6e/deaEnQiVXj69v54RnG8DNS" +
  "2N087sS3vHS4XVi7aFD5W3WBrwt8/SF+vKWJ6grDIZrBlvn3osJ9zkvjDCnoQNftiDCSRWKP7f7JXcMQNqKSi8UtcL6Yytmkij2x" +
  "w1X7x/cry26L546m2uHRXlqOAZSvBMtP8YozXHQu6a6EXG403fTtAb4VWgY/w/ILOf8tvWdYCTru/9hp5JME0i8KG+1AkfI46idE" +
  "CyDhvSdQ+Ny57HHRlq6FxrRtZeH1hE3P0ubHmUrNeXD/PGYEtC8quraQQJgQz+kLmANCXJpUPU8PCQeCHRsMYqcWA2mRT6F+lvim" +
  "00ICUDkQlhmUzoytTMi64Wz/z9evJaaPhKGwqOiJEjC7tqPnIGa/NFsyloMWzsU846iB2N/IlrQFE9sMpQVG3Pf8TD5sxUB0SLcZ" +
  "0vuI8R+Up0YC4nXsWLxpsPVMoHUZy2+5rs5rOxDmAgeYj/hJeohylAyMXxMk48+hEEInv3ip5b5prvXrYKTz96I33xjJPNaiWVet" +
  "pSQ7YmnAFdL7y0tJ0FVEwAZc2XLdCJ8LnVw5zF/CVrXGN1AN1OBFWjE1aq6tXC86A9QbSQmhNHLvyOs7m9ewGRr4lmsi6pnN/VSo" +
  "3agQuxtW4czwykCCgaQW9+Hg6ZHyrhWwshJq4do2MXepQ3p0juKsM/foPMuGZ4pB01u4JJmqh9tpUnU8pQfQyt0rsZgBOMMRASeg" +
  "PPj2jYz+wBJMva5fWdNCdleZjsxyDGBYe5VVMr+XQGPhyjcJB89wI6iRLBUktRQRbqBZNi8sGGw8vqcsQXMfeOnC0Y0eZcjjhdgi" +
  "d81sbRbcxw3mbYWqF2kdx+xjvQhz8xSG7VgH4g4LFwqqjwVmD9WEDEYPG0oht49rCzu2QfUtgvd9eyHzSUE0MYn5vYqqi+RckRGO" +
  "hW/1MQ+jbTE74pnwC3AlTCg/B5y9wLVTOZ7qM1zxyY8euMphFwKcbl7wdO3VOr3hgjq+GzvrZmDhvHgFm7k8aYMZ1AChLKgDAFZ9" +
  "OUmWtjvb4ev4bZlvDZ+5eAJGFmOdbdCKd7qOQHiWiWIK+jiAhV3mKesDuZMNsQN6/Rg6ECE7pO63Dh2vVFXl4p3rS/BZUglmIZQu" +
  "+E8dsjDFPbQbbdRP7Wux/ZIgq3gh+vFGTQtNZJgEzeidRjQNIzWFIAXAznrrHgltkF4+4cVzwxl46OrQWcSW6R7B7g2VhSq4rFHu" +
  "CmmoNgExs+KozMrTeXsccgV58xcgduF1KbG30oHI1SEKCA5HQk8HascKeaNZNarzIkVexbnu5Rg18M7UJFkFWRheXQ9QBhlPMzDw" +
  "3GBgdptfv4CFGAvyxo//e2h0huJ+bWIo9r/fz8dIHeRK0j501IYU+rYYFcL0IwtMEPc2aDqt3johuKZyoJYRWVgKuy5L46XB0Wcf" +
  "ybCBqHKOAXR4JRUFaYpHFzc0ZT6OYiZCxO/zwhFkF/KdL6JwO9aSKKzpH2GtCYjBI8e9eRlO61PAKx+myPBkzBVdaI4NtZCGVVkB" +
  "mUTg6nUzjewMAPREGe8veSvkiLwDhOIvBxpR9nfqMLvUGPY/LaCNd/EOVEALJGiIgLYhcXV0YO12wj5rkUQqcI7abetAFslV4ZOf" +
  "g2o5uo8Gk+gQXa0d7pVGM2aoHfIUMwZeXi8odZNVqCqQOVSEXzbUWV+6CUKORrnlfg+HKKo4My8+4zHIQCK4vB/8YTX2sep2F+RE" +
  "JJUH2jfCGROj5zp60+zEA0kKVf09+S44LHz4B2xFGT1gEYXMzrBd7Yw4OD9ha7qJQcVYtAgX2SL7VoQsnPpHTLaWWVTlClsZ6ZY2" +
  "iwyiXEp8y9wEl7hrUGwssFhh06IvmVkosAmIjAl6Jo50+LLPjmzmDheQo5aai3tHh6AdsLNC5IGZMthE01iuS/3yHg4JRcBnYBRW" +
  "LLSTTT6QhnjAz23wWDC2jnDydW9EwIDroEt96o9pr7nI3sB0ae9qwOFTd1NaEjBpQK5GW4JAao3+I4cdfTVrLGYJ7EvzWJ92o7PS" +
  "xu7cWMH8RYtRrKUnTA4/ijCws3r2ssW0F5jZMx+dpfZaa8nvHTdR5HMaFX4bvx0I5vGZrDGjANyFi+IKj7dl1453D/lk03tCxqep" +
  "Ug9HzmW9M77xAnc7AG5otlRYNkfK1ty5wCw8wrGEKHQ5DeQcWTYynu325jytZyA6Qk6GO6LvEA0CyK1bulzaPSzydb/BdyoO3jma" +
  "vdBlLHnHGqNypnzhah1/lVR0LLvhYHNVwtVK4UWDR5YYAfGC0yAaBb1Wfzb3++mIczg2V5iDQQQFvkeVodAirT0j1jVbRdIiATva" +
  "eNLqZC9kah8GrmHWGWkf5hQO/TPfkIpFqb6jzuM6uqnZlF6r8bj8EqEszRHFoHsaj2ZvlZhiOlOu9j3tH2a9uWwdXdQsDqCB+WxR" +
  "asmzCI6GL4ObOmCTLCcsxfKmXyBaybxlY3CROVkDL1nMcnDsN9x+F/Vp06YGOxDV8k3jn1XxWCIOD1rcvakzqH3UAfglnAPk7prb" +
  "KR1zFvuVUKH45aNaWH1LjA6K9h6D0XA+cBxk8nBaG3rMYv9YPMy4jDGTEWH0+M5ZfDzwWEZ948yMpw4wG8rqtc6I3QZXipCGJA+6" +
  "zbUu9C7MaQBGOB4VaWvdoKitVl+Dm+QVsqN6uMvgws5DeqTY76EylJFq3duHpNviY36BYa4RNJcTmuylG9WZmIvYaQGlPdfdmr9n" +
  "CgACS0+bEIT7AjPV9XkwMHbzUrFg17MO5j7LSs8oNyMGkd6MUQHVwLbQ4umPQrK5Kdzq0Icqe91NXYCWBFwHdT54d7BvkcFP1PZe" +
  "Pkrs7VDPXGSyr7phoNdNIDSNjuVJKLX4U6umcxXVwK8CEim42UNZg0BdYYZQqAE6hkRiXTXR2zkYhvZ7uJE42u1+dQIy5YghLTLm" +
  "I1BSwgXSL2HkHiYGVuraeLFNgIm2lnHfJq7gJHwnXYZnPx9Fi5yxAlfEIakmrMllHAVnxElmGOpCu2njIDXFnbmgGIUudWZx5Fix" +
  "8qWBSKtP4MdFVaMRUoxicZK2qKDuzbXX2IK6ik/va8lWl2Q7grHDSX+kAF2xZtJMZLZsbPDS6alHz68B5pqV7mvHUN2BobXAxtpY" +
  "X+pEPKDr1mhp501iHEFsLbxWyGRJ6cShmKtZukUDuLQ+9B1OjNMURNy6j3lHCigv+YtbkTK6kYE/RBUP8r35Vg1GYVHquy0vEqpR" +
  "TFJBqJimBDkYDrle4fblgwWrJbuEoZkCuyNjqCD65SLDP3YBDmgc4xkA0O6jDdcHB9NCJ0cgnI5AlVqR8tnRp0k9AdNSq5Q0xJ+C" +
  "7P1MrfQurF8bGwH4uFdX2ZvffCj20g2tMNh5fpGMsOB4LseoOQB5TTGHq/g4yT0GAse6j74VP2n1WDc+l3JjX9oahpVcwB84VhRC" +
  "QGEm5AXqehQAs+E+lmIZREJhSlZ0rs/xHNqWv/TSR0ASNtjKiSjKgxn+nt+aikeJxSSRIBuSK0UR4LFhko8NHlhiomqUwRJDQeQ3" +
  "xrFWaamgtIAR1TbwocFQXQ+gJfTXr7tZSBMuS5EAfGVcrIxyHktJ56m94WWgIfxtqkhLOUxWnMsQCehYwqy59KtI15Aa7dVGk4Tk" +
  "AJbdO7rDwPK3HGt6lyl0T5hNYsqHaKFJ60YIN7NBdHCtyU0TkdYEoJU9VlyslsyfURY9ewJDGpVNgfjVSO2ocESjZiL/VyupNXTO" +
  "VLHl/lwwkYHlTwZMUSi21WTO7qRZjDmBNbkVCbzDWz1V9wuRczO1/BIGHtLKUpp7hASbrXyPOs++fuZ8TRA+AlGP5lfDWmtDsBVv" +
  "D/JAZhPIYkQiy8zp5GLScaow5CdmQ+R6GhQyX5ZgmdiSSOX5kOKEZxMUlMXyY4EnZ/jomwVc/3SNW7SkRvQEWkImHtn8pgidMkwU" +
  "TKTrR6TNKiucrSzQKnhCTgCXKByqCaEQlr9KiUAcuYRUbh+J+ifHhF6PASAMRRFodU6piqYZ6xYt3D/McaDWZc/7gM4XwCGtKz8G" +
  "/KHaWaGXJRw7zUnKNYKIWGmV3uC+zBAEHWOl/PItxOi0tmMZX5tWczZpcbAyLmZOvg4vgYnkPHO1Z47omflxe1GfgoRMGITpcefQ" +
  "+JFzdxtaA9eoNg4x8P2ovamPYIo70ImCSNFdEahPOKGu5IH1OIXbAo/CiYFV9ENSlkrQboC1SdKXS0qKiChMb+tdYj93gGsXDU9M" +
  "6naoVvmSSW8iCigfbiUlslwbxpDT8Q8ZPJSqeZozWKX0qBUxC9Dnpo/tKVBqjbmMzN5YmvXpMXfkgBhC5JwEisqwrriGsk2aYLPS" +
  "ntpJDvBrINr2UIsydx+9LpasVdRmvTQGp61Ce44CPwIpdyGQbWFFM0Q6pkzNDXhyCh+O472VMymAjhSmBUFDBBzVKCbm1RfWIyHM" +
  "4pDrrZUH5JQIZtoc1Fug7A1gwpG85yKh3gqA/vZdv1RaQUcQyCNC6b2UUjbbg31bilp9ruBYMDM9yWcSKDbTTSwQoJHjYnqGK8rC" +
  "Tk+c1sQ51gvCmN4xX7xKt1XPTVC42dGPbPklsHRISzPZKaR9tmZlLQ4HhAYCmU2tqkQZfA/EQ4AYQWdTH5PX0WxUjfYiH7/+oC7k" +
  "n1LDFZPGqJqmsT1K7U7XEgeEinl7BfBcy8Yvkby5KkF06salkb/lc1cY1xFWEm2L7/7EYEXVBcT02Vz0GNnxLOgDI59O2tcTzjeB" +
  "eIRLVRKfc3VMQ1+URUgvzj9i1xJzv8Fod19SM9fS+0P3ZVE0drBEqAd+vKWRGk6jnxZG5zNqMaIxZi36rWIm9VpoSTO2IgpCBZlQ" +
  "olAiUdzoUnW2ORVuV2iZU1GMOeLMep/vgT1Uo+KosXjlzjtm48B18f8WxdJiJrTA7RiHg7BzrDHLHf/XC7L7PKCYuBWb/Tr1OZOh" +
  "ldyqqq8uv2pvjrSsDqd3WGFsYa+yu1/Vr4kCbm1yWZjmjHBd5DIjAxSgWZfFfpnAIE3SEErfjLxlDYnzgzwwNMn9lVLXZgBA+Zd0" +
  "+i8Lo4IE7UklkrHsLxgCzljK3nFIiw2GSWSC6HY2vk3AyWRRYU8x4JloRU+FIAs5HvqyRN7PztR0Nc1IwhaVUV3dQxiw0WBFjYss" +
  "Fdo8bqgiZ5JrqBk5VA1aLEA6fJ0vXZoEGcY9llswgaQ6nGFaqlsWVNX23phkcIU5ZLEhDZjEQHeHGeXUCRsXoMwqYU/0GJzl69tD" +
  "B/u1l+6jSKeJC0SxB8AcyqmVbhHwHWSFs3Glo2OZ2qSFhVNvzCRKSdMEo6JwER5ShinOpa2K1nCoFS8ubI9adFxisj5iu6i5T5d6" +
  "J2g+JuIqBzrcxdzkk54Hgk8UNottmrGPn3fXALJUoUAxUySKmRuquqU5ay3YW1GmQSTNLVYFiugFdPW9r5l7lpjmJid3Um5SOjWp" +
  "O7XYwVafS14FplvkvcmJHQ3awrzBAsCOC1LOUsG8kYusxcig5mZXHrTwT375jD4zP5etV6CdMlpn1M42evYxe5VaJm8jVFUh7gwK" +
  "t3uC0e5BmQrBbsRnVnT6VXpYqK9IToQ5QV3KJdCuxZR6d1fBtFyQEhcV5JBUh22lDpjKtwAWPOXhtkzIBVXXvsjkkczyyNx56DyE" +
  "LTbMfvbsao14sywNjVNjqHtYNR8Xht9geTvtZCcU5fhF6mghV+lEgF1VHVEp/DOP/fCB6mGaW0EBT4V2dtoInz35DCuHYPhVeZLZ" +
  "sJ+hWSiOgYUixNMsz+DxtKXFZziU91CIn1HsoIAlxouUQ+I2FcSfLjG1Tzbp4gq/vbt1WMKyMVX9x0A+PLu+UH3/6aWbh2cQBRkk" +
  "0TVEdXFKSKt/S08hvjHikxJCUFMKNO4lpD/MtDEwXBZKta4NLZHuVoq/ZZF2EMUrsWnHZwO1T6ZfPSQWOoomTQetGHwJdT6leGHp" +
  "xFDvFnotiKIXkoHQVnfaRfuwZlElTm/dhNTV+XBAInl3OZt8DmjBM9hwZwR4sWpH98hLTWRMjHUlZlLMIucXHRzZ3r2v9H4tNv6m" +
  "mEZd5z/xIlVHU0U23mZnPX13R0f/WJMe84/FMzZvbQLYhUIauzzmhLLdY/Y+4mw+PG/x5aqpi4uGMJgBXjtN7Jnwz63Si98ydZC6" +
  "2ks9z96gDCTaafIuH1ecw5zB81AP8vQGaUt8pkRJ8W7wNObD1Ao/EFOHqGWGMBLtCgVSIBRu6fCcTZQHF2/iRBQModTLPFmEKKDi" +
  "HAWxYeqldzuWODBECcEHZYrCQ8B9oGpxo3sUXXGyBIbnlNNQLcz7bhjnYUSSIkJvqnM7DPY97Y1PDhJR4WBQQSFYNuCA82pLK160" +
  "WEqnBmFQxyvYODq8X15q0dYyxbKporOGutgig4/Vo1Q7Xxdt8tWaPJDPBMSwa6Phbv2JBI7tO7pTSQPrZ5nLclKUYtlub/dgg3Ug" +
  "0Ppzs95gt2l4/Z4/K7Il8u3nmn8erkE8lptM9wBxriS9XAbxrDU5Mku52OKFmNYSk9Ouccx9bMlirhbyxBIvzVwH9PHoz07HMF6V" +
  "w/Mh1MzY1bO4MxZNuN1jM41Wq6cWu1FmD7gYQhmV7Hls8eBI+vk2c0zuP5ZUBPDKXf6krx4zm49l3YRXLAbdlvSvRNlhTSkCLwRs" +
  "C5QT0C01VpXcemmNl41BReNpqq3MDyz+mcHF6Q4d9ortjo+f4QevoMfiep7MJbE0fpKn0iCFNLKiycgeHFqJTQusnXhzkblOp4Fb" +
  "tnnXa0QBuiSWjuXxtm7KDwAOFhJRnTE/TlHBolDMuwucfR/KOZZbPW+J+ACCRcW03DQ0/Z6y0bfEne+9f3ns5HH4bWFgnhy6u3L7" +
  "B4hgaHRzPtRk1GBrsEg98EBDgE4/BXruG7ppi2fRrsJzgW7YYrhsbswyGx5Xh4vTzOpfrVis21nrXdrLKtwzaCbYXy4lQKIg9Mtk" +
  "kXc49Uf2VhkivjZ/FTZTRcyM7QnK+OICBwHncu7NujYn8/2CrK4PfmWBKZaXo2MAU9mrwK5hU1j3dxu6+SxHfaow02k/GJrI5t6v" +
  "lPIRAJA0U1kzFj9kMNhxuI4OF1BJyInvrC+WCGpT3D3sFHJ70UIOT209hkqcnzmsLpeF72zGPIY8vvtWhKGbEtl1Wxxv0TJWQt+U" +
  "8xEGQ/bjW3Bu7QaQaiXMN3RngHu8V/yf2rRANtiWJieT2wdbbA8iAKmgHrtQC93Xa8ce4AdHmGLK6TWKR+OW1PMw1wtq4wehk8rS" +
  "LHHlfrGar29pPeGwNEhzWA/heMoL3QVdo9WnJbtj2J+wHZ8JmkocJLYvrZEY8BhZ3T2XMeZaFDgn8HG4TXu6G0Ov2Yu+nx9BII4h" +
  "DYc6dqupU+zT35BNTezPtDFpb7fBTJXOCtdVAvp0zAaOOC8mRqJjNIk73IjFdOmcVZinikI/qZnHojDEs3sKEPcIiJ2Llc2QZp6n" +
  "gIYKc+6Qp2uz4Ly9Y44XOcnMLH/RGpCXLi1civGio4zhlBbxuL2j+fCFcDPXo7QYKjCrepl25xMtiRd4Wi2vgkKlLcW5YThmdj6R" +
  "AZHvEwGkG261NCsZdA6zsQwxXVg9dtFXMm9OW9JxuIT/EGw63umbKoUHrIfWfLclfh2NZSQc4l6c4dhYt9SsiG47GnNKP7vCCUuG" +
  "43tjy1L7bektxjH8N0Azv2UvC2yRbcHWV6HvYxO+qgaWdhIP4bjf8mOffw4z4jqDp3e4Mf4bVdv3uED+CzQEPbaSf9fgs1yAD1WV" +
  "94aWBPp7Pt96Lcdmlpj71PLuTx44NDbhjRKWdx8hWL21E7z7P/vj/5zyyL9hMP5w8vDflh4dAvLfCv97Bk/Xlv72CuMV5oz/0E3E" +
  "N1y1/xx15/9jhTHbZ/hHDeZIJe1f2dJ8h+t3fIVJ+lY7ED7UovFKivg/felbrOYmskIAAAAASUVORK5CYII=";
