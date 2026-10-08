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

  // image slots (the row of three): show the marked placeholder until the real file exists
  $$(".slot:not(.hero-slot)").forEach(fig => {
    const img = $("img", fig);
    if (!img) return;
    const check = () => { fig.classList.toggle("missing", !(img.complete && img.naturalWidth > 0)); };
    img.addEventListener("error", () => fig.classList.add("missing"));
    img.addEventListener("load", () => fig.classList.remove("missing"));
    if (img.complete) check();
  });

  // hero: the muted video loop behind the top block. Two copies of the same video take turns: shortly before the
  // end of one, the other starts from the beginning and the first fades out, so the loop closes without a jump or a stall.
  // Not under reduced motion (the poster stays), and never forced.
  const A = $(".hero-slot video.loop");
  if (A) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    A.classList.add("on");
    if (!still) {
      const XF = 0.12;                                    // overlap at the loop point, in seconds: a hard cut
      const B = A.cloneNode(false);
      B.removeAttribute("poster"); B.classList.remove("on");
      A.parentNode.appendChild(B);
      [A, B].forEach(v => { v.loop = false; v.muted = true; v.preload = "auto"; v.src = A.dataset.src; v.load(); });
      let cur = A, nxt = B, switching = false;
      const play = v => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
      const swap = () => {
        if (switching) return; switching = true;
        const old = cur, fresh = nxt;
        try { fresh.currentTime = 0; } catch (e) {}
        play(fresh);
        fresh.classList.add("on"); old.classList.remove("on");
        cur = fresh; nxt = old;
        setTimeout(() => { old.pause(); try { old.currentTime = 0; } catch (e) {} switching = false; }, XF * 1000 + 250);
      };
      const tick = () => {
        if (cur.duration && !cur.paused && cur.currentTime >= cur.duration - XF && nxt.readyState >= 3) swap();
        requestAnimationFrame(tick);
      };
      A.addEventListener("canplay", () => play(A), { once: true });
      play(A);
      addEventListener("pointerdown", () => { if (cur.paused) play(cur); }, { once: true, passive: true });
      requestAnimationFrame(tick);
      // safety nets: a tab that was hidden stops animation frames; when it ends or returns, carry on
      [A, B].forEach(v => v.addEventListener("ended", () => { if (v === cur) { switching = false; swap(); } }));
      document.addEventListener("visibilitychange", () => { if (!document.hidden && cur.paused && !switching) play(cur); });
    }
  }

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
  // and not unreasonably far ahead (a typo like 2062): two years from today
  const far = new Date(d.getFullYear() + 2, d.getMonth(), d.getDate());
  const maxDay = `${far.getFullYear()}-${pad(far.getMonth() + 1)}-${pad(far.getDate())}`;
  form.elements.date.max = maxDay;

  const msg = {
    name: "Please add your name.",
    email: "That email doesn't look right.",
    instagram: "Add your Instagram handle, with or without the @.",
    date: "Pick a date from today onwards.",
    dateFar: "Pick a date within the next two years.",
    location: "Tell me where it will happen.",
    start: "Add a start time.",
    end: "Add an end time.",
    startPast: "That time has already passed today.",
    studioTime: "Pick a time between 09:00 and 21:00."
  };

  const cleanHandle = v => {
    v = (v || "").trim();
    const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
    if (m) v = m[1];
    return v.replace(/^@+/, "").replace(/\/+$/, "");
  };

  // artists: the time is optional (a presskit has none, and some do not know it yet)
  const timeNeeded = () => form.elements.type.value !== "artist";
  // artist asking only for a presskit: it is shot at Studio Brada, so no location is needed
  const presskitOnly = () => { const n = $$('input[name="needs"]:checked', form).map(i => i.value); return form.elements.type.value === "artist" && n.length === 1 && n[0] === "presskit"; };
  const nowHM = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; };
  const check = {
    name: v => v.trim().length >= 2,
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    instagram: v => cleanHandle(v) === "" || /^[A-Za-z0-9._]{1,30}$/.test(cleanHandle(v)),
    date: v => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= today && v <= maxDay,
    location: v => v.trim().length >= 2 || presskitOnly(),
    start: v => v === "" ? !(timeNeeded() || presskitOnly()) : /^([01]\d|2[0-3]):[0-5]\d$/.test(v) && !(form.elements.date.value === today && v < nowHM()) && (!presskitOnly() || (v >= "09:00" && v <= "21:00")),
    end: v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
  };

  const setErr = (name, text) => {
    const input = form.elements[name], wrap = input.closest(".field"), p = $(".err", wrap);
    wrap.classList.toggle("bad", !!text);
    input.setAttribute("aria-invalid", text ? "true" : "false");
    if (p) p.textContent = text || "";
  };
  const have = () => Object.keys(check).filter(n => form.elements[n]);
  const validateOne = name => {
    const v = form.elements[name].value, ok = check[name](v);
    setErr(name, ok ? "" : (name === "date" && v > today ? msg.dateFar : (name === "start" && /^\d/.test(v) ? (presskitOnly() && (v < "09:00" || v > "21:00") ? msg.studioTime : msg.startPast) : (name === "start" && presskitOnly() ? msg.studioTime : msg[name]))));
    return ok;
  };

  have().forEach(name => {
    const el = form.elements[name];
    el.addEventListener("blur", () => { if (el.value || el.dataset.touched) validateOne(name); el.dataset.touched = "1"; });
    el.addEventListener("input", () => { if (el.closest(".field").classList.contains("bad")) validateOne(name); });
  });
  form.elements.date.addEventListener("change", () => { if (form.elements.start && form.elements.start.value) validateOne("start"); });
  // adapt the time label and the location field to what is picked
  const timeLabel = $('label[for="f-start"]', form), locIn = form.elements.location;
  const dateLabel = $('label[for="f-date"]', form), dateText = dateLabel.textContent;
  const notesIn = form.elements.notes, notesText = notesIn.placeholder;
  const STUDIO = "Studio Brada, Zijdepark 19, Breda";
  let autoStudio = false;
  locIn.addEventListener("input", () => { autoStudio = false; });
  const syncNeeds = () => {
    if (timeLabel && form.elements.type.value === "artist") {
      const multi = !!$('input[name="needs"][value="live registration"]:checked', form);
      timeLabel.textContent = presskitOnly() ? "What time suits you best? Pick a time between 09:00 and 21:00."
        : multi ? "What time are you on? I plan the cameras around it. Not sure yet? Leave it open."
        : "Time you are on, if you know. Not sure yet? Leave it open.";
      const st = form.elements.start; st.min = presskitOnly() ? "09:00" : ""; st.max = presskitOnly() ? "21:00" : ""; st.required = presskitOnly();
      dateLabel.textContent = presskitOnly() ? "Preferred date for your presskit shoot" : dateText;
    }
    notesIn.placeholder = presskitOnly() ? "Paste a link to your moodboard or references, and tell me your ideas. Anything that helps." : notesText;
    if (form.elements.start && form.elements.start.dataset.touched) validateOne("start");
    const combo = locIn.closest(".combo");
    if (presskitOnly()) {
      locIn.value = STUDIO; autoStudio = true; place = null; closeList(); setErr("location", "");
      combo.hidden = true;
      found.textContent = "I shoot all presskits in my regular studio: " + STUDIO + "."; found.hidden = false;
    } else {
      combo.hidden = false;
      if (autoStudio) { locIn.value = ""; autoStudio = false; found.hidden = true; found.textContent = ""; }
    }
  };
  $$('input[name="needs"]', form).forEach(i => i.addEventListener("change", syncNeeds));
  // tidy the handle when the field is left
  form.elements.instagram.addEventListener("blur", e => { const h = cleanHandle(e.target.value); if (h && /^[A-Za-z0-9._]{1,30}$/.test(h)) e.target.value = "@" + h; });

  // ---- address search: type a venue or an address, pick it from the list (OpenStreetMap data via Photon, no key)
  const loc = form.elements.location, list = $("#loc-list"), found = $("#found");
  let place = null, timer = null, ctrl = null, items = [], active = -1, lastQ = "";
  const mapsUrl = text => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(text);

  const fromFeature = f => {
    const p = f.properties || {}, [lon, lat] = (f.geometry && f.geometry.coordinates) || [];
    const street = [p.street || (p.osm_key === "highway" ? p.name : ""), p.housenumber].filter(Boolean).join(" ");
    const nameIsVenue = p.name && p.osm_key !== "highway" && p.osm_key !== "place" && p.osm_key !== "boundary";
    const city = p.city || p.town || p.village || p.district || p.county || "";
    const rest = [street, [p.postcode, city].filter(Boolean).join(" "), p.country].filter(Boolean);
    return {
      name: nameIsVenue ? p.name : "", street, postcode: p.postcode || "", city, country: p.country || "",
      lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6,
      label: [nameIsVenue ? p.name : "", ...rest].filter(Boolean).join(", "),
      l1: nameIsVenue ? p.name : (street || city || p.name || ""),
      l2: nameIsVenue ? rest.join(", ") : [[p.postcode, city].filter(Boolean).join(" "), p.country].filter(Boolean).join(", ")
    };
  };

  const closeList = () => { list.hidden = true; loc.setAttribute("aria-expanded", "false"); loc.removeAttribute("aria-activedescendant"); active = -1; };
  const openList = () => { list.hidden = false; loc.setAttribute("aria-expanded", "true"); };
  const setActive = n => {
    active = n;
    $$("li", list).forEach((li, i) => li.setAttribute("aria-selected", i === n ? "true" : "false"));
    if (n >= 0) loc.setAttribute("aria-activedescendant", "loc-o" + n); else loc.removeAttribute("aria-activedescendant");
  };
  const render = () => {
    list.innerHTML = "";
    if (!items.length) { const li = document.createElement("li"); li.className = "none"; li.textContent = "No match. Keep typing, or leave it as you wrote it."; list.appendChild(li); openList(); return; }
    items.forEach((it, i) => {
      const li = document.createElement("li");
      li.id = "loc-o" + i; li.setAttribute("role", "option");
      li.innerHTML = `<span class="l1"></span><span class="l2"></span>`;
      li.firstChild.textContent = it.l1; li.lastChild.textContent = it.l2;
      li.addEventListener("mousedown", e => { e.preventDefault(); choose(i); });
      list.appendChild(li);
    });
    openList(); setActive(-1);
  };
  const choose = i => {
    const it = items[i]; if (!it) return;
    place = it; loc.value = it.label; closeList(); setErr("location", "");
    found.hidden = false;
    found.innerHTML = 'Found. <a target="_blank" rel="noopener"></a>';
    const a = $("a", found); a.href = mapsUrl(it.label); a.textContent = "Check it on Google Maps";
  };
  const search = q => {
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    // Breda as a soft bias; the search still finds addresses anywhere
    fetch("https://photon.komoot.io/api/?limit=6&lat=51.589&lon=4.776&q=" + encodeURIComponent(q), { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : { features: [] }))
      .then(d => { if (q !== loc.value.trim()) return; items = (d.features || []).map(fromFeature).filter(x => x.label); render(); })
      .catch(e => { if (e && e.name !== "AbortError") console.warn("address search failed:", e); });
  };
  loc.addEventListener("input", () => {
    place = null; found.hidden = true;                      // typing again clears the picked place
    clearTimeout(timer);
    const q = loc.value.trim();
    if (q.length < 3) { closeList(); return; }
    timer = setTimeout(() => { lastQ = q; search(q); }, 350);
  });
  loc.addEventListener("keydown", e => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(items.length - 1, active + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { closeList(); }
  });
  loc.addEventListener("blur", () => setTimeout(closeList, 120));

  const formErr = $("#form-err");
  const submit = $(".submit", form);

  const mailto = payload => {
    const body = [
      `Type: ${payload.type}`, `Name: ${payload.name}`, `Email: ${payload.email}`, `Instagram: ${payload.instagram || "-"}`,
      `Date: ${payload.date}`, `Time: ${payload.start || "-"}${payload.end ? " - " + payload.end : ""}`, `Location: ${payload.location}`, `Address: ${payload.place ? payload.place.label : "(typed by hand)"}`, `Needs: ${payload.needs.join(", ") || "-"}`, `Notes: ${payload.notes || "-"}`, `Source: ${payload.src}`
    ].join("\n");
    return `mailto:${FALLBACK_MAIL}?subject=${encodeURIComponent("Request: " + payload.type)}&body=${encodeURIComponent(body)}`;
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    formErr.textContent = "";
    const results = have().map(validateOne);
    if (results.includes(false)) {
      const first = have().find(n => form.elements[n].closest(".field").classList.contains("bad"));
      if (first) form.elements[first].focus();
      return;
    }
    const payload = {
      type: form.elements.type.value,
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      instagram: cleanHandle(form.elements.instagram.value) ? "@" + cleanHandle(form.elements.instagram.value) : "",
      date: form.elements.date.value,
      start: form.elements.start ? form.elements.start.value : "",
      end: form.elements.end ? form.elements.end.value : "",
      location: form.elements.location.value.trim(),
      place: place ? { name: place.name, street: place.street, postcode: place.postcode, city: place.city, country: place.country, lat: place.lat, lon: place.lon, label: place.label } : null,
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
