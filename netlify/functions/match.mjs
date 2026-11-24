// POST /api/match  { tags:[{name,price}], receipt:[{name,price,qty}], token }
// Pro only: smart matching of shelf tags to abbreviated receipt lines.
import { env, fail, isPro, streamClaude, body } from "../lib/util.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const { tags, receipt, token } = await body(req);
  if (!Array.isArray(tags) || !Array.isArray(receipt) || tags.length > 200 || receipt.length > 400) return fail("bad_request");
  try {
    const pro = await isPro(token);
    if (!pro.ok) return fail("pro_required", 402);
    const clean = (s) => String(s ?? "").slice(0, 120);
    const prompt = `Match shelf tags to receipt lines from one grocery trip. Receipt names are abbreviated (e.g. "GM CHEERIOS 18Z" = "Cheerios 18 oz").
TAGS:
${tags.map((t, i) => `${i}: ${clean(t.name)} @ ${Number(t.price) || 0}`).join("\n")}
RECEIPT:
${receipt.map((r, i) => `${i}: ${clean(r.name)} qty ${Number(r.qty) || 1} charged ${Number(r.price) || 0}`).join("\n")}
Each receipt line matches at most one tag. Reply with only a JSON array, one entry per tag in order: [{"tag": number, "line": number or null}]. Use null when you are not confident.`;
    return await streamClaude({ prompt, model: env("MATCH_MODEL", "claude-haiku-5-5"), maxTokens: 2000 });
  } catch (e) {
    return fail(e.code || "server_error", e.code === "rate_limited" ? 429 : 500);
  }
};
