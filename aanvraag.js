/* Request form for /event, /brand and /artist, plus the small bits the pages share.
   Sends the request as JSON to the Worker (see worker/). No keys live in this file. */
(() => {
  // The address of the Worker that mails the request to Stevy. Set after the Worker is deployed.
  const ENDPOINT = "https://aanvraag-stevyvergouwen.polished-shape-ff19.workers.dev";
  const FALLBACK_MAIL = "info@shotbystevy.com";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const src = (params.get("src") || "direct").replace(/[^\w.-]/g, "").slice(0, 40) || "direct";

  // /start: carry ?src= over to the three pages
  $$("[data-keepsrc]").forEach(a => { if (params.get("src")) a.href += "?src=" + encodeURIComponent(src); });

  // image slots: show the marked placeholder until the real file exists
  $$(".slot").forEach(fig => {
    const img = $("img", fig);
    const check = () => { fig.classList.toggle("missing", !(img.complete && img.naturalWidth > 0)); };
    img.addEventListener("error", () => fig.classList.add("missing"));
    img.addEventListener("load", () => fig.classList.remove("missing"));
    if (img.complete) check();

    // hero: no real image yet -> let the black-and-white loop run (muted, silent, not under reduced motion)
    const loop = $("video.loop", fig);
    if (loop) {
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const useLoop = () => {
        if (img.complete && img.naturalWidth > 0) { loop.remove(); return; }
        fig.classList.add("loop-on");
        if (still) return;
        loop.src = loop.dataset.src; loop.muted = true;
        const p = loop.play(); if (p && p.catch) p.catch(() => {});
      };
      if (img.complete) useLoop(); else { img.addEventListener("error", useLoop); img.addEventListener("load", () => { loop.remove(); fig.classList.remove("loop-on"); }); }
    }
  });

  // a hairline under the sticky bar once the page has moved
  const onScroll = () => document.body.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const form = $(".form");
  if (!form) return;
  const t0 = Date.now();
  form.elements.src.value = src;

  // no dates in the past
  const pad = n => String(n).padStart(2, "0");
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  form.elements.date.min = today;

  const msg = {
    name: "Please add your name.",
    email: "That email doesn't look right.",
    instagram: "Add your Instagram handle, with or without the @.",
    date: "Pick a date from today onwards.",
    location: "Tell me where it will happen."
  };

  const cleanHandle = v => {
    v = (v || "").trim();
    const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
    if (m) v = m[1];
    return v.replace(/^@+/, "").replace(/\/+$/, "");
  };

  const check = {
    name: v => v.trim().length >= 2,
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    instagram: v => /^[A-Za-z0-9._]{1,30}$/.test(cleanHandle(v)),
    date: v => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= today,
    location: v => v.trim().length >= 2
  };

  const setErr = (name, text) => {
    const input = form.elements[name], wrap = input.closest(".field"), p = $(".err", wrap);
    wrap.classList.toggle("bad", !!text);
    input.setAttribute("aria-invalid", text ? "true" : "false");
    if (p) p.textContent = text || "";
  };
  const validateOne = name => { const ok = check[name](form.elements[name].value); setErr(name, ok ? "" : msg[name]); return ok; };

  Object.keys(check).forEach(name => {
    const el = form.elements[name];
    el.addEventListener("blur", () => { if (el.value || el.dataset.touched) validateOne(name); el.dataset.touched = "1"; });
    el.addEventListener("input", () => { if (el.closest(".field").classList.contains("bad")) validateOne(name); });
  });
  // tidy the handle when the field is left
  form.elements.instagram.addEventListener("blur", e => { const h = cleanHandle(e.target.value); if (h && /^[A-Za-z0-9._]{1,30}$/.test(h)) e.target.value = "@" + h; });

  const formErr = $("#form-err");
  const submit = $(".submit", form);

  const mailto = payload => {
    const body = [
      `Type: ${payload.type}`, `Name: ${payload.name}`, `Email: ${payload.email}`, `Instagram: ${payload.instagram}`,
      `Date: ${payload.date}`, `Location: ${payload.location}`, `Needs: ${payload.needs.join(", ") || "-"}`, `Notes: ${payload.notes || "-"}`, `Source: ${payload.src}`
    ].join("\n");
    return `mailto:${FALLBACK_MAIL}?subject=${encodeURIComponent("Request: " + payload.type)}&body=${encodeURIComponent(body)}`;
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    formErr.textContent = "";
    const results = Object.keys(check).map(validateOne);
    if (results.includes(false)) {
      const first = Object.keys(check).find(n => form.elements[n].closest(".field").classList.contains("bad"));
      if (first) form.elements[first].focus();
      return;
    }
    const payload = {
      type: form.elements.type.value,
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      instagram: "@" + cleanHandle(form.elements.instagram.value),
      date: form.elements.date.value,
      location: form.elements.location.value.trim(),
      needs: $$('input[name="needs"]:checked', form).map(i => i.value),
      notes: form.elements.notes.value.trim(),
      src,
      page: location.pathname,
      elapsed: Math.round((Date.now() - t0) / 1000),
      company: form.elements.company.value
    };

    submit.disabled = true; submit.textContent = "Sending...";
    try {
      if (!ENDPOINT) throw new Error("no endpoint");
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("status " + res.status);
      form.hidden = true;
      const thanks = $("#thanks");
      thanks.hidden = false; thanks.focus();
      thanks.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    } catch (err) {
      submit.disabled = false; submit.textContent = "Send request";
      formErr.innerHTML = `That didn't go through. Please try again, or <a href="${mailto(payload)}">send it by email</a> instead.`;
    }
  });
})();
