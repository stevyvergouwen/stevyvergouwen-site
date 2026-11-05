/* Brada album pages: /brada/<slug>/... shows a Brada job's finished photos and clips from a VIEW-ONLY Dropbox shared link (read only, the Brada Dropbox itself is never touched).
   Two views of the same page: the client (key missing or wrong) sees the album; Brada (the right key in ?k=) also gets the Dropbox link, the client link and downloads.
   The Projecten app registers a page with POST /brada-register (header x-key, same as the other registrations). The record lives in KV (IG) under "brada:<slug>".
   The Dropbox link is never sent to a client view. */
import { json, adminOk, dbxToken, same } from "./delivery.js";
const SLUG = /^[a-z0-9]{12,40}$/, KEY = /^[a-z0-9]{12,40}$/;
const LINK = /^https:\/\/(www\.)?dropbox\.com\/(scl\/fo|sh)\//;
const HIDE = new Set(["uploads", "raw video", "raw footage", "raw audio", "stacks", "preview-wm", "audio"]);
const isPhoto = n => /\.(jpe?g|png|webp|heic)$/i.test(n), isVideo = n => /\.(mp4|mov|m4v)$/i.test(n);

async function dbx(env, endpoint, body) {
  const r = await fetch("https://api.dropboxapi.com/2/" + endpoint, { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const t = (await r.text().catch(() => "")).slice(0, 160); throw new Error(endpoint + " " + r.status + " " + t); }
  return r.json();
}
/** Everything under the shared link, sorted into the blocks of the page. Cached for two minutes so a busy page costs one Dropbox listing. */
async function manifest(env, slug, rec) {
  const ck = "bradamf:" + slug, c = await env.IG.get(ck, "json"); if (c) return c;
  const link = { url: rec.link }, all = []; let level = [""], calls = 0;
  for (let depth = 0; depth < 5 && level.length; depth++) {   // Dropbox lists a shared link one folder at a time
    const next = [];
    await Promise.all(level.map(async dir => {
      if (calls++ > 80) return;
      let res = await dbx(env, "files/list_folder", { path: dir, shared_link: link, limit: 2000 });
      const entries = [...res.entries];
      while (res.has_more) { res = await dbx(env, "files/list_folder/continue", { cursor: res.cursor }); entries.push(...res.entries); }
      for (const e of entries) {
        const path = dir + "/" + e.name;
        if (e[".tag"] === "folder") { if (!HIDE.has(e.name.toLowerCase())) next.push(path); }
        else if (e[".tag"] === "file") all.push({ ...e, path });
      }
    }));
    level = next;
  }
  const out = { highlights: [], previews: [], high: [], low: [], videos: [] };
  for (const e of all) {
    const path = e.path, parts = path.toLowerCase().split("/").filter(Boolean).slice(0, -1);
    if (parts.some(p => HIDE.has(p))) continue;
    const it = { n: e.name.replace(/\.[^.]+$/, ""), p: path, s: e.size || 0 };
    if (isPhoto(e.name)) {
      if (parts.includes("highlights")) out.highlights.push(it);
      else if (parts.includes("previews") || parts.includes("preview")) out.previews.push(it);
      else if (parts.some(p => p === "lowres" || p === "low res")) out.low.push(it);
      else out.high.push(it);   // HighRes, or any photo outside the known folders
    } else if (isVideo(e.name)) out.videos.push(it);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.p.localeCompare(b.p, "en", { numeric: true }));
  await env.IG.put(ck, JSON.stringify(out), { expirationTtl: 120 });
  return out;
}
const role = (rec, url) => (url.searchParams.get("k") && rec.key && same(url.searchParams.get("k"), rec.key)) ? "brada" : "client";
const inside = p => typeof p === "string" && p.startsWith("/") && !p.includes("..") && p.length < 400;

/** Who opened it: a personal link (?t=) names the person, the plain link counts as "someone". The first open of each person, and the first anonymous open of a day, is mailed to Stevy. Brada's own view is never counted. */
async function visit(env, slug, rec, request, url, notify) {
  const t = url.searchParams.get("t") || "", who = (rec.people || []).find(x => x.t === t), key = who ? who.t : "anon", name = who ? who.n : "";
  const vk = "bradav:" + slug; let v = {}; try { v = JSON.parse(await env.IG.get(vk) || "{}") || {}; } catch { v = {}; }
  const e = v[key] || { n: name, c: 0, first: 0, last: 0 }, now = Date.now(), neu = !e.first;
  if (!neu && now - e.last < 10 * 60 * 1000) return;   // the same person reloading: not a new visit
  e.c++; e.last = now; if (neu) e.first = now; e.n = name || e.n; if (!who) e.country = (request.cf && request.cf.country) || e.country || "";
  v[key] = e; await env.IG.put(vk, JSON.stringify(v));
  const dag = new Date(now).toISOString().slice(0, 10);
  const melden = who ? neu : !(await env.IG.get("bradan:" + slug + ":" + dag));
  if (!who && melden) await env.IG.put("bradan:" + slug + ":" + dag, "1", { expirationTtl: 2 * 86400 });
  if (melden && notify) { try { await notify({ subject: `${who ? name : "Someone"} opened ${rec.title}`, heading: who ? `${name} opened the album` : "Someone opened the album", intro: `${who ? name : "Someone with the plain link"} opened "${rec.title}"${rec.client ? " (" + rec.client + ")" : ""}${who ? " for the first time" : ""}.`, rows: [["Album", rec.title], ["Who", who ? name : "plain link" + (e.country ? " · " + e.country : "")], ["Visits", String(e.c)]] }); } catch { /* the page still opens */ } }
}
export async function handleBrada(request, env, url, origin, notify) {
  const path = url.pathname;
  if (path === "/brada-register" && request.method === "POST") {
    if (!(await adminOk(env, request))) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""), key = String(b.key || ""), link = String(b.link || "");
    if (!SLUG.test(slug) || !KEY.test(key) || !LINK.test(link)) return json(400, { ok: false, error: "slug, key or link" }, origin);
    const people = (Array.isArray(b.people) ? b.people : []).slice(0, 30).map(x => ({ t: String(x.t || ""), n: String(x.n || "").slice(0, 60) })).filter(x => /^[a-z0-9]{8,24}$/.test(x.t) && x.n);
    const rec = { link: link.replace(/&dl=\d/, "").slice(0, 400), key, people, title: String(b.title || "").slice(0, 120), client: String(b.client || "").slice(0, 80), date: String(b.date || "").slice(0, 10), location: String(b.location || "").slice(0, 160), note: String(b.note || "").slice(0, 300), at: Date.now() };
    await env.IG.put("brada:" + slug, JSON.stringify(rec));
    await env.IG.delete("bradamf:" + slug);
    return json(200, { ok: true }, origin);
  }
  if (path === "/brada-visits" && request.method === "GET") {   // for the app: who opened it, how often, when
    if (!(await adminOk(env, request))) return json(401, { ok: false }, origin);
    const slug = url.searchParams.get("slug") || ""; if (!SLUG.test(slug)) return json(400, { ok: false }, origin);
    let v = {}; try { v = JSON.parse(await env.IG.get("bradav:" + slug) || "{}") || {}; } catch { v = {}; }
    return json(200, { ok: true, visits: Object.entries(v).map(([k, e]) => ({ who: k === "anon" ? "" : e.n, anon: k === "anon", count: e.c, first: e.first, last: e.last, country: e.country || "" })) }, origin);
  }
  const m = path.match(/^\/brada\/([a-z0-9]{12,40})\/(manifest|img|stream|file)$/);
  if (!m) return null;
  let rec; try { rec = JSON.parse(await env.IG.get("brada:" + m[1]) || "null"); } catch { rec = null; }
  if (!rec) return json(404, { error: "not found" }, origin);
  const r = role(rec, url);
  if (m[2] === "manifest") {
    if (r === "client") await visit(env, m[1], rec, request, url, notify);
    let mf; try { mf = await manifest(env, m[1], rec); } catch (e) { return json(502, { error: "dropbox", detail: String(e && e.message || e).slice(0, 240) }, origin); }
    const body = { role: r, title: rec.title, client: rec.client, date: rec.date, location: rec.location, note: rec.note, ...mf };
    if (r === "brada") { body.dropbox = rec.link; body.downloadAll = rec.link.replace(/([?&])dl=\d/, "$1dl=1").includes("dl=1") ? rec.link.replace(/([?&])dl=\d/, "$1dl=1") : rec.link + (rec.link.includes("?") ? "&" : "?") + "dl=1"; }
    return json(200, body, origin);
  }
  const p = url.searchParams.get("p") || ""; if (!inside(p)) return json(400, { error: "path" }, origin);
  if (m[2] === "img") {   // a thumbnail through the shared link: the client never sees Dropbox
    const size = url.searchParams.get("s") === "large" ? "w2048h1536" : "w640h480";
    const res = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Dropbox-API-Arg": JSON.stringify({ resource: { ".tag": "link", url: rec.link, path: p }, format: "jpeg", size, mode: "bestfit" }) } });
    if (!res.ok) return new Response((await res.text().catch(() => "")).slice(0, 200), { status: res.status === 404 ? 404 : 502 });
    return new Response(res.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  }
  // stream (a clip played on the page, ranges for scrubbing) and file (Brada only: the original as a download)
  if (m[2] === "file" && r !== "brada") return json(403, { error: "no" }, origin);
  const h = { Authorization: "Bearer " + await dbxToken(env), "Dropbox-API-Arg": JSON.stringify({ url: rec.link, path: p }) };
  const range = request.headers.get("Range"); if (range && m[2] === "stream") h.Range = range;
  const res = await fetch("https://content.dropboxapi.com/2/sharing/get_shared_link_file", { method: "POST", headers: h });
  if (!res.ok && res.status !== 206) return new Response((await res.text().catch(() => "")).slice(0, 200), { status: res.status === 404 ? 404 : 502 });
  const name = p.split("/").pop() || "file", ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1] || "";
  const type = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[ext.toLowerCase()] || "application/octet-stream";
  const head = { "Content-Type": type, "Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  for (const k of ["Content-Length", "Content-Range"]) if (res.headers.get(k)) head[k] = res.headers.get(k);
  if (m[2] === "file") head["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
  return new Response(res.body, { status: res.status, headers: head });
}
