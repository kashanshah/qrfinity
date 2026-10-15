# CodeTypeBadge

A pill that tells people what kind of code they made, shown on every generated code in the generator and dashboard.

**The consumer provides:** the type (`static` or `dynamic`), and whether to add the "Never expires" pill beside it (always, on public pages).

- **Static**: `surface` fill, `ink` text, 1.5 px `control-border`. Meaning: the link is inside the code; works forever; can't be edited or tracked.
- **Dynamic**: `evergreen` fill, `on-evergreen` text. Meaning: editable and tracked through a `qrfinity.link` short link; free with an account; never deactivated.
- **Never expires**: `mint` fill, bold `ink` text, Lucide `infinity` icon. Our promise, shown next to both types.
- A dynamic code's short link sits beside the pills in `mono`, `evergreen`.
- `label` text, `radius-pill`, `space-1` icon gap. Never create a dynamic code without showing the Dynamic pill.
