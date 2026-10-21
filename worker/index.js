/* Cloudflare Worker: receives a request from /event, /brand or /artist and mails it to Stevy.
   Uses Cloudflare Email Routing's send_email binding: no API key, no third party.
   Setup: see worker/README.md */
import { EmailMessage } from "cloudflare:email";

const ALLOWED_ORIGINS = ["https://stevyvergouwen.com", "https://www.stevyvergouwen.com"];
const FROM = "aanvraag@stevyvergouwen.com";     // must be an address on a domain with Email Routing
const TYPES = { event: "Event", brand: "Brand", artist: "Artist" };
const NEEDS = ["photos", "video", "aftermovie", "brand video", "social content", "presskit", "live registration", "recap", "other"];

const cors = origin => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
});
const reply = (status, body, origin) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(origin ? cors(origin) : {}) } });

// header values: one line, ASCII only (the body carries the real text)
// ---- Instagram feed (Instagram API with Instagram Login): the token lives in KV (refreshed) or as the secret IG_TOKEN
const IG_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
async function igToken(env) {
  const saved = await env.IG.get("token", "json");          // { token, at }
  return saved && saved.token ? saved : (env.IG_TOKEN ? { token: env.IG_TOKEN, at: 0 } : null);
}
async function igRefresh(env, force = false) {
  const cur = await igToken(env);
  if (!cur) return null;
  const week = 7 * 24 * 3600 * 1000;
  if (!force && cur.at && Date.now() - cur.at < week) return cur.token;
  const r = await fetch("https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(cur.token));
  if (r.ok) { const j = await r.json(); if (j.access_token) { await env.IG.put("token", JSON.stringify({ token: j.access_token, at: Date.now() })); return j.access_token; } }
  return cur.token;
}
async function igLoad(env) {
  const token = await igRefresh(env);
  if (!token) return { posts: [], error: "no token" };
  const r = await fetch(`https://graph.instagram.com/me/media?fields=${IG_FIELDS}&limit=12&access_token=${encodeURIComponent(token)}`);
  if (!r.ok) return { posts: [], error: "instagram " + r.status };
  const j = await r.json();
  const posts = (j.data || []).filter(p => p.permalink && (p.media_url || p.thumbnail_url)).map(p => ({
    id: p.id, permalink: p.permalink, caption: (p.caption || "").slice(0, 200), mediaType: p.media_type, timestamp: p.timestamp,
    mediaUrl: p.media_type === "VIDEO" ? (p.thumbnail_url || "") : p.media_url, thumbnailUrl: p.thumbnail_url || ""
  })).filter(p => p.mediaUrl);
  const out = { posts, at: Date.now() };
  if (posts.length) await env.IG.put("feed", JSON.stringify(out));
  return out;
}
async function igFeed(env) {
  const cached = await env.IG.get("feed", "json");
  if (cached && Date.now() - cached.at < 6 * 3600 * 1000) return cached;
  const fresh = await igLoad(env);
  return fresh.posts.length ? fresh : (cached || fresh);
}

const line = (s, max = 120) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7E]/g, "").trim().slice(0, max);
const text = (s, max = 2000) => String(s ?? "").replace(/\r/g, "").trim().slice(0, max);

// ---- mails in the style of the site: dark, uppercase headline, hairlines, the signature banner for the client.
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const b64 = str => { const by = new TextEncoder().encode(str); let bin = ""; for (const x of by) bin += String.fromCharCode(x); return btoa(bin).replace(/.{1,76}/g, "$&\r\n").trim(); };
function mailParts({ heading, eyebrow, intro, rows, note, sign, cta }) {
  const items = (rows || []).filter(r => r && r[1]);
  const text = [heading, "", ...(intro ? [intro, ""] : []), ...items.map(r => `${r[0]}: ${r[1]}${r[2] ? "  (" + r[2] + ")" : ""}`), ...(note ? ["", note] : []), ...(cta ? ["", `${cta.text}: ${cta.href}`] : []), ...(sign ? ["", "Kind regards,", "Stevy Vergouwen", "https://stevyvergouwen.com"] : [])].join("\n");
  const F = "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif";
  const rowsHtml = items.map(r => `<tr><td style="padding:20px 0;border-top:1px solid #232327"><div style="${F};font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#8d8b85;margin:0 0 7px">${esc(r[0])}</div><div style="${F};font-size:17px;line-height:1.5;color:#f1efe9">${r[2] ? `<a href="${esc(r[2])}" style="color:#f1efe9;text-decoration:underline;text-underline-offset:3px">${esc(r[1])}</a>` : esc(r[1]).replace(/\n/g, "<br>")}</div></td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#050506" bgcolor="#050506"><table role="presentation" width="100%" bgcolor="#050506" style="background:#050506"><tr><td align="center" style="padding:0 18px"><table role="presentation" width="620" style="max-width:620px;width:100%;${F};color:#f1efe9">
<tr><td style="padding:44px 0 56px"><table role="presentation" width="100%"><tr><td style="${F};font-size:12px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#ffffff">Stevy Vergouwen</td><td align="right" style="${F};font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6f6d68">${esc(eyebrow || "")}</td></tr></table></td></tr>
<tr><td style="${F};padding:0 0 22px;font-size:46px;line-height:.98;font-weight:800;letter-spacing:-.035em;text-transform:uppercase;color:#f1efe9">${esc(heading)}</td></tr>
<tr><td style="padding:0 0 34px"><div style="width:44px;height:2px;background:#5b84ff;font-size:0;line-height:0">&nbsp;</div></td></tr>
${intro ? `<tr><td style="${F};padding:0 0 38px;font-size:18px;line-height:1.55;color:#d6d3cd">${esc(intro)}</td></tr>` : ""}
${rowsHtml}
<tr><td style="border-top:1px solid #232327;font-size:0;line-height:0;height:1px">&nbsp;</td></tr>
${note ? `<tr><td style="${F};padding:22px 0 0;font-size:14px;line-height:1.55;color:#8d8b85">${esc(note)}</td></tr>` : ""}
${cta ? `<tr><td style="padding:34px 0 6px"><a href="${esc(cta.href)}" style="${F};display:inline-block;padding:17px 30px;border:1px solid #f1efe9;border-radius:99px;color:#f1efe9;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">${esc(cta.text)} &nbsp;&#8599;</a></td></tr>` : ""}
${sign ? `<tr><td style="${F};padding:40px 0 0;font-size:17px;color:#f1efe9">Kind regards,</td></tr><tr><td style="padding:16px 0 0"><a href="https://stevyvergouwen.com" style="text-decoration:none"><img src="https://stevyvergouwen.com/mail/signature.png" width="500" height="170" alt="Stevy Vergouwen, photographer and videographer" style="display:block;border:0;max-width:100%;height:auto"></a></td></tr>` : ""}
${sign ? `<tr><td style="height:64px;font-size:0;line-height:0">&nbsp;</td></tr>` : `<tr><td style="height:56px;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="border-top:1px solid #232327;font-size:0;line-height:0;height:1px">&nbsp;</td></tr>`}
<tr><td style="${F};padding:22px 0 6px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6f6d68">Visuals for artists, events &amp; brands</td></tr>
<tr><td style="${F};padding:0 0 48px;font-size:11px;letter-spacing:.2em;text-transform:uppercase"><a href="https://stevyvergouwen.com" style="color:#8d8b85;text-decoration:none">stevyvergouwen.com</a></td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
function rawMime({ from, to, replyTo, subject, text, html }) {
  const bd = "sv-" + crypto.randomUUID();
  return [`From: ${from}`, `To: ${to}`, ...(replyTo ? [`Reply-To: ${replyTo}`] : []), `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@stevyvergouwen.com>`, "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${bd}"`, "",
    `--${bd}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(text), `--${bd}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(html), `--${bd}--`, ""].join("\r\n");
}
// ---- one door to Brevo: timeout, two retries on network/5xx/429, and a dead-letter in KV so nothing is lost silently; the daily cron retries the dead letters and warns Stevy.
async function brevo(env, path, body, label) {
  let status = 0, detail = "";
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch("https://api.brevo.com/v3" + path, { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      if (r.ok) return { ok: true, status: r.status };
      status = r.status; detail = (await r.text()).slice(0, 300);
      if (r.status < 500 && r.status !== 429) break;   // a 4xx will not get better by repeating
    } catch (e) { status = 0; detail = String(e && e.message || e); }
    await new Promise(res => setTimeout(res, 400 * (i + 1) ** 2));
  }
  console.error("brevo failed:", label || path, status, detail);
  if (/^(confirm|contact)/.test(label || "")) {   // park confirmations and contacts for a retry; notifications fail loudly to the visitor (who retries) and the feedback run retries by itself
    try { await env.IG.put("dead:" + Date.now() + ":" + crypto.randomUUID().slice(0, 8), JSON.stringify({ path, body, label: label || path, status, detail, at: new Date().toISOString() }), { expirationTtl: 60 * 86400 }); } catch { /* ignore */ }
  }
  return { ok: false, status, detail };
}
// retry the parked calls; one alert mail to Stevy per run when something stays stuck (the alert itself is not parked, so it cannot loop)
async function deadRun(env) {
  if (!env.BREVO_API_KEY) return { skipped: true };
  const out = { retried: 0, stuck: 0 }, stuck = []; let cursor;
  do {
    const l = await env.IG.list({ prefix: "dead:", cursor }); cursor = l.list_complete ? undefined : l.cursor;
    for (const k of l.keys) {
      let rec; try { rec = JSON.parse(await env.IG.get(k.name) || "null"); } catch { rec = null; }
      if (!rec) { await env.IG.delete(k.name); continue; }
      let ok = false;
      try { const r = await fetch("https://api.brevo.com/v3" + rec.path, { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" }, body: JSON.stringify(rec.body), signal: AbortSignal.timeout(8000) }); ok = r.ok || (r.status === 400 && rec.path === "/contacts"); } catch { ok = false; }
      if (ok) { await env.IG.delete(k.name); out.retried++; } else { out.stuck++; stuck.push(rec.label + " (" + rec.status + ") " + rec.at.slice(0, 10)); }
    }
  } while (cursor);
  if (out.stuck) await alertMail(env, "Mail or contact stuck", "These calls to Brevo keep failing and are kept for a retry tomorrow:", stuck.slice(0, 10).map((x, i) => [String(i + 1), x]));
  return out;
}
// one alert per hour at most
async function alertMail(env, subject, intro, rows) {
  try {
    if (await env.IG.get("alert:last")) return;
    await env.IG.put("alert:last", "1", { expirationTtl: 3600 });
    const { text, html } = mailParts({ heading: subject, eyebrow: "Alert", intro, rows, sign: false });
    await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ sender: { name: "Stevy Vergouwen site", email: "info@stevyvergouwen.com" }, to: [{ email: env.MAIL_TO || "info@stevyvergouwen.com" }], subject: "Alert: " + subject, htmlContent: html, textContent: text }) });
  } catch { /* nothing more to do */ }
}
// ---- price links: one personal token per mail, valid for 24 hours and at most 20 openings; Stevy's own code (PRICE_CODE) stays unlimited
async function priceLink(env, email) {
  const tok = [...crypto.getRandomValues(new Uint8Array(8))].map(b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  const exp = Date.now() + 24 * 3600 * 1000;
  await env.IG.put("tok:" + tok, JSON.stringify({ email, exp, uses: 0 }), { expiration: Math.floor(exp / 1000) });
  return `https://stevyvergouwen.com/?pr=${env.PRICING_PATH}&k=${tok}`;
}
async function tokenOk(env, code) {
  if (!/^[a-z2-9]{8}$/.test(code)) return false;
  let t; try { t = JSON.parse(await env.IG.get("tok:" + code) || "null"); } catch { t = null; }
  if (!t || t.exp < Date.now() || t.uses >= 20) return false;
  t.uses++; try { await env.IG.put("tok:" + code, JSON.stringify(t), { expiration: Math.floor(t.exp / 1000) }); } catch { /* ignore */ }
  return true;
}
// ---- the client list: every request is remembered (KV key contact:<email>) with what they asked for; every requester also becomes a Brevo contact, and with their consent goes on the mailing list (unsubscribe is handled by Brevo).
async function saveContact(env, c) {
  const email = String(c.email || "").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
  const key = "contact:" + email; let rec = null;
  try { rec = JSON.parse(await env.IG.get(key) || "null"); } catch { rec = null; }
  rec = rec || { email, created: new Date().toISOString(), requests: [], tags: [] };
  rec.name = c.name || rec.name || ""; if (c.instagram) rec.instagram = c.instagram;
  rec.requests = [...(rec.requests || []).slice(-19), { at: new Date().toISOString(), via: c.via, what: c.what, date: c.date || "", dateIso: /^\d{4}-\d{2}-\d{2}$/.test(c.dateIso || "") ? c.dateIso : "", location: c.location || "", source: c.source || "" }];
  rec.tags = [...new Set([...(rec.tags || []), ...(c.tags || [])])];
  if (c.updates) { rec.updates = true; rec.updatesAt = rec.updatesAt || new Date().toISOString(); }
  try { await env.IG.put(key, JSON.stringify(rec)); } catch { /* the list is a nice-to-have, never block the request */ }
  if (env.BREVO_API_KEY) {   // every requester is a Brevo contact; only people who ticked the box also go on the mailing list (BREVO_LIST_ID)
    try {
      const [first, ...rest] = (rec.name || "").split(" ");
      await brevo(env, "/contacts", { email, updateEnabled: true, attributes: { FIRSTNAME: first || "", LASTNAME: rest.join(" "), INTERESTS: rec.tags.join(", "), LAST_REQUEST: String(c.what || "").slice(0, 250), LAST_REQUEST_DATE: new Date().toISOString().slice(0, 10), WANTS_UPDATES: rec.updates ? "yes" : "no" },
        ...(c.updates && env.BREVO_LIST_ID ? { listIds: [Number(env.BREVO_LIST_ID)] } : {}) }, "contact " + email);
    } catch { /* ignore */ }
  }
}
// the mail Stevy receives: through Brevo to his own inbox (Email Routing is not used: his mail lives at iCloud). Falls back to Email Routing without a Brevo key.
async function sendNotify(env, { replyTo, subject, heading, intro, rows, cta: ctaOverride }) {
  const { text, html } = mailParts({ heading, eyebrow: "New", intro, rows, sign: false, cta: ctaOverride ? ctaOverride : replyTo ? { text: "Reply to " + (String(replyTo[0]).split(" ")[0] || "them"), href: "mailto:" + replyTo[1] + "?subject=" + encodeURIComponent("Re: " + (subject || "your request")) } : null });
  const to = env.MAIL_TO || "info@stevyvergouwen.com";
  if (env.BREVO_API_KEY) {
    const r = await brevo(env, "/smtp/email", { sender: { name: "Stevy Vergouwen site", email: "info@stevyvergouwen.com" }, to: [{ email: to }], ...(replyTo ? { replyTo: { email: replyTo[1], name: String(replyTo[0]).slice(0, 80) } } : {}), subject, htmlContent: html, textContent: text }, "notify " + subject);
    if (!r.ok) throw new Error("brevo " + r.status);
    return;
  }
  const raw = rawMime({ from: `Stevy Vergouwen site <${FROM}>`, to, replyTo: replyTo ? `${String(replyTo[0]).replace(/[<>",]/g, "")} <${replyTo[1]}>` : "", subject, text, html });
  try { await env.MAIL.send(new EmailMessage(FROM, to, raw)); } catch (e) { console.error("notify failed:", String(e && e.message || e)); throw e; }
}
// the confirmation the client receives, from info@stevyvergouwen.com with the signature, sent through Brevo (the sender address must be verified there). Without BREVO_API_KEY nothing is sent.
async function confirmMail(env, to, name, rows, note, introOverride) {
  if (!env.BREVO_API_KEY || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to || "")) return false;
  const first = (name || "").split(" ")[0] || "there";
  const { text, html } = mailParts({ heading: "Your request is in.", eyebrow: "Request received", intro: introOverride || `Hi ${first}, thank you. I read your request myself and reply within 24 hours with a quote.`, rows, note, sign: true });
  try {
    const r = await brevo(env, "/smtp/email", { sender: { name: "Stevy Vergouwen", email: "info@stevyvergouwen.com" }, to: [{ email: to, name: name || undefined }], replyTo: { email: "info@stevyvergouwen.com", name: "Stevy Vergouwen" }, subject: "Your request is in | Stevy Vergouwen", htmlContent: html, textContent: text }, "confirm " + to);
    return r.ok;
  } catch { return false; }
}

// ---- reminders to Stevy (never to clients): a request nobody answered for 2 days, and a requested date coming up within 7 days. Once per request each. "Handled" = POST /handled {email} (x-key), or the client got an invoice.
async function remindRun(env, dry) {
  if (!env.BREVO_API_KEY) return { skipped: true };
  const today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), waiting = [], upcoming = []; let cursor;
  do {
    const l = await env.IG.list({ prefix: "contact:", cursor }); cursor = l.list_complete ? undefined : l.cursor;
    for (const k of l.keys) {
      let rec; try { rec = JSON.parse(await env.IG.get(k.name) || "null"); } catch { rec = null; }
      if (!rec) continue; let changed = false;
      for (const r of rec.requests || []) {
        if (r.handled || !["pricing", "event", "brand", "artist"].includes(r.via)) continue;
        const age = (Date.now() - new Date(r.at).getTime()) / 864e5;
        if (!r.rem2 && age >= 2 && age <= 21) { waiting.push([rec.name || rec.email, `${r.via}: ${String(r.what || "").slice(0, 80)} (asked ${r.at.slice(0, 10)})`, "mailto:" + rec.email]); r.rem2 = today; changed = true; }
        if (!r.rem7 && r.dateIso && r.dateIso >= today && r.dateIso <= soon) { upcoming.push([rec.name || rec.email, `${r.dateIso} ${r.location || ""}`.trim(), "mailto:" + rec.email]); r.rem7 = today; changed = true; }
      }
      if (changed && !dry) { try { await env.IG.put(k.name, JSON.stringify(rec)); } catch { /* ignore */ } }
    }
  } while (cursor);
  if (dry || (!waiting.length && !upcoming.length)) return { waiting: waiting.length, upcoming: upcoming.length };
  const rows = [...waiting.map(w => ["Waiting for a reply", w[0] + " - " + w[1], w[2]]), ...upcoming.map(u => ["Date within 7 days", u[0] + " - " + u[1], u[2]])];
  const { text, html } = mailParts({ heading: "Open requests", eyebrow: "Reminder", intro: "These need your attention.", rows, sign: false });
  await brevo(env, "/smtp/email", { sender: { name: "Stevy Vergouwen site", email: "info@stevyvergouwen.com" }, to: [{ email: env.MAIL_TO || "info@stevyvergouwen.com" }], subject: `Reminder: ${waiting.length + upcoming.length} open request${waiting.length + upcoming.length > 1 ? "s" : ""}`, htmlContent: html, textContent: text }, "remind");
  return { waiting: waiting.length, upcoming: upcoming.length };
}

// ---- the feedback mail: two weeks after the date of a request, once per request, to people who asked for a quote. Runs from the daily cron.
async function feedbackRun(env, dry) {
  if (!env.BREVO_API_KEY || !env.FEEDBACK_PATH) return { skipped: true };
  const today = new Date().toISOString().slice(0, 10), out = { sent: 0, due: 0 }; let cursor;
  do {
    const l = await env.IG.list({ prefix: "contact:", cursor }); cursor = l.list_complete ? undefined : l.cursor;
    for (const k of l.keys) {
      let rec; try { rec = JSON.parse(await env.IG.get(k.name) || "null"); } catch { rec = null; }
      if (!rec || rec.noFeedback) continue;
      if ((rec.requests || []).some(r => r.fbSent)) continue;   // one feedback mail per client, ever
      let changed = false;
      for (const r of rec.requests || []) {
        if (r.fbSent || !r.dateIso) continue;
        const due = new Date(r.dateIso + "T12:00:00Z"); due.setUTCDate(due.getUTCDate() + (r.via === "moneybird" ? 0 : 14));   // requests: 14 days after the shoot date; Moneybird invoices: dateIso is already the due day (sent + 7)
        const dueIso = due.toISOString().slice(0, 10), age = (Date.now() - new Date(r.at).getTime()) / 864e5;
        if (dueIso > today || age > 180) continue;   // not yet, or too old to ask now
        out.due++; if (dry) continue;
        const first = (rec.name || "").split(" ")[0] || "there";
        const { text, html } = mailParts({ heading: "How was it?", eyebrow: "Feedback", intro: `Hi ${first}, it was a pleasure working with you. If you are happy with the result, would you share a few words about the experience? It takes two minutes, and with your permission it may appear on my website.`, cta: { text: "Share your experience", href: `https://stevyvergouwen.com/${env.FEEDBACK_PATH}/` }, note: "If you would rather not get this kind of mail, just reply and let me know.", sign: true });
        try {
          const res = await brevo(env, "/smtp/email", { sender: { name: "Stevy Vergouwen", email: "info@stevyvergouwen.com" }, to: [{ email: rec.email, name: rec.name || undefined }], replyTo: { email: "info@stevyvergouwen.com", name: "Stevy Vergouwen" }, subject: "How was it? | Stevy Vergouwen", htmlContent: html, textContent: text }, "feedback " + rec.email);
          if (res.ok) { r.fbSent = new Date().toISOString(); changed = true; out.sent++; for (const o of rec.requests) if (o !== r && !o.fbSent) o.fbSent = "skipped"; break; } else console.error("feedback mail failed:", res.status);
        } catch (e) { console.error("feedback mail error:", String(e && e.message || e)); }
      }
      if (changed) { try { await env.IG.put(k.name, JSON.stringify(rec)); } catch { /* ignore */ } }
    }
  } while (cursor);
  return out;
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(Promise.all([igLoad(env), feedbackRun(env, false), deadRun(env), remindRun(env, false)])); },
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const okOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";

    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: okOrigin ? cors(okOrigin) : {} });
    if (request.method === "GET" && new URL(request.url).pathname === "/health") {   // KV round trip + whether the secrets are there; nothing private
      let kv = false; try { await env.IG.put("health", "1", { expirationTtl: 60 }); kv = (await env.IG.get("health")) === "1"; } catch { kv = false; }
      let dead = -1; try { dead = (await env.IG.list({ prefix: "dead:", limit: 100 })).keys.length; } catch { /* ignore */ }
      return new Response(JSON.stringify({ ok: kv && !!env.BREVO_API_KEY && !!env.PRICES, kv, brevo: !!env.BREVO_API_KEY, prices: !!env.PRICES, parked: dead }), { status: kv ? 200 : 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (request.method === "GET" && new URL(request.url).pathname === "/instagram") {
      const feed = await igFeed(env);
      return new Response(JSON.stringify({ posts: feed.posts || [] }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900", ...(okOrigin ? cors(okOrigin) : { "Access-Control-Allow-Origin": "*" }) } });
    }
    if (new URL(request.url).pathname === "/feedback-queue" && request.method === "POST") {   // from ~/moneybird/feedback_queue.py: paid, sent invoices -> one feedback mail per invoice
      const kk = String(request.headers.get("x-key") || ""), want = String(env.PRICE_CODE || ""); let df = kk.length ^ want.length; for (let i = 0; i < Math.max(kk.length, want.length); i++) df |= (kk.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
      if (!want || df !== 0) return reply(401, { ok: false }, okOrigin);
      let q; try { q = JSON.parse((await request.text()).slice(0, 50000)); } catch { return reply(400, { ok: false, error: "json" }, okOrigin); }
      let added = 0, skipped = 0;
      for (const it of Array.isArray(q.items) ? q.items.slice(0, 200) : []) {
        const email = String(it.email || "").toLowerCase().trim(), inv = String(it.inv || "").slice(0, 40), dueIso = String(it.dueIso || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !inv || !/^\d{4}-\d{2}-\d{2}$/.test(dueIso)) { skipped++; continue; }
        const key = "contact:" + email; let rec = null; try { rec = JSON.parse(await env.IG.get(key) || "null"); } catch { rec = null; }
        rec = rec || { email, created: new Date().toISOString(), requests: [], tags: [] };
        rec.name = rec.name || String(it.name || "").slice(0, 80);
        if ((rec.requests || []).some(r => r.inv === inv || r.fbSent)) { skipped++; continue; }   // known invoice, or this client already got their feedback mail
        rec.requests = [...(rec.requests || []).slice(-19), { at: new Date().toISOString(), via: "moneybird", inv, what: "Invoice " + inv, dateIso: dueIso, date: dueIso, location: "", source: "moneybird" }];
        rec.tags = [...new Set([...(rec.tags || []), "client"])];
        if (!q.dry) { try { await env.IG.put(key, JSON.stringify(rec)); added++; } catch { skipped++; } } else added++;
      }
      return reply(200, { ok: true, added, skipped, dry: !!q.dry }, okOrigin);
    }
    if (new URL(request.url).pathname === "/manychat" && request.method === "POST") {   // ManyChat "External Request": a follower left an email in the DM. Header x-key = MANYCHAT_KEY.
      const kk = String(request.headers.get("x-key") || ""), want = String(env.MANYCHAT_KEY || ""); let df = kk.length ^ want.length; for (let i = 0; i < Math.max(kk.length, want.length); i++) df |= (kk.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
      if (!want || df !== 0) return reply(401, { ok: false }, okOrigin);
      let m; try { m = JSON.parse((await request.text()).slice(0, 5000)); } catch { return reply(400, { ok: false, error: "json" }, okOrigin); }
      const ig = line(m.ig_username || m.instagram || "", 40).replace(/^@/, ""), interest = line(m.interest || "", 30).toLowerCase();
      const consent = m.optin === true || String(m.optin || "").toLowerCase() === "yes" || String(m.optin || "") === "true";
      await saveContact(env, { email: line(m.email, 120), name: line(m.first_name || m.name || "", 80), instagram: ig ? "@" + ig : "", via: "manychat", what: interest ? "Instagram DM: " + interest : "Instagram DM", source: "ig-dm", updates: consent, tags: ["instagram", ...(["event", "brand", "artist", "presskit"].includes(interest) ? [interest] : [])] });
      return reply(200, { ok: true }, okOrigin);
    }
    if (new URL(request.url).pathname === "/handled" && request.method === "POST") {   // mark a client's requests as answered (stops the reminders); header x-key = price code
      const kk = String(request.headers.get("x-key") || ""), want = String(env.PRICE_CODE || ""); let df = kk.length ^ want.length; for (let i = 0; i < Math.max(kk.length, want.length); i++) df |= (kk.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
      if (!want || df !== 0) return reply(401, { ok: false }, okOrigin);
      let h; try { h = JSON.parse((await request.text()).slice(0, 500)); } catch { return reply(400, { ok: false }, okOrigin); }
      const key = "contact:" + String(h.email || "").toLowerCase().trim(); let rec = null; try { rec = JSON.parse(await env.IG.get(key) || "null"); } catch { rec = null; }
      if (!rec) return reply(404, { ok: false, error: "unknown" }, okOrigin);
      for (const r of rec.requests || []) r.handled = new Date().toISOString().slice(0, 10);
      await env.IG.put(key, JSON.stringify(rec)); return reply(200, { ok: true }, okOrigin);
    }
    if (new URL(request.url).pathname === "/run-reminders" && request.method === "POST") {
      const kk = String(request.headers.get("x-key") || ""), want = String(env.PRICE_CODE || ""); let df = kk.length ^ want.length; for (let i = 0; i < Math.max(kk.length, want.length); i++) df |= (kk.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
      if (!want || df !== 0) return reply(401, { ok: false }, okOrigin);
      return reply(200, { ok: true, ...(await remindRun(env, new URL(request.url).searchParams.get("dry") === "1")) }, okOrigin);
    }
    if (new URL(request.url).pathname === "/run-feedback" && request.method === "POST") {   // manual run (header x-key = the price code); ?dry=1 only counts
      const kk = String(request.headers.get("x-key") || ""), want = String(env.PRICE_CODE || ""); let df = kk.length ^ want.length; for (let i = 0; i < Math.max(kk.length, want.length); i++) df |= (kk.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
      if (!want || df !== 0) return reply(401, { ok: false }, okOrigin);
      return reply(200, { ok: true, ...(await feedbackRun(env, new URL(request.url).searchParams.get("dry") === "1")) }, okOrigin);
    }
    if (request.method !== "POST") return reply(405, { ok: false, error: "method" }, okOrigin);
    if (!okOrigin) return reply(403, { ok: false, error: "origin" }, "");

    // the price list: only with the shared code (Worker secret PRICE_CODE); the prices live in a Worker secret (PRICES), never in the repo or the page
    if (new URL(request.url).pathname === "/prices") {
      // 3 wrong codes an hour per visitor, then it is closed for that hour; only wrong tries count
      const ip = request.headers.get("CF-Connecting-IP") || "unknown", key = "pl:" + ip; let n = 0;
      try { n = Number(await env.IG.get(key)) || 0; } catch { /* the limit is a safety net */ }
      if (n >= 3) return reply(429, { ok: false, error: "rate" }, okOrigin);
      let pd; try { pd = JSON.parse((await request.text()).slice(0, 500)); } catch { return reply(400, { ok: false, error: "json" }, okOrigin); }
      const code = String(pd.code || "").trim().toLowerCase(), want = String(env.PRICE_CODE || "").trim().toLowerCase();
      let diff = code.length ^ want.length; for (let i = 0; i < Math.max(code.length, want.length); i++) diff |= (code.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
      if (!want || (diff !== 0 && !(await tokenOk(env, code)))) { try { await env.IG.put(key, String(n + 1), { expirationTtl: 3600 }); } catch { /* ignore */ } return reply(401, { ok: false, error: "code" }, okOrigin); }
      let prices; try { prices = JSON.parse(env.PRICES); } catch { return reply(500, { ok: false, error: "setup" }, okOrigin); }
      return reply(200, { ok: true, prices }, okOrigin);
    }

    // size cap and a rate limit per visitor: 5 requests an hour (the counter lives in KV and expires by itself)
    if (Number(request.headers.get("Content-Length") || 0) > 20000) return reply(413, { ok: false, error: "size" }, okOrigin);
    try {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown", key = "rl:" + ip, n = Number(await env.IG.get(key)) || 0;
      if (n >= 5) return reply(429, { ok: false, error: "rate" }, okOrigin);
      await env.IG.put(key, String(n + 1), { expirationTtl: 3600 });
    } catch { /* the limit is a safety net: when KV is down the form keeps working */ }

    let d;
    try { d = JSON.parse((await request.text()).slice(0, 20000)); } catch { return reply(400, { ok: false, error: "json" }, okOrigin); }
    const rawBody = JSON.stringify({ ...d, elapsed: 0 });   // timing differs per click; keep it out of the duplicate check

    // spam: the hidden field must be empty and nobody fills a form in under 3 seconds
    if (d.company) return reply(200, { ok: true }, okOrigin);          // pretend it worked
    if (Number(d.elapsed) < 3) return reply(200, { ok: true }, okOrigin);

    // idempotency: the same submission twice within 2 minutes (double click, retry on a flaky connection) is answered once
    let idem = "";
    try {
      const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
      idem = "idem:" + [...new Uint8Array(dig)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
      if (await env.IG.get(idem)) return reply(200, { ok: true }, okOrigin);
    } catch { idem = ""; }
    const done = async () => { if (idem) { try { await env.IG.put(idem, "1", { expirationTtl: 120 }); } catch { /* ignore */ } } };

    // a plain question from the Questions page: name, email, question
    if (d.type === "question") {
      const qn = line(d.name, 80), qe = line(d.email, 120), qq = text(d.question, 1500);
      if (qn.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(qe) || qq.length < 5) return reply(400, { ok: false, error: "invalid" }, okOrigin);
      try { await sendNotify(env, { replyTo: [qn, qe], subject: `New question - ${qn}`, heading: "New question", rows: [["Name", qn], ["Email", qe, "mailto:" + qe], ["Question", qq]] }); } catch (e) { return reply(502, { ok: false, error: "mail" }, okOrigin); }
      await done(); return reply(200, { ok: true }, okOrigin);
    }
    if (d.type === "pricing") {   // a request from the hidden pricing page: contact details plus the chosen package
      const pn = line(d.name, 80), pe = line(d.email, 120), pp = line(d.phone, 40), pd = line(d.date, 60), pm = text(d.message, 1500), pl = line(d.place, 120), ps = text(d.selection, 800), pt = line(d.total, 40);
      if (pn.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(pe)) return reply(400, { ok: false, error: "invalid" }, okOrigin);
      try { await sendNotify(env, { replyTo: [pn, pe], subject: `Pricing request - ${pn}`, heading: "Pricing request", rows: [["Name", pn], ["Email", pe, "mailto:" + pe], ["Phone", pp], ["Date", pd], ["Location", pl, pl ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(pl) : ""], ["Selection", ps], ["Estimate (ex VAT and travel)", /^\d/.test(pt) ? "\u20ac" + pt : pt], ["Remarks", pm]] }); } catch (e) { return reply(502, { ok: false, error: "mail" }, okOrigin); }
      await saveContact(env, { email: pe, name: pn, via: "pricing", what: ps, date: pd, dateIso: d.dateIso, location: pl, updates: d.updates === true, tags: ["pricing", ...(/multicam/i.test(ps) ? ["multicam"] : []), ...(/photo/i.test(ps) ? ["photo"] : []), ...(/presskit/i.test(ps) ? ["presskit"] : []), ...(/recap/i.test(ps) ? ["recap"] : [])] });
      await confirmMail(env, pe, pn, [["Your request", ps], ["Estimate", pt ? (/^\d/.test(pt) ? "\u20ac" + pt : pt) + " (ex VAT and travel)" : ""], ["Date", pd], ["Location", pl], ["Remarks", pm]], "This is a request, not a booking: we check the date and the details together.", `Hi ${pn.split(" ")[0] || "there"}, thank you. I read your request myself and reply within 24 hours to confirm it or to talk it through.`);
      await done(); return reply(200, { ok: true }, okOrigin);
    }
    if (d.type === "codeRequest") {   // someone asks for the prices from the lock screen of the pricing page
      const cn = line(d.name, 80), ce = line(d.email, 120), cm = text(d.message, 600); let plink = "";
      if (cn.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ce)) return reply(400, { ok: false, error: "invalid" }, okOrigin);
      try { plink = env.PRICING_PATH ? await priceLink(env, ce) : ""; } catch { plink = ""; }
      try { await sendNotify(env, { replyTo: [cn, ce], subject: `Price code requested - ${cn}`, heading: "Price code requested", intro: "The private price link was sent to them automatically. Reply to follow up.", cta: { text: "Reply with the price link", href: "mailto:" + ce + "?subject=" + encodeURIComponent("Your prices | Stevy Vergouwen") + "&body=" + encodeURIComponent(`Hi ${cn.split(" ")[0]},\n\nThanks for asking. Here are my prices, you can fill in your request right there:\n${plink}\n\nThe link is private, please keep it to yourself.\n\nStevy`) }, rows: [["Name", cn], ["Email", ce, "mailto:" + ce], ["Message", cm]] }); } catch (e) { return reply(502, { ok: false, error: "mail" }, okOrigin); }
      await saveContact(env, { email: ce, name: cn, via: "pricing-code", what: "Asked for the prices" + (cm ? ": " + cm.slice(0, 120) : ""), source: line(d.src, 40) || "pricing-lock", updates: d.updates === true, tags: ["pricing-code"] });
      if (env.BREVO_API_KEY && plink) {   // the prices go out automatically, to anyone who left a valid email
        const link = plink;
        const { text, html } = mailParts({ heading: "Here are my prices.", eyebrow: "Prices", intro: `Hi ${cn.split(" ")[0] || "there"}, thanks for asking. This private link opens my prices; fill in your request right there and I reply within 24 hours to confirm it or to talk it through.`, cta: { text: "Open the prices", href: link }, note: "The link is private and works for 24 hours. Need more time? Just reply and I will send a new one.", sign: true });
        await brevo(env, "/smtp/email", { sender: { name: "Stevy Vergouwen", email: "info@stevyvergouwen.com" }, to: [{ email: ce, name: cn }], replyTo: { email: "info@stevyvergouwen.com", name: "Stevy Vergouwen" }, subject: "Your prices | Stevy Vergouwen", htmlContent: html, textContent: text }, "confirm prices " + ce);
      }
      await done(); return reply(200, { ok: true }, okOrigin);
    }
    if (d.type === "testimonial") {   // a client leaves a quote through the hidden feedback page
      const tn = line(d.name, 80), tr = line(d.role, 120), tc = line(d.client, 120), tq = text(d.quote, 1500), ok = d.consent === true || d.consent === "yes";
      if (tn.length < 2 || tq.length < 10 || !ok) return reply(400, { ok: false, error: "invalid" }, okOrigin);
      try { await sendNotify(env, { subject: `New testimonial - ${tn}`, heading: "New testimonial", rows: [["Name", tn], ["Role", tr], ["Client", tc], ["Quote", tq]] }); } catch (e) { return reply(502, { ok: false, error: "mail" }, okOrigin); }
      await done(); return reply(200, { ok: true }, okOrigin);
    }
    const type = TYPES[d.type] ? d.type : "";
    const name = line(d.name, 80), email = line(d.email, 120), ig = line(d.instagram, 40).replace(/^@+$/, "");
    const date = line(d.date, 10);
    const needs = (Array.isArray(d.needs) ? d.needs : []).filter(n => NEEDS.includes(n));
    // an artist who only wants a presskit needs no location: those are shot at Studio Brada
    const presskitOnly = type === "artist" && needs.length === 1 && needs[0] === "presskit";
    let location = line(d.location, 240);
    if (presskitOnly) location = "Studio Brada, Zijdepark 19, Oudekerk aan den IJssel";   // presskits are always shot in the studio
    if (!type || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || (ig && !/^@[A-Za-z0-9._]{1,30}$/.test(ig)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || location.length < 2) return reply(400, { ok: false, error: "invalid" }, okOrigin);

    // the date: today (Amsterdam) up to two years ahead - never yesterday
    const ams = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());   // YYYY-MM-DD
    const far = new Date(ams + "T00:00:00Z"); far.setUTCFullYear(far.getUTCFullYear() + 2);
    if (date < ams || date > far.toISOString().slice(0, 10)) return reply(400, { ok: false, error: "date" }, okOrigin);

    // times: event needs start and end, artist optional, brand none (HH:MM)
    const hm = t => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || "")) ? String(t) : "");
    const start = hm(d.start), end = hm(d.end);
    // artist: the time is optional, except for a presskit-only request: a time between 09:00 and 21:00 in the studio
    if (presskitOnly && (!start || start < "09:00" || start > "21:00")) return reply(400, { ok: false, error: "time" }, okOrigin);
    if ((type === "event" && (!start || !end))) return reply(400, { ok: false, error: "time" }, okOrigin);
    const notes = text(d.notes);
    const src = line(d.src, 40) || "direct";

    // the picked place from the address search (optional): clean every part, never trust the numbers
    let place = null;
    if (d.place && typeof d.place === "object") {
      const lat = Number(d.place.lat), lon = Number(d.place.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
        place = { label: line(d.place.label, 240), lat: lat.toFixed(6), lon: lon.toFixed(6) };
    }
    const mapQuery = encodeURIComponent(place && place.label ? place.label : location);
    const mapLines = [
      `Address:    ${place && place.label ? place.label : "(typed by hand, not checked)"}`,
      `Google Maps: https://www.google.com/maps/search/?api=1&query=${mapQuery}`,
      ...(place ? [`Coordinates: ${place.lat}, ${place.lon}`] : [])
    ];

    try {
      await sendNotify(env, { replyTo: [name, email], subject: `New request - ${TYPES[type]} - ${name} (${date}${start ? " " + start : ""})`, heading: `New request: ${TYPES[type]}`, rows: [
        ["Name", name], ["Email", email, "mailto:" + email], ["Instagram", ig, ig ? "https://instagram.com/" + ig.slice(1) : ""], ["Date", date], ["Time", start ? start + (end ? " - " + end : "") : ""],
        ["Location", location, "https://www.google.com/maps/search/?api=1&query=" + mapQuery], ["Address", place && place.label ? place.label : "typed by hand, not checked"], ["Needs", needs.join(", ")], ["Notes", notes], ["Source", src + (line(d.page, 40) ? " / " + line(d.page, 40) : "")]] });
    } catch (e) {
      return reply(502, { ok: false, error: "mail" }, okOrigin);
    }
    await saveContact(env, { email, name, instagram: ig, via: type, what: needs.join(", "), date, dateIso: date, location, source: src, updates: d.updates === true, tags: [type, ...needs.map(n => n.replace(" ", "-"))] });
    await confirmMail(env, email, name, [["For", TYPES[type]], ["Date", date], ["Time", start ? start + (end ? " - " + end : "") : ""], ["Location", place && place.label ? place.label : location], ["What you need", needs.join(", ")], ["Notes", notes]], "This is a request, not a booking: we check the date and the details together.");
    await done(); return reply(200, { ok: true }, okOrigin);
  }
};
