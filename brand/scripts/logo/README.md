# Logo source

- `mark-trace.json`: the QR infinity mark as one vector path, traced from the approved reference drawing (October 2026) and smoothed.
- `build-logo.js`: scales the mark to 100 units tall, sets "finity" in Bricolage Grotesque 800 (outlined, yellow i-dots), and writes every file in `brand/logo/`.
  Run: `npm i opentype.js @fontsource/bricolage-grotesque` then `node brand/scripts/logo/build-logo.js`.

Lockup settings: "f" height 70 % of the mark, baseline at 90 % of the mark, gap between mark and "finity" 4 % of the mark's height.
