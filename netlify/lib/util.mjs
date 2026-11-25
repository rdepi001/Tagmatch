// Shared helpers for TagMatch server functions. No npm packages needed.
import crypto from "node:crypto";

export const env = (k, d = "") => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? d);

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const fail = (code, status = 400, message = "") => json({ error: code, message }, status);

export function siteUrl(req) {
  const configured = env("SITE_URL");
  if (configured) return configured.replace(/\/$/, "");
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

/* ---------- Pro tokens: signed with SESSION_SECRET, no database ---------- */
const b64u = (buf) => Buffer.from(buf).toString("base64url");

export function signToken(customerId) {
  const secret = env("SESSION_SECRET");
  if (!secret) throw new Error("SESSION_SECRET not set");
  const body = b64u(JSON.stringify({ c: customerId, t: Date.now() }));
  const sig = b64u(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function readToken(token) {
  const secret = env("SESSION_SECRET");
  if (!secret || !token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const want = b64u(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig || ""), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}

/* ---------- Stripe (REST, form-encoded) ---------- */
export async function stripe(method, path, params) {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw Object.assign(new Error("STRIPE_SECRET_KEY not set"), { code: "not_configured" });
  const opts = { method, headers: { authorization: `Bearer ${key}` } };
  let url = `https://api.stripe.com/v1/${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (method === "GET") url += `?${qs}`;
    else { opts.body = qs; opts.headers["content-type"] = "application/x-www-form-urlencoded"; }
  }
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) {
    const kind = key.startsWith("sk_live_") ? "sk_live_" : key.startsWith("sk_test_") ? "sk_test_" : key.startsWith("rk_") ? "restricted key" : key.startsWith("sk-ant-") ? "ANTHROPIC key (wrong key in STRIPE_SECRET_KEY)" : "unknown format";
    console.error(`[stripe] ${method} ${path} failed (${r.status}): ${data?.error?.message || "no message"} | key type: ${kind}`);
    throw Object.assign(new Error(data?.error?.message || "Stripe error"), { code: "stripe_error" });
  }
  return data;
}

// Cache subscription checks for 10 minutes per warm function instance.
const subCache = new Map();
export async function isPro(token) {
  if (env("PRO_FOR_EVERYONE") === "true") return { ok: true, customer: null }; // testing switch
  const t = readToken(token);
  if (!t?.c) return { ok: false };
  const hit = subCache.get(t.c);
  if (hit && Date.now() - hit.at < 600000) return { ok: hit.ok, customer: t.c };
  const subs = await stripe("GET", "subscriptions", { customer: t.c, status: "all", limit: "10" });
  const ok = (subs.data || []).some((s) => ["active", "trialing"].includes(s.status));
  subCache.set(t.c, { ok, at: Date.now() });
  return { ok, customer: t.c };
}

/* ---------- Anthropic (Claude) ---------- */
export async function askClaude({ prompt, image, mediaType, model, maxTokens = 1500 }) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw Object.assign(new Error("ANTHROPIC_API_KEY not set"), { code: "not_configured" });
  const content = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } });
  content.push({ type: "text", text: prompt });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  if (r.status === 429) throw Object.assign(new Error("rate limited"), { code: "rate_limited" });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || "AI error"), { code: r.status === 400 ? "image_rejected" : "ai_error" });
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return parseJson(text);
}

export function parseJson(text) {
  const s = String(text).replace(/```(?:json)?/g, "").trim();
  const start = s.search(/[\[{]/);
  if (start < 0) throw Object.assign(new Error("no json"), { code: "invalid_json" });
  const open = s[start], close = open === "[" ? "]" : "}";
  const end = s.lastIndexOf(close);
  try { return JSON.parse(s.slice(start, end + 1)); }
  catch { throw Object.assign(new Error("bad json"), { code: "invalid_json" }); }
}

export async function body(req) {
  try { return await req.json(); } catch { return {}; }
}
/* ---------- Streaming Claude: avoids the 10-second limit on normal functions ----------
   Streams plain text to the browser as Claude writes it. onDone runs after a complete answer. */
export async function streamClaude({ prompt, image, pdf, mediaType, model, maxTokens = 1500, onDone }) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return fail("not_configured", 500);
  const content = [];
  if (pdf) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } });
  if (image) content.push({ type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } });
  content.push({ type: "text", text: prompt });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, messages: [{ role: "user", content }] }),
  });
  if (!r.ok || !r.body) {
    const code = r.status === 429 ? "rate_limited" : r.status === 400 ? "file_rejected" : "ai_error";
    return fail(code, r.status === 429 ? 429 : 502);
  }
  const enc = new TextEncoder(), dec = new TextDecoder();
  let buf = "", finished = false;
  const out = new ReadableStream({
    async start(ctrl) {
      const reader = r.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const evt = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = evt.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let d; try { d = JSON.parse(line.slice(5)); } catch { continue; }
            if (d.type === "content_block_delta" && d.delta?.type === "text_delta") ctrl.enqueue(enc.encode(d.delta.text));
            else if (d.type === "message_stop") finished = true;
            else if (d.type === "error") ctrl.enqueue(enc.encode("\n<<STREAM_ERROR>>"));
          }
        }
        if (finished && onDone) { try { await onDone(); } catch {} }
        if (!finished) ctrl.enqueue(enc.encode("\n<<STREAM_ERROR>>"));
      } catch {
        ctrl.enqueue(enc.encode("\n<<STREAM_ERROR>>"));
      }
      ctrl.close();
    },
  });
  return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
