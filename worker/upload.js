/* Upload pages: /upload/<slug>... lets people who shot for Stevy upload footage (whole folders, camera angles, recordings) straight into his Dropbox.
   Chunks of 8 MB go through this Worker into a Dropbox upload session, so a flaky connection only repeats one chunk and an interrupted upload can resume.
   Needs a SECOND, write-scoped Dropbox app (files.content.write): secrets DBXW_APP_KEY, DBXW_APP_SECRET, DBXW_REFRESH. Registration: POST /upload-register with x-key = PRICE_CODE. */
import { dbxToken, json, same, tooMany } from "./delivery.js";
const SLUG = /^[a-z0-9]{10,40}$/;
const clean = (t, n = 80) => String(t || "").replace(/[\\:*?"<>|\x00-\x1f]/g, "").replace(/\.\.+/g, ".").trim().slice(0, n);
const relOk = r => String(r || "").split("/").map(x => clean(x, 120)).filter(x => x && x !== ".").join("/").slice(0, 400);
const RISKY = /\.(exe|bat|cmd|com|scr|msi|dll|js|mjs|jar|vbs|ps1|sh|app|dmg|pkg|html?|svg|php|command|scpt)$/i;   // nothing that runs or renders may land in Stevy's Dropbox
const content = async (env, endpoint, arg, body) => fetch("https://content.dropboxapi.com/2/files/" + endpoint, { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env, true), "Dropbox-API-Arg": JSON.stringify(arg), "Content-Type": "application/octet-stream" }, body });

export async function handleUpload(request, env, url, origin, notify) {
  const path = url.pathname;
  if (path === "/upload-register" && request.method === "POST") {
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""); if (!SLUG.test(slug) || !String(b.path || "").startsWith("/")) return json(400, { ok: false, error: "slug or path" }, origin);
    await env.IG.put("upl:" + slug, JSON.stringify({ path: String(b.path).replace(/\/+$/, ""), title: String(b.title || "").slice(0, 120), pass: String(b.pass || "").slice(0, 60), exp: Number(b.exp) || 0 }));
    return json(200, { ok: true }, origin);
  }
  const m = path.match(/^\/upload\/([a-z0-9]+)(?:\/(start|chunk|finish|done))?$/);
  if (!m) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-pass", "Access-Control-Max-Age": "86400" } });
  const [, slug, action] = m; if (!SLUG.test(slug)) return json(404, { error: "not found" }, origin);
  let rec; try { rec = JSON.parse(await env.IG.get("upl:" + slug) || "null"); } catch { rec = null; }
  if (!rec) return json(404, { error: "not found" }, origin);
  if (rec.exp && rec.exp < Date.now()) return json(410, { error: "expired" }, origin);
  if (rec.pass && !same(request.headers.get("x-pass") || url.searchParams.get("k") || "", rec.pass)) return json(401, { error: "code", title: rec.title }, origin);
  const dest = (who, rel) => `${rec.path}/UPLOADS/${clean(who, 40) || "unknown"}/${relOk(rel)}`;
  try {
    if (!action) return json(200, { title: rec.title }, origin);
    if (request.method !== "POST") return json(405, { error: "method" }, origin);
    if (action === "start") {
      if (await tooMany(env, request, "upstart", 300, 3600)) return json(429, { error: "slow down" }, origin);
      if (RISKY.test(String(url.searchParams.get("rel") || ""))) return json(415, { error: "type" }, origin);
      const r = await content(env, "upload_session/start", { close: false }, new Uint8Array(0)); if (!r.ok) return json(502, { error: "start" }, origin);
      return json(200, { sid: (await r.json()).session_id, dest: dest(url.searchParams.get("who"), url.searchParams.get("rel")) }, origin);
    }
    const sid = String(url.searchParams.get("sid") || "").slice(0, 80), off = Number(url.searchParams.get("off")) || 0;
    if (action === "chunk") {
      if (await tooMany(env, request, "upchunk", 4000, 3600)) return json(429, { error: "slow down" }, origin);
      if (off > 60 * 1024 * 1024 * 1024) return json(413, { error: "too big" }, origin);
      const body = await request.arrayBuffer(); if (body.byteLength > 16 * 1024 * 1024) return json(413, { error: "chunk too big" }, origin);
      const r = await content(env, "upload_session/append_v2", { cursor: { session_id: sid, offset: off }, close: false }, body);
      if (r.status === 409) { const e = await r.json().catch(() => ({})); const c = e && e.error && e.error.correct_offset; if (typeof c === "number") return json(409, { offset: c }, origin); return json(409, { error: "conflict" }, origin); }
      if (!r.ok) return json(502, { error: "append" }, origin);
      return json(200, { offset: off + body.byteLength }, origin);
    }
    if (action === "finish") {
      const to = String(url.searchParams.get("dest") || ""); if (!to.startsWith(rec.path + "/UPLOADS/") || to.split("/").some(s => s === ".." || s === ".") || /[\\\x00-\x1f]/.test(to) || RISKY.test(to) || to.length > 700) return json(403, { error: "path" }, origin);
      const r = await content(env, "upload_session/finish", { cursor: { session_id: sid, offset: off }, commit: { path: to, mode: "add", autorename: true, mute: true } }, new Uint8Array(0));
      if (!r.ok) return json(502, { error: "finish" }, origin);
      return json(200, { ok: true }, origin);
    }
    if (action === "done") {
      let b; try { b = JSON.parse((await request.text()).slice(0, 30000)); } catch { return json(400, { error: "json" }, origin); }
      const gb = n => (n / 1073741824).toFixed(2) + " GB";
      await env.IG.put("upldone:" + slug + ":" + Date.now(), JSON.stringify({ at: new Date().toISOString(), who: clean(b.who), count: Number(b.count) || 0, bytes: Number(b.bytes) || 0, notes: clean(b.notes, 600), failed: Number(b.failed) || 0 }), { expirationTtl: 180 * 86400 });
      if (notify) await notify({ subject: `Footage uploaded: ${rec.title}`, heading: "Footage uploaded", intro: `${clean(b.who) || "Someone"} uploaded ${Number(b.count) || 0} files (${gb(Number(b.bytes) || 0)}) for ${rec.title}`,
        rows: [["Uploader", clean(b.who) || "-"], ["Files", String(Number(b.count) || 0)], ["Size", gb(Number(b.bytes) || 0)], ["Notes", clean(b.notes, 600) || "-"], ["Failed", String(Number(b.failed) || 0)], ["Folder", `${rec.path}/UPLOADS/${clean(b.who, 40)}`]] });
      return json(200, { ok: true }, origin);
    }
  } catch (e) { return json(500, { error: "failed" }, origin); }
  return json(405, { error: "method" }, origin);
}
