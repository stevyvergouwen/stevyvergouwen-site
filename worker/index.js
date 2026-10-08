/* Cloudflare Worker: receives a request from /event, /brand or /artist and mails it to Stevy.
   Uses Cloudflare Email Routing's send_email binding: no API key, no third party.
   Setup: see worker/README.md */
import { EmailMessage } from "cloudflare:email";

const ALLOWED_ORIGINS = ["https://stevyvergouwen.com", "https://www.stevyvergouwen.com"];
const FROM = "aanvraag@stevyvergouwen.com";     // must be an address on a domain with Email Routing
const TYPES = { event: "Event", brand: "Brand", artist: "Artist" };
const NEEDS = ["photos", "video", "aftermovie", "social content", "presskit", "other"];

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
    const date = line(d.date, 10), location = line(d.location, 120);
    if (!type || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^@[A-Za-z0-9._]{1,30}$/.test(ig) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || location.length < 2) return reply(400, { ok: false, error: "invalid" }, okOrigin);

    const needs = (Array.isArray(d.needs) ? d.needs : []).filter(n => NEEDS.includes(n));
    const notes = text(d.notes);
    const src = line(d.src, 40) || "direct";

    const body = [
      `New request: ${TYPES[type]}`, "",
      `Name:       ${name}`, `Email:      ${email}`, `Instagram:  ${ig}  (https://instagram.com/${ig.slice(1)})`,
      `Date:       ${date}`, `Location:   ${location}`, `Needs:      ${needs.join(", ") || "-"}`, "",
      "Notes:", notes || "-", "",
      `Source:     ${src}`, `Page:       ${line(d.page, 40)}`
    ].join("\r\n");

    const subject = `New request - ${TYPES[type]} - ${name} (${date})`;
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
