/* Crew briefing pages: /brief/<slug> serves one job's briefing (JSON) and /brief-img/<slug>/<id> its reference photos, for the page at /b/?c=<slug>.
   The link itself is the key (long random slug, noindex). Registration comes from the Projecten app with x-key = PRICE_CODE; records live in KV (IG) under "brief:<slug>" and "briefimg:<slug>:<id>", gone after 150 days. */
import { json, tooMany, adminOk } from "./delivery.js";
const SLUG = /^[a-z0-9]{10,40}$/, ID = /^[a-z0-9]{4,24}$/;
const TTL = 150 * 86400;
export async function handleBrief(request, env, url, origin) {
  const path = url.pathname;
  if ((path === "/brief-register" || path === "/brief-img-put") && request.method === "POST") {
    if (!(await adminOk(env, request))) return json(401, { ok: false }, origin);
    if (path === "/brief-register") {
      let b; try { b = JSON.parse((await request.text()).slice(0, 300000)); } catch { return json(400, { ok: false }, origin); }
      const slug = String(b.slug || ""); if (!SLUG.test(slug) || typeof b.doc !== "object" || !b.doc) return json(400, { ok: false, error: "slug or doc" }, origin);
      await env.IG.put("brief:" + slug, JSON.stringify({ doc: b.doc, at: new Date().toISOString() }), { expirationTtl: TTL });
      return json(200, { ok: true }, origin);
    }
    const slug = url.searchParams.get("slug") || "", id = url.searchParams.get("id") || "";
    if (!SLUG.test(slug) || !ID.test(id)) return json(400, { ok: false }, origin);
    const buf = await request.arrayBuffer(); if (!buf.byteLength || buf.byteLength > 2.5 * 1024 * 1024) return json(413, { ok: false, error: "size" }, origin);
    await env.IG.put(`briefimg:${slug}:${id}`, buf, { expirationTtl: TTL });
    return json(200, { ok: true }, origin);
  }
  if (request.method !== "GET") return null;
  let m = path.match(/^\/brief\/([a-z0-9]+)$/);
  if (m) {
    if (!SLUG.test(m[1])) return json(404, { error: "not found" }, origin);
    if (await tooMany(env, request, "brief", 120, 3600)) return json(429, { error: "slow down" }, origin);
    let rec; try { rec = JSON.parse(await env.IG.get("brief:" + m[1]) || "null"); } catch { rec = null; }
    return rec ? json(200, { ...rec.doc, updated: rec.at }, origin) : json(404, { error: "not found" }, origin);
  }
  m = path.match(/^\/brief-img\/([a-z0-9]+)\/([a-z0-9]+)$/);
  if (m) {
    if (!SLUG.test(m[1]) || !ID.test(m[2])) return new Response("Not found", { status: 404 });
    const buf = await env.IG.get(`briefimg:${m[1]}:${m[2]}`, "arrayBuffer");
    return buf ? new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } }) : new Response("Not found", { status: 404 });
  }
  return null;
}
