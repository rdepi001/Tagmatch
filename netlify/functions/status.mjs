// POST /api/status { token } -> { pro: boolean }
import { json, fail, isPro, body } from "../lib/util.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const { token } = await body(req);
  try {
    const p = await isPro(token);
    return json({ pro: !!p.ok, canManage: !!p.customer });
  } catch (e) {
    return fail(e.code || "server_error", 500);
  }
};
