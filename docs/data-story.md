# Data story: how many printed QR codes are dead?

Traffic plan item P7. We photograph a few hundred QR codes in public places, follow every one,
and publish what share no longer work and why. The finding, the method and the data go on one
page; we then pitch it to marketing, small-business and local news.

The question: **of the QR codes printed on menus, posters, windows and packaging, how many are
dead, and why?** We expect a large share of dead dynamic codes to run through QR services whose
trial or plan ended, but we publish whatever the data says.

## 1. What to collect

Aim for **400 photos** (300 is the minimum for a credible headline number; 500 is better). Spread
them across these categories, so no single type dominates:

| Category (use this word in the log) | Where | Target |
| --- | --- | --- |
| `menu` | Restaurant and café tables, menus, takeaway windows | 80 |
| `poster` | Event posters, noticeboards, community boards, lamp posts | 80 |
| `window` | Shop windows and doors, "scan for hours / offers" | 60 |
| `packaging` | Food, drink and product packaging, labels, swing tags | 60 |
| `flyer` | Leaflets, business cards, brochures, direct mail | 50 |
| `transport` | Bus shelters, parking meters, stations, taxis | 30 |
| `venue` | Hotels, gyms, museums, churches, offices | 40 |

More is fine; keep the spread roughly the same. Older prints are valuable: a faded poster or a
menu that has clearly been on the table for years is exactly what the study is about.

**Where:** your own city first; a second or third city (or friends in other cities) makes it a
national story rather than a local one. Note the city in the log.

## 2. How to photograph

- **One code per photo, filling about a third of the frame,** straight on, in focus. Step back
  if the code is large.
- **Any phone camera is fine.** iPhones save HEIC by default: either set Settings → Camera →
  Formats → Most Compatible before you start, or export the photos as JPG afterwards. The script
  reads JPG, PNG and WebP.
- **Don't open the codes on the spot.** The script follows every link the same way, with the
  same checks, so results are comparable. Opening them yourself also risks scam codes.
- **Public places only.** Don't photograph codes inside homes, on private documents, on tickets
  or receipts with personal details, or on anything that shows people's faces or car plates. If a
  code is on a parking meter or payment terminal, photograph it but never pay through it.
- **Same code twice is fine.** Chains print the same code in many places; the script counts each
  code once and reports duplicates.

## 3. Name and log the photos

Put every photo in one folder named `data-story/` at the root of the repository (git ignores it:
photos can hold personal data). Keep the camera's file names, or rename them `0001.jpg`,
`0002.jpg`…

Add a `log.csv` in the same folder, one row per photo. It's optional, but the category column is
what turns one number into a story ("menus fare worst"):

```csv
file,category,city,country,date,notes
0001.jpg,menu,Toronto,CA,2026-10-18,café table tent
0002.jpg,poster,Toronto,CA,2026-10-18,community board; poster dated 2023
0003.jpg,packaging,Toronto,CA,2026-10-18,coffee bag
```

`date` is when you took the photo. `notes` is anything useful: the print's age, if visible, or
"peeling", "faded".

## 4. Run the checks

```bash
pnpm --filter @qrfinity/web data-story ../../data-story
```

For each photo, the script:

1. Reads every QR code in it (photos with no readable code are counted as unreadable, separately
   from dead links).
2. Records what the code holds. For anything that isn't a link (Wi-Fi, contacts, text, payments),
   only the type is kept: no passwords or personal details are stored.
3. Follows each link with the same check as our QR code checker (redirects, error pages,
   domains that no longer exist, and pages that say a code has been deactivated), and notes
   whether the link goes through a QR service's short link.
4. Writes `results.csv` (one row per code), `results.json` and `summary.md`.

It refuses to run without a working internet connection, because then every link would look dead.

**Then re-check after at least 24 hours:**

```bash
pnpm --filter @qrfinity/web data-story ../../data-story --recheck
```

A link counts as **dead** only if it failed every check and the checks were at least a day apart.
That keeps sites that were briefly down out of the headline number. Links that refused an
automated check ("verify by hand" in the summary) are opened by hand in a normal browser and
noted in `results.csv`.

## 5. What we publish

One page on qrfinity.com, for example `/research/dead-qr-codes`, with:

- **The headline number:** "X% of the QR codes we found in public no longer work", with the
  sample size next to it.
- **Why they died:** a chart of the reasons (turned off by a QR service, page gone, domain
  expired, site down).
- **Static vs dynamic:** the share of dead codes among codes that go through a short link
  versus codes that hold the final address.
- **By category:** menus, posters, windows, packaging…
- **The method,** in plain words: where and when we collected, how many, how we checked, what
  counts as dead, the 24-hour re-check, and the limits (a sample, not a census; one or a few
  cities; photos taken by us).
- **The data:** a downloadable CSV with one row per code, without the photos, without exact
  locations, without link paths, and without anything that identifies a business. Domains of
  big platforms (Google, Instagram…) can stay; small businesses' domains are replaced with
  "business website".
- **What to do:** check your own codes with the [QR code checker](/qr-code-checker), and how to
  make codes that don't depend on a subscription.

### Fairness and legal care

- **Report counts, not targets.** We can say how many dead codes ran through each service's short
  link, as a measured fact, with the method beside it. We don't single out a competitor in the
  headline, don't speculate about why a service's codes died beyond what the page they lead to
  says, and offer each named service a chance to comment before we publish.
- **Name no small businesses.** The story is about the problem, not about whose menu is broken.
- **Disclose our interest.** Say plainly that QRfinity makes QR codes that don't expire, and that
  the full data is published so anyone can check it.
- **Legal review** of the page before it goes live (legal@qrfinity.com), since it names other
  companies' services.

## 6. Timeline

| Week | Work |
| --- | --- |
| 1 | Collect photos (an hour or two a day, plus a weekend walk through a busy area). |
| 2 | Run the checks, re-check after 24 hours, verify the "by hand" links, review the numbers. |
| 2 to 3 | Write and design the report page and charts; legal review; ask named services for comment. |
| 3 | Publish, then pitch: marketing newsletters, small-business publications, local news, and the subreddits where QR code questions come up. |
