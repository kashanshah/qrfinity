# Site analytics: tracking plan and GA4 setup

What we measure on qrfinity.com, why, and how to set up Google Analytics 4 so the reports answer product questions. The code is `apps/web/lib/analytics.ts` (event catalog and privacy guard), `lib/generator-analytics.ts` (generator events), `lib/traffic-source.ts` (channels) and `components/Analytics.tsx` (loading, consent, user properties, errors). PostHog gets the same events.

## Rules

- Never on qrfinity.link or /admin. Consent rules as in docs/decisions.md (Site analytics).
- Events carry option names, counts and yes/no flags only. Never what a code holds (links, Wi-Fi names, contact details), never typed text, emails, colours or images. `cleanProps()` drops any value that looks like a link, email, path or long number, so a mistake at a call site loses the value instead of leaking it.
- No user id. User properties are broad: `signed_in`, `user_plan`, `first_channel`, `first_source`.
- Traffic sources keep the referrer's host name only, never its path or query.
- Before consent (EU, EEA, UK, Switzerland), nothing is written to storage for attribution; only an outside landing counts.

## Questions and the events that answer them

| Question | Events and parameters |
| --- | --- |
| Where do people come from, and which sources turn into users and customers? AI assistants vs search vs direct | `traffic_source` (channel, source_name, source_medium, source_campaign, first); `traffic_channel` on every event; user properties `first_channel`, `first_source` |
| What do people make QR codes for? | `generator_started`, `content_type_selected`, `content_variant_selected` (social platform, app store, payment method, Wi-Fi security), `qr_downloaded.content_type/variant`, `dynamic_code_created.content_type/variant` |
| Static or dynamic? | `code_kind_selected`, `qr_downloaded.kind`, `dynamic_continue`, `dynamic_code_created` |
| Which design features matter? | `design_option_used` (option, choice; once per page load per choice), design parameters on `qr_downloaded` and `dynamic_code_created` (dot_style, eye_style, colors, gradient, logo, frame, transparent), `design_saved`, `design_applied` |
| Where do people get stuck? | `content_problem` (too-long, invalid, lasting 4 s), `scan_check_failed` (reason: low-contrast, logo-coverage, margin, unreadable), `scan_warning_shown`, `download_failed`, `sign_in_failed`, `dynamic_code_create_failed`, `code_update_failed`, `code_feature_failed` (code: invalid, rate_limited, forbidden, not_found, server) |
| Which formats and sizes? | `qr_downloaded.format/size`, `upgrade_prompt_shown{feature: vectorFormats}` |
| Which paid features pull people towards a plan? | `upgrade_prompt_shown` and `upgrade_prompt_clicked` (feature: vectorFormats, custom_slug, rules, split, password, limits, contact_templates, account_plan), `code_feature_saved` (feature, on, count, template) |
| Does the plan funnel work? | `upgrade_prompt_clicked` → pricing page_view → `plan_interval_selected` → `begin_checkout` (plan, interval, value) → `checkout_cancelled` or `subscription_started` (trial) / `purchase` (transaction_id, value) → `billing_portal_opened` |
| Do accounts stick? | `sign_in_requested` → `sign_up` / `login` (method), `code_updated`, `code_managed` (move, tags, pause, resume, duplicate, delete, rename), `folder_managed`, `scan_report_viewed`, `scan_report_exported`, `short_link_copied`, `account_deleted` (paying) |
| Which tools get used? | `qr_read` (tool, input, found), `link_checked`, `qr_tested`, `abuse_report_submitted` |
| Is the site breaking? | `exception` (description: error name, plus message when it holds nothing personal; source: window, promise). Up to 10 per page load |

Every event also carries GA's own page_location, so the same event can be compared across the homepage, each `/qr-code-generator/*` page and the dashboard. `qr_downloaded.surface` separates the public generator, a saved code's page and the restyle tool.

## Traffic channels

GA4's default channel grouping files ChatGPT, Perplexity and the like under Referral. `lib/traffic-source.ts` sorts each landing into our own channels:

| Channel | How it's recognised |
| --- | --- |
| `ai_assistant` | Referrer chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com, meta.ai, grok.com, deepseek, mistral, you.com, phind, poe, kagi; or `utm_source` naming one (ChatGPT adds `utm_source=chatgpt.com` to its links) |
| `search` | Google, Bing, DuckDuckGo, Yahoo, Yandex, Baidu, Ecosia, Brave, Naver, Startpage, Qwant |
| `social` | Facebook, Instagram, X, LinkedIn, Reddit, YouTube, TikTok, Pinterest, Threads, Bluesky, Hacker News, Quora, Product Hunt, Discord, Telegram, WhatsApp |
| `email` | Webmail referrers, or `utm_medium` email/newsletter |
| `paid` | `gclid`, `msclkid`, or `utm_medium` cpc/ppc/paid/display |
| `qr_scan` | From qrfinity.link (a contact page, say), or `utm_medium` containing qr |
| `referral` | Any other site, by host name |
| `direct` | No referrer and no tags |

UTM tags win over the referrer. Coming back from our own pages, Google sign-in or Stripe continues the visit. The session channel lasts for the browser session; the first channel is kept with the visitor's analytics choice.

To tag our own links (newsletter, social posts, partner sites), use `utm_source`, `utm_medium` and `utm_campaign`. To tag printed QR codes that point at qrfinity.com, use `utm_medium=qr`.

## GA4 setup

Event parameter names avoid GA's reserved ones: `value` is only revenue, and plain `source`, `medium` and `campaign` are left to GA's own attribution, so ours are `choice`, `source_name`, `source_medium`, `source_campaign`, `input` and `user_plan`.

### Run the setup script (most of it)

`apps/web/scripts/ga-setup.ts` uses the GA Admin API to create the custom dimensions and metrics, mark the key events, set data retention to 14 months, turn Google signals off, turn file-download tracking off in enhanced measurement (we send `qr_downloaded` ourselves), and add a "QRfinity channels" channel group: GA's default channels with "AI assistants" ahead of Referral, set as primary so standard reports show it. It only adds what's missing, so it's safe to run again; `--dry-run` lists the changes without making them.

1. Get an access token with the `analytics.edit` scope, signed in as an account with Editor access to the property. The quickest way: open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), type `https://www.googleapis.com/auth/analytics.edit` in Step 1 and press Authorize APIs, sign in, then press Exchange authorization code for tokens and copy the access token (it lasts an hour). Or, with gcloud installed: `gcloud auth application-default login --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform`, and the script asks gcloud for the token itself.
2. From the repo:

   ```
   GA_ACCESS_TOKEN=ya29... NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX pnpm --filter @qrfinity/web ga:setup --dry-run
   GA_ACCESS_TOKEN=ya29... NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX pnpm --filter @qrfinity/web ga:setup
   ```

   It finds the property from the measurement id; `--property 123456789` picks one directly.

Register dimensions early: GA doesn't backfill them. Limits are 50 event-scoped and 25 user-scoped dimensions and 50 metrics; the script uses 45, 4 and 5. To report on a new parameter, add it to `DIMENSIONS` in the script and run it again.

### By hand (the Admin API doesn't cover these)

1. **Internal traffic**: Admin → Data streams → (web stream) → Configure tag settings → Define internal traffic, add the office IP; then Admin → Data collection and modification → Data filters → set the Internal traffic filter to Active.
2. **Unwanted referrals**: same Configure tag settings page → List unwanted referrals: `qrfinity.com`, `checkout.stripe.com`, `accounts.google.com`.
3. **Search Console link**: Admin → Product links → Search Console links, so landing pages show their queries.
4. **Check it**: open any page with `?ga_debug=1` (or set `NEXT_PUBLIC_GA_DEBUG=true` on a preview deploy) and watch Admin → DebugView.

## Reports to build (Explore)

- **Generator funnel** (funnel exploration, open funnel): `generator_started` → `qr_downloaded` (static) and `generator_started` → `dynamic_continue` → `sign_up` → `dynamic_code_created`. Breakdown: content_type, then traffic_channel.
- **Paid plan funnel**: `upgrade_prompt_shown` → `upgrade_prompt_clicked` → `begin_checkout` → `subscription_started`. Breakdown: feature. Tells which paid feature sells plans, and where people drop.
- **Feature demand** (free form): event `upgrade_prompt_shown` and `code_feature_saved` by feature; `design_option_used` by option and choice; `qr_downloaded` by format, logo, frame.
- **Use cases** (free form): `qr_downloaded` and `dynamic_code_created` by content_type × variant, with landing page as a column, to see which SEO pages bring which use cases.
- **Acquisition** (free form): users, `sign_up`, `dynamic_code_created`, `purchase` by first_channel and first_source; sessions by traffic_channel. Add a segment "AI assistants" (traffic_channel = ai_assistant).
- **Friction** (free form): `scan_check_failed` by reason; `content_problem` by content_type and reason; all `*_failed` events by code; `exception` by description and page.
- **Retention**: cohort exploration on `sign_up`, return criterion `code_updated` or `scan_report_viewed`.

Subscription renewals, cancellations and trial-to-paid conversion live in Stripe (exact revenue); GA counts the start of a plan. If renewal events are needed in GA later, send them from the Stripe webhook with the Measurement Protocol, keyed by the GA client id stored on the checkout.
