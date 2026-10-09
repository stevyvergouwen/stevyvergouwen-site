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

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(igLoad(env)); },
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const okOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";

    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: okOrigin ? cors(okOrigin) : {} });
    if (request.method === "GET" && new URL(request.url).pathname === "/instagram") {
      const feed = await igFeed(env);
      return new Response(JSON.stringify({ posts: feed.posts || [] }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900", ...(okOrigin ? cors(okOrigin) : { "Access-Control-Allow-Origin": "*" }) } });
    }
    if (request.method !== "POST") return reply(405, { ok: false, error: "method" }, okOrigin);
    if (!okOrigin) return reply(403, { ok: false, error: "origin" }, "");

    let d;
    try { d = await request.json(); } catch { return reply(400, { ok: false, error: "json" }, okOrigin); }

    // spam: the hidden field must be empty and nobody fills a form in under 3 seconds
    if (d.company) return reply(200, { ok: true }, okOrigin);          // pretend it worked
    if (Number(d.elapsed) < 3) return reply(200, { ok: true }, okOrigin);

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

    const body = [
      `New request: ${TYPES[type]}`, "",
      `Name:       ${name}`, `Email:      ${email}`, `Instagram:  ${ig ? ig + "  (https://instagram.com/" + ig.slice(1) + ")" : "-"}`,
      `Date:       ${date}`, `Time:       ${start ? start + (end ? " - " + end : "") : "-"}`, `Location:   ${location}`, ...mapLines, `Needs:      ${needs.join(", ") || "-"}`, "",
      "Notes:", notes || "-", "",
      `Source:     ${src}`, `Page:       ${line(d.page, 40)}`
    ].join("\r\n");

    const subject = `New request - ${TYPES[type]} - ${name} (${date}${start ? " " + start : ""})`;
    const raw = [
      `From: Stevy Vergouwen site <${FROM}>`,
      `To: ${env.MAIL_TO || "info@shotbystevy.com"}`,
      `Reply-To: ${name.replace(/[<>",]/g, "")} <${email}>`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@stevyvergouwen.com>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body
    ].join("\r\n");

    try {
      await env.MAIL.send(new EmailMessage(FROM, env.MAIL_TO || "info@shotbystevy.com", raw));
    } catch (e) {
      return reply(502, { ok: false, error: "mail" }, okOrigin);
    }
    return reply(200, { ok: true }, okOrigin);
  }
};
