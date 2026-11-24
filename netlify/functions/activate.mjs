// POST /api/activate { session_id } -> { token }  Turns a finished checkout into a Pro code.
import { json, fail, stripe, signToken, body } from "../lib/util.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const { session_id } = await body(req);
  if (typeof session_id !== "string" || !session_id.startsWith("cs_")) return fail("bad_request");
  try {
    const s = await stripe("GET", `checkout/sessions/${encodeURIComponent(session_id)}`);
    if (s.status !== "complete" || !s.customer) return fail("checkout_incomplete", 402);
    return json({ token: signToken(s.customer) });
  } catch (e) {
    return fail(e.code || "server_error", 500);
  }
};
