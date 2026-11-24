// POST /api/portal { token } -> { url }  Stripe page where subscribers cancel or update their card.
import { json, fail, stripe, readToken, siteUrl, body } from "../lib/util.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const { token } = await body(req);
  const t = readToken(token);
  if (!t?.c) return fail("bad_token", 401);
  try {
    const s = await stripe("POST", "billing_portal/sessions", { customer: t.c, return_url: siteUrl(req) + "/" });
    return json({ url: s.url });
  } catch (e) {
    return fail(e.code || "server_error", 500);
  }
};
