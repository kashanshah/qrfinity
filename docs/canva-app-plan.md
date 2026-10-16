# QRfinity for Canva: plan

> Status: **proposal, awaiting approval.** No code yet. Written 2026-10-16.
> Canva's docs (canva.dev) couldn't be opened from the build environment, so the Canva facts below come from search results quoting those docs. Items marked **(verify)** need a check against canva.dev before building.

## 1. What it is

A QRfinity app that runs inside the Canva editor. People open it from the side panel, choose what the code holds (link, Wi-Fi, vCard and the rest), style it, and add it to their design. It's the same promise as qrfinity.com: free, no sign-up, codes that never expire.

Canva has merged its developer products into one "Canva Developers SDK" (September–October 2026). What we'd build is an app for the **apps inside Canva** surface (previously the Apps SDK). The old Connect APIs are now the Canva REST APIs; we don't need them for this. Existing starter kits still work while Canva combines them.

## 2. Why, and the catch

- **Why:** Canva is where many people make the flyers, menus and packaging that carry QR codes. A listing in Canva's app directory puts QRfinity in front of them at the moment they need a code, and links back to qrfinity.com for dynamic codes.
- **The catch:** Canva already ships a free built-in QR code app for static codes. A static-only QRfinity app has to win on design: dot and eye styles, colours, logo, frames with text, and a scan check. The thing Canva doesn't offer is **dynamic codes that never expire**. That's version 2 (section 7), and it's what makes the app worth finding.

## 3. Recommended scope for version 1 (static only)

Mirrors the free static generator. No account, nothing stored, nothing sent to our servers.

- **Content types:** all 12 we support (`url`, `text`, `wifi`, `vcard`, `email`, `sms`, `phone`, `whatsapp`, `location`, `event`, `app`, `social`), using the same validation as the web generator.
- **Design:** dot style, eye frame and eye ball styles, foreground (solid or gradient), background or transparent, frame with text, error correction and quiet zone. Same `Design` type and defaults as qrfinity.com.
- **Logo upload:** include it if Spike 2 shows the file picker works in Canva's iframe; otherwise ship v1 without it and add it in 1.1.
- **Scan check:** include it if Spike 3 shows the zxing-wasm worker runs in Canva's iframe. Otherwise keep the static checks that need no decoder (contrast, quiet zone, logo coverage) and say plainly that the code wasn't test-scanned.
- **Add to design:** drop it as a vector where possible (Spike 1), sized and centred, with alt text describing what the code opens.
- **Link back:** one quiet line, "Need to change the link after printing? Make a dynamic code on qrfinity.com". No ads, no upsell banners.

Out of scope for v1: dynamic codes, accounts, analytics, saved templates, bulk generation.

## 4. How it fits the repo

- **New workspace `apps/canva`:** a React app built from Canva's starter kit and CLI, using Canva's App UI Kit (Canva requires its own components and design guidelines inside the editor).
- **Reuse `@qrfinity/core` unchanged:** content encoding, `buildScene`, `sceneToSvg`, design types and scan checks. The renderer already runs in the browser, which is what a Canva app needs. Any change needed for Canva goes into core behind tests, so the web generator gets it too.
- **Brand:** inside the editor, Canva's UI kit and guidelines win over `brand/BRAND.md`. Our brand shows up in the app icon, listing images, copy voice (sentence case, plain words, "QRfinity") and the default QR colours. **Decision needed:** confirm that's acceptable.
- **Hosting:** per the search results, Canva serves the app's bundle, and the review asks for reliable production hosting for anything we host ourselves. v1 hosts nothing new if Spike 1 avoids a render endpoint. **(verify)**

## 5. Spikes before building (about 1 day)

1. **Adding the code to a design.** The docs show two routes:
   - **Upload:** upload the image through `@canva/asset`, then place it with `addElementAtPoint`. Uploads need a publicly reachable URL, which a code generated in the browser doesn't have.
   - **Shape elements:** add the code as a Canva shape built from SVG path data, so it stays a crisp, editable vector and needs no upload or server. Canva says production apps must validate path data and handle bad paths. Shapes also have path and size limits. **(verify)**

   Test whether shape elements handle dense codes (a vCard at high error correction) and our dot styles. If neither route works without a URL, fall back to a stateless render endpoint on qrfinity.com that returns the SVG and stores nothing. That would be the first time code content reaches our server, so it needs your OK.
2. **Logo upload** inside Canva's iframe, and whether a logo can be taken from the user's Canva uploads instead.
3. **Scan check:** whether the WebAssembly decoder and its worker load under Canva's iframe rules, and how big the bundle gets.

## 6. Canva review and listing (from Canva's submission checklist)

- **Our side:**
  - Read and accept the Canva Developer Terms and Apps Terms.
  - Follow Canva's design and brand guidelines.
  - Handle errors clearly and fail gracefully.
  - Meet Canva's security expectations.
- **Listing:**
  - Name, descriptions, icon, a featured image, and screenshots that match the real Canva UI (they can't repeat the featured image). All edited in the Developer Portal before submitting.
  - **Privacy policy, terms and support URLs**, hosted by us and readable on mobile.
  - Our legal pages are still drafts awaiting your or a lawyer's review. **That's a blocker for submission.** The privacy policy also needs a line about the Canva app (no data collected for static codes).
- **Review:**
  - Submitting opens a support ticket with Canva.
  - If users sign in through a third party (version 2), we send documentation and test credentials there.
  - If rejected, Canva says why.
- **Localization:**
  - After approval, Canva translates the app into 25+ locales. This takes about three business days; release after it finishes.
  - Some sample docs also mention `@canva/app-i18n-kit` for multi-language support. Wrap all UI strings so they can be translated. **(verify)**
- **Your actions:**
  - Create a Canva developer account and complete developer verification.
  - Accept the terms.
  - Approve the listing name "QRfinity" (the trademark searches were clear).
  - Supply or approve listing imagery.

## 7. Version 2: dynamic codes from Canva (later, separate approval)

- Sign in to QRfinity from Canva (Canva's third-party sign-in flow). That makes QRfinity an OAuth provider, which Better Auth supports through a plugin.
- New authenticated API on qrfinity.com:
  - list a user's dynamic codes
  - create a code
  - fetch a code's short link and design
- These endpoints would allow cross-origin requests from Canva and be rate-limited. They'd reuse the existing services (`createDynamicCode` and the rest), so redirects, abuse screening and the edge sync stay exactly as they are.
- Codes made in Canva are ordinary QRfinity dynamic codes: free, never expire, editable from the dashboard.
- Canva review then needs test credentials and sign-in documentation.
- Rough size: several times version 1.

## 8. Non-negotiables check

- Codes never expire: v1 codes are static, so nothing can expire. v2 codes are normal QRfinity dynamic codes.
- No sign-up for static codes: v1 has no sign-in at all.
- No ads, no raw IP storage: v1 stores and sends nothing.
- Free features stay free: v1 is entirely free. Any paid feature later only adds capabilities, per `FEATURES`.

## 9. Rough effort (v1)

| Step | Estimate |
| --- | --- |
| Spikes | ~1 day |
| Build the panel, reusing core | 3–5 days |
| Tests, error states, i18n wrapping | 1–2 days |
| Listing assets and privacy policy update | ~1 day, plus legal review |
| Canva review and translation | Canva's timeline, typically weeks |

These are estimates, not commitments. The spikes may change them.

## 10. Decisions for you

1. Approve version 1 as static-only, with version 2 (dynamic codes) as a separate later phase. Or ask for both together.
2. Accept Canva's UI kit inside the editor, with our brand on the listing, icon and default colours.
3. If Spike 1 needs it, allow a stateless render endpoint on qrfinity.com.
4. Set up the Canva developer account and verification, and get the legal pages finalised.

## Sources

- Canva Developers SDK documentation: https://www.canva.dev/docs/apps/
- Image elements: https://www.canva.dev/docs/apps/design-interaction/image-elements
- Asset upload example: https://www.canva.dev/docs/apps/feature-examples/asset-upload/
- Shape elements: https://www.canva.dev/docs/apps/feature-examples/shape-elements/
- Submission checklist: https://canva.dev/docs/apps/submission-checklist
- App listing guidelines: https://www.canva.dev/docs/apps/designing-apps/create-app-listing/
- Submitting apps: https://canva.dev/docs/apps/submitting-apps
- Integrations becoming part of Apps: https://community.canva.dev/t/integrations-are-becoming-part-of-apps-in-the-developer-portal-soon/8881
