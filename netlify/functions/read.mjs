// POST /api/read  { kind: "tag"|"receipt", image: base64 jpeg, token }
// Pro only: reads a shelf tag or receipt photo with Claude.
import { env, fail, isPro, streamClaude, body } from "../lib/util.mjs";

const TAG_PROMPT = (year) => `This photo shows a retail shelf price tag or sale sign. Read it.
Reply with only JSON: {"name": string, "price": number, "ends": "YYYY-MM-DD" or null, "kind": "regular"|"sale"|"loyalty"|"coupon", "store": string or null, "confident": boolean}
"price" is the per-item price a shopper would pay (for "2 for $5" use 2.5). "ends" is the sale end date if printed (assume year ${year} if missing). "kind" is "loyalty" if it needs a store card/membership, "coupon" if it needs a digital coupon. "confident" is false if any part was blurry or guessed. If the image is not a price tag, reply {"error":"not a tag"}.`;

const REC_PROMPT = `This photo shows a store receipt, or part of one. List every purchased item line, top to bottom.
Reply with only JSON: {"store": string or null, "date": "YYYY-MM-DD" or null, "items": [{"name": string, "price": number, "qty": number}]}
"price" is the final amount charged for that line after any discounts printed directly beneath it (subtract them). Skip subtotal, tax, total, payment and change lines. If it is not a receipt, reply {"error":"not a receipt"}.`;

export default async (req) => {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const { kind, image, token } = await body(req);
  if (!["tag", "receipt"].includes(kind) || typeof image !== "string") return fail("bad_request");
  if (image.length > 6_000_000) return fail("image_too_large", 413);
  try {
    const pro = await isPro(token);
    if (!pro.ok) return fail("pro_required", 402);
    return await streamClaude({
      prompt: kind === "tag" ? TAG_PROMPT(new Date().getFullYear()) : REC_PROMPT,
      image: image.replace(/^data:image\/\w+;base64,/, ""),
      model: env("PHOTO_MODEL", "claude-sonnet-5-5"),
    });
  } catch (e) {
    return fail(e.code || "server_error", e.code === "rate_limited" ? 429 : 500);
  }
};
