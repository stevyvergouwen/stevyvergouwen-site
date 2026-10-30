/* Delivery pages: /delivery/<slug> shows a job's finished files straight from Dropbox (read-only), with downloads and feedback.
   Needs three secrets from a read-only Dropbox app: DBX_APP_KEY, DBX_APP_SECRET, DBX_REFRESH. Records live in the same KV (IG) under "deliv:<slug>".
   Registration reuses the existing shared key (PRICE_CODE) in the x-key header, like /feedback-queue. Setup: worker/README.md (Delivery pages). */
const SLUG = /^[a-z0-9]{10,40}$/;
export const json = (status, body, origin, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...(origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, x-pass, x-key", "Vary": "Origin" } : {}), ...extra } });
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
const isPhoto = n => /\.(jpe?g|png|webp)$/i.test(n), isVideo = n => /\.(mp4|mov|m4v)$/i.test(n);
const base = n => n.replace(/\.[^.]+$/, "").toLowerCase();

/** A job's folder becomes: photos (HighRes + LowRes/Previews matched by file name) and finished clips (stacks, audio and raw footage are left out). */
async function manifest(env, rec, scope = "") {
  const files = (await listAll(env, rec.path)).filter(f => !scope || f.path_lower.startsWith((rec.path + "/" + scope).toLowerCase() + "/")); const root = rec.path.toLowerCase().length;
  const photos = new Map(), videos = [];
  for (const f of files) {
    const rel = f.path_lower.slice(root + 1); const parts = rel.split("/"); const name = f.name;
    if (isPhoto(name)) {
      const tier = rec.select ? "preview" : parts.some(p => p === "highres") ? "high" : parts.some(p => p === "lowres" || p === "lowres logo") ? "low" : parts.some(p => p === "previews" || p === "highlights") ? "preview" : "";
      if (!tier) continue;
      const key = base(name); const p = photos.get(key) || { id: key, name: name.replace(/\.[^.]+$/, "") };
      if (tier === "high") p.high = f.path_display; else if (tier === "low" && !/logo/.test(rel)) p.low = f.path_display; else if (tier === "preview") p.preview = f.path_display;
      photos.set(key, p);
    } else if (isVideo(name) && !parts.some(p => ["stacks", "audio", "raw video", "raw footage"].includes(p))) {
      videos.push({ id: f.id, name, path: f.path_display, size: f.size, group: f.path_display.slice(rec.path.length + 1).split("/").slice(0, -1).filter(p => !/^\d+x\d+$/i.test(p)).join(" / ") });
    }
  }
  const list = [...photos.values()].filter(p => p.high || p.low || p.preview).map(p => ({ id: p.id, name: p.name, thumb: p.low || p.preview || p.high, high: p.high || null, low: p.low || null })).sort((a, b) => a.name.localeCompare(b.name));
  return { scope: scope || "", select: rec.select || null, layout: rec.layout || "masonry", title: rec.title, client: rec.client, date: rec.date, note: rec.note || "", photos: list, videos: videos.sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)) };
}
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]).join(""); };
const hmac = async (secret, msg) => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map(b => b.toString(16).padStart(2, "0")).join(""); };
const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(t))))].map(b => b.toString(16).padStart(2, "0")).join("");
const okMail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const allowed = (rec, email) => (rec.allow || []).some(a => { a = String(a).toLowerCase(); return a.startsWith("@") ? email.endsWith(a) : email === a; });
/** A personal link for one person: their own token, valid for 30 days, so a forwarded link never has to be shared. */
export async function giveToken(env, slug, email, name, scope = "", days = 365) {
  const t = rnd(24); await env.IG.put("delivtok:" + await sha(t), JSON.stringify({ slug, email, name, scope: String(scope || "").replace(/^\/+|\/+$/g, "").slice(0, 200), at: Date.now() }), { expirationTtl: Math.round(days * 86400) }); return t;
}
const inside = (rec, p, scope = "") => p && p.toLowerCase().startsWith((rec.path + (scope ? "/" + scope : "")).toLowerCase() + "/");

export async function handleDelivery(request, env, url, origin, notify, mailVisitor) {
  const path = url.pathname;
  if (path === "/delivery-register" && request.method === "POST") {      // from the Projecten app: slug -> Dropbox folder
    if (!env.PRICE_CODE || !same(request.headers.get("x-key"), env.PRICE_CODE)) return json(401, { ok: false }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const slug = String(b.slug || ""); if (!SLUG.test(slug) || !String(b.path || "").startsWith("/")) return json(400, { ok: false, error: "slug or path" }, origin);
    const rec = { select: Number(b.select) > 0 ? { limit: Math.min(2000, Math.round(Number(b.select))) } : null, scopes: (b.scopes && typeof b.scopes === "object") ? Object.fromEntries(Object.entries(b.scopes).slice(0, 80).map(([k, v]) => [String(k).toLowerCase(), String(v).slice(0, 200)])) : {}, days: Math.max(7, Math.min(3650, Math.round(Number(b.days) || 365))), layout: ["masonry", "grid", "large"].includes(b.layout) ? b.layout : "masonry", mode: ["open", "code", "email"].includes(b.mode) ? b.mode : "email", allow: (Array.isArray(b.allow) ? b.allow : []).map(x => String(x).toLowerCase().trim()).filter(Boolean).slice(0, 60), path: String(b.path).replace(/\/+$/, ""), title: String(b.title || "").slice(0, 120), client: String(b.client || "").slice(0, 80), date: String(b.date || "").slice(0, 10), note: String(b.note || "").slice(0, 600), pass: String(b.pass || "").slice(0, 60), exp: Number(b.exp) || 0 };
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
    const t = await giveToken(env, slug, who, String(b.name || ""), String(b.scope || ""), rec.days || 365);
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
    const t = await giveToken(env, slug, email, reqd.name, "", rec.days || 365); await env.IG.delete("delivreq:" + slug + ":" + email);
    if (mailVisitor) await mailVisitor(email, "Your link: " + rec.title, `Hi${reqd.name ? " " + reqd.name.split(" ")[0] : ""},\n\nHere is your personal link to ${rec.title}:\nhttps://stevyvergouwen.com/d/?c=${slug}&t=${t}\n\nYou can open it as often as you like. Please do not forward it.\n\nStevy Vergouwen`);
    return json(200, { ok: true }, origin);
  }
  const m = path.match(/^\/delivery\/([a-z0-9]+)(?:\/(thumb|file|zip|feedback|request|approve|review|approve-review|selection|code-request|code-verify))?$/);
  if (!m) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-pass, x-key", "Access-Control-Max-Age": "86400" } });
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
    if (allowed(rec, email)) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await env.IG.put("delivotp:" + slug + ":" + email, JSON.stringify({ h: await sha(code), tries: 0 }), { expirationTtl: 600 });
      if (mailVisitor) await mailVisitor(email, "Your code: " + code, `Your code for ${rec.title} is ${code}.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this mail.\n\nStevy Vergouwen`);
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
    const t = await giveToken(env, slug, email, String(b.name || ""), (rec.scopes && rec.scopes[email]) || "", rec.days || 365);
    return json(200, { ok: true, token: t }, origin);
  }
  if (action === "request" && request.method === "POST") {            // someone asks for access: leave an email
    if (await tooMany(env, request, "req", 10, 3600)) return json(429, { ok: false, error: "slow down" }, origin);
    let b; try { b = await request.json(); } catch { return json(400, { ok: false }, origin); }
    const email = String(b.email || "").toLowerCase().trim().slice(0, 120), name = String(b.name || "").slice(0, 80);
    if (!okMail(email)) return json(400, { ok: false, error: "email" }, origin);
    if (allowed(rec, email)) { const t = await giveToken(env, slug, email, name, "", rec.days || 365); if (mailVisitor) await mailVisitor(email, "Your link: " + rec.title, `Hi${name ? " " + name.split(" ")[0] : ""},\n\nHere is your personal link to ${rec.title}:\n${site}&t=${t}\n\nYou can open it as often as you like. Please do not forward it; Stevy can send a link to anyone who needs one.\n\nStevy Vergouwen`); return json(200, { ok: true, sent: true }, origin); }
    await env.IG.put("delivreq:" + slug + ":" + email, JSON.stringify({ email, name, at: Date.now() }), { expirationTtl: 30 * 86400 });
    const sig = await hmac(env.PRICE_CODE || "x", "approve:" + slug + ":" + email);
    if (notify) await notify({ subject: `Access request: ${rec.title}`, heading: "Someone wants access", intro: `${name || email} (${email}) asked for ${rec.title}${rec.client ? " (" + rec.client + ")" : ""}`, rows: [["Email", email], ["Name", name || "-"], ["Approve", `https://aanvraag-stevyvergouwen.polished-shape-ff19.workers.dev/delivery/${slug}/approve?e=${encodeURIComponent(email)}&sig=${sig}`]] });
    return json(200, { ok: true, sent: false }, origin);
  }
  if (action === "approve") {                                           // from the link in Stevy's mail
    const email = (url.searchParams.get("e") || "").toLowerCase(), sig = url.searchParams.get("sig") || "";
    if (!okMail(email) || !same(sig, await hmac(env.PRICE_CODE || "x", "approve:" + slug + ":" + email))) return new Response("Invalid link", { status: 403 });
    const reqd = JSON.parse(await env.IG.get("delivreq:" + slug + ":" + email) || "null") || { email, name: "" };
    const t = await giveToken(env, slug, email, reqd.name, "", rec.days || 365); await env.IG.delete("delivreq:" + slug + ":" + email);
    if (mailVisitor) await mailVisitor(email, "Your link: " + rec.title, `Hi${reqd.name ? " " + reqd.name.split(" ")[0] : ""},\n\nStevy approved your request. Here is your personal link to ${rec.title}:\n${site}&t=${t}\n\nYou can open it as often as you like. Please do not forward it.\n\nStevy Vergouwen`);
    return new Response(`Approved. ${email} has been sent a personal link.`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (action === "approve-review") {                                    // from the link in Stevy's mail: show it on the website
    const id = (url.searchParams.get("id") || "").replace(/\D/g, ""), sig = url.searchParams.get("sig") || "";
    if (!id || !same(sig, await hmac(env.PRICE_CODE || "x", "review:" + slug + ":" + id))) return new Response("Invalid link", { status: 403 });
    const key = "delivrev:" + slug + ":" + id; const r = JSON.parse(await env.IG.get(key) || "null");
    if (!r) return new Response("Not found", { status: 404 });
    r.approved = true; await env.IG.put(key, JSON.stringify(r));
    return new Response("Approved: this review can now be shown on the website.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // access: open, the shared code, or a personal token
  const pass = request.headers.get("x-pass") || url.searchParams.get("k") || "", tok = request.headers.get("x-tok") || url.searchParams.get("t") || "";
  let who = null;
  if (tok) { try { const t = JSON.parse(await env.IG.get("delivtok:" + await sha(tok)) || "null"); if (t && t.slug === slug) who = t; } catch { /* ignore */ } }
  if (who && who.seenDay !== new Date().toISOString().slice(0, 10)) { try { await env.IG.put("delivtok:" + await sha(tok), JSON.stringify({ ...who, seenDay: new Date().toISOString().slice(0, 10) }), { expirationTtl: Math.round((rec.days || 365) * 86400) }); } catch { /* ignore */ } }
  const mode = rec.mode || (rec.pass ? "code" : "email");
  const ok = mode === "open" || !!who || (rec.pass && same(pass, rec.pass));
  if (!ok) { if (pass || tok) { if (await tooMany(env, request, "bad", 30, 3600)) return json(429, { error: "slow down" }, origin); } }
  if (!ok) return json(401, { error: "access", title: rec.title, client: rec.client, code: !!rec.pass, request: mode === "email" }, origin);
  try {
    if (!action) return json(200, await manifest(env, rec, who && who.scope), origin, { "Cache-Control": "private, max-age=60" });
    const p = url.searchParams.get("p") || "";
    if (action === "thumb") {
      if (!inside(rec, p, who && who.scope)) return json(403, { error: "path" }, origin);
      const size = ["w256h256", "w640h480", "w1024h768", "w2048h1536"].includes(url.searchParams.get("s")) ? url.searchParams.get("s") : "w640h480";
      const r = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Dropbox-API-Arg": JSON.stringify({ resource: { ".tag": "path", path: p }, format: "jpeg", size, mode: "bestfit" }) } });
      if (!r.ok) return json(502, { error: "thumbnail" }, origin);
      return new Response(r.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", ...(origin ? { "Access-Control-Allow-Origin": origin } : {}) } });
    }
    if ((action === "file" || action === "zip") && rec.select) return json(403, { error: "selection only" }, origin);
    if (action === "file") {
      if (!inside(rec, p, who && who.scope)) return json(403, { error: "path" }, origin);
      const j = await rpc(env, "files/get_temporary_link", { path: p });
      return Response.redirect(j.link, 302);
    }
    if (action === "zip") {
      const sub = (url.searchParams.get("sub") || "").replace(/[^\p{L}\p{N} _\-|.&\/]/gu, "").split("/").filter(x => x && x !== "." && x !== "..").join("/");
      const folder = sub ? rec.path + "/" + (who && who.scope ? who.scope + "/" : "") + sub : rec.path + (who && who.scope ? "/" + who.scope : "");
      const r = await fetch("https://content.dropboxapi.com/2/files/download_zip", { method: "POST", headers: { Authorization: "Bearer " + await dbxToken(env), "Dropbox-API-Arg": JSON.stringify({ path: folder }) } });
      if (!r.ok) return json(502, { error: "zip" }, origin);
      return new Response(r.body, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${(rec.title || "delivery").replace(/[^A-Za-z0-9 _-]/g, "")}.zip"` } });
    }
    if (action === "selection" && request.method === "POST") {           // the client's picks, up to the limit
      if (!rec.select) return json(400, { error: "no selection" }, origin);
      let b; try { b = JSON.parse((await request.text()).slice(0, 60000)); } catch { return json(400, { error: "json" }, origin); }
      const names = [...new Set((Array.isArray(b.names) ? b.names : []).map(x => String(x).slice(0, 120)))].slice(0, rec.select.limit);
      const pickKey = ((who && who.email) || String(b.name || "client")).replace(/[^a-z0-9@.]/gi, "_").slice(0, 80);
      const row = { id: String(Date.now()), at: new Date().toISOString(), who: String(b.name || (who && who.name) || (who && who.email) || "").slice(0, 80), email: (who && who.email) || "", names, limit: rec.select.limit };
      await env.IG.put("delivsel:" + slug + ":" + pickKey, JSON.stringify(row));
      if (notify) await notify({ subject: `Selection: ${rec.title}`, heading: "Photo selection received", intro: `${row.who || row.email || "The client"} picked ${names.length} of ${rec.select.limit} for ${rec.title}`, rows: [["Picked", String(names.length)], ["Files", names.join(" ")]] });
      return json(200, { ok: true, count: names.length }, origin);
    }
    if (action === "review" && request.method === "POST") {
      let b; try { b = JSON.parse((await request.text()).slice(0, 6000)); } catch { return json(400, { error: "json" }, origin); }
      const rating = Math.max(1, Math.min(5, Math.round(Number(b.rating) || 0))), text = String(b.text || "").slice(0, 1500).trim();
      if (!text || !rating) return json(400, { error: "empty" }, origin);
      const id = String(Date.now());
      const row = { slug, id, at: new Date().toISOString(), name: String(b.name || (who && who.name) || "").slice(0, 80), company: String(b.company || rec.client || "").slice(0, 80), email: (who && who.email) || "", rating, text, publish: !!b.publish, approved: false, title: rec.title };
      await env.IG.put("delivrev:" + slug + ":" + id, JSON.stringify(row));
      const sig = await hmac(env.PRICE_CODE || "x", "review:" + slug + ":" + id);
      if (notify) await notify({ subject: `Review: ${rec.title}`, heading: `${"★".repeat(rating)}${"☆".repeat(5 - rating)} review`, intro: `${row.name || row.email || "A client"} reviewed ${rec.title}`, rows: [["Review", text], ["Name", row.name || "-"], ["Company", row.company || "-"], ["May be shown on the website", row.publish ? "yes" : "no"], ...(row.publish ? [["Approve for the website", `https://aanvraag-stevyvergouwen.polished-shape-ff19.workers.dev/delivery/${slug}/approve-review?id=${id}&sig=${sig}`]] : [])] });
      return json(200, { ok: true }, origin);
    }
    if (action === "feedback" && request.method === "POST") {
      let b; try { b = JSON.parse((await request.text()).slice(0, 20000)); } catch { return json(400, { error: "json" }, origin); }
      const row = { at: new Date().toISOString(), name: String(b.name || "").slice(0, 80), decision: ["approved", "changes"].includes(b.decision) ? b.decision : "comment", note: String(b.note || "").slice(0, 3000), favorites: (Array.isArray(b.favorites) ? b.favorites : []).slice(0, 300).map(x => String(x).slice(0, 120)), comments: (Array.isArray(b.comments) ? b.comments : []).slice(0, 100).map(c => ({ file: String(c.file || "").slice(0, 120), t: Number(c.t) || 0, text: String(c.text || "").slice(0, 600) })) };
      await env.IG.put("delivf:" + slug + ":" + Date.now(), JSON.stringify(row), { expirationTtl: 60 * 86400 });
      const tc = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
      if (notify) await notify({ subject: `Delivery feedback: ${rec.title}`, heading: row.decision === "approved" ? "Approved" : row.decision === "changes" ? "Changes requested" : "Feedback", intro: `${row.name || (who && who.name) || (who && who.email) || "The client"} on ${rec.title}${rec.client ? " (" + rec.client + ")" : ""}`,
        rows: [["From", (who && who.email) || "-"], ["Decision", row.decision], ["Note", row.note || "-"], ["Favourites", String(row.favorites.length)], ...row.comments.map(c => [`${c.file} ${tc(c.t)}`, c.text])] });
      return json(200, { ok: true }, origin);
    }
  } catch (e) { return json(500, { error: "failed" }, origin); }
  return json(405, { error: "method" }, origin);
}
