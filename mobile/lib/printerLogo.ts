// Receipt logo, base64-encoded grayscale PNG (144x184), derived from
// assets/images/logonabawi.png.
//
// Cropped to the artwork's bounding box before scaling. The previous 200x200
// export carried 11px of blank canvas above and below the artwork and 29px
// either side, which printed as dead paper right where the receipt's header
// gap was complained about. Cropping means the whole 184 dots is artwork: the
// logo prints slightly larger than before while using ~16 dots less paper.
//
// The width is a multiple of 8 because ESC/POS raster data is packed 8 dots to
// the byte, and it must match the `width` passed to printPic in printer.ts.
// Grayscale rather than RGB: the printer dithers to 1-bit anyway, and it cut
// the encoded size from 38KB to 15KB, which is also 38KB less to push over
// Bluetooth on every receipt.
//
// Embedded rather than loaded through expo-asset + expo-file-system because on
// Android release builds a bundled image becomes an APK drawable resource:
// Asset.localUri comes back null and Asset.uri is a bare resource name
// ("assets_images_logonabawi"), which readAsStringAsync rejects with
// "Unsupported scheme". It works under Metro only because dev assets are served
// over http. Inlining removes that whole failure mode.
//
// To regenerate after changing the logo (requires Pillow):
//   python3 -c "
//   from PIL import Image
//   im = Image.open('assets/images/logonabawi.png').convert('RGB')
//   im = im.crop(im.getbbox() if im.mode=='RGBA' else Image.eval(im, lambda p: 255-p).getbbox())
//   w = 144; h = round(im.size[1]*w/im.size[0]); h += (8-h%8)%8
//   im.resize((w,h), Image.LANCZOS).convert('L').save('/tmp/logo.png', optimize=True)"
//   python3 -c "import base64;print(base64.b64encode(open('/tmp/logo.png','rb').read()).decode())"

export const RECEIPT_LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAJAAAAC4CAAAAAAp0jo/AAA5jklEQVR42s29d3hc13kn/J5zbp3eK3rvJNgpkSIlixTVLCuRZVuJ" +
  "Y6c5cRJ/2WyeJJvHWce76ySbdXriIsd2HMuxLcmymtUlUhTF3kD03oHB9D5z55Zzvj8AkiAFUsXaPIu/8Azu3Pu7b2/nBWLwc/wo" +
  "WioLdrcFPrwf7oN9TXv7DLekElnIUnW5Smy+u4Ghay5gAAwBev93Rh+EQgxNfKkYd4aMj1QIAj09xeUPffIaRBQrPAEAhv5TKIQA" +
  "N1knA/a3VR4BCO6wy/3isw+su8Ag3/teadMvm0Kh943oAwFiiJgaKhZO0zEAwslMHbvrK6496Cp93jpdVzrzRrft87f8X6IQBXzd" +
  "17ggy4ScBcJXMiYYBdrxl88KV67mXgt5F7tPBjvO1oYpfl+A3v1qpum6hjG7Rth4UeMlzkKROjxUkrhOEr1TXLryDVIuu+x1W0N8" +
  "AyTg/eF5D5cjnuP4qfPsGvEnVsawKTUPK3zrr93HM8KEXSvsCjmP85JSP8ysJTldAfahsswgkR8cRyZB7v2Ydx3xOT5vcLzVhLG7" +
  "zgu73gghjV++LMBIPeyTNORPenUuXhA+XAph9swz2VTfclv+mLreDq0kFpJRk5OKepHSRgNAWDYuvwN+qiKr7si+EDVck8l1asYo" +
  "+3kBUTQzv+P2e3/BbzTEzmP9yudyIGlMj9QFiFjRdTgjMCQut6I1FVx4tZ5lRM0XWhxKc+fTV3jNEKaa8fOxjEFarBLcK3OZsjTc" +
  "6DPImh2y2H7szjZtSvLagun/uIsuhlWtaY0W2LUk+LqTAUGqFCY802kHu4xUzzvJu9lK/G4mUEKqSRZEC7NqL6QJXYOZn3IUujxH" +
  "prO8o1Ipenit+uJB09pXSk9MfGesLt2A2yqD088cSaJVEjGU+I+v/MV3+t7FUpIvv4sJTIyKFq3elEIVIZoOiqvuCeX7/WSfc5Tj" +
  "TX5LUCiWvdGl35DQKpOffUUIaMV97cThXrlYkvJNTkAADODkQHp6cdAXNvAHZxnFaUNGOrnzlfMuq3amZtcaxUV/3GI2u1x2nEsU" +
  "TRbrdOgR59orsJ9V1dpnUjUio3svDG8SY3O1qy+RzYTdaVv/0Hb2c8gQgoiCy3Js07YjMVNqpVzcLTMEAEiyU5EaPk5nxOLkjs/+" +
  "Qftl4UCxFqd2SwoxRrREUx1nuvx8lWfYYan3vG8tYwa9anP1OcyXDFJuvoubX5AWXx1CdJUOvhYG5YRBLQ0dfo7bsvw/BhAAAMPD" +
  "VrvDLSIN4SJnMVn8wuWwwm5CHm9eaL253HIbmEKy3nIUx7ObPIZgebDx8QsHzNnh7auSks47OJVViJ7KOy3kQTyfeirkQgAMfbfN" +
  "Wg68WTW0nFcajYDMmRFdvaHAaRgytpp3RkkUELoxIKKNuMOXOWYIoX+kKu2xUduexBznUPNJF0MARjFf9sqqXUcCpyjKnB/94tjr" +
  "DwMwdHHldixk+y3xqYLev9AiID5asDMEFCsZjum6Rjdk0xUv8A7yGcOPfvfF6JoDoiQWq2qeOC4yaoDTw8t1cBExAKCGE2eiebeZ" +
  "udpDNnOmaJloGq8AUPRKA9LNKTcl4W2mub4lI+lcWF6922zGXizrG1nGyZmrOLjrteq1p2e30DP7rQwBAMVvjx90m3JRxkHWUUsx" +
  "iKOdQQYg+iZy88WOOgpKrEzdtUmdV6xLjYDocNbkL1RbJCORs5LIdHWkTSmskV5SMtnF3dL1Smb0fU/atbWarLdDDNYYS/FfO3eU" +
  "a9MhO6wCGp/3mZyc7CiNn04ncrUFsTLTDRjE7Ff6hiK3BxjOxheVsmCmigysFqMnXhulknPLWxXeKJVpvZoqxby3WhkCxNzq0XOR" +
  "5kMhhq+1dLlvEOOVAX/VqpZyAAwQuhz9ItaliEEG/OXrgwoNcZkpSCdBfVsMQ9YlGDxD2kheClgvdqvFmKP2wOiJsLoUcuUYTHyz" +
  "uXZh/GDTwRF/cD5W/9Dxp8az7tV7s0pieqj24CaDXGdYFiq3Lku5EzuuAEIAWSaLaxfc9hy1CUbSj9aclodocnzBbwpkz/NzbzYl" +
  "RrZkeYQyy59WBfspvSCLzOvzTZeRzQIqwFOdtUZ7zsY+AQBQlukDsaGqlecfcjNE8dRFz6GlJ1uC14WQmVfCjJruiOncZRkqapdO" +
  "hatbggAA2Og9nRIV0wVPgCEABtO61zDUQtaxQrp0t2WuMF5kd20CoSk545WjF9ooH61nhnXFZnZPhYDN15gqNTHEKEMAksq/9r3W" +
  "9oZkxM0QAG7yxMye65Ws8vzYwYIHZQR+VbY47cz55TdrgzOn7u9YlaKuV/Jiw+RyYFWoYoa1otXnFyS9UiS/suepZ9xbuaNdhGrm" +
  "Kose3qxTwZQ8I0/5das0vpM7ZQQ5YvI14DXxQC/5qq2SSVqzaXYSF33XmiF6+sV7iliWUx9f+5z7yb80kLtmhjdvfcpUiwAwatTn" +
  "3RX1MgdVqtFye3ZQ5kPiwW20/ftdFiebrweCgighMQPDiuN7tjaEqvosfuPf23DFF39AviweoOIqh0JWjTXBmk1WybUSXR4OpUQr" +
  "UT51ObDknrrN7XTk8jmx7ckDnTwgI9h5ZCHSjQ2MABjY+0u18rb9ia77JACKJzLbRVFL1KtJNyWkpHAgBYpbxBJUVQb/KzmGzcBr" +
  "m8xXn+jP81zRZgIEADJXkIxU0XqNRHPOsYCdpD/OM6QaEgLAt0g2XmmN5HOk7qcv6wCEPvL7ODL9L6OIASBmzBx5cwnv/OpDImMM" +
  "QAKnyGgEigtihcjimEJxTZAMjiPf64/Y4UgimxFQI3/VAu916QSVV4PfQjGXkk3Xhn/ZJ88nhhCV7Axlv/7lIyoAPrBiAs1DI1DM" +
  "tC8XDAYMZfBde5rzGmKUm35z18PNdJ4xihBCAG0NUxYEi4YA8fmc4e3PZAqKTjp3VX+noRVB6sxsjDF+nUvYYS9SazINDAAyJTI/" +
  "57YaaF0ef/bp2WzSqt0LWH9xOPm//nKSka+fRCYmLUVDfH4oEn/d6wGcXxR8shGUgeILkyGxyu+s5gEBAAKPeLyNCpWZHRNLxaIR" +
  "kaqwCRSd0NObPo0B9vD9HLc9ePWJjL9QInLGXYuA4okL3GDmIXzcYb4S0y58qzFkVR84JCJQj1h8jbPzQL7sfsPNU4t/JEtHny61" +
  "numyaIE+zS8Uam0AeGnAHQyRYD29rDd12pm6kilrbvp+Mj80V7WYiBSyBhd85BYMAMKuB7ffWrXOzCB6MVEAO+eTGELOmZPlX1b/" +
  "fPjpSi9FAAxQ5KukmVoaPbUMgfJ0yG2x9RzmYJMj4eSCS1/40ZmzPZtC2tc/F4KqwbI3UQAA4G02s27xXn2AuHMkngi4+z7+ez+s" +
  "7mo3J1wOJ4cQWtMdJIWuyxGYIRftlZLD4Ka+9XZln/l8V3D0udmPnRPqdgnZ78Q+nvMDu5ViYP0zbcCqii0coPrzGGmk8Uv675bs" +
  "+Ybo/37w9vApLaFPBG2URMFqMLv9iu1A4Kuf5LLMk77ndo57txQCUeI+IRgrD3iAwBDvYiu/u2OfUseff7naFNvyBwtDH8vwQD9G" +
  "ABja4n/hkAnnHiFfBv3ZYvrMrq2c0HS65EMW36i152hB80T9LkaOpmpVEq7hLiNCIGXOO2aGG3ZjgcPwbhUpzJpsYNmzV2aonMiv" +
  "hJRLt/TqoHKh6qC5EKMXHAUrudvOEKCRp3fjBU9pczX5MvhNSy+YvP2dgvfWi7PeUn7O0+l7YiXrvE0GdCZmprzNK155MkOOlUu2" +
  "Q/eb3lt1DPGNW29pkwExbjElhxPiIVIyKZFus8yLzvTxHsm+pYohgNE/Wjjm3lFv3sqTLwOue97eUZ21BrFl+4mLnrlzbcdhE8ym" +
  "X+Gb8JOnPVCQ6sV1PJO7br9zi/k9V+swLxAAoDi2EnAsObrzMtibKyZ3brjTPGnzC3soBig86jNRGDE9KAIGgIxlcx0fjqjAHF/c" +
  "3jfjOQqHNZcywk4Owlb9Zydwp+UaUbEE3fz7qW6x1RexWTTQNUMume4ImASufPSffiQ67PsxBoDYTAvfiW69qK7GQw5TCDg5TgEx" +
  "z+eXFn4kFnYN/PQW0WYpw/1b0nLQha+vZ76faublSzm5oItlzchudkR4MNK5Nv1Y+Jd9DAEYY2U+aGb1p1ZjaiTvHRIxl8sDIGZr" +
  "n447RbqnSekMOc3M1Lyj23Nd3L1qs99vFRCyOT5h5BaKzp5IDEvK9D2dqR2wCAwAlNEw55Ia0+2m1SCf3e6IaUroZAkA6SyMwFFU" +
  "PlPtaaIqMMrYz1XJvkqnDBU0nc8XO+QScVaeIw8YTTucLkAAkL/YVgawJ34JrQJC0kMRJedeoRSAY3c9uJKwR811WEEFBX0gcmxI" +
  "IW75zMyl2Uptr1ZCQ89zt+u+bWhvA0UMii8hDSHHzN7g5ayDdhsvhQ+3FiwAgISHqp6nNbmSqrgiyaoPq0CPoSf7Rnlnb1ejiarJ" +
  "hdydhuLK7+8CBECNV/wJOwjWLoovZx3ItfB8RJ51+RAgJjUG3jCq3qwIFiJ4uVUFYwDo52SZVNe27Z69Ydkg2jNjm2Xsge3dHEOA" +
  "0Jl/L9Sr1fO3egGtUQjRnRcuton09VoHAKKw5dOPYSFiizG3LlxRFYquUZoNmHJz0ExsAgAGmNbt69eQF2pbGCCG6Im/xQO2XZX5" +
  "RoauJorM2O0TqyYSDgDATL+18uTCZEzurpPWCDS11O1aNSqMXa5y4Hek5+xmrg0xxhBCAEz4pdTz5iDtMTACgOh3zb2hYfDfI7Cr" +
  "mStm+77F2UtCtI4DAMTROyxH94iOra2YAQBD2uKkhZPwDTWeAgZqsJvby8tfxcz86/ait0WmCADRidyeYj2f7d62GuJcTqW7GxXG" +
  "a4m15AjTHTvWmTWG/FPfLjVYPWaqYdkscgTzosdzmR6MYcjOLpZLjtsc70meqPfzS7yPYQAG6mg1csa2i/KaSFzJ7Q9+38esSboW" +
  "UGADU2BrYQ4y+Nij/ZXaOizZZREbBvAir/d8drXMwgCh3PSpfmKaUbUH3lOrAlMWXqt3oMXju62qOZBXMFsPCLEaTldci8nLQThh" +
  "eJ2HL74wVOuz8j6qWy2yLIBSyi73XtGf4vTxAdzRbZt+4Vxvw3szAoyuiiDKP2715PUaKdEF11KImYyCBJGRML7OBQEAJcf79/IS" +
  "ly3Xl+cKFqfTZgoHvPvX2JlbOtlPujb3SrA5OXSyhrtZBRXY2n0vy5P65OT9WWSzj+8V2XUsww0n9Jz+wEYSS1KvmyWGuNueS+y6" +
  "szAXW0D2aq8+XM0AAOjJl6Subd0c0xG6f75/e8uN4SAAdE1Pj0H/C4eKwNsv1Gy7nPFfKQsj7+H54sc+yr9Tcyk98mo1qVTNefZO" +
  "9IHX4612q3Nnj9bfsnqPJPvYgRBQRDBY2VC2i78RHro4uMx4Hl3OOQBQ+sdY1i1SvPB7OrmuYIVYzd9M1oQ3sG2UDJ2TeFPUHhyo" +
  "PTB+OrLfHM9Vd/bLd67WefCuXUANjAEAGbcPjg/sQBvj0Qae6Rc7O5vaLjMHMcie8hTKNj3+p1drNFcpxMzVNv2dZoYh9eVh2SIk" +
  "TeHFcle+e/rt6kaeToz8xa61WialgPFlK+7ri2ySNsSjn3h9WfNJM4fLzatcQACI9D8WVkzQ3ni1pHe1ko8YYwRtUDp/+7yuB7U0" +
  "ri0sVbuneqzPZHdbk5t/RV3jDcLo6i3c2Uumxg1IhCrHDyus88GQVnibdZC1fgCTugaO2LyWA9JVQqxrLWxohRnOvFgo8sFslg+Q" +
  "3PyBxamWzguvNda0NSK8kcmr6xvvtr7zD6WXj+jG9k/X1tXS4nm+da2BjsD2UEis3129TlDepdcBFL084F70WtJ5rjruWFLvGs+Y" +
  "NpNvz9xXzzasf/PmE3oHuf7T5E8vMvLReznKrEE13mdpvmLkce/tm73rBfddAFEydYQUy2GDFoyauIxHOxtmsI4sVR9zbujaEQsv" +
  "n2/xXhcGLDw+o3l+rcfAGFNTQI30u2svCzaijF1zp3frBrHnJ6vHzbVRUVWCrOBPzNzHsxnbn/yW8wahBkJVZxMdhOqUUYYQAFA0" +
  "+GS8sulXfZSs6k5QiYyEg5dbQtf7a+5dOq4nph2VUsAU95tTRVuS1I281f3GJw+sdkM0TdF0nTIGgBHCHOF4ngfPrS8+4dc0xBFr" +
  "VdCEGTr2ep7dfZCssRgx7yHt3I9NLTdon98UECOVs8VgmtqZapiNbE2soAr/sONzexYX5jOlPEDKpumabuhULzCcA4I4UUbK9oO1" +
  "Ll6tYJIZOw/hlnNvZdyf6rnKF8T892oDP/ps7caIuJtL0M8S4UpKcBa9smDgtp/FdzSr/FO/b+sNBWych2U8OWYCngEoBdecqQFR" +
  "3J/q2McyykBK0PCmdoD4M+cLOz5xzcQFYsEHiiNnatm7U2i1wL2epckxv3c5VN9fiVjlocotv/DiD6y16t63twMgZbHB3Vgp9KbT" +
  "GBgAijTVMdOc6ZDl7bJ1uHO76ht9vI2rbH2w7fBHQtf2EBELPTS1E94DyxBD1/gOwj5zaPLUYKzK8ZHy/AV9f+J+6e7NMcXeGfL4" +
  "5MhQdaVFnzLrVGcAwAXsoE6tHEKvNgRsy9Gt8440v9k3f7KnM/jm1EfRuvo9AwR11QTQamgHQBHaeFxHWa7BFC+ZXOtpZCgXSltN" +
  "HFP1Y9/gP1GbVCHT5RYk5CrMBCrVhaGaaFgsAVGKy37T28V7bS95A8mqgTOfXPG/4DlUztHZ7rrZr5T+tkXn1lv/jX69Xu0pGnyK" +
  "1GH4rl6//iIs1DaaecKJx/7+7s9qufCO9kRkh0ehNsFklwWSF+fkkKwRt1aW1aEDs2eO7HZE0r4LDfbcyU1+fdl9st/R6Ig9JnUb" +
  "aFUg6In5Wo2svBUQGZo41m6gyhvYyTZo4CGjz3Ex6orlwSCUXXVQDCFgDP/0S3sdk90uKXF+3vYPVHHWi6IoCCi6MqrahYmVO915" +
  "6fSOqVyH+t3fqe8Ls5wzYtiNae4xcmCotKnS+K3k5+lqNLTSV8K78scmO62o1DfK30EunHY1bCBDDCXTLhqPWvgQz9a3+FbbVCf/" +
  "sPmedE/hcBHbupHeofIcBqNS0DXNnT8F+fwRa3FYv3Wo27p56fu/Y1cdZavhsC0Ix9RPhripoGmL/58cn6IIALMZxds3grIeCSCy" +
  "UD37H6hs5zcSakQdnoLFTJZraxEcTu3zro/sMPwb/5WMHJnt8pjMlhXa7tAYo4xRiikyGFX1shF44l6Oq6okui8+31MJRoRUSPW9" +
  "nr5NzW9JpZ19d/7Kc51dOgcMqbpZ13lweig2yiaq8gS3rpOkq78h4S5DpfHag1aYG134ySi6OmfDUGJeTGRzxp4dbVUO3uOe5RDH" +
  "i7LJajfbHU6se2qa2nlt5/zQP413ODrnhx3Nc+W0vXZxcn91jfUnz04FUi/eYn6VYQYArb6YxZSx3kYAwt1LZktF2SdvKNSIWmJZ" +
  "Tb7Ly9ibJUd5PmS9QiOKIz+W7ikOZO2CzajoBFJmSWeMGtSIckyvVCjm9GOl9otdxulhR23PKdxxunpoG3v6Iweyh1+q3FbCqtXx" +
  "1PPbGgyMmJVOScngXX5ATLCMkQK+r3m9SbrGubqGONojQfmw5jGgdT2g0f4up2N7dfTsosUp8kKl5DQAASG5opVgyczpqcJb9YlQ" +
  "c1NInx3zbTvjTiKl5u3tnT87KjY0bubnxfC5xSltnwyIYUsswTd16BgQmJUpk23vNYHM+gCNWcZZpsUO4FpJpW5tvhqBUXxppDk2" +
  "NiOGQnR+JV1AAjhFjJieU7HAM4QJopUT7anufExgLnkyIyXEoWBcME6Vu1rNgmxJT12K7rRN91ZTjKhYnjGLTYABGOaHzEYHRjf0" +
  "ZbUjiAEI7da3HM1kva+pFJgr+/qbvnpO3UZKK2p50ma2WziLnC1ZNcoA2XRiX8qYuAw0SrF5Np4UhsRObludc2q+2pohRaWxqjQ3" +
  "v4sSAOS1FUsMMwQAtlDcpNjWeyvumhpO86hKAIFRdRe1r/MhCFZQONPiX87O6JCXrS6XRYuqKnGEPXwl7eAQIGYKmFsXzBwxLSFH" +
  "fcTlPXhyKe+Vp3IVupLJeesq+pSZJVZv5vYPkLU4X66fdtAb+zLqlTAPDBHqvq78tWyrO9xeYwmWl2by85LVajFbhVxQyCliOWJi" +
  "hKolIz7enCwwIFwpQ5xNDrbrbS4yiCUGjBTb0Fgm387FVr2lJXRewquCw1UxKsKNWIYoca2sJltsvaBRrCl1TuayFCOK7ZaZgCOf" +
  "XmaSXEpnOVkWRAMIUydqOoRiNUVcYbmmYI6g+PCC4a/ersZ5IaepeQ2bgRfijAAgil08rM20IJuzJF7jz7hrKdG21rC9LgFJYysO" +
  "56y2rKNBe6UlDDwtFRKxSswkS1UcAp7DWgwXlqihQWSsR+eWTTIeclRXZt3Nrsy8EVhMCaqTk0s5KwMEYKu68lixcQkbNw4/oKF+" +
  "wxHfeDacg6QYzDgCo84qFTIVl9tpcuhmJe6hw2mKslFk2HSNqWqSv2DGgoZNvY5sMDLorwo5l/JcgVCPtaRl7QDAqOU2YdX0IOB7" +
  "a68NjLh3FgrZdVERUJxKYmxaFhuczlKuljFDKbsUJM035M3B3hK3jEyjxI80UWCEW8Q9nFCOVVtGgksLvzB9bK6qRpzlyjzycHrk" +
  "hW0Vj8+FpIYrD0C+6/rm12cdq81VhOi65ITi/im7Io+t5N0dK7NOXYUanQfCcW2VYk0xohZYMdMe8hVEb9Bm4+b8op6KqwifeWTg" +
  "wr5OceKSzaYtpJ3VxDF9MtX3yhlXecl1VSaur0teC4ghhBHLqZgghOjV1ziZaHh1WlhhpkszxKyrje4pmwEciZikxlc2+y32obBF" +
  "p4kEUviKtcAYLveygmmo6u7XVqz23Z4Lrcqk0GC2+M7Q3Za517nxr/bUXglqr0+Xr4+pV+KRgWmpPhgM1+Arn7JopeBsRY3FeT1j" +
  "l5GlaZoBgpIQHex6c05dnrOVHCpmdZme08iOPWYBFL1twLZtvPo3vuZsn2gRE3l3VbV2aSpSb863qbq39FiLxyDvPvLFUOHVxy/N" +
  "UatoVdDmB3Y77SIDBICKiXzZ7a1whlETLVqW/ZJFUnEpw6ekSRR4oYRUK+Z1xKVtdz1vYjP13em5AYeD5KKd4YeeM21fjk3ZGiJ9" +
  "+UGzzVsNRTIgdI5+5c+dNyghc+sFuvzVv4NQx3ZbBWhh8S983d0f963OQxhF0VlmqmZSTI31Oapaq6asXNcJcRsDVjb4+XiGFxnm" +
  "Yj07z+u9J5JelI6LXLkAcy2H3lIcS2JBcL926WHneYuTKymTQ+bwYfLfHRsjWidDFL7xrbtsC3VhxhCRgs3C5Nk6K5OAodwr2c0C" +
  "07CXIr0QrDUKEEwJm+ynu0AH9aJSZWfDigMg1YvcR6vuHrB7XOHqQCBcEWpJGLd4Jys5qJmtuXMi9cCmYrzaMrVfsPQv3LZxHrQu" +
  "yCcv/fPuoHNMr+UMoMxAdmib+GqmV6I4+STdXiZFd3hRIFqa6Jlkm4VxlbRHx7DM+3nmmA0UjaKtO6ujnWrMIzDDMDSkKfXBpSys" +
  "2DWrJ6Y63fHSgY6anlYWcYsB6+lA24YTn/iqAEX/occRSTXG4hgAIcSyyvx824uPMgTpchAnCrxLYEC4olEeSiy9xfwRKyWQczRi" +
  "AOS33e8jW4WJdEd0kEMUEEKIIPvFZ95eHGjwttfnVkqZjGBoTKPGzrvPo5zCjmw8y3w15kH/KNjio2hf6GJOYABgLCSws86WLmIo" +
  "il4Nq8QFwEBbHuHtA887vYPzdsWg2Z1pgQGrncH+JhHFp4/7Fs2lAgDOxRVvfmA63HqnYW4qzlXq3BlqlBDCmB04cN6UlyIzHL2Z" +
  "UKPcKe9EqtFdaXo5ZkeA1MyS18rTLJp3hGr1I1t2LkRl3Vq0FEj0kgVi2dO6OzSJG13usg1Alc3phsnX2hKVg8OalE9LHGLLvKum" +
  "YG0r8ivZ6Ciut6rFJKsAAKLQM5RWeWW5kd2EQgxfTC/iTf5yua4mXiFgqOXGAFgy/Ju/dgqq9p3vq6sxJSy+vGJn+tbGxjqv157O" +
  "SFy0BmQNoXNK4PDhucozCeWlEwikso4Y2koVpSZR4kb69SQ02FVsyyzowAAQCtamTSuV6g1LTFcq+WgBemzZMVTFghccrVhTLYhJ" +
  "YnJWzI8C3PWvLz0QtiSXQ5Fwqa/HQkkxUV+ZmGqsf2IPqp50LBBNWCqZpB6BYDxTsNgww4ZFXim7uX/1p5J+qcGKktnNhSm6GuW4" +
  "ar5Vlhu+/vHtG1RkLmsZQy8sKalsKiRVLDPxGnNRA2zmhZULvfb8rTbTxb6dXAai9WE6xOyAy3HqIOYFaa9K3HJfwdSdKOltLotZ" +
  "kAgPGWc54ZAyjvpFGpvy+r31op4zRIOzpSdv2bJaRgs2B6xHf2Y/oJEbswySJ+Y0PWgRMd8WHQdetNoEIGlzuHq0DxTaFF8ix4zk" +
  "9GzFuUTyxnYTzTjq5pb31k25OtoOAIrX8IwZ3HLR8Kkl3iiD4vSQ7JypOeD31AfzmZzDnQpdaTtowz/4vvlj2kY8u0qzNNcQsngk" +
  "qiq17pHJGGfCgPR42OuKnYdSoco0ZG+bHM/aRRFpdKeB9bgacJydjC7BTlLIG5KTAuNW+hmi3rh2F1yoDirTLVsaZb0/QXwhf0Xw" +
  "6EXu8nSaAi1bb7XrNwe0stW0KEpQolRozZ2QbTpQIalU27K5Ya2smQL0LTk/bZlIEH+51ZUVVFXjfZOB88nSa8waUb2MAknpjRJO" +
  "S1pJ7tm5NRG/t0MXEcYrZSJgyMkthmFbg2AK+cIWLbPR2a2rgJQCX1U0gLe5cb0No6KBQBgVmhKJLek+tWRn/PKcW+yLu3VOaC5R" +
  "LMgcWPmRXfFjnh2LYFiZyGhyk0yUBA1FjByyLswZF0oiZUFfUc/OufxSfTJqX3uWbli9Zmanxs0oxKweuxkYB6rKt5VPlkTKZ5Z9" +
  "vnF1d2xIT6JiOWD311il5vBCkAN7UQrwK0v2w0eTp4Yeez6PRDrFrbSbACKS4OSGWvWhRYBFXjQ4pU0sqFgpjD+bs5cun82IOGwV" +
  "vBVzoNMbenvqyC5ViEPTDF2vn57eyinWEakxnQ74pEEfiZbALeZm7S5zy2yccN5RYopJxqiz6NFLWVQsNlSmAkpHBFWwH5T2E3PG" +
  "DBIuem0UcMUaHrDJcL6vqi6XXS3K0fxSayKXmXjL18iDzt0AEB7OBaSyg8dIKHIthVmfVFwK+acsjlTzSEPr+G02SVlIB1ms7vbC" +
  "PO8ODHjrq5/kuimTFEZSEyt455zLIhusYazcUzHLtM3ILddMWH0U0erTPuuwdKCiGWVgQA0e+gqe8WR6JI6sdQdarw3V1lmmOUkQ" +
  "RIQE3uRA1Z7hqH3S2ly0tJBYqNgnryS9ak5q4ll6JuLKTYutH9leaxJ7RMm+NGAT/Q0zxS5/AvyGJVUWSpH6Vj1dW7MpUkgAlWVL" +
  "KYjT9SERkjlgGubPfebrvrFkWQ9CZeH1X/8BMTYGRDV/VrNho1LKl1UhlF9YjoatebOoq1rV4qRZ8SRwJ2BRy3Cvx6K8sxjhCma3" +
  "AYtF0TBw0LVUvH3rkuC5VN7nmfG6KpIQwQ2GUZ/u83ti/motYJ7UOJVnlF/+0pePpfWjp+fNLjPn8S7/cBSzDQEZnQ1N1USnFPGY" +
  "KmHv4HijL2uwEsVFf3YwO6dU/J4sx5FsfcNIOfLyQoifEygUitvtiOZLjdxwqnepuPmW3qo4DmUKplY5WW5Pu3qrm9KFQ5APlMXq" +
  "nBBE0nMf+ykpi2fP5qSGfLzM0Vb6OqIbAkJNwaawZHVa9EjKbLI25CecXJ4wHRhVdCWdXDKHDQCERkZaG8snnbc3l+eCuhHdbTZw" +
  "fqVkaRnMH48X/IZ1ORFGyxWhtE3POKuKxV21C0X7lC5rdusUdJf+8nNjRrIGncw3t1nUhQWcdYtT1xyJWyfihpkrJWJzqZLdvtJu" +
  "aV9ZGGxGWNcRRWlqEboqWmBJNMToPD+nZXOtfZWyMty9bO04jSGPbCteUrRPVc4a/pc9VsoRKRn0JjOVOdeEWEijQYcq2WJDvfUv" +
  "ftOFjHZhypbWks5Uog45uZn6G2lZYWw2VnG6urp70Z+kvBEDjdu8oFMMuIhri+2WE5rTtWyhQbWi+umiQos8mRGbDW8JLM5M3/5N" +
  "fbeVD9v3LS/tiGlhk461+tyinpW5kQXbYt5KncaUqUcxN+Q2t4sT1bC4rKO5YrtuLQmeG1Q/UF+Du6urfXMIJk7V4mm1Op2asDgU" +
  "ZAi66ifDuf2s7AyOB+vOCI1FMCho8wufOj/dzbz+SCiaqS7I8bf0marXZ8K2+ZUdthkX+JesXdnT4ZGkR27O2/190cBbFx+47eiu" +
  "4rITJpP2lsWJek4xCcTGNqIQgt9KtnQHAC4cvjSSbilXbAlJm3HZgIJkOAXsPHPnLSvR6n1tBdVd1DBGSKo2vIeey+XFnc+U5V2V" +
  "sYWgDYeNgokp4qZlNd4h5XO36/nZhLU+natHVbJSiJoi/261n1a3lwdnSYs+Ye7S5dxwMrxhbo+gpcNRGnjmseeOLHs2sRwfz7UK" +
  "K3Gzx+AsxEwtmWGPJxXv8BipiAsjXeEMg5ei3T7PAvLzYk370gg0uc0e3VmfViu3C1GyXcnXtSz2OdvC7mAh09G8vBLreKQ+ci7l" +
  "rps7G7W0+mZnmqryyfk58tv+jXquDPX9t8PHXnwt5ulpsahZtWDuqLHY8nNmD2YU8by2iMNJl3RGhhkzwbmFsI4RLOt8JhdrdpWx" +
  "ZXC+U1bJ3FHZbleWm2v4dv8lt7kyGG2yKhVen2r0TszR/eQ0cxqV1ABt7DAnp/SwkchpFouy3EPRBq0F74JGTFuIVtIoFqweC8u6" +
  "w9WvnmANRU7AWkNy0NfUfF7xThs5EioMdiMoksDI/gU1oZ4r7kfnOl1FcbYg+CgLDC/jkhMyeWiNuB0MEdUppidKmfQQcyzS6hOO" +
  "W92lrDaZrZbSsnNhpfF7lvvWjZJeKULQmtvihXQsni8DAnvAaWi8HpP32k+MEQEAKvXlxyIL9JCY4WBZ10pZoRBBJmGsfWnh8YsN" +
  "S89y7oSQjtzRJCNGO6aqXecXSvM7IOulBYSp2JAdxjr2y6ZSrHNPg69iSZ+PVNdIXh8qc7Yt6b51tnrdqIXnMc5vNZuRLIKRzgiC" +
  "oZR1bygxxdsxZiWvPizLhC5Pmhxlw3Dq3nnDh80nR1FszjxwsX9TfLi1727zgB8hcEShJTOU2N74llJTiAgyY5YzZffZTHFsKWoK" +
  "uByalh4rNdZihpGAXM3ZoVs3bdCeQkbvjllnRRUllitk+sp3h7KqaOJ8ew6fTHa7mVrhBdny1mlR28FqY9qukwquxqRsqRJauALG" +
  "heWK64LYOQOI4LGw541TvgXrYnS6Viw71QpvmGV8/HRlyCC9bQrP0rNLzi5zhRJscNVCdpwrrrPV6wyj8dufmN4REsvLK5lU2cfy" +
  "zCpRNbNi0WcLW91M9bkyVVY+NT8iuCx610Cshlfm3NZqvRwNMmTKR//kr5u1MC2Y8ic/Ak5JaTRKCmMGq9EzhC54jg+1N8maxRGL" +
  "JWMZW5NPIhxCBCMtPx111mw4aoFYS//c4tTidFRi3PZbBDBzRj6aLNduJ6NRWWJ+Wg4kGPUMKLRYuykz0qLMnvT7ufLR2U6VGq7R" +
  "HS1EcOZmitnmUrnRZ6c2p6sUJQQ3pRMi/tmxO/bKOi2Nj/bHPc6GJtAFs8BjjNJDK37lvka24TAK22WaSqnUZgluDWuEByORo6ZG" +
  "ezxPCtMJasNxsy+RD5bt977Y1MpNlovZjuludSBZGy7liazNNrT3WxpmzZ/MD7bIemG0bOJLOZMaqp9JHkr+eNPOXGmxf2BOsxJH" +
  "p4/nOGCIAdYWy7Xi4sfrNgTE8LGXxiv+rTtqZcIwQjTBeSVzPqlZPX5XbCLlyQ532Es2a353Z4kzuw4H7i+tNM6U70j4Fwsu5DzX" +
  "OpKxez1m70+dYeATnVA0Fz11rA6lt1d/K9oaGxsbKdociOtwmESDCAIiBKBSdBvHt31xXdB4beH8NdZrF2ZKDh9mwDQ3R7ScnRio" +
  "UGuuGxpf9q+88Vt5w2R69m550db1u0WaDiqzvzrE6xWbwkm+/i2jtqXKbQuxVqwJCnfLqxVcFm8tzNh8j7+Re62s2oKWQNAUo2Ed" +
  "AdZHkt0uDAAlJXgvu0EVlra8OeG3FawhVZM4TRU4xrCNs2gFlxXLYX8lI+bLXTw1T0uZBeo+GrY/mbOr98xO1Uqm5+p5y1szywOL" +
  "tuzzRPdivNxaP8HPLrampiJV5/8hw5dtIY9FkiQmWxkGJGQu5uILIuHsvtn0V21ow/khBCj8Yp6E00uSm2eYQwwAAdJU2UwAc9Za" +
  "YTk11XHrOJcbu21ybNHlOCZ0P715k/h2yHQ+b/NMdTVUm4OZQS6smSwJvtsxN9iRmU2Om157FAL29lt76v0WQFaoADEAJKfQpM1m" +
  "C6n+kc8+pJMb7P3Quf/6zWquucmIUu9aNQmreWIhDBAo0SK/NNj4R+K47ULRlgdOy9f92ffTv01P/8ze1vx6nVLD0OvNjbRPuPOI" +
  "d/m2etvX4eFjusP28lM9LToTmCgaGDGKGKOUB+BKk5nWhzcZMXWTnd1gsgEYKx3o+yX7UMHnNziBAQBWi4IJGACqLHO2pLkw4Pnk" +
  "5tRbm2BF8hjKue17KjGz/21X7crjDXXAYInnfUuzv81eEu7JGsst7EWX68jZlpBaKQuxlfZABQEA1isiYQCI5Prnd/7eR+AmlXzE" +
  "xLafraygLZbJjENgAEiriDIDAKQtC9assyhsyx6biVf80xYsEYv5bMugHmsvx2tnT+6mKodTt41K9nTHSkeP5YzTrfWzzI+Wm6yE" +
  "CKAE5FnObiBgXDZn5wxAwIRa/9BjZz4i32TCCul16Olsx8J4uJ43AAE1BIEBAFJLVivgotkz59isXjhd2CJ1TFiXXMXSwUtpsnCH" +
  "+T9qwwsDDVrx1mhkGjV5XjNbB2IpPHj07WRVrVHkOAE0r2xIBIARbWKcd3MGYwyZa3j6awzdZOQLse2GdS6zKQhYwAyArHaRDEU0" +
  "YwEJrjwJM3Od/ZT4GWtqoQjeC9nc6Ih1/uziXiPVMT2/16+O1kXELeH+8qxw/+PfnQ3vK0+7LSXG8cDMMtYUQdDEkDQ6rttkjuiC" +
  "unz/7mun664HBHi39v2qXqGSnlgSVw8AIcRUIgEgTsCkpEsG8VuPLB2sJ6XGHMuaXA4o5EjeXtjRHGpUuCMH0OHBpemLWujMj6vu" +
  "Xsl0Sismm2YQAggAz4yabQZnDwjJsYmcbkZDxb/n8E1n0BCTHh77m/mwviJtsa+2ITUChGcADHhlWbLq2IiGdv8s/TtGDeGW95uL" +
  "jDKqpSeL8aqw1FfT7liuDXL+7OBJbGu37jjS32tGIFIDI8ZAa/JkZFknJkEnkTHJoalfsOnoXdb9MFT84cUTc74tIUoBAKjCmTSD" +
  "IGBibsnpprw6b3aQufMWK09I0tfbZaKIg0pheO43K3VTkjiTsM2NxQmxVxlppyN/PLBVrRBgCDASCtO4RlYRAr0UX4xmdL35cOi6" +
  "DsMGNSyG2Cu/trJjn5EXOKbLhZhXTQUtGhVjMb8D+Oy4342NsqbjAgimsiIFHUo0nsomsrUhX1W4fMSoqAGLIRLBpjMi5C+IW+Qy" +
  "AobZ4kB1+9BiV5tRBsJVFguS2v/Jv7+uGrPhQiSK89/5+/navdVanjrjK85Sud68SIJL2SoTCEvj9X6slkULyWqCZNWHh23ec2mT" +
  "KAuZoqH76uOSzy6DXSiqOnbxBhMKU7nmgM6YmDp5i3L2zmS/1BbmlGJKR9pQ/Y+817dgNhqsREzcvN95bpQziD82ay7prTCIA4tJ" +
  "i2Dix0dbqkAzLIKe02UbGh+AquiFUBO2P/orFzz3tp+07qkLOWVeYTLPQwkEpMtuPoItDBnmaPKXpafrNrPZ8bLNzPPaRfKNVobf" +
  "y94PxPjwnv3+/jdVciGLSRvtN9cuRASLj/TNddbqwHNZXcQ8tzBcsSinyEdrFuD/HAqGXrc/fN8RpQs0yvGUcFjiNIPDOmeXBIEB" +
  "5f1nR36/4UfLtc3CxHAKkYHYX9+rk/e4w4oxDGrfibfeSqLug/JJ0jS5aLc3oJPZ2lpBVLUMasgvxRWHsBgp3Lln9iXydx8Div/l" +
  "7/Z9Xv0v5btBZRhpPKeDoSMeCMWMAgCVE8+3/lP5a+e5xsQ5xOimLzzCvXNA+YZLtRglAGNnjr86V2etq78w47fSSkwJBEGWMwgH" +
  "xqbEgDs1ktz5WcdzT7T+7UEAAOVPf7Lrz8x/MHWQrwCTyiUrABgEymahDAgYQubki6F/bX3m+IWhNDTd9/DujQ6B3mTLF6MYQf7i" +
  "m6+cd9jnnPV8fIn3OSRZ0CBhiis+R3Yx2/nQLyz9z5e3f2MrRQgYivy3k21fDv/R2f1WbU5wvtnQreqYkfFYQ51eIcioMEf2qPev" +
  "9rDjF0b9B3YSutEA903XjjEKBGDy1NE3pxhCVLSIjXasl3ILIcmUjULzR+9rPvv7Jzf9W++q7lI8/sXR0J9v+pNX9oSXF6oWRza3" +
  "gs5IdjFh6bTlsRZRzSQ37vythx2g8XB9+fV6QIwC3gAwpYiAeq5/eiEWjWaIk1MzOgWhVbQ27d1fDYN//Erro3sv39og5/971Pln" +
  "+/746e7eaDlwdGZblQRlHkdmSI9zKSNXigKdnjA9fkiXmEHQTRezUXyjNWqr8RQo8fn5ZCmbK5c0ZnA13TvbAYzk/3hW/Nohjb8a" +
  "4b32V3n7n37kqz+Ud5sK7KTYzOyaglh8HG2yZpgRX+Bk/65PdNEbn+tbA8SQMoU6bjg1TBm+op9Mr2iSDEANQr/+WOwfHtTWjSFq" +
  "/A/+sRz44u1PfC3e1iBlxoSqChNRMbkyZ+0tnLO2CnV7bqm76YHmNTuE4j85fqnQfKM1MxgjRqlhUAYARJB53QDEweHvaB//vLp+" +
  "axZRe1Nv5S9tuWPHytAKC7NZ5s3O6Wa+qC3lmjp3Pfh7n+x26OuN83UD8JcpxOBro83o7K/ejjY4WLc60YuvTs+sTmwwNP+H8+Ef" +
  "Ev66rWnCf/lO+BN/aIOnH1uQ29mllvahvpSrm5W2/lIzAOgMY3TN4PCGLGPGb+6wslL/H9e+Y2kgAmAV2OjwiPrNb1ce3Xe97WcG" +
  "/OoJ97c7Ka/94NmIz3lh+/2vTmzp7mqXwWCAr5EdhiCXkzwbAKL4m1NW3ZoIfs60HhEDBEYsHcsZjrbgdZxnaO5zS9u+907dpZD8" +
  "9MAjf2bXMNGeeiElvfz1zxQsAMzA7xRkte9iTN6xZ6N5auPFyeCwNHvffZitmxOGYmT60pzCSUXfp7qu69iyV/4Ivt+9gfIaZOx3" +
  "L/7wIGIGIjB2LHawFxuAN1Ir5cmXA55Y7E+7GNpQ7ct/blp5eI+wRgqGQJk/fbbss4NGqofQH3iuRWT8x+c+/tiGQzc6d+JLn3mE" +
  "MMQM4DaWlNXrnnz2LhHDaPWvr99Bd6VexZj0uW/4Hy/udVw+3BQ7cpSvUfO0veG587svnPjotYBIl+d+uvHEjXHL66uZMAeUMoJv" +
  "cAz13Et7Zst+nNqyYZ2aABhNv/K90HODD1SLPAKjculJrS0d3XrQBeMQZrhyfVzZ8t1deGPHQyi7PLeK8Q3Pvy085xmvqRnIO/bB" +
  "jTJXg0z/K9KSgZ4aOyseG+vU5vb/AqY698SxPYmFOw7pH3AB6MZ49Cefrdn5i6CP1thumEoDxcYLpxRDrSAw2O55/DshA2GDnPyh" +
  "mOv4TfP1BvZ9rn687rsX/tnt+2OVA3ztba/z9gwQjF+cz6etyUXbzkdWl+cxtNLv7+TYh3CsXE8tCFUOQAzFf3Ch+v/zM3y9H+He" +
  "sT6AtbSAUeK+ZhUPrp4vAgSBAHyw09tXR7IVKiEc+eEFm8J/Zo+BYeBkU3dA595xW27jlQbWFyrFW1p+vhPkDFWGkpu9AMDQ2y+k" +
  "iNTqOabfW6ALzzYGYfJ1h/BJSt772aBBTg5yP4+QAGPal2ZCP/rEQUTxo0/YbIxfuOBvpW9m9mfng+VzYy13o42EgNv41FSyItvM" +
  "H3D1wBXe85sL0PmyfzP+q3+/9+N1sVcvtDcYy8UOha+D/peqqnZsqLUbA0IrBq9/MOW5eoKSwKcSi+H5NFwo/8seEQWEJBWjQyi4" +
  "UuWbeUOzfQaR93GcSzXkYo5t8Parm/QYYhsGvAaJjyYEt1UQRFzJT5/U60E3Q/Mf2gF0blatr6h69bTtN/TTZ5sPWd7H+TIEPgL8" +
  "/PZ1ms5Wj+8zhoExDAxvFPBS8u1LTgGzgkIJNjjJ7TW90tkB1tV7JgyLMl+hHb9oeeXFqoZdNzCzGwMygiTV8XZ7r7Ea7bC1qKqi" +
  "cyJQbDw9VGbBe5opvgKVAcKI4X+e645HKq5qhDFjTFUHV3o/daUXxoi4JH6hQ3S8/LTd8kuEvq8FkfiO/3B1fm/ugStmJLo4PjaX" +
  "LCm7/9g7+03DayXxR3+/iiFg9LK3YgaemGq8FL7ddCxXPzMnMNFq621rtMLlo9GY4pKlxQ+Pv22u/LL1vQznrvOOxq7kc7Ut/UNV" +
  "tU6OllORxZkoCTbucUk++/K3aYsQnWwoDVRTxBhRz8yoKpGDuyz64krxFzc5+OgEXdi/FRFRsKw/ZGMxdEP0LXw/C6XPdt4Izw0p" +
  "hO72vjlikMw4GEopXzI13NPsdpgRgHo0eoeRTtX8ZNNegzCEfjIOuXSREe7Vg3duO7XzdgQg8iDUtVxnqjHsOXm6d+xvSDIe+PXN" +
  "N95ayd0oOxJuqZtZiSQyBd5UE64J+1xrW3EXzndTNTK8vbMy20Vx7tFstBTc5IHK7OD/evOLv+kBRrGKQIwZBACMq6qImfuRf3ud" +
  "JMF52x2NN0mEuBvna6GQklQMgxNlq7S6SAMQRgs5fyX7ZthbNf9GN0v/Uy7Z2xPwWJBezJx5+iefBoYQAmSYZqdYgbPXXXPHni/0" +
  "xaivut1GMXr/W08RUCSF1631WE1tWUliLC4eksqCwMrfyFTuvnV1nYvF37rdWM2PKdK8k3+Xoww1fT58lRYIGhrS1EFuHrZwN1v3" +
  "wlZXpwNad3Kc8lwmfP+8xZndgR5fEHc/RFZn9xkjbWvWkce6U+F2++hERr2GORQ7ASjCH3gv7DsyBcSQFDUccPH4L+p625lj3uAn" +
  "ydr7IljbVEG5GCEEPbwXQSVvv0Z6MQOG8Ie847yr820TJVt1wwI/8Eif5q8miqu+iXIn52sxJZQxEMV3yAH6kJeuIwh89pjiaDo9" +
  "b06/qHKf8FwvDwzN/XjQb2emRcXEGMP/9xf3s+DDAOxcoSExLG3tfIdDYuiJvKVCqcmgG7AcPowd5+/YgqAbGvQkpsVK+BPGO/EM" +
  "XKq9XzAAKwbAB9uc9L6/wREOtd2Nunp+lcPvjKTeKH3UowMC9p/5vxYQSA9nFf8G9hblp52dkxTAEPF/6j9/YNRuN9AGBBpLb+FU" +
  "DLgs8/+pgBBhbEN/vaw1YZ0DUnDyHyxn+cDZ8Q00KGfYoUgw1ULkP0uob55y6AxDgvAZq/sDivWHCwiBHTRWJqbpDhv8v0AhAD8r" +
  "DOuymthl+YBpL/fhUoi1yINDPsvZW+rhA9YmPmQKMU/vi+P+MflB0wetlSD24QJCK180M9cXPD8HkT9kIYLCRXPPzyEI/z/eSwcA" +
  "uP+xYAAAAABJRU5ErkJggg==";
