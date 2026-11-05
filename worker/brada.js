/* Brada album pages: /brada/<slug>/... shows a Brada job's finished photos and clips from a VIEW-ONLY Dropbox shared link (read only, the Brada Dropbox itself is never touched).
   Two views of the same page: the client (key missing or wrong) sees the album; Brada (the right key in ?k=) also gets the Dropbox link, the client link and downloads.
   The Projecten app registers a page with POST /brada-register (header x-key, same as the other registrations). The record lives in KV (IG) under "brada:<slug>".
   The Dropbox link is never sent to a client view. */
import { json, adminOk, dbxToken, same } from "./delivery.js";
const SLUG = /^[a-z0-9]{12,40}$/, KEY = /^[a-z0-9]{12,40}$/;
const LINK = /^https:\/\/(www\.)?dropbox\.com\/(scl\/fo|sh)\//;
const HIDE = new Set(["uploads", "raw video", "raw footage", "raw audio", "stacks", "preview-wm", "audio", "lowres + logo", "lowres logo"]);   // the logo copies are not shown: they repeat the low res photos
const isPhoto = n => /\.(jpe?g|png|webp|heic)$/i.test(n), isVideo = n => /\.(mp4|mov|m4v)$/i.test(n);

async function dbx(env, endpoint, body) {
  const r = await fetch("https://api.dropboxapi.com/2/" + endpoint, { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const t = (await r.text().catch(() => "")).slice(0, 160); throw new Error(endpoint + " " + r.status + " " + t); }
  return r.json();
}
/* The Brada Dropbox itself: a second READ-ONLY Dropbox app, authorized once with Stevy's own Brada login (secrets DBXB_APP_KEY, DBXB_APP_SECRET, DBXB_REFRESH; setup: zet-dropbox-brada.sh).
   With it the page finds a Brada album by its folder path: no link has to be pasted and nothing is made or changed in the Brada Dropbox. */
const bOK = env => !!(env.DBXB_APP_KEY && env.DBXB_APP_SECRET && env.DBXB_REFRESH);
async function bToken(env) {
  const c = await env.IG.get("brada-token", "json"); if (c && c.exp > Date.now() + 60000) return c.token;
  const r = await fetch("https://api.dropbox.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(env.DBXB_APP_KEY + ":" + env.DBXB_APP_SECRET) }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.DBXB_REFRESH }) });
  if (!r.ok) throw new Error("brada token " + r.status);
  const j = await r.json(); await env.IG.put("brada-token", JSON.stringify({ token: j.access_token, exp: Date.now() + (j.expires_in || 14400) * 1000 }), { expirationTtl: 14000 });
  return j.access_token;
}
/** Headers for the Brada Dropbox: the team space is the root of that account, so its namespace goes in the path root. */
async function bHead(env) {
  const token = await bToken(env); let root = await env.IG.get("brada-root");
  if (!root) { const r = await fetch("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { Authorization: "Bearer " + token } }); if (r.ok) { const j = await r.json(); root = (j.root_info && j.root_info.root_namespace_id) || ""; if (root) await env.IG.put("brada-root", root); } }
  return { Authorization: "Bearer " + token, ...(root ? { "Dropbox-API-Path-Root": JSON.stringify({ ".tag": "root", "root": root }) } : {}) };
}
async function bApi(env, endpoint, body) {
  const r = await fetch("https://api.dropboxapi.com/2/" + endpoint, { method: "POST", headers: { ...(await bHead(env)), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const t = (await r.text().catch(() => "")).slice(0, 160); throw new Error(endpoint + " " + r.status + " " + t); }
  return r.json();
}
/** The album folder in the Brada Dropbox. The app sends the local path under "Dropbox-Drive"; Dropbox may start higher or lower, so a few starts are tried and the one that exists is remembered. */
async function bFolder(env, slug, rec) {
  const k = "bradap:" + slug, c = await env.IG.get(k); if (c) return c;
  const segs = rec.bpath.split("/").filter(Boolean);
  for (let i = 0; i < Math.min(4, segs.length); i++) { const p = "/" + segs.slice(i).join("/"); try { const m = await bApi(env, "files/get_metadata", { path: p }); if (m[".tag"] === "folder") { await env.IG.put(k, p); return p; } } catch { /* try the next start */ } }
  throw new Error("folder not found in the Brada Dropbox");
}
/** Everything under the shared link, sorted into the blocks of the page. Cached for two minutes so a busy page costs one Dropbox listing. */
async function manifest(env, slug, rec) {
  const ck = "bradamf:" + slug, c = await env.IG.get(ck, "json"); if (c) return c;
  const link = { url: rec.link }, all = []; let level = [""], calls = 0;
  if (rec.bpath) {
    const base = await bFolder(env, slug, rec);
    let res = await bApi(env, "files/list_folder", { path: base, recursive: true, limit: 2000 });
    const entries = [...res.entries];
    while (res.has_more) { res = await bApi(env, "files/list_folder/continue", { cursor: res.cursor }); entries.push(...res.entries); }
    for (const e of entries) if (e[".tag"] === "file") all.push({ ...e, path: (e.path_display || "").slice(base.length) });
    level = [];
  }
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
export async function handleBrada(request, env, url, origin, notify, mailer) {
  const path = url.pathname;
  if (path === "/brada-mail" && request.method === "POST") {   // from the Projecten app (x-key): the album mail, in Brada's look. kind "client" = your album is ready, "brada" = delivered, with the internal view. preview/dry never reach the client.
    if (!(await adminOk(env, request))) return json(401, { ok: false }, origin);
    if (!mailer) return json(503, { ok: false, error: "no mailer" }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || "").toLowerCase(), kind = b.kind === "brada" ? "brada" : "client", to = String(b.to || "").toLowerCase().trim();
    if (!SLUG.test(slug) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return json(400, { ok: false, error: "slug or to" }, origin);
    let rec = null; try { rec = JSON.parse(await env.IG.get("brada:" + slug) || "null"); } catch { rec = null; } if (!rec) return json(404, { ok: false, error: "no such album" }, origin);
    const what = ["photos", "video", "photos and video"].includes(b.what) ? b.what : "photos", first = String(b.name || "").trim().split(" ")[0], hi = first ? `Hi ${first}, ` : "", when = rec.date && /^\d{4}-\d{2}-\d{2}$/.test(rec.date) ? new Date(rec.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
    const person = (rec.people || []).find(x => first && String(x.n || "").toLowerCase().startsWith(first.toLowerCase()));
    const base = "https://stevyvergouwen.com/show/?c=" + slug, link = base + (person ? "&t=" + person.t : "");
    const rows = [["Album", rec.title], ["Client", rec.client], ["Date", when], ["Location", rec.location]];
    const m = kind === "client"
      ? { subject: `Your album from Brada Media: ${rec.title}`, eyebrow: "Brada Media", heading: "Your album from Brada Media.", intro: `${hi}Brada Media has the ${what} of ${rec.title} ready for you. Photography by Stevy Vergouwen.`, rows, note: "This page is for looking. If you need the files, Brada Media sends them to you.", cta: { text: "Open your album", href: link } }
      : { subject: `Delivered: ${rec.title}`, eyebrow: "Delivered", heading: "Album delivered.", intro: `${hi}${rec.title}${rec.client ? " for " + rec.client : ""} is ready. Your internal view has the Dropbox link, the client link and the downloads. Please do not forward that view: the client gets the client link.`, rows, note: "The client link is view only; the internal view is for Brada Media.", cta: { text: "Open the internal view", href: base + "&k=" + rec.key } };
    const r = await mailer(b.preview ? "info@stevyvergouwen.com" : to, { ...m, subject: (b.preview ? "[Preview] " : "") + m.subject, dry: !!b.dry });
    if (b.dry) return json(200, { ok: true, html: r.html }, origin);
    return json(r.ok ? 200 : 502, { ok: !!r.ok, preview: !!b.preview }, origin);
  }
  if (path === "/brada-register" && request.method === "POST") {
    if (!(await adminOk(env, request))) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""), key = String(b.key || ""), link = String(b.link || "");
    const bpath = String(b.bpath || "").slice(0, 300);
    if (!SLUG.test(slug) || !KEY.test(key) || !(LINK.test(link) || (bpath && !bpath.includes("..")))) return json(400, { ok: false, error: "slug, key and a link or a folder path" }, origin);
    if (!LINK.test(link) && !bOK(env)) return json(409, { ok: false, error: "brada-dropbox-not-set-up" }, origin);
    const people = (Array.isArray(b.people) ? b.people : []).slice(0, 30).map(x => ({ t: String(x.t || ""), n: String(x.n || "").slice(0, 60) })).filter(x => /^[a-z0-9]{8,24}$/.test(x.t) && x.n);
    const rec = { link: LINK.test(link) ? link.replace(/&dl=\d/, "").slice(0, 400) : "", bpath: LINK.test(link) ? "" : bpath, key, people, title: String(b.title || "").slice(0, 120), client: String(b.client || "").slice(0, 80), date: String(b.date || "").slice(0, 10), location: String(b.location || "").slice(0, 160), note: String(b.note || "").slice(0, 300), at: Date.now() };
    await env.IG.put("brada:" + slug, JSON.stringify(rec));
    await env.IG.delete("bradamf:" + slug); await env.IG.delete("bradap:" + slug);
    return json(200, { ok: true }, origin);
  }
  if (path === "/brada-visits" && request.method === "GET") {   // for the app: who opened it, how often, when
    if (!(await adminOk(env, request))) return json(401, { ok: false }, origin);
    const slug = url.searchParams.get("slug") || ""; if (!SLUG.test(slug)) return json(400, { ok: false }, origin);
    let v = {}; try { v = JSON.parse(await env.IG.get("bradav:" + slug) || "{}") || {}; } catch { v = {}; }
    return json(200, { ok: true, visits: Object.entries(v).map(([k, e]) => ({ who: k === "anon" ? "" : e.n, anon: k === "anon", count: e.c, first: e.first, last: e.last, country: e.country || "" })) }, origin);
  }
  const m = path.match(/^\/brada\/([a-z0-9]{12,40})\/(manifest|img|stream|file|zip)$/);
  if (!m) return null;
  let rec; try { rec = JSON.parse(await env.IG.get("brada:" + m[1]) || "null"); } catch { rec = null; }
  if (!rec) return json(404, { error: "not found" }, origin);
  const r = role(rec, url);
  if (m[2] === "manifest") {
    if (r === "client") await visit(env, m[1], rec, request, url, notify);
    let mf; try { mf = await manifest(env, m[1], rec); } catch (e) { return json(502, { error: "dropbox", detail: String(e && e.message || e).slice(0, 240) }, origin); }
    const body = { role: r, title: rec.title, client: rec.client, date: rec.date, location: rec.location, note: rec.note, ...mf };
    if (r === "brada" && rec.bpath) body.zip = true;   // a folder can be downloaded as one zip
    if (r === "brada" && rec.link) { body.dropbox = rec.link; body.downloadAll = rec.link.replace(/([?&])dl=\d/, "$1dl=1").includes("dl=1") ? rec.link.replace(/([?&])dl=\d/, "$1dl=1") : rec.link + (rec.link.includes("?") ? "&" : "?") + "dl=1"; }
    if (r === "brada" && rec.bpath && !body.dropbox) { try { const f = await bFolder(env, m[1], rec); body.dropbox = "https://www.dropbox.com/home" + f.split("/").map(encodeURIComponent).join("/"); } catch { /* the page still works without the button */ } }
    return json(200, body, origin);
  }
  if (m[2] === "zip") {   // Brada only: a whole folder (or the whole album) as one zip, made by Dropbox itself while it streams (limit: 20 GB and 10,000 files per zip)
    if (r !== "brada") return json(403, { error: "no" }, origin);
    if (!rec.bpath) return json(404, { error: "zip only for albums found by folder" }, origin);
    const sub = url.searchParams.get("sub") || ""; if (sub && !(inside(sub) && sub.split("/").length <= 4)) return json(400, { error: "path" }, origin);
    let res; try { res = await fetch("https://content.dropboxapi.com/2/files/download_zip", { method: "POST", headers: { ...(await bHead(env)), "Dropbox-API-Arg": JSON.stringify({ path: (await bFolder(env, m[1], rec)) + sub }) } }); } catch (e) { return json(502, { error: "dropbox" }, origin); }
    if (!res.ok) { const t = (await res.text().catch(() => "")).slice(0, 160); return json(res.status === 409 ? 413 : 502, { error: "zip", detail: t }, origin); }
    const nm = ((rec.title || "album") + (sub ? " - " + sub.split("/").filter(Boolean).slice(-1)[0] : "")).replace(/[\\/:*?"<>|]+/g, " ").trim() + ".zip";
    return new Response(res.body, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nm)}`, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  }
  const p = url.searchParams.get("p") || ""; if (!inside(p)) return json(400, { error: "path" }, origin);
  if (m[2] === "img") {   // a thumbnail through the shared link: the client never sees Dropbox
    const size = url.searchParams.get("s") === "large" ? "w2048h1536" : "w640h480";
    let res;
    try {
      res = rec.bpath
        ? await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", { method: "POST", headers: { ...(await bHead(env)), "Dropbox-API-Arg": JSON.stringify({ resource: { ".tag": "path", path: (await bFolder(env, m[1], rec)) + p }, format: "jpeg", size, mode: "bestfit" }) } })
        : await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Dropbox-API-Arg": JSON.stringify({ resource: { ".tag": "link", url: rec.link, path: p }, format: "jpeg", size, mode: "bestfit" }) } });
    } catch (e) { return new Response("", { status: 502 }); }
    if (!res.ok) return new Response((await res.text().catch(() => "")).slice(0, 200), { status: res.status === 404 ? 404 : 502 });
    return new Response(res.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  }
  // stream (a clip played on the page, ranges for scrubbing) and file (Brada only: the original as a download)
  if (m[2] === "file" && r !== "brada") return json(403, { error: "no" }, origin);
  const range = request.headers.get("Range");
  let res;
  try {
    if (rec.bpath) {   // the Brada Dropbox: a short-lived link, fetched here so the client never sees it
      const tl = await bApi(env, "files/get_temporary_link", { path: (await bFolder(env, m[1], rec)) + p });
      res = await fetch(tl.link, { headers: range ? { Range: range } : {} });   // ranges for both: a scrubbed clip and a download that resumes
    } else {
      const h = { Authorization: "Bearer " + await dbxToken(env), "Dropbox-API-Arg": JSON.stringify({ url: rec.link, path: p }) }; if (range && m[2] === "stream") h.Range = range;
      res = await fetch("https://content.dropboxapi.com/2/sharing/get_shared_link_file", { method: "POST", headers: h });
    }
  } catch (e) { return new Response("", { status: 502 }); }
  if (!res.ok && res.status !== 206) return new Response((await res.text().catch(() => "")).slice(0, 200), { status: res.status === 404 ? 404 : 502 });
  const name = p.split("/").pop() || "file", ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1] || "";
  const type = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[ext.toLowerCase()] || "application/octet-stream";
  const head = { "Content-Type": type, "Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  for (const k of ["Content-Length", "Content-Range"]) if (res.headers.get(k)) head[k] = res.headers.get(k);
  if (m[2] === "file") head["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
  return new Response(res.body, { status: res.status, headers: head });
}
