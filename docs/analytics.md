# Site analytics: tracking plan and GA4 setup

What we measure on qrfinity.com, why, and how to set up Google Analytics 4 so the reports answer product questions. The code is `apps/web/lib/analytics.ts` (event catalog and privacy guard), `lib/generator-analytics.ts` (generator events), `lib/traffic-source.ts` (channels) and `components/Analytics.tsx` (loading, consent, user properties, errors). PostHog gets the same events.

## Rules

- Never on qrfinity.link or /admin. Consent rules as in docs/decisions.md (Site analytics).
- Events carry option names, counts and yes/no flags only. Never what a code holds (links, Wi-Fi names, contact details), never typed text, emails, colours or images. `cleanProps()` drops any value that looks like a link, email, path or long number, so a mistake at a call site loses the value instead of leaking it.
- No user id. User properties are broad: signed in or not, plan, first channel and source.
- Traffic sources keep the referrer's host name only, never its path or query.
- Before consent (EU, EEA, UK, Switzerland), nothing is written to storage for attribution; only an outside landing counts.

## Questions and the events that answer them

| Question | Events and parameters |
| --- | --- |
| Where do people come from, and which sources turn into users and customers? AI assistants vs search vs direct | `traffic_source` (channel, source, medium, campaign, first); `traffic_channel` on every event; user properties `first_channel`, `first_source` |
| What do people make QR codes for? | `generator_started`, `content_type_selected`, `content_variant_selected` (social platform, app store, payment method, Wi-Fi security), `qr_downloaded.content_type/variant`, `dynamic_code_created.content_type/variant` |
| Static or dynamic? | `code_kind_selected`, `qr_downloaded.kind`, `dynamic_continue`, `dynamic_code_created` |
| Which design features matter? | `design_option_used` (option, value; once per page load per value), design parameters on `qr_downloaded` and `dynamic_code_created` (dot_style, eye_style, colors, gradient, logo, frame, transparent), `design_saved`, `design_applied` |
| Where do people get stuck? | `content_problem` (too-long, invalid, lasting 4 s), `scan_check_failed` (reason: low-contrast, logo-coverage, margin, unreadable), `scan_warning_shown`, `download_failed`, `sign_in_failed`, `dynamic_code_create_failed`, `code_update_failed`, `code_feature_failed` (code: invalid, rate_limited, forbidden, not_found, server) |
| Which formats and sizes? | `qr_downloaded.format/size`, `upgrade_prompt_shown{feature: vectorFormats}` |
| Which paid features pull people towards a plan? | `upgrade_prompt_shown` and `upgrade_prompt_clicked` (feature: vectorFormats, custom_slug, rules, split, password, limits, contact_templates, account_plan), `code_feature_saved` (feature, on, count, template) |
| Does the plan funnel work? | `upgrade_prompt_clicked` → pricing page_view → `plan_interval_selected` → `begin_checkout` (plan, interval, value) → `checkout_cancelled` or `subscription_started` (trial) / `purchase` (transaction_id, value) → `billing_portal_opened` |
| Do accounts stick? | `sign_in_requested` → `sign_up` / `login` (method), `code_updated`, `code_managed` (move, tags, pause, resume, duplicate, delete, rename), `folder_managed`, `scan_report_viewed`, `scan_report_exported`, `short_link_copied`, `account_deleted` (paying) |
| Which tools get used? | `qr_read`, `link_checked`, `qr_tested`, `abuse_report_submitted` |
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

## GA4 setup (one time, in the GA4 admin)

1. **Data stream**: Web, qrfinity.com. Enhanced measurement on (page views, scrolls, outbound clicks, site search, file downloads off: we send `qr_downloaded` ourselves). Put the measurement id in `NEXT_PUBLIC_GA_ID`.
2. **Data retention**: Admin → Data collection and modification → Data retention → 14 months (the default 2 months is too short for explorations).
3. **Google signals**: leave off (the code also turns it off).
4. **Internal traffic**: Admin → Data streams → Configure tag settings → Define internal traffic, add the office IP; then Data filters → activate the Internal traffic filter. Also add qrfinity.com, checkout.stripe.com and accounts.google.com under List unwanted referrals.
5. **Key events** (Admin → Events, mark as key event): `qr_downloaded`, `dynamic_code_created`, `sign_up`, `begin_checkout`, `subscription_started`, `purchase`.
6. **Custom dimensions** (Admin → Custom definitions). Event-scoped: `content_type`, `variant`, `kind`, `format`, `size`, `scan`, `surface`, `dot_style`, `eye_style`, `colors`, `gradient`, `logo`, `frame`, `option`, `value`, `reason`, `warning`, `feature`, `code`, `plan`, `interval`, `trial`, `method`, `action`, `tool`, `outcome`, `channel`, `source`, `traffic_channel`. User-scoped: `plan`, `signed_in`, `first_channel`, `first_source`. Custom metrics: `count`, `saved_count`, `days`. GA4 allows 50 event-scoped dimensions, so this fits; register a dimension before you need it, since GA doesn't backfill.
7. **AI channel in GA's own reports**: Admin → Data display → Channel groups → Create new channel group, copy the default, then add a channel "AI assistants" above Referral with the condition Source matches regex `chatgpt|openai|perplexity|claude\.ai|gemini\.google|copilot|meta\.ai|grok|deepseek|mistral|you\.com|phind|poe\.com|kagi`. This complements our `traffic_channel`, which also counts tagged links.
8. **Search Console link**: Admin → Product links → Search Console, so landing pages show their queries.
9. **Check it**: open any page with `?ga_debug=1` (or set `NEXT_PUBLIC_GA_DEBUG=true` on a preview deploy) and watch Admin → DebugView.

## Reports to build (Explore)

- **Generator funnel** (funnel exploration, open funnel): `generator_started` → `qr_downloaded` (static) and `generator_started` → `dynamic_continue` → `sign_up` → `dynamic_code_created`. Breakdown: content_type, then traffic_channel.
- **Paid plan funnel**: `upgrade_prompt_shown` → `upgrade_prompt_clicked` → `begin_checkout` → `subscription_started`. Breakdown: feature. Tells which paid feature sells plans, and where people drop.
- **Feature demand** (free form): event `upgrade_prompt_shown` and `code_feature_saved` by feature; `design_option_used` by option and value; `qr_downloaded` by format, logo, frame.
- **Use cases** (free form): `qr_downloaded` and `dynamic_code_created` by content_type × variant, with landing page as a column, to see which SEO pages bring which use cases.
- **Acquisition** (free form): users, `sign_up`, `dynamic_code_created`, `purchase` by first_channel and first_source; sessions by traffic_channel. Add a segment "AI assistants" (traffic_channel = ai_assistant).
- **Friction** (free form): `scan_check_failed` by reason; `content_problem` by content_type and reason; all `*_failed` events by code; `exception` by description and page.
- **Retention**: cohort exploration on `sign_up`, return criterion `code_updated` or `scan_report_viewed`.

Subscription renewals, cancellations and trial-to-paid conversion live in Stripe (exact revenue); GA counts the start of a plan. If renewal events are needed in GA later, send them from the Stripe webhook with the Measurement Protocol, keyed by the GA client id stored on the checkout.
