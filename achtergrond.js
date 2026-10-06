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
      v.muted = true; v.defaultMuted = true; v.loop = false; v.playsInline = true; v.preload = "auto"; v.autoplay = false;
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      // play as soon as it can, if it is the slide on screen (autoplay can need a second try)
      const go = () => { if (!calm && el.classList.contains("is-on") && v.paused && !v.ended) v.play().catch(e => refused(s, e)); };
      v.addEventListener("loadeddata", go); v.addEventListener("canplay", go);
      if (s.poster) { v.poster = s.poster; el.style.background = "url(" + s.poster + ") center / cover no-repeat"; }
      v.controls = false; v.disablePictureInPicture = true;
      v.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback"); v.setAttribute("x-webkit-airplay", "deny");
      // download the whole piece first and play it from memory: no stalls halfway
      fetch(s.src).then(r => r.blob()).then(b => { v.src = URL.createObjectURL(b); }).catch(() => { v.src = s.src; });
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

  // the browser refuses video outright (iPhone Low Power Mode, a strict autoplay policy): use the animated copy
  function refused(slide, e) {
    if (!e || e.name !== "NotAllowedError" || !slide.el) return;
    if (slide.anim) {
      const old = slide.el.querySelector("img.anim"); if (old) old.remove();
      const g = new Image(); g.className = "anim"; g.alt = "";
      g.onload = () => { if (slide.el.classList.contains("is-on")) slide.el.appendChild(g); };
      g.src = slide.anim;
    } else slide.el.classList.add("is-still");
  }

  function show(n, immediate) {
    const next = slides[n];
    if (!next.el) { next.el = make(next); root.appendChild(next.el); }
    const v = next.el.querySelector("video");
    const prev = cur >= 0 ? slides[cur] : null;
    cur = n;                       // timers follow the slide being brought in
    let done = false;
    const swap = () => {           // the actual switch: the new slide fades in, the old one fades out
      if (done) return; done = true;
      if (!v) next.el.classList.add("kb");          // photo: slow zoom starts when it appears
      next.el.classList.remove("is-still");
      next.el.classList.add("is-on");
      if (prev && prev !== next && prev.el) {
        prev.el.classList.remove("is-on");
        setTimeout(() => {         // only when it is fully faded out: stop it and reset it
          if (prev.el.classList.contains("is-on")) return;
          prev.el.classList.remove("kb");
          const pv = prev.el.querySelector("video"); if (pv) { pv.pause(); try { pv.currentTime = 0; } catch (e) {} }
        }, 900);
      }
    };
    if (v && !calm) {
      try { if (v.readyState > 0 && v.currentTime > 0.05) v.currentTime = 0; } catch (e) {}
      const p = v.play();
      const ready = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(() => swap()) : swap());
      if (p && p.then) p.then(ready).catch(e => { refused(next, e); swap(); }); else ready();
      if (immediate) swap(); else setTimeout(swap, 1000);   // never wait longer than a second
    } else swap();
    // warm the next two, so their video is already loading while this one plays
    for (let k = 1; k <= 2; k++) {
      const nn = slides[(n + k) % slides.length];
      if (!nn.el) { nn.el = make(nn); root.appendChild(nn.el); }
    }
  }

  // a second chance every second: the slide on screen should be playing
  setInterval(() => {
    const s = slides[cur]; const v = s && s.el && s.el.querySelector("video");
    if (!calm && v && v.paused && !v.ended && !document.hidden) v.play().catch(() => {});
  }, 1000);
  // some browsers only allow autoplay after a first touch or click
  ["pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, () => {
    const s = slides[cur]; const v = s && s.el && s.el.querySelector("video");
    if (!calm && v && v.paused && !v.ended) v.play().catch(() => {});
  }, { passive: true, once: false }));
  const wait = () => ((slides[cur] && slides[cur].dur) ? Math.max(3000, slides[cur].dur * 1000 - 600) : HOLD);

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
  // move on only when the next video is ready (or after 3 s), so a slow download never shows as a still image
  const advance = tries => {
    const i = (cur + 1) % slides.length, nx = slides[i];
    if (!nx.el) { nx.el = make(nx); root.appendChild(nx.el); }
    const nv = nx.el.querySelector("video");
    if (nv && !calm && nv.readyState < 3 && tries < 12) { timer = setTimeout(() => advance(tries + 1), 250); return; }
    show(i);
    timer = setTimeout(() => advance(0), wait());
  };
  const start = () => { if (!timer && slides.length > 1 && !calm) timer = setTimeout(() => advance(0), wait()); };
  const stop = () => { clearTimeout(timer); timer = null; };
  addEventListener("pageshow", () => { const s = slides[cur]; const v = s && s.el && s.el.querySelector("video"); if (!calm && v && v.paused && !v.ended) v.play().catch(() => {}); });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  fetch("media/bg/bg.json?v=" + Date.now(), { cache: "no-store" }).then(r => (r.ok ? r.json() : [])).then(list => {
    slides = list.filter(s => s && s.src);
    if (!slides.length) return;
    // shuffle, then mix photos and video: the photos are spread evenly between the video pieces
    const shuf = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const vids = shuf(slides.filter(x => x.type === "video")), fotos = shuf(slides.filter(x => x.type !== "video"));
    // pieces of the same artist/set stay at least 4 slides apart (greedy)
    const ordered = [];
    while (vids.length) {
      const recent = ordered.slice(-4).map(x => x.group);
      let k = vids.findIndex(x => !recent.includes(x.group));
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
    show(0, true);
    start();
  }).catch(() => {});
})();
