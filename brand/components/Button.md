# Button

The action control: primary (evergreen), download (signal yellow) and secondary (outlined).

**The consumer provides:** a label in sentence case (a verb first: "Download PNG", "Create dynamic code"), an optional leading Lucide icon at 18 px, the variant, and the click handler.

- **Primary** (`evergreen` fill, `on-evergreen` text): the main action of a view. One per view.
- **Download** (`signal` fill, `on-signal` text): only for the export action under the QR preview. At most one yellow element per screen.
- **Secondary** (`surface` fill, `ink` text, 1.5 px `control-border`): everything else.
- Size: 44 px minimum height, `space-3` × `space-6` padding, `radius-md`, `button` text style.
- Hover: primary goes to `evergreen-deep`; secondary to `surface-sunk`. Focus: 2 px `focus` ring, 2 px offset.
- Disabled: 50 % opacity and `not-allowed` cursor, and say why next to it in `body-small` when it isn't obvious.

Don't put two primary buttons side by side, use yellow for anything but downloading, or write "Click here".
