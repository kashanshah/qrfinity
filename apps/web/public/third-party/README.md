# Third-party marks

Brand assets owned by other companies, used only as their guidelines require. Don't edit, recolour
or resize them; replace the file if the owner publishes a new version.

- `google-g.svg`: Google's "G", for the "Continue with Google" sign-in button (Sign in with Google
  branding guidelines).
- `google-logo.svg`: the Google logo shown under Google Maps address suggestions, as the Places API
  (New) attribution policy requires when Places data appears without a Google map
  (https://developers.google.com/maps/documentation/places/web-service/policies#logo). Copied
  unchanged from `GOOGLE_LOGO_SVG` in Google's `@googlemaps/extended-component-library` 0.7.0
  (`lib/place_overview/place_overview.js`, Apache-2.0), where Google's own place component uses it
  for the same purpose. Shown at its native 56 × 20 px.

## Platform icons (`public/brand-icons/`)

The icons the generator puts in the middle of a code by default when it opens WhatsApp, a social
profile, an app store or another known app (the logo's "Automatic" choice). Each is the platform's
single-colour mark from Simple Icons (https://simpleicons.org, `simple-icons` 16.35.0, CC0 data;
the marks stay their owners' trademarks), in the platform's own colour on a rounded tile. Built by
`scripts/build-brand-icons.mjs`, which rewrites every path to absolute M/L/C/Z commands so the icon
goes into codes as vector shapes (SVG, PDF and EPS downloads stay sharp); don't edit the SVGs by
hand. Each brand's guidelines link is in
the Simple Icons data. LinkedIn is missing because it asked Simple Icons to remove its mark.
