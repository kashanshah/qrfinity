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
- **Any phone camera is fine.** The easiest is "Take a photo" in Admin → Study, which saves and
  checks each code as you go. Photos taken with the camera app work too: add them later with
  "Choose photos" (phone browsers turn iPhone HEIC photos into JPG when uploading).
- **Don't open the codes on the spot.** The admin follows every link the same way, with the
  same checks, so results are comparable. Opening them yourself also risks scam codes.
- **Public places only.** Don't photograph codes inside homes, on private documents, on tickets
  or receipts with personal details, or on anything that shows people's faces or car plates. If a
  code is on a parking meter or payment terminal, photograph it but never pay through it.
- **Same code twice is fine.** Chains print the same code in many places; each code is counted
  once, with how many times it was seen.

## 3. Add photos in the admin

Everything happens in **Admin → Study** (`/admin/study`), from a computer or a phone, so any admin
can collect from anywhere:

1. **Set where you are:** the category (menus, posters, windows…), city, country and the date the
   photos were taken, plus optional notes ("faded poster dated 2023"). The category, city and
   country are remembered on that device for the next photos.
2. **Add photos:** "Take a photo" opens the phone's camera; "Choose photos" takes any number of
   photos at once from a phone or computer.
3. **Each photo is processed right away,** with progress shown for each one:
   - The browser reads the code and makes the photo smaller (2,000 px on the longest side).
   - The server gets the smaller photo, a fingerprint of what the code holds (so a code
     photographed twice is counted once, as "seen 2 times"), its type and, for links, the
     address. Decoded Wi-Fi passwords and contact details are not stored.
   - New links are followed straight away with the QR code checker's own check (redirects,
     error pages, domains that no longer exist, pages saying a code was deactivated), and
     codes that go through a QR service's short link are marked.

Photos are kept in a **private S3 bucket** (or an S3-compatible store such as Cloudflare R2), set
with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and, for R2,
`S3_ENDPOINT` (see `apps/web/.env.example`). The bucket stays private: photos are only served
through the admin, to signed-in admins. Without these settings, codes are still recorded, just
without their photos. Deleting a code in the admin deletes its photos too.

## 4. Re-check, verify, export

- **Re-check after at least 24 hours.** "Re-check due" follows every link that failed and was
  last checked over a day ago (and any not checked yet). A link counts as **dead** only if it
  failed every check and the first and last were at least a day apart, so sites that were
  briefly down stay out of the headline number.
- **Verify by hand.** Some sites refuse automated checks; they're listed under "Verify by hand".
  Open the link in a normal browser and press **Works** or **Doesn’t work**; a hand check settles
  the result.
- **Results** update live on the page: the dead share, why links died, the dead share by
  category, short links versus direct links, and dead links per QR service.
- **Download CSV** gives every code with its checks, for analysis and for the published data
  (after removing what section 5 says to remove).

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
- **Photos stay private.** They're evidence for us, not for publication; delete them (and the
  bucket's contents) once the study is published and any questions about it are settled.
- **Disclose our interest.** Say plainly that QRfinity makes QR codes that don't expire, and that
  the full data is published so anyone can check it.
- **Legal review** of the page before it goes live (legal@qrfinity.com), since it names other
  companies' services.

## 6. Timeline

| Week | Work |
| --- | --- |
| 1 | Collect photos (an hour or two a day, plus a weekend walk through a busy area). |
| 1 to 2 | Photos are checked as they're added; re-check after 24 hours, verify the "by hand" links, review the numbers. |
| 2 to 3 | Write and design the report page and charts; legal review; ask named services for comment. |
| 3 | Publish, then pitch: marketing newsletters, small-business publications, local news, and the subreddits where QR code questions come up. |
