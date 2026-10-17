# Traffic plan

> Status: **proposal**, written 2026-10-16. No paid keyword tool was available, so priorities below are
> judgement (fit with searcher intent, competition, effort, and whether only we can offer it), not
> measured volumes. Section 2 says how to check them for free before and after launch. Re-rank once
> real numbers exist.

## 1. Where we start

- **Head terms are out of reach for now.** "qr code generator" is held by sites with years of links and
  millions of visits a month (see `decisions.md`, "Can we rank?").
- **Narrow pages work.** ME-QR's SEO agency credits its growth to adding use-case generator pages
  (23 → 42 per language: Reddit, with logo, Google Forms, Spotify…), starting when organic search was
  only about 2 % of its traffic. Source:
  https://netpeak.net/blog/how-to-increase-monthly-website-traffic-by-10-million-sessions-in-six-months-with-80-organic-growth-me-qr-case-study
  (seen 2026-10-16; only excerpts were readable, so treat the headline numbers as unverified).
- **"Never expires" alone isn't a differentiator on the lists that matter.** Current "best free QR
  code generator" roundups already credit Hovercode, FreeQR and The QR Code Generator with free
  dynamic codes that never expire. Our pitch has to be specific:
  - **unlimited** free dynamic codes, with editing and analytics (up to 2 years);
  - **in our terms** (with a 12-month shutdown notice), not just in marketing copy;
  - **nothing breaks** when someone stops paying;
  - **no ads**, no watermark, every format free.
- **Assets we already have:** 20 use-case pages, 6 guides, 5 comparisons, 3 landing pages, hubs,
  structured data, share images, llms.txt, IndexNow, a browser QR decoder (zxing-wasm) and a scan check.

## 2. How we'll measure demand without a paid tool

1. **Before building a batch of pages:**
   - Paste the candidate list (appendix) into **Google Keyword Planner**. It's free with a Google Ads
     account, and no ad spend is needed.
   - Note the volume range and competition for each term.
   - Drop anything showing "0–10"; build the higher ranges first.
2. **Google Trends** for head-to-head choices (for example "qr code scanner" against "qr code reader").
3. **After launch, Search Console is the source of truth.**
   - From week 4, list queries where we show up with impressions but rank 8–30.
   - Each of those is a page to improve or a new page to add.
   - Re-rank this plan at week 6 and week 12.
4. **PostHog** for what visits turn into: codes made, by landing page and by source.

## 3. Priorities

Each item: what it is, why, rough effort, and what success looks like.

### P0. Launch readiness (days)

- **Indexing on:** set `NEXT_PUBLIC_INDEXABLE=true`, verify Search Console and Bing Webmaster Tools,
  and submit the sitemap (IndexNow pings Bing and others automatically).
- **Comparison facts:** re-check the claims on `/alternatives/*` on the live sites.
- **Region:** match the Vercel function region to the Neon database region (page speed is a ranking
  signal).
- **Success:** every sitemap URL indexed within 2–3 weeks.

### P1. Free tools next to the generator (1–2 weeks; highest return for the effort)

People search for tools, not articles. Each tool runs in the browser, so it costs nothing to serve.

1. **QR code scanner / reader**
   - Decode a QR code from an uploaded image, a pasted screenshot or the camera, using the decoder we
     already ship.
   - Show the content plainly, warn about risky links (shorteners, raw IPs), and offer "make a code
     that never expires" with the content pre-filled.
   - Targets "qr code scanner", "scan qr code from image", "qr code reader online" and similar.
2. **Dead QR code checker** (unique to us)
   - Upload a photo of a code that stopped working.
   - We decode it, follow where it points, and name the service that made it (known redirect domains
     of trial-based generators).
   - Then we offer a replacement that never expires. This is the content behind
     `/qr-code-stopped-working`, turned into a tool.
   - It's also the hook for Reddit, journalists and the listicles (P5).
3. **QR code tester**
   - Upload a design and get our scan check: contrast, quiet zone, logo coverage, size for print.
   - Targets "test qr code", "check if qr code works".

**Success:** each tool in the top 20 for its terms within 3 months, and a measurable share of tool
visitors going on to make a code.

### P2. More use-case generator pages (ongoing, ~10 a week)

Same template as today: preset generator, unique copy, FAQ, structured data. Pick from the appendix
after the Keyword Planner check. The strongest candidates by intent:

- **Payments:** done (2026-10-16): PayPal, Venmo, Cash App, UPI and Pix pages on a new Payment
  content type (`packages/core/src/content/payment.ts`; UPI and Pix are static only). Left: crypto
  wallet.
- **Social and apps:** done 2026-10-16: TikTok, LinkedIn, Facebook, X, Snapchat, Pinterest,
  Discord, Calendly, Zoom, link in bio, Google Forms, résumé, wedding; guides on not scanning,
  editing, tampering, making a code and high-resolution files; nonprofit and school pages; then Reddit, Threads, Google Drive, hotels, gyms, churches, retail,
  how to scan, free vs paid, and ChatGPT/Canva/Google (2026-10-17).
- **Work tools:** done.
- **Places and business:** restaurant table tent, real-estate sign, hotel room, gym, church giving,
  parking.
- **Events and personal:** wedding, birthday invitation, résumé/CV, conference badge, museum label,
  school worksheet.
- **Products:** product packaging label, Etsy shop, Amazon store, user manual, warranty registration.

**Success:** after 3 months, use-case pages bring more visits combined than the home page.

### P3. More comparison pages (a few days each)

- People searching "[competitor] alternative" or "[competitor] free" are often the very people whose
  codes just stopped working. Add Hovercode, FreeQR, The QR Code Generator, QR.io, ME-QR, Beaconstac
  (Uniqode exists) and Canva's QR tool.
- The same rules as today apply: facts from the vendor's own pages, a source comment with URL and
  date on every claim, and fair wording.

### P4. Other languages (after P1 and the first P2 batch)

- Spanish, Portuguese (Brazil), French and German, then Hindi and Indonesian. The QR market is very
  international, and those searches often face weaker competition. ME-QR repeated its full page set
  per language.
- **Work needed:**
  - locale routes, `hreflang`, and a per-locale registry and MDX;
  - generator UI strings translated;
  - human review of each page, not raw machine translation.
- Start with the home page, the top 10 use cases, "no expiration", "stopped working" and the scanner.

### P5. AI answers, roundups and communities (ongoing, a few hours a week)

AI assistants (ChatGPT, Perplexity, Gemini) cite roundup articles, Reddit and directories.

1. **Roundups.** Ask the authors of current "best free QR code generator" lists to review QRfinity,
   with the specific pitch from section 1. Roundups seen 2026-10-16:
   - jotform.com/blog/best-free-qr-code-generator
   - pixelixe.com/blog/best-qr-code-generators
   - guideflow.com/blog/best-qr-code-generator-software
   - vizologi.com/7-best-dynamic-qr-code-generators-in-2026-free-and-paid
   - mergeimages.net/blog/best-free-qr-code-generators
2. **Reddit and Quora.** Answer threads about expired codes and trial traps honestly, link the dead
   code checker only where it helps, and disclose that we built it.
3. **Directories.** Product Hunt launch (on a Tuesday to Thursday, with the dead code checker as the
   story), AlternativeTo (as an alternative to each competitor), SaaSHub, G2, Capterra.
4. **Check monthly.** Ask the AI assistants "best free QR code generator that never expires" and
   note whether we're named.

### P6. Integrations (each 1–3 weeks)

Each one is a marketplace listing, a backlink, and a way to keep reaching people after their first
visit.

- **Canva app:** static codes, plan in `docs/canva-app-plan.md`.
- **WordPress plugin:** a QR block or shortcode, with dynamic codes through an account later.
- **Browser extension:** "QR code for this page", made in the browser.

### P7. One data story (2–3 weeks, once)

- **Research:** collect 300–500 QR codes from real menus, posters and packaging (photos, plus public
  image search). Decode them, follow them, and report what share are dead, and why (expired trials,
  deleted pages). Publish a page with the method and the data.
- **Pitch:** to marketing, small-business and local news.
- **Payoff:** one well-covered story can bring more links than months of outreach, and the dead code
  checker is the natural follow-up for readers.

### P8. Sister sites

- Link 3D Box Studio's packaging and dieline pages to "QR codes on packaging", and back.
- Add the print-partner flow (already built) to sticker and label pages.

## 4. Not doing (non-negotiables)

- **No "Made with QRfinity" mark** on codes or redirect pages: no watermark is part of the promise, and
  redirects show nothing. At most, an opt-in frame caption.
- **No ads or paid placements** on the generator, dashboard or redirects.
- **No tracking** of people who scan codes for marketing purposes.
- **No thin or auto-generated pages:** every page has its own copy and a working preset.

## 5. First 90 days

| Weeks | Work |
| --- | --- |
| 1 | P0. Keyword Planner check of the appendix list. |
| 2–3 | P1 scanner and dead code checker; tester if time allows. |
| 3–8 | P2: ~10 pages a week, highest volume first. P3: 2 comparisons a week. P5 every week. |
| 6 | First Search Console review: fix pages with impressions but low rank; re-rank this plan. |
| 6–8 | Product Hunt launch with the dead code checker. Start P7. |
| 9–12 | P4 Spanish and Portuguese for the top pages. Canva app (P6) if approved. |
| 12 | Second review: keep what works, drop what doesn't. |

## 6. Measuring

- **Search Console:** clicks and impressions by page and query, plus the queries ranking 8–30.
- **PostHog:** visits → codes made, by landing page and source (no code content in events, as
  already set up).
- **Links:** referring domains (Search Console's Links report; free tools like Ahrefs Webmaster Tools
  once the site is verified).
- **AI answers:** the monthly check in P5.

## Appendix: candidate terms for Keyword Planner

Paste as one list; set location to United States, then repeat for Canada, the UK, India and
Australia.

```
qr code scanner
scan qr code from image
qr code reader online
qr code checker
test qr code
qr code not working
qr code expired
free qr code generator no expiration
dynamic qr code generator free
qr code generator for paypal
venmo qr code
cash app qr code
upi qr code generator
pix qr code
crypto wallet qr code
tiktok qr code
linkedin qr code
facebook qr code
telegram qr code
snapchat qr code
pinterest qr code
reddit qr code
discord qr code
google form qr code
google doc qr code
google drive qr code
calendly qr code
zoom meeting qr code
link in bio qr code
qr code for restaurant table
real estate sign qr code
hotel qr code
wedding qr code
birthday invitation qr code
resume qr code
qr code for conference badge
qr code for museum
qr code for packaging
qr code for product label
etsy qr code
amazon store qr code
qr code for user manual
warranty registration qr code
hovercode alternative
qr.io alternative
me-qr alternative
beaconstac alternative
canva qr code generator
```

## Sources (seen 2026-10-16)

- ME-QR case study (Netpeak):
  https://netpeak.net/blog/how-to-increase-monthly-website-traffic-by-10-million-sessions-in-six-months-with-80-organic-growth-me-qr-case-study
- Roundups: https://www.jotform.com/blog/best-free-qr-code-generator/,
  https://pixelixe.com/blog/best-qr-code-generators/,
  https://guideflow.com/blog/best-qr-code-generator-software,
  https://vizologi.com/7-best-dynamic-qr-code-generators-in-2026-free-and-paid/,
  https://mergeimages.net/blog/best-free-qr-code-generators
- Competitor "never expires" claim: https://hovercode.com/free-qr-code-generator/
