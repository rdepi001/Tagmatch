// POST /api/checkout -> { url }  Starts a Stripe Checkout for TagMatch Pro (with free trial).
import { env, json, fail, stripe, siteUrl } from "../lib/util.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const price = env("STRIPE_PRICE_ID");
  if (!price) return fail("not_configured", 500);
  const site = siteUrl(req);
  const params = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${site}/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/?checkout=cancelled`,
    allow_promotion_codes: "true",
  };
  const trial = parseInt(env("TRIAL_DAYS", "7"), 10);
  if (trial > 0) params["subscription_data[trial_period_days]"] = String(trial);
  try {
    const s = await stripe("POST", "checkout/sessions", params);
    return json({ url: s.url });
  } catch (e) {
    return fail(e.code || "server_error", 500, e.message);
  }
};
