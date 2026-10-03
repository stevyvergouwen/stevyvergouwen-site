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
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      if (s.poster) v.poster = s.poster;
      v.src = s.src;
      el.appendChild(v);
    } else {
      const i = document.createElement("img");
      i.alt = ""; i.src = s.src; i.decoding = "async";
      if (s.pos) i.style.objectPosition = s.pos;
      el.appendChild(i);
    }
    return el;
  };

  function show(n) {
    const next = slides[n];
    if (!next.el) { next.el = make(next); root.appendChild(next.el); }
    const v = next.el.querySelector("video");
    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
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

  const wait = () => ((slides[cur] && slides[cur].dur) ? slides[cur].dur * 1000 : HOLD);
  const tick = () => { show((cur + 1) % slides.length); timer = setTimeout(tick, wait()); };
  const start = () => { if (!timer && slides.length > 1 && !calm) timer = setTimeout(tick, wait()); };
  const stop = () => { clearTimeout(timer); timer = null; };
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  fetch("media/bg/bg.json").then(r => (r.ok ? r.json() : [])).then(list => {
    slides = list.filter(s => s && s.src);
    if (!slides.length) return;
    // shuffle the order once so it is not the same every visit
    for (let i = slides.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [slides[i], slides[j]] = [slides[j], slides[i]]; }
    // never two pieces of the same clip in a row
    for (let i = 1; i < slides.length; i++) {
      if (slides[i].group === slides[i - 1].group) {
        const k = slides.findIndex((x, n) => n > i && x.group !== slides[i - 1].group && x.group !== (slides[i + 1] || {}).group);
        if (k > -1) [slides[i], slides[k]] = [slides[k], slides[i]];
      }
    }
    document.body.classList.add("has-bg");
    show(0);
    start();
  }).catch(() => {});
})();
