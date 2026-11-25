# TagMatch: launch package

Everything needed to put TagMatch online and charge for Pro.

- `public/`: the app (installable on phones), privacy policy, terms, icons
- `netlify/functions/`: server code for photo reading (Claude) and payments (Stripe). No packages to install.
- `store-assets/`: Google Play icon (512×512) and feature graphic (1024×500)

## Before you upload, replace these placeholders
- `public/index.html`: `supportEmail` near the top of the script
- `public/privacy.html` and `public/terms.html`: `REPLACE_WITH_YOUR_LLC_NAME` and `REPLACE_WITH_YOUR_EMAIL`

## Settings to add in Netlify (Site configuration → Environment variables)
| Name | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | From console.anthropic.com → API keys. Pays for photo reading. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key (use the `sk_test_` key while testing) |
| `STRIPE_PRICE_ID` | Stripe → Product catalog → TagMatch Pro → the monthly price's ID (`price_...`) |
| `SESSION_SECRET` | Any long random password (30+ characters). Never share it. |
| `SITE_URL` | Your live address, e.g. `https://tagmatch.netlify.app` |
| `TRIAL_DAYS` | Optional. Default 7. Use 0 for no trial (also change `trialDays` in index.html). |
| `PRO_FOR_EVERYONE` | Optional. Set to `true` to test photo reading without paying. Remove before launch. |

## Deploy
1. Make a free GitHub account and a new repository named `tagmatch`. Upload the contents of this folder (Add file → Upload files).
2. Make a free Netlify account → Add new site → Import from GitHub → pick `tagmatch`. Leave the build settings as they are (netlify.toml sets them).
3. Add the environment variables above, then Deploys → Trigger deploy.
4. Stripe → Settings → Billing → Customer portal → turn it on (lets subscribers cancel themselves).

## Google Play
1. Go to pwabuilder.com, enter your live URL, choose Android → Generate. Download the package.
2. Copy the package ID and SHA-256 fingerprint it gives you into `public/.well-known/assetlinks.json`, upload, redeploy.
3. In Play Console, create the app, upload the `.aab`, add the store-assets graphics, the privacy URL (`/privacy.html`), and start a closed test with 12+ testers for 14 days.

The Android app hides the buy button (`hideBuyInAndroidApp`), so subscribers buy on the website and enter their Pro code in the app. That keeps it clear of Google Play's billing rules. Ask before changing it.
.
