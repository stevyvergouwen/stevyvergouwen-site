/* Delivery pages: /delivery/<slug> shows a job's finished files straight from Dropbox (read-only), with downloads and feedback.
   Needs three secrets from a read-only Dropbox app: DBX_APP_KEY, DBX_APP_SECRET, DBX_REFRESH. Records live in the same KV (IG) under "deliv:<slug>".
   Registration reuses the existing shared key (PRICE_CODE) in the x-key header, like /feedback-queue. Setup: worker/README.md (Delivery pages). */
const SLUG = /^[a-z0-9]{10,40}$/;
export const json = (status, body, origin, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...(origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, x-pass, x-key, x-tok", "Vary": "Origin" } : {}), ...extra } });
/** At most `max` tries per `win` seconds per IP and bucket; answers true when the call is over the limit. */
export async function tooMany(env, request, bucket, max, win) {
  const ip = request.headers.get("CF-Connecting-IP") || "x", k = `rl:${bucket}:${ip}`;
  const n = Number(await env.IG.get(k) || 0); if (n >= max) return true;
  await env.IG.put(k, String(n + 1), { expirationTtl: Math.max(60, win) }); return false;
}
export const same = (a, b) => { a = String(a || ""); b = String(b || ""); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };

export async function dbxToken(env, write = false) {
  const K = write ? "deliv-token-w" : "deliv-token", id = write ? env.DBXW_APP_KEY : env.DBX_APP_KEY, sec = write ? env.DBXW_APP_SECRET : env.DBX_APP_SECRET, rf = write ? env.DBXW_REFRESH : env.DBX_REFRESH;
  const c = await env.IG.get(K, "json");
  if (c && c.exp > Date.now() + 60000) return c.token;
  const r = await fetch("https://api.dropbox.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(id + ":" + sec) }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rf }) });
  if (!r.ok) throw new Error("dropbox token " + r.status);
  const j = await r.json();
  await env.IG.put(K, JSON.stringify({ token: j.access_token, exp: Date.now() + (j.expires_in || 14400) * 1000 }), { expirationTtl: 14000 });
  return j.access_token;
}
async function rpc(env, endpoint, body) {
  const r = await fetch("https://api.dropboxapi.com/2/" + endpoint, { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(endpoint + " " + r.status);
  return r.json();
}
async function listAll(env, path) {
  let res = await rpc(env, "files/list_folder", { path, recursive: true, limit: 2000 }); const out = [...res.entries];
  while (res.has_more) { res = await rpc(env, "files/list_folder/continue", { cursor: res.cursor }); out.push(...res.entries); }
  return out.filter(e => e[".tag"] === "file");
}
const isAudio = n => /\.(wav|mp3|m4a|aiff?|flac)$/i.test(n);
const isPhoto = n => /\.(jpe?g|png|webp)$/i.test(n), isVideo = n => /\.(mp4|mov|m4v)$/i.test(n);
const base = n => n.replace(/\.[^.]+$/, "").toLowerCase();

/** A job's folder becomes: photos (HighRes + LowRes/Previews matched by file name) and finished clips (stacks, audio and raw footage are left out). */
async function manifest(env, rec, scope = "") {
  const files = (await listAll(env, rec.path)).filter(f => !scope || f.path_lower.startsWith((rec.path + "/" + scope).toLowerCase() + "/")); const root = rec.path.toLowerCase().length;
  const photos = new Map(), videos = [], audio = [];
  for (const f of files) {
    const rel = f.path_lower.slice(root + 1); const parts = rel.split("/"); const name = f.name;
    if (hidden("/" + rel)) continue;
    if (isPhoto(name)) {
      const tier = rec.select ? "preview" : parts.some(p => p === "highres") ? "high" : parts.some(p => p === "lowres" || p === "lowres logo") ? "low" : parts.some(p => p === "previews" || p === "highlights") ? "preview" : "";
      if (!tier) continue;
      const key = base(name); const p = photos.get(key) || { id: key, name: name.replace(/\.[^.]+$/, "") };
      if (tier === "high") p.high = f.path_display; else if (tier === "low" && !/logo/.test(rel)) p.low = f.path_display; else if (tier === "preview") p.preview = f.path_display;
      photos.set(key, p);
    } else if (isAudio(name) && parts.some(p => p === "audio") && !parts.some(p => ["stacks", "raw video", "raw footage", "raw audio"].includes(p))) {
      audio.push({ id: f.id, name, path: f.path_display, size: f.size, group: f.path_display.slice(rec.path.length + 1).split("/").slice(0, -1).join(" / ") });
    } else if (isVideo(name) && !parts.some(p => ["stacks", "audio", "raw video", "raw footage"].includes(p))) {
      videos.push({ id: f.id, name, path: f.path_display, size: f.size, group: f.path_display.slice(rec.path.length + 1).split("/").slice(0, -1).filter(p => !/^\d+x\d+$/i.test(p)).join(" / ") });
    }
  }
  const list = [...photos.values()].filter(p => p.high || p.low || p.preview).map(p => ({ id: p.id, name: p.name, thumb: p.low || p.preview || p.high, high: p.high || null, low: p.low || null })).sort((a, b) => a.name.localeCompare(b.name));
  return { scope: scope || "", select: rec.select || null, layout: rec.layout || "masonry", title: rec.title, client: rec.client, date: rec.date, note: rec.note || "", location: String(rec.location || "").slice(0, 160), lineup: Array.isArray(rec.lineup) ? rec.lineup : [], dropbox: rec.dropbox || "", end: rec.end || "", comments: !!rec.comments, share: !!rec.share, watermark: !!rec.watermark || !!rec.select, locked: (!!rec.watermark && !rec.released) || !!rec.select, wm: String(rec.wm || "STEVYVERGOUWEN.COM").slice(0, 60), root: rec.path, photos: list, audio: audio.sort((a, b) => a.name.localeCompare(b.name)), videos: videos.sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)) };
}
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]).join(""); };
const hmac = async (secret, msg) => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map(b => b.toString(16).padStart(2, "0")).join(""); };
const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(t))))].map(b => b.toString(16).padStart(2, "0")).join("");
/** A path from the outside is only ever a plain path: no "..", no backslashes, no control characters. */
const cleanPath = p => typeof p === "string" && p.startsWith("/") && !/[\\\x00-\x1f]/.test(p) && !p.split("/").some(s => s === ".." || s === ".") && p.length < 600;
const HIDDEN = ["uploads", "raw video", "raw footage", "raw audio", "stacks"];
const hidden = p => String(p || "").toLowerCase().split("/").some(s => HIDDEN.includes(s));
/** At most `max` per `win` seconds for one key (an email, a link), answers true when over the limit. */
async function capKey(env, key, max, win) { const k = "cap:" + await sha(key), n = Number(await env.IG.get(k) || 0); if (n >= max) return true; await env.IG.put(k, String(n + 1), { expirationTtl: Math.max(60, win) }); return false; }
/** A link from a mail asks "are you sure?" first: mail scanners open links, and an opened link must never change anything. */
const confirmPage = (title, button, origin) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><body style="margin:0;background:#08080a;color:#ebe7e0;font:16px -apple-system,Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh"><form method="post" style="text-align:center;padding:24px"><p style="font-size:22px;font-weight:700;margin:0 0 22px">${title}</p><button style="font:inherit;padding:14px 26px;border-radius:99px;border:1px solid #ebe7e0;background:#ebe7e0;color:#08080a;cursor:pointer;letter-spacing:.14em;text-transform:uppercase;font-size:12px;font-weight:700">${button}</button></form></body>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });
/** Codes and personal links go out as designed mails like everything else (plain text only when no designer is wired in). */
const codeMail = (designed, mailVisitor, to, code, what) => designed
  ? designed(to, { subject: "Your code: " + code, eyebrow: "Your code", heading: code.slice(0, 3) + " " + code.slice(3), intro: `Use this code to open ${what}. It works for 10 minutes.`, note: "If you did not ask for it, you can ignore this mail." })
  : mailVisitor && mailVisitor(to, "Your code: " + code, `Your code for ${what} is ${code}.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this mail.\n\nStevy Vergouwen`);
const linkMail = (designed, mailVisitor, to, name, title, link, lead) => designed
  ? designed(to, { subject: "Your link: " + title, eyebrow: "Your page", heading: name ? `${name.split(" ")[0]}, your page is ready.` : "Your page is ready.", intro: `${lead} Here is your personal link to ${title}.`, note: "Open it as often as you like, on your own devices. Please do not forward it: Stevy can send a link to anyone who needs one.", cta: { text: "Open my page", href: link } })
  : mailVisitor && mailVisitor(to, "Your link: " + title, `Hi${name ? " " + name.split(" ")[0] : ""},\n\n${lead} Here is your personal link to ${title}:\n${link}\n\nOpen it as often as you like. Please do not forward it.\n\nStevy Vergouwen`);
const okMail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const allowed = (rec, email) => (rec.allow || []).some(a => { a = String(a).toLowerCase(); return a.startsWith("@") ? email.endsWith(a) : email === a; });
/** A personal link for one person: their own token, valid for 30 days, so a forwarded link never has to be shared. */
export async function giveToken(env, slug, email, name, scope = "", days = 90, dev = "", link = false) {
  const t = rnd(24), exp = Date.now() + Math.max(1, days) * 86400000; await env.IG.put("delivtok:" + await sha(t), JSON.stringify({ slug, email, name, scope: String(scope || "").replace(/^\/+|\/+$/g, "").slice(0, 200), at: Date.now(), exp, devs: /^[a-z0-9]{10,40}$/.test(dev) ? [dev] : [], ...(link ? { link: true } : {}) }), { expirationTtl: Math.round(days * 86400) }); return t;
}
const inside = (rec, p, scope = "") => cleanPath(p) && !hidden(p.slice(rec.path.length)) && p.toLowerCase().startsWith((rec.path + (scope ? "/" + scope : "")).toLowerCase() + "/");

export async function handleDelivery(request, env, url, origin, notify, mailVisitor, designed) {
  const path = url.pathname;
  if (path === "/delivery-register" && request.method === "POST") {      // from the Projecten app: slug -> Dropbox folder
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""); if (!SLUG.test(slug) || !cleanPath(String(b.path || "")) || String(b.path).split("/").filter(Boolean).length < 2) return json(400, { ok: false, error: "slug or path" }, origin);
    const rec = { share: b.share !== false, select: Number(b.select) > 0 ? { limit: Math.min(2000, Math.round(Number(b.select))), extra: Number(b.extra) > 0 ? Math.round(Math.min(5000, Number(b.extra)) * 100) / 100 : 0 } : null, scopes: (b.scopes && typeof b.scopes === "object") ? Object.fromEntries(Object.entries(b.scopes).slice(0, 80).map(([k, v]) => [String(k).toLowerCase(), String(v).slice(0, 200)])) : {}, days: Math.max(7, Math.min(3650, Math.round(Number(b.days) || 90))), layout: ["masonry", "grid", "large"].includes(b.layout) ? b.layout : "masonry", mode: ["open", "code", "email"].includes(b.mode) ? b.mode : "email", allow: (Array.isArray(b.allow) ? b.allow : []).map(x => String(x).toLowerCase().trim()).filter(Boolean).slice(0, 60), path: String(b.path).replace(/\/+$/, ""), title: String(b.title || "").slice(0, 120), location: String(b.location || "").slice(0, 160), end: /^\d{1,2}[:.]\d{2}$/.test(String(b.end || "")) ? String(b.end).replace(".", ":") : "", dropbox: /^https:\/\/(www\.)?dropbox\.com\//.test(String(b.dropbox || "")) ? String(b.dropbox).slice(0, 300) : "", lineup: (Array.isArray(b.lineup) ? b.lineup : []).slice(0, 60).map(x => ({ t: String(x.t || "").slice(0, 12), n: String(x.n || "").replace(/\bb2b\b/gi, "B2B").slice(0, 80) })).filter(x => x.n), client: String(b.client || "").slice(0, 80), date: String(b.date || "").slice(0, 10), note: String(b.note || "").slice(0, 600), pass: String(b.pass || "").slice(0, 60), exp: Number(b.exp) || 0 };
    await env.IG.put("deliv:" + slug, JSON.stringify(rec));
    return json(200, { ok: true }, origin);
  }
  if (path === "/reviews" && request.method === "GET") {                 // approved reviews, for the website
    const out = []; let cursor;
    do { const l = await env.IG.list({ prefix: "delivrev:", cursor }); cursor = l.list_complete ? undefined : l.cursor;
      for (const k of l.keys) { try { const r = JSON.parse(await env.IG.get(k.name) || "null"); if (r && r.approved && r.publish) out.push({ name: r.name, company: r.company, rating: r.rating, text: r.text, at: r.at }); } catch { /* ignore */ } }
    } while (cursor);
    out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return json(200, { reviews: out.slice(0, 50) }, origin, { "Cache-Control": "public, max-age=600" });
  }
  if (path === "/delivery-status" && request.method === "GET") {         // for the Projecten app: what happened on this delivery
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    const slug = url.searchParams.get("slug") || ""; if (!SLUG.test(slug)) return json(400, { ok: false }, origin);
    const grab = async prefix => { const out = []; let cursor; do { const l = await env.IG.list({ prefix, cursor }); cursor = l.list_complete ? undefined : l.cursor; for (const k of l.keys) { try { const v = JSON.parse(await env.IG.get(k.name) || "null"); if (v) out.push({ id: k.name.slice(prefix.length), ...v }); } catch { /* ignore */ } } } while (cursor); return out; };
    const toks = (await grab("delivtok:")).filter(t => t.slug === slug);
    return json(200, { ok: true, requests: await grab("delivreq:" + slug + ":"), people: toks.map(t => ({ email: t.email, name: t.name, scope: t.scope || "", at: t.at })), feedback: await grab("delivf:" + slug + ":"), reviews: await grab("delivrev:" + slug + ":"), uploads: await grab("upldone:" + slug + ":"), selections: await grab("delivsel:" + slug + ":"), allow: (JSON.parse(await env.IG.get("deliv:" + slug) || "{}").allow) || [], scopes: (JSON.parse(await env.IG.get("deliv:" + slug) || "{}").scopes) || {} }, origin);
  }
  if (path === "/delivery-link" && request.method === "POST") {         // a personal link for one person, to send by WhatsApp or anything else
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""); let rec; try { rec = JSON.parse(await env.IG.get("deliv:" + slug) || "null"); } catch { rec = null; }
    if (!SLUG.test(slug) || !rec) return json(400, { ok: false }, origin);
    const who = String(b.contact || b.name || "link").slice(0, 120);
    const t = await giveToken(env, slug, who, String(b.name || ""), String(b.scope || ""), rec.days || 90);
    return json(200, { ok: true, link: `https://stevyvergouwen.com/d/?c=${slug}&t=${t}` }, origin);
  }
  if (path === "/delivery-access" && request.method === "POST") {      // give or take away access by email address (from the app)
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""); let rec; try { rec = JSON.parse(await env.IG.get("deliv:" + slug) || "null"); } catch { rec = null; }
    if (!SLUG.test(slug) || !rec) return json(400, { ok: false }, origin);
    rec.allow = rec.allow || []; rec.scopes = rec.scopes || {};
    for (const x of Array.isArray(b.add) ? b.add : []) { const e = String(x.email || "").toLowerCase().trim(); if (okMail(e) || /^@[^\s@]+\.[^\s@]+$/.test(e)) { if (!rec.allow.includes(e)) rec.allow.push(e); if (x.scope) rec.scopes[e] = String(x.scope).slice(0, 200); } }
    for (const e0 of Array.isArray(b.remove) ? b.remove : []) { const e = String(e0).toLowerCase().trim(); rec.allow = rec.allow.filter(a => a !== e); delete rec.scopes[e]; }
    await env.IG.put("deliv:" + slug, JSON.stringify(rec));
    return json(200, { ok: true, allow: rec.allow }, origin);
  }
  if (path === "/delivery-flags" && request.method === "POST") {         // from the app: watermark, release the originals, sharing, comments
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""); let rec; try { rec = JSON.parse(await env.IG.get("deliv:" + slug) || "null"); } catch { rec = null; }
    if (!SLUG.test(slug) || !rec) return json(400, { ok: false }, origin);
    for (const k of ["watermark", "released", "share", "comments"]) if (typeof b[k] === "boolean") rec[k] = b[k];
    if (typeof b.wm === "string") rec.wm = b.wm.slice(0, 60);
    await env.IG.put("deliv:" + slug, JSON.stringify(rec));
    return json(200, { ok: true, watermark: !!rec.watermark, released: !!rec.released }, origin);
  }
  if (path === "/delivery-live" && request.method === "GET") {         // from the app: everything clients commented and approved, live
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    const slug = url.searchParams.get("slug") || ""; if (!SLUG.test(slug)) return json(400, { ok: false }, origin);
    const out = []; let cursor;
    do { const l = await env.IG.list({ prefix: "delivlive:" + slug + ":", cursor }); cursor = l.list_complete ? undefined : l.cursor;
      for (const k of l.keys) { try { const d = JSON.parse(await env.IG.get(k.name) || "null"); if (d) out.push(d); } catch { /* ignore */ } }
    } while (cursor);
    return json(200, { ok: true, viewers: out }, origin);
  }
  if (path === "/delivery-revoke" && request.method === "POST") {      // take away one person's access (all their links for this delivery)
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""), who = String(b.email || "").toLowerCase(); let n = 0, cursor;
    do { const l = await env.IG.list({ prefix: "delivtok:", cursor }); cursor = l.list_complete ? undefined : l.cursor;
      for (const k of l.keys) { try { const t = JSON.parse(await env.IG.get(k.name) || "null"); if (t && t.slug === slug && String(t.email || "").toLowerCase() === who) { await env.IG.delete(k.name); n++; } } catch { /* ignore */ } }
    } while (cursor);
    return json(200, { ok: true, revoked: n }, origin);
  }
  if (path === "/delivery-approve" && request.method === "POST") {      // approve an access request from the app
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""), email = String(b.email || "").toLowerCase().trim(); let rec; try { rec = JSON.parse(await env.IG.get("deliv:" + slug) || "null"); } catch { rec = null; }
    if (!SLUG.test(slug) || !okMail(email) || !rec) return json(400, { ok: false }, origin);
    const reqd = JSON.parse(await env.IG.get("delivreq:" + slug + ":" + email) || "null") || { email, name: "" };
    const t = await giveToken(env, slug, email, reqd.name, "", rec.days || 90); await env.IG.delete("delivreq:" + slug + ":" + email);
    await linkMail(designed, mailVisitor, email, reqd.name, rec.title, `https://stevyvergouwen.com/d/?c=${slug}&t=${t}`, "Here you go.");
    return json(200, { ok: true }, origin);
  }
  const m = path.match(/^\/delivery\/([a-z0-9]+)(?:\/(thumb|file|zip|feedback|request|approve|review|approve-review|selection|share|live|code-request|code-verify|device-code|device-verify|artist-request|artist-verify|revoke-link))?$/);
  if (!m) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-pass, x-key, x-tok", "Access-Control-Max-Age": "86400" } });
  const [, slug, action] = m;
  if (!SLUG.test(slug)) return json(404, { error: "not found" }, origin);
  let rec; try { rec = JSON.parse(await env.IG.get("deliv:" + slug) || "null"); } catch { rec = null; }
  if (!rec) return json(404, { error: "not found" }, origin);
  if (rec.exp && rec.exp < Date.now()) return json(410, { error: "expired" }, origin);
  const site = "https://stevyvergouwen.com/d/?c=" + slug;
  if (action === "code-request" && request.method === "POST") {         // login by email: a 6-digit code to an address that has access
    if (await tooMany(env, request, "otp", 8, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const email = String(b.email || "").toLowerCase().trim().slice(0, 120); if (!okMail(email)) return json(400, { ok: false, error: "email" }, origin);
    if (await capKey(env, "otp:" + slug + ":" + email, 4, 3600)) return json(200, { ok: true }, origin);   // an inbox is never flooded with codes
    if (allowed(rec, email)) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await env.IG.put("delivotp:" + slug + ":" + email, JSON.stringify({ h: await sha(code), tries: 0 }), { expirationTtl: 600 });
      await codeMail(designed, mailVisitor, email, code, rec.title);
    }
    return json(200, { ok: true }, origin);                           // the same answer for everyone: no hints about who has access
  }
  if (action === "code-verify" && request.method === "POST") {
    if (await tooMany(env, request, "otpv", 20, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const email = String(b.email || "").toLowerCase().trim().slice(0, 120), key = "delivotp:" + slug + ":" + email; let o; try { o = JSON.parse(await env.IG.get(key) || "null"); } catch { o = null; }
    if (!o || o.tries >= 5 || !allowed(rec, email)) return json(401, { ok: false }, origin);
    if (!same(await sha(String(b.code || "").replace(/\D/g, "")), o.h)) { o.tries++; await env.IG.put(key, JSON.stringify(o), { expirationTtl: 600 }); return json(401, { ok: false }, origin); }
    await env.IG.delete(key);
    const t = await giveToken(env, slug, email, String(b.name || ""), (rec.scopes && rec.scopes[email]) || "", rec.days || 90, String(b.dev || ""));
    return json(200, { ok: true, token: t }, origin);
  }
  if (action === "request" && request.method === "POST") {            // someone asks for access: leave an email
    if (await tooMany(env, request, "req", 10, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const email = String(b.email || "").toLowerCase().trim().slice(0, 120), name = String(b.name || "").slice(0, 80);
    if (!okMail(email)) return json(400, { ok: false, error: "email" }, origin);
    if (await capKey(env, "req:" + slug + ":" + email, 3, 3600)) return json(200, { ok: true, sent: false }, origin);
    if (allowed(rec, email)) { const t = await giveToken(env, slug, email, name, "", rec.days || 90); await linkMail(designed, mailVisitor, email, name, rec.title, `${site}&t=${t}`, "Good news: you are on the list."); return json(200, { ok: true, sent: true }, origin); }
    await env.IG.put("delivreq:" + slug + ":" + email, JSON.stringify({ email, name, at: Date.now() }), { expirationTtl: 30 * 86400 });
    const sig = await hmac(env.PRICE_CODE || "x", "approve:" + slug + ":" + email);
    if (notify) await notify({ subject: `Access request: ${rec.title}`, heading: "Someone wants access", intro: `${name || email} (${email}) asked for ${rec.title}${rec.client ? " (" + rec.client + ")" : ""}`, rows: [["Email", email], ["Name", name || "-"], ["Approve", `https://aanvraag-stevyvergouwen.polished-shape-ff19.workers.dev/delivery/${slug}/approve?e=${encodeURIComponent(email)}&sig=${sig}`]] });
    return json(200, { ok: true, sent: false }, origin);
  }
  if (action === "approve") {                                           // from the link in Stevy's mail
    const email = (url.searchParams.get("e") || "").toLowerCase(), sig = url.searchParams.get("sig") || "";
    if (!okMail(email) || !same(sig, await hmac(env.PRICE_CODE || "x", "approve:" + slug + ":" + email))) return new Response("Invalid link", { status: 403 });
    if (request.method === "GET") return confirmPage("Give " + email.replace(/[<>&"]/g, "") + " access?", "Approve", origin);
    const reqd = JSON.parse(await env.IG.get("delivreq:" + slug + ":" + email) || "null") || { email, name: "" };
    const t = await giveToken(env, slug, email, reqd.name, "", rec.days || 90); await env.IG.delete("delivreq:" + slug + ":" + email);
    await linkMail(designed, mailVisitor, email, reqd.name, rec.title, `${site}&t=${t}`, "Stevy approved your request.");
    return new Response(`Approved. ${email} has been sent a personal link.`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (action === "approve-review") {                                    // from the link in Stevy's mail: show it on the website
    const id = (url.searchParams.get("id") || "").replace(/\D/g, ""), sig = url.searchParams.get("sig") || "";
    if (!id || !same(sig, await hmac(env.PRICE_CODE || "x", "review:" + slug + ":" + id))) return new Response("Invalid link", { status: 403 });
    if (request.method === "GET") return confirmPage("Show this review on the website?", "Show it", origin);
    const key = "delivrev:" + slug + ":" + id; const r = JSON.parse(await env.IG.get(key) || "null");
    if (!r) return new Response("Not found", { status: 404 });
    r.approved = true; await env.IG.put(key, JSON.stringify(r));
    return new Response("Approved: this review can now be shown on the website.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (action === "revoke-link") {                                       // from the link in Stevy's mail: switch one artist link off
    const th = (url.searchParams.get("h") || "").replace(/[^a-f0-9]/g, ""), sig = url.searchParams.get("sig") || "";
    if (!th || !same(sig, await hmac(env.PRICE_CODE || "x", "revoke:" + slug + ":" + th))) return new Response("Invalid link", { status: 403 });
    if (request.method === "GET") return confirmPage("Switch this artist link off?", "Switch off", origin);
    await env.IG.delete("delivtok:" + th);
    return new Response("Switched off. That artist link no longer opens.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // access: open, the shared code, or a personal token
  const pass = request.headers.get("x-pass") || url.searchParams.get("k") || "", tok = request.headers.get("x-tok") || url.searchParams.get("t") || "";
  let who = null;
  if (tok) { try { const t = JSON.parse(await env.IG.get("delivtok:" + await sha(tok)) || "null"); if (t && t.slug === slug) who = t; } catch { /* ignore */ } }
  if (who && who.exp && who.exp < Date.now()) who = null;                // a link has its own end date (checked before it can be renewed)
  if (who && who.seenDay !== new Date().toISOString().slice(0, 10)) { try { const span = (who.link || who.scope ? 60 : (rec.days || 90)) * 86400000, born = who.born || who.at || Date.now(); who.seenDay = new Date().toISOString().slice(0, 10); who.born = born; who.exp = Math.min(Date.now() + span, born + 365 * 86400000); await env.IG.put("delivtok:" + await sha(tok), JSON.stringify(who), { expirationTtl: Math.max(60, Math.round((who.exp - Date.now()) / 1000)) }); } catch { /* ignore */ } }   // coming back keeps the link alive: it only ends after a quiet spell (or a year)
  const mode = rec.mode || (rec.pass ? "code" : "email");
  const dev = /^[a-z0-9]{10,40}$/.test(url.searchParams.get("d") || "") ? url.searchParams.get("d") : "";
  const mask = e => e.replace(/^(.).*(@.*)$/, "$1***$2");
  if (who && who.link && !who.email && (action === "artist-request" || action === "artist-verify") && request.method === "POST") {   // automatic: the artist fills in their email, a code proves it is theirs, the link is theirs from then on
    const ak = "artotp:" + await sha(tok); let b; try { b = JSON.parse((await request.text()).slice(0, 1000)); } catch { return json(400, { ok: false }, origin); }
    if (action === "artist-request") {
      if (await tooMany(env, request, "artreq", 6, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
      if (await capKey(env, "artreq:" + ak, 5, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
      const email = String(b.email || "").toLowerCase().trim().slice(0, 120), nm = String(b.name || "").slice(0, 80).trim(); if (!okMail(email)) return json(400, { ok: false, error: "email" }, origin);
      const code = String(Math.floor(100000 + Math.random() * 900000)); await env.IG.put(ak, JSON.stringify({ h: await sha(code), email, name: nm, tries: 0 }), { expirationTtl: 600 });
      await codeMail(designed, mailVisitor, email, code, `the clips of ${(who.scope || "").split("/").filter(x => !/^clips$/i.test(x)).pop() || rec.title} (${rec.title})`);
      return json(200, { ok: true }, origin);
    }
    if (await tooMany(env, request, "artver", 20, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
    let o; try { o = JSON.parse(await env.IG.get(ak) || "null"); } catch { o = null; }
    if (!o || o.tries >= 5 || !dev) return json(401, { ok: false }, origin);
    if (!same(await sha(String(b.code || "").replace(/\D/g, "")), o.h)) { o.tries++; await env.IG.put(ak, JSON.stringify(o), { expirationTtl: 600 }); return json(401, { ok: false }, origin); }
    await env.IG.delete(ak); const th = await sha(tok);
    await env.IG.put("delivtok:" + th, JSON.stringify({ ...who, email: o.email, name: o.name || who.name, devs: [dev] }), { expirationTtl: Math.max(60, Math.round(((who.exp || Date.now() + 60 * 86400000) - Date.now()) / 1000)) });
    const artist = (who.scope || "").split("/").filter(x => !/^clips$/i.test(x)).pop() || who.scope;
    if (notify) await notify({ subject: `Artist in: ${artist} (${rec.title})`, heading: "An artist opened their page", intro: `${o.name || o.email} (${o.email}) signed in to the clips of ${artist} on ${rec.title}. The link now belongs to that address.`, rows: [["Email", o.email], ["Folder", who.scope]], cta: { text: "Switch this link off", href: `https://aanvraag-stevyvergouwen.polished-shape-ff19.workers.dev/delivery/${slug}/revoke-link?h=${th}&sig=${await hmac(env.PRICE_CODE || "x", "revoke:" + slug + ":" + th)}` } });
    return json(200, { ok: true }, origin);
  }
  if (who && who.link && !who.email) return json(401, { error: "artist", title: rec.title, artist: (who.scope || "").split("/").filter(x => !/^clips$/i.test(x)).pop() || "" }, origin);
  if (who && (action === "device-code" || action === "device-verify") && request.method === "POST") {   // a new device must prove it can read the mail of this link
    const dk = "devotp:" + await sha(tok);
    if (action === "device-code") {
      if (await tooMany(env, request, "devc", 6, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
      if (await capKey(env, "devc:" + dk, 5, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
      const code = String(Math.floor(100000 + Math.random() * 900000)); await env.IG.put(dk, JSON.stringify({ h: await sha(code), tries: 0 }), { expirationTtl: 600 });
      if (okMail(who.email || "")) await codeMail(designed, mailVisitor, who.email, code, `${rec.title} on a new device`);
      return json(200, { ok: true, mail: mask(who.email || "") }, origin);
    }
    if (await tooMany(env, request, "devv", 20, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    let o; try { o = JSON.parse(await env.IG.get(dk) || "null"); } catch { o = null; }
    if (!o || o.tries >= 5 || !dev) return json(401, { ok: false }, origin);
    if (!same(await sha(String(b.code || "").replace(/\D/g, "")), o.h)) { o.tries++; await env.IG.put(dk, JSON.stringify(o), { expirationTtl: 600 }); return json(401, { ok: false }, origin); }
    await env.IG.delete(dk);
    const devs = [...(who.devs || []).filter(x => x !== dev), dev].slice(-5);
    await env.IG.put("delivtok:" + await sha(tok), JSON.stringify({ ...who, devs }), { expirationTtl: Math.max(60, Math.round(((who.exp || Date.now() + 90 * 86400000) - Date.now()) / 1000)) });
    if (devs.length >= 4 && notify) await notify({ subject: `Link on ${devs.length} devices: ${rec.title}`, heading: "A link is used on many devices", intro: `${who.name || who.email} opened ${rec.title} on ${devs.length} different devices.`, rows: [["Email", who.email || "-"], ["Folder", who.scope || "everything"]] });
    return json(200, { ok: true }, origin);
  }
  if (who && mode !== "open" && okMail(who.email || "")) {
    if (!(who.devs || []).length && dev && !who.needCode) { who.devs = [dev]; try { await env.IG.put("delivtok:" + await sha(tok), JSON.stringify(who), { expirationTtl: Math.max(60, Math.round(((who.exp || Date.now() + 90 * 86400000) - Date.now()) / 1000)) }); } catch { /* ignore */ } }   // the first device to open a fresh link is the recipient's
    else if (!dev || !(who.devs || []).includes(dev)) return json(401, { error: "device", mail: mask(who.email), title: rec.title }, origin);
  }
  const ok = mode === "open" || !!who || (rec.pass && same(pass, rec.pass));
  if (!ok) { if (pass || tok) { if (await tooMany(env, request, "bad", 30, 3600)) return json(429, { error: "slow down" }, origin); } }
  if (!ok) return json(401, { error: "access", title: rec.title, code: !!rec.pass, request: mode === "email" }, origin);
  if (who && (action === "zip" || action === "file")) {                  // unusual use: many zips in a day, or the same link from several countries -> one mail to Stevy
    try {
      const uk = "use:" + await sha(tok) + ":" + new Date().toISOString().slice(0, 10), country = (request.cf && request.cf.country) || "";
      const u = JSON.parse(await env.IG.get(uk) || "null") || { z: 0, c: [], al: false };
      const newC = country && !u.c.includes(country); if (newC) u.c.push(country); if (action === "zip") u.z++;
      if (action === "zip" || newC) {
        if (!u.al && (u.z > 8 || u.c.length >= 3) && notify) { u.al = true; await notify({ subject: `Unusual use: ${rec.title}`, heading: "A link is used unusually", intro: `${who.name || who.email} on ${rec.title}: ${u.z} zip downloads today, from ${u.c.join(", ") || "-"}.`, rows: [["Email", who.email || "-"], ["Folder", who.scope || "everything"]] }); }
        await env.IG.put(uk, JSON.stringify(u), { expirationTtl: 2 * 86400 });
      }
    } catch { /* never block a download on the watch */ }
  }
  try {
    if (!action) return json(200, await manifest(env, rec, who && who.scope), origin, { "Cache-Control": "private, max-age=60" });
    const p = url.searchParams.get("p") || "";
    if (action === "thumb") {
      if (!inside(rec, p, who && who.scope)) return json(403, { error: "path" }, origin);
      const sizes = ((rec.watermark && !rec.released) || rec.select) ? ["w256h256", "w640h480"] : ["w256h256", "w640h480", "w1024h768", "w2048h1536"]; const size = sizes.includes(url.searchParams.get("s")) ? url.searchParams.get("s") : "w640h480";
      const r = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Dropbox-API-Arg": JSON.stringify({ resource: { ".tag": "path", path: p }, format: "jpeg", size, mode: "bestfit" }) } });
      if (!r.ok) return json(502, { error: "thumbnail" }, origin);
      return new Response(r.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", ...(origin ? { "Access-Control-Allow-Origin": origin } : {}) } });
    }
    if (action === "share" && request.method === "POST") {              // the client copies a link for one artist: that page shows only the artist's own clips and audio
      if (!rec.share) return json(403, { error: "sharing is off" }, origin);
      if (who && who.scope) return json(403, { error: "not allowed" }, origin);
      if (await tooMany(env, request, "share", 80, 3600)) return json(429, { error: "slow down" }, origin);
      if (await capKey(env, "share:" + tok, 80, 86400) || await capKey(env, "sharedel:" + slug, 240, 86400)) return json(429, { error: "slow down" }, origin);   // a link cannot be used to mail the world
      let b; try { b = JSON.parse((await request.text()).slice(0, 2000)); } catch { return json(400, { error: "json" }, origin); }
      const sub = String(b.scope || "").replace(/[^\p{L}\p{N} _\-|.&\/]/gu, "").split("/").filter(x => x && x !== "." && x !== "..").join("/").slice(0, 200);
      if (!sub) return json(400, { error: "folder" }, origin);
      const check = await manifest(env, rec, sub); if (!check.videos.length && !check.photos.length) return json(404, { error: "no such folder" }, origin);
      const artist = sub.split("/").filter(x => !/^clips$/i.test(x)).pop() || sub, to = String(b.to || "").toLowerCase().trim(), nm = String(b.name || "").slice(0, 80).trim();
      if (to && !okMail(to)) return json(400, { error: "mail" }, origin);
      const t = await giveToken(env, slug, to, nm || artist, sub, Math.min(rec.days || 90, 60), "", !to);   // by mail: the link belongs to that address and asks for a code; copied: the artist fills in their email first
      const link = `https://stevyvergouwen.com/d/?c=${slug}&t=${t}`;
      if (to) {
        const th = await sha(t); await env.IG.put("delivtok:" + th, JSON.stringify({ ...JSON.parse(await env.IG.get("delivtok:" + th)), needCode: true }), { expirationTtl: Math.round(Math.min(rec.days || 90, 60) * 86400) });
        const by = (who && (who.name || who.email)) || rec.client || "";
        if (designed) await designed(to, { subject: `Your content: ${rec.title}`, eyebrow: "Your content", heading: nm ? `Hi ${nm.split(" ")[0]}!` : "Hi!", intro: `Thanks for playing at ${rec.title}${by ? ", shared with you by " + by : ""}. Here is your content: your own clips and audio, in every format, on a page just for you.`, note: "You sign in with a code we mail to this address. The page is personal: please do not forward it.", cta: { text: "Open my content page", href: link } });
        if (notify) await notify({ subject: `Content sent to ${artist} (${rec.title})`, heading: "A client sent an artist their content", intro: `${(who && (who.name || who.email)) || rec.client || "The client"} sent ${artist}'s page to ${to}.`, rows: [["Delivery", rec.title], ["Folder", sub], ["To", to]], cta: { text: "Switch this link off", href: `https://aanvraag-stevyvergouwen.polished-shape-ff19.workers.dev/delivery/${slug}/revoke-link?h=${th}&sig=${await hmac(env.PRICE_CODE || "x", "revoke:" + slug + ":" + th)}` } });
        return json(200, { ok: true, sent: true }, origin);
      }
      return json(200, { ok: true, link: `https://stevyvergouwen.com/d/?c=${slug}&t=${t}` }, origin);
    }
    if (action === "live") {                                           // live feedback: a viewer's comments and approvals, saved as they happen
      const vkey = who && who.email ? "e" + (await sha(String(who.email).toLowerCase())).slice(0, 24) : "v" + String(url.searchParams.get("v") || "x").replace(/[^a-z0-9]/gi, "").slice(0, 32);
      const key = "delivlive:" + slug + ":" + vkey;
      if (request.method === "GET") { let d = null; try { d = JSON.parse(await env.IG.get(key) || "null"); } catch { d = null; } return json(200, d || { comments: [], approved: [] }, origin); }
      if (request.method === "POST") {
        if (await tooMany(env, request, "live", 240, 3600)) return json(429, { error: "slow down" }, origin);
        let b; try { b = JSON.parse((await request.text()).slice(0, 60000)); } catch { return json(400, { error: "json" }, origin); }
        const comments = (Array.isArray(b.comments) ? b.comments : []).slice(0, 400).map(c => ({ file: String(c.file || "").slice(0, 200), t: Math.max(0, Math.min(86400, Number(c.t) || 0)), text: String(c.text || "").slice(0, 1500), at: Number(c.at) || Date.now() })).filter(c => c.file && c.text);
        const approved = [...new Set((Array.isArray(b.approved) ? b.approved : []).map(x => String(x).slice(0, 200)))].slice(0, 2000);
        const doc = { viewer: vkey, name: String(b.name || (who && who.name) || "").slice(0, 80), email: (who && who.email) || "", comments, approved, updated: Date.now() };
        await env.IG.put(key, JSON.stringify(doc), { expirationTtl: 400 * 86400 });
        return json(200, { ok: true }, origin);
      }
    }
    if ((action === "file" || action === "zip") && rec.select) return json(403, { error: "selection only" }, origin);
    if ((action === "file" || action === "zip") && rec.watermark && !rec.released) return json(403, { error: "locked" }, origin);   // portraits and presskits: watermarked previews until Stevy releases the originals
    if (action === "file") {
      if (!inside(rec, p, who && who.scope)) return json(403, { error: "path" }, origin);
      const ck = "tl:" + await sha(p); let link = await env.IG.get(ck);   // Dropbox links last 4 hours: reuse one for 3, so a clip opens at once the second time
      if (!link) { const j = await rpc(env, "files/get_temporary_link", { path: p }); link = j.link; try { await env.IG.put(ck, link, { expirationTtl: 10800 }); } catch { /* ignore */ } }
      return new Response(null, { status: 302, headers: { Location: link, "Cache-Control": "private, max-age=600", "Referrer-Policy": "no-referrer" } });
    }
    if (action === "zip") {
      const sub = (url.searchParams.get("sub") || "").replace(/[^\p{L}\p{N} _\-|.&\/]/gu, "").split("/").filter(x => x && x !== "." && x !== "..").join("/");
      if ((!sub && !(who && who.scope)) || hidden("/" + sub)) return json(403, { error: "path" }, origin);
      const folder = sub ? rec.path + "/" + (who && who.scope ? who.scope + "/" : "") + sub : rec.path + (who && who.scope ? "/" + who.scope : "");
      const r = await fetch("https://content.dropboxapi.com/2/files/download_zip", { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Dropbox-API-Arg": JSON.stringify({ path: folder }) } });
      if (!r.ok) return json(502, { error: "zip" }, origin);
      return new Response(r.body, { headers: { "X-Content-Type-Options": "nosniff", "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${(rec.title || "delivery").replace(/[^A-Za-z0-9 _-]/g, "")}.zip"` } });
    }
    if (action === "selection" && request.method === "POST") {           // the client's picks, up to the limit
      if (!rec.select) return json(400, { error: "no selection" }, origin);
      let b; try { b = JSON.parse((await request.text()).slice(0, 60000)); } catch { return json(400, { error: "json" }, origin); }
      const names = [...new Set((Array.isArray(b.names) ? b.names : []).map(x => String(x).slice(0, 120)))].slice(0, rec.select.limit + (rec.select.extra ? 300 : 0));
      const pickKey = ((who && who.email) || String(b.name || "client")).replace(/[^a-z0-9@.]/gi, "_").slice(0, 80);
      const row = { id: String(Date.now()), at: new Date().toISOString(), who: String(b.name || (who && who.name) || (who && who.email) || "").slice(0, 80), email: (who && who.email) || "", names, limit: rec.select.limit, extra: rec.select.extra ? Math.max(0, names.length - rec.select.limit) : 0, extraPrice: rec.select.extra || 0 };
      await env.IG.put("delivsel:" + slug + ":" + pickKey, JSON.stringify(row));
      if (notify) await notify({ subject: `Selection: ${rec.title}`, heading: "Photo selection received", intro: `${row.who || row.email || "The client"} picked ${names.length} (${rec.select.limit} included${row.extra ? `, ${row.extra} extra` : ""}) for ${rec.title}`, rows: [["Picked", String(names.length)], ...(row.extra ? [["Extra photos", `${row.extra} x EUR ${row.extraPrice} = EUR ${(Math.round(row.extra * row.extraPrice * 100) / 100).toFixed(2)}`]] : []), ["Files", names.join(" ")]] });
      return json(200, { ok: true, count: names.length }, origin);
    }
    if (action === "review" && request.method === "POST") {
      if (await tooMany(env, request, "review", 6, 3600)) return json(429, { error: "slow down" }, origin);
      let b; try { b = JSON.parse((await request.text()).slice(0, 6000)); } catch { return json(400, { error: "json" }, origin); }
      const rating = Math.max(1, Math.min(5, Math.round(Number(b.rating) || 0))), text = String(b.text || "").slice(0, 1500).trim();
      if (!text || !rating) return json(400, { error: "empty" }, origin);
      const id = String(Date.now());
      const row = { slug, id, at: new Date().toISOString(), name: String(b.name || (who && who.name) || "").slice(0, 80), company: String(b.company || rec.client || "").slice(0, 80), email: (who && who.email) || "", rating, text, publish: !!b.publish, approved: false, title: rec.title };
      await env.IG.put("delivrev:" + slug + ":" + id, JSON.stringify(row));
      const sig = await hmac(env.PRICE_CODE || "x", "review:" + slug + ":" + id);
      if (notify) await notify({ subject: `Review: ${rec.title}`, heading: `${"★".repeat(rating)}${"☆".repeat(5 - rating)} review`, intro: `${row.name || row.email || "A client"} reviewed ${rec.title}`, replyTo: row.email ? [row.name || row.email, row.email] : undefined, rows: [["Review", text], ["Name", row.name || "-"], ["Company", row.company || "-"], ["Delivery", rec.title], ["Client of this delivery", rec.client || "-"], ["Signed in as", row.email || "nobody (open link)"], ["Page", who && who.scope ? "artist page: " + who.scope : "client page"], ["May be shown on the website", row.publish ? "yes" : "no"], ...(row.publish ? [["Approve for the website", `https://aanvraag-stevyvergouwen.polished-shape-ff19.workers.dev/delivery/${slug}/approve-review?id=${id}&sig=${sig}`]] : [])] });
      return json(200, { ok: true }, origin);
    }
    if (action === "feedback" && request.method === "POST") {         // "Send feedback": one designed mail to Stevy with everything, one thank-you mail to the client (live comments never mail)
      if (await tooMany(env, request, "fb", 10, 3600)) return json(429, { error: "slow down" }, origin);
      let b; try { b = JSON.parse((await request.text()).slice(0, 20000)); } catch { return json(400, { error: "json" }, origin); }
      const row = { at: new Date().toISOString(), name: String(b.name || "").slice(0, 80), decision: ["approved", "changes"].includes(b.decision) ? b.decision : "comment", note: String(b.note || "").slice(0, 3000), favorites: (Array.isArray(b.favorites) ? b.favorites : []).slice(0, 300).map(x => String(x).slice(0, 120)), approved: (Array.isArray(b.approved) ? b.approved : []).slice(0, 300).map(x => String(x).slice(0, 120)), comments: (Array.isArray(b.comments) ? b.comments : []).slice(0, 100).map(c => ({ file: String(c.file || "").slice(0, 120), t: Number(c.t) || 0, text: String(c.text || "").slice(0, 600) })) };
      await env.IG.put("delivf:" + slug + ":" + Date.now(), JSON.stringify(row), { expirationTtl: 60 * 86400 });
      const tc = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
      const email = String((who && who.email) || b.email || "").toLowerCase().trim(), nm = row.name || (who && who.name) || "", first = nm.split(" ")[0];
      const what = ["videos", "photos"].includes(b.what) ? b.what : (row.favorites.length && !row.comments.length ? "photos" : "videos");
      const byFile = {}; row.comments.sort((a, c) => a.t - c.t).forEach(c => { (byFile[c.file] = byFile[c.file] || []).push(c); });
      const head = row.decision === "approved" ? "Approved" : row.decision === "changes" ? "Changes requested" : "Feedback";
      const link = `https://stevyvergouwen.com/d/?c=${slug}`;
      if (notify) await notify({ subject: `${head}: ${rec.title}${nm ? " (" + nm + ")" : ""}`, heading: head, intro: `${nm || email || "The client"} sent feedback on ${rec.title}${rec.client ? " (" + rec.client + ")" : ""}: ${row.comments.length} comment${row.comments.length === 1 ? "" : "s"}, ${row.approved.length} clip${row.approved.length === 1 ? "" : "s"} approved${row.favorites.length ? ", " + row.favorites.length + " favourite photos" : ""}.`,
        replyTo: email ? [nm || email, email] : undefined,
        rows: [["From", email || "-"], ["Decision", head], ...(row.note ? [["Note", row.note]] : []), ...Object.keys(byFile).flatMap(f => byFile[f].map((c, i) => [i ? "" : f, `${tc(c.t)}  ${c.text}`])), ...(row.approved.length ? [["Approved", row.approved.join(", ")]] : []), ...(row.favorites.length ? [["Favourite photos", row.favorites.join(", ")]] : [])] });
      if (designed && okMail(email)) {
        await designed(email, row.decision === "approved"
          ? { subject: `Approved: ${rec.title}`, eyebrow: "Approved", heading: first ? `Thank you, ${first}.` : "Thank you.", intro: `You approved the ${what} from ${rec.title}. Enjoy them, and tag me when you post.`, cta: { text: "Open my page", href: link } }
          : { subject: `Thanks for your feedback: ${rec.title}`, eyebrow: "Feedback received", heading: first ? `Thanks, ${first}.` : "Thanks for your feedback.", intro: `I received your feedback on ${rec.title}. I am going to look into it and get back to you soon with the improved ${what}.`, cta: { text: "Open my page", href: link } });
      }
      return json(200, { ok: true, mailed: okMail(email) }, origin);
    }
  } catch (e) { return json(500, { error: "failed" }, origin); }
  return json(405, { error: "method" }, origin);
}
