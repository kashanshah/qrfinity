# ScanCheck

A live badge under the QR preview that says whether the current design actually scans, decoded in the browser after every change.

**The consumer provides:** the result (`pass` or `fail`), and for a fail, the reason and the fix as one plain sentence; for a pass, the minimum print size.

- Pass: `scan-pass` fill, `on-scan-pass` text, a check icon and the word "Scans".
- Fail: `scan-fail` fill (orange, not red), `on-scan-fail` text, a warning icon and "Won't scan".
- The message beside it is `body-small` in `ink-muted`, with the key fix in bold `ink`. Always name the cause and the fix: "The logo covers too much of the code. Make the logo smaller."
- Never rely on colour alone: the icon and word always appear. The two fills differ by 3:1 in lightness in both themes.
- Don't show a fail while the person is still typing; re-check 300 ms after the last change.
