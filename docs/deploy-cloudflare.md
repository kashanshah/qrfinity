# Deploying the QR engine and analytics (Cloudflare)

This puts dynamic codes live: the redirect Worker on `qrfinity.link`, the private edge-api Worker that the app writes through, and scan analytics in Workers Analytics Engine. About 30 minutes.

Everything below happens in the **Cloudflare account that owns qrfinity.link** (kept separate from qrfinity.com on purpose). Run the commands on your computer from the repository root, on `main`.

## What you'll end up with

| Piece | Where | Does |
| --- | --- | --- |
| `qrfinity-redirect` Worker | `https://qrfinity.link/<slug>` | Looks up the slug in KV (Postgres fallback through Hyperdrive), sends a 302, records the scan in Analytics Engine |
| `qrfinity-edge-api` Worker | `https://edge.qrfinity.link` | The only writer to KV. Accepts signed requests from the app. Creates the daily visitor-hash salt |
| KV namespace `LINKS` | shared by both Workers | Slug → destination records |
| Hyperdrive config | redirect Worker | Read-only Postgres fallback (role `redirect_reader`, can read one view only) |
| Analytics Engine dataset `qrfinity_scans` | created on the first scan | Scan events, kept 90 days; the app rolls them into daily totals every night |

## 0. Before you start

- Workers **Paid** plan on that account (Workers & Pages → Plans, $5/month). Analytics Engine and Hyperdrive need it.
- `qrfinity.link` is an active zone in that account (done in Phase 3: nameservers moved to Cloudflare).
- Neon is set up and `pnpm db:migrate` has run against it.
- `psql` installed (`brew install libpq && brew link --force libpq` on a Mac).

```sh
pnpm install
pnpm --filter @qrfinity/redirect exec wrangler login   # log in to the qrfinity.link account
pnpm --filter @qrfinity/redirect exec wrangler whoami  # check it's the right account
```

## 1. KV namespace

```sh
pnpm --filter @qrfinity/redirect exec wrangler kv namespace create LINKS
```

Copy the `id` it prints into **both** `apps/redirect/wrangler.jsonc` and `apps/edge-api/wrangler.jsonc` (replace `REPLACE_WITH_KV_NAMESPACE_ID`).

## 2. Read-only database role

In Neon, copy the **direct** (not pooled) connection string for the database owner. Then, with a strong new password for the read-only role:

```sh
psql "<owner connection string>" -v password="'<new strong password>'" -f packages/db/sql/redirect-reader.sql
DATABASE_URL="<owner connection string>" pnpm db:migrate   # applies the grant now that the role exists
```

## 3. Hyperdrive

Use the same direct host, with the read-only role:

```sh
pnpm --filter @qrfinity/redirect exec wrangler hyperdrive create qrfinity-redirect \
  --connection-string="postgres://redirect_reader:<password>@<direct-host>/<database>?sslmode=require"
```

Copy the `id` into `apps/redirect/wrangler.jsonc` (replace `REPLACE_WITH_HYPERDRIVE_ID`).

The KV and Hyperdrive ids aren't secrets: commit them.

## 4. Shared secret

```sh
openssl rand -hex 32          # keep this; it also goes into Vercel as EDGE_API_SECRET
pnpm --filter @qrfinity/edge-api exec wrangler secret put EDGE_API_SECRET
```

## 5. Deploy both Workers

```sh
pnpm --filter @qrfinity/edge-api run deploy
pnpm --filter @qrfinity/redirect run deploy
```

Keep the word `run`: `deploy` is also a built-in pnpm command, and without `run` pnpm tries that instead ("ERR_PNPM_INVALID_DEPLOY_TARGET").

Wrangler creates the custom domains `edge.qrfinity.link` and `qrfinity.link` and their certificates. Check:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://qrfinity.link/doesnotexist   # 404: the redirect Worker answers
curl -s https://edge.qrfinity.link/v1/health                                    # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://edge.qrfinity.link/v1/links   # 401: unsigned requests are refused
```

## 6. Analytics API token

Cloudflare dashboard → My Profile → API Tokens → Create token → Custom token:

- Permissions: **Account → Account Analytics → Read**
- Account resources: the qrfinity.link account only

Copy the token. The account id is on the account's home page (right-hand side), or in `wrangler whoami`.

## 7. Vercel environment variables

Project → Settings → Environment Variables (Production), then redeploy:

| Variable | Value |
| --- | --- |
| `EDGE_API_URL` | `https://edge.qrfinity.link` |
| `EDGE_API_SECRET` | the value from step 4 |
| `ANALYTICS_BACKEND` | `analytics-engine` |
| `CF_ACCOUNT_ID` | from step 6 |
| `CF_ANALYTICS_TOKEN` | from step 6 |
| `CRON_SECRET` | `openssl rand -hex 32` (Vercel sends it to the crons) |
| `SHORT_LINK_ORIGIN` | leave empty in production |

## 8. Check it end to end

1. Sign in at qrfinity.com, create a dynamic code, download it.
2. Scan it with your phone: it should open the destination. `curl -sI https://qrfinity.link/<slug>` shows `302` and `location:`.
3. Change the destination in the dashboard and scan again: the new address, usually within a minute.
4. Analytics in the dashboard show the scans within a couple of minutes.
5. Next day: Vercel → Logs → the `/api/cron/rollup` run returns `[{ "day": …, "codes": … }]`, not an error. That confirms the nightly roll-up queries work on real Analytics Engine data.

Codes created before the Workers existed are pushed to KV by the edge-sync cron (every minute) once `EDGE_API_URL` is set.

## If something is wrong

| Symptom | Likely cause |
| --- | --- |
| Dashboard says "Analytics isn't connected" | `ANALYTICS_BACKEND`, `CF_ACCOUNT_ID` or `CF_ANALYTICS_TOKEN` missing, or no redeploy after setting them |
| Analytics errors, "responded 401/403" in logs | Token lacks Account Analytics: Read, or is scoped to the other account |
| New codes don't redirect | `EDGE_API_URL` / `EDGE_API_SECRET` missing or different from the Worker secret; the edge-sync cron retries every minute |
| Redirects work but a just-created code 404s for a minute | Normal edge caching of a miss (up to 5 minutes for slugs scanned before they existed) |
| `wrangler deploy` fails on the custom domain | The zone `qrfinity.link` isn't in the account you're logged in to |
