# Logo source

The QRfinity mark is built from geometry, not drawn by hand, so it can be regenerated exactly.

1. `refine-mark.py` defines the ribbon (Q circle, R bowl, woven crossing, tail and leg), applies the optical corrections and outlines everything into one filled shape → `refined.json`.
   Needs: `pip install skia-pathops fonttools`
2. `build-logo.js` sets "finity" in Bricolage Grotesque 800 (outlined) and writes every file in `brand/logo/`.
   Needs: `npm i opentype.js @fontsource/bricolage-grotesque @fontsource/manrope`

Key numbers (in a 100-unit-tall mark): ribbon weight 20 (wordmark stem 17.1), weave gap 4 each side, Q radius 41 (1-unit overshoot), crossing at 60°, tail and leg at 52°, flat cuts on the baseline.
