/* Landing page background: a slideshow of video and photo, crossfading.
   Reads media/bg/bg.json (made by tools/maak_achtergrond.py). With no
   list, or reduced motion, the page stays plain dark (or shows the first slide). */
(() => {
  const root = document.querySelector("[data-bg]");
  if (!root) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HOLD = 4000;
  let slides = [], cur = -1, timer = null;

  const make = s => {
    const el = document.createElement("div");
    el.className = "bg-slide";
    if (s.type === "video") {
      const v = document.createElement("video");
      v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.autoplay = true;
      v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("autoplay", "");
      // play as soon as it can, if it is the slide on screen (autoplay can need a second try)
      const go = () => { if (el.classList.contains("is-on") && v.paused) v.play().catch(() => {}); };
      v.addEventListener("loadeddata", go); v.addEventListener("canplay", go);
      if (s.poster) v.poster = s.poster;
      v.src = s.src;
      el.appendChild(v);
    } else {
      const i = document.createElement("img");
      i.alt = ""; i.src = s.src; i.decoding = "async";
      if (s.pos) i.style.objectPosition = s.pos;
      if (s.fit) i.className = "fit-" + s.fit;
      el.appendChild(i);
    }
    return el;
  };

  function show(n) {
    const next = slides[n];
    if (!next.el) { next.el = make(next); root.appendChild(next.el); }
    const v = next.el.querySelector("video");
    if (v) { try { if (v.readyState > 0) v.currentTime = 0; } catch (e) {} v.play().catch(() => {}); }
    next.el.classList.add("is-on");
    const old = slides[cur];
    if (old && old !== next) {
      old.el.classList.remove("is-on");
      const ov = old.el.querySelector("video");
      if (ov) setTimeout(() => { if (!old.el.classList.contains("is-on")) ov.pause(); }, 1600);
    }
    cur = n;
    // warm the next one
    const nn = slides[(n + 1) % slides.length];
    if (!nn.el) { nn.el = make(nn); root.appendChild(nn.el); }
  }

  // a second chance every second: the slide on screen should be playing
  setInterval(() => {
    const s = slides[cur]; const v = s && s.el && s.el.querySelector("video");
    if (v && v.paused && !document.hidden) v.play().catch(() => {});
  }, 1000);
  // some browsers only allow autoplay after a first touch or click
  ["pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, () => {
    const s = slides[cur]; const v = s && s.el && s.el.querySelector("video");
    if (v && v.paused) v.play().catch(() => {});
  }, { passive: true, once: false }));
  const wait = () => ((slides[cur] && slides[cur].dur) ? slides[cur].dur * 1000 : HOLD);

  // ?debug shows what the current video is doing - for finding out why autoplay is blocked
  if (/[?&]debug\b/.test(location.search)) {
    const box = document.createElement("pre");
    box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:8px 10px;background:rgba(0,0,0,.75);color:#9f9;font:11px/1.4 monospace;max-width:92vw;white-space:pre-wrap;pointer-events:none";
    document.body.appendChild(box);
    window.__bgErr = "";
    setInterval(() => {
      const s = slides[cur]; const v = s && s.el && s.el.querySelector("video");
      box.textContent = "slide " + cur + "/" + slides.length + (s ? " " + s.type : "") + "\n" +
        (v ? "paused=" + v.paused + " t=" + v.currentTime.toFixed(1) + " ready=" + v.readyState + " net=" + v.networkState + " err=" + (v.error ? v.error.code : "-") + " muted=" + v.muted + "\nplay(): " + window.__bgErr : "photo") +
        "\nreduceMotion=" + calm + " hidden=" + document.hidden + "\n" + navigator.userAgent.slice(0, 90);
    }, 400);
  }
  const tick = () => { show((cur + 1) % slides.length); timer = setTimeout(tick, wait()); };
  const start = () => { if (!timer && slides.length > 1 && !calm) timer = setTimeout(tick, wait()); };
  const stop = () => { clearTimeout(timer); timer = null; };
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  fetch("media/bg/bg.json").then(r => (r.ok ? r.json() : [])).then(list => {
    slides = list.filter(s => s && s.src);
    if (!slides.length) return;
    // shuffle, then mix photos and video: the photos are spread evenly between the video pieces
    const shuf = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const vids = shuf(slides.filter(x => x.type === "video")), fotos = shuf(slides.filter(x => x.type !== "video"));
    // never two pieces of the same clip in a row (greedy)
    const ordered = [];
    while (vids.length) {
      const last = ordered.filter(x => x.type === "video").slice(-1)[0];
      let k = vids.findIndex(x => !last || x.group !== last.group);
      if (k < 0) k = 0;
      ordered.push(vids.splice(k, 1)[0]);
    }
    const N = ordered.length + fotos.length, mixed = [];
    const slots = new Set(fotos.map((_, i) => Math.min(N - 1, Math.floor((i + 0.5) * N / fotos.length))));
    let vi = 0, fi = 0;
    for (let n = 0; n < N; n++) mixed.push(slots.has(n) && fi < fotos.length ? fotos[fi++] : ordered[vi++] || fotos[fi++]);
    slides = mixed.filter(Boolean);
    // open on the opener (LOU'D), whichever piece of it
    const op = slides.map((x, n) => (x.opener ? n : -1)).filter(n => n > -1);
    if (op.length) { const k = op[Math.floor(Math.random() * op.length)]; [slides[0], slides[k]] = [slides[k], slides[0]]; }
    document.body.classList.add("has-bg");
    show(0);
    start();
  }).catch(() => {});
})();
