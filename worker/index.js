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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
});
const reply = (status, body, origin) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(origin ? cors(origin) : {}) } });

// header values: one line, ASCII only (the body carries the real text)
const line = (s, max = 120) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7E]/g, "").trim().slice(0, max);
const text = (s, max = 2000) => String(s ?? "").replace(/\r/g, "").trim().slice(0, max);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const okOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";

    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: okOrigin ? cors(okOrigin) : {} });
    if (request.method !== "POST") return reply(405, { ok: false, error: "method" }, okOrigin);
    if (!okOrigin) return reply(403, { ok: false, error: "origin" }, "");

    let d;
    try { d = await request.json(); } catch { return reply(400, { ok: false, error: "json" }, okOrigin); }

    // spam: the hidden field must be empty and nobody fills a form in under 3 seconds
    if (d.company) return reply(200, { ok: true }, okOrigin);          // pretend it worked
    if (Number(d.elapsed) < 3) return reply(200, { ok: true }, okOrigin);

    const type = TYPES[d.type] ? d.type : "";
    const name = line(d.name, 80), email = line(d.email, 120), ig = line(d.instagram, 40);
    const date = line(d.date, 10), location = line(d.location, 240);
    if (!type || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || (ig && !/^@[A-Za-z0-9._]{1,30}$/.test(ig)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || location.length < 2) return reply(400, { ok: false, error: "invalid" }, okOrigin);

    // the date: today (Amsterdam) up to two years ahead - never yesterday
    const ams = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());   // YYYY-MM-DD
    const far = new Date(ams + "T00:00:00Z"); far.setUTCFullYear(far.getUTCFullYear() + 2);
    if (date < ams || date > far.toISOString().slice(0, 10)) return reply(400, { ok: false, error: "date" }, okOrigin);

    // times: event needs start and end, artist optional, brand none (HH:MM)
    const hm = t => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || "")) ? String(t) : "");
    const start = hm(d.start), end = hm(d.end);
    const needs = (Array.isArray(d.needs) ? d.needs : []).filter(n => NEEDS.includes(n));
    // artist: the time is optional
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
