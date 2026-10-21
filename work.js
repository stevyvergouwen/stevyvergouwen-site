/* Work: scroll-driven motion (transform + opacity only), the pointer label and the photo viewer */
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const bar = () => document.body.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", bar, { passive: true }); bar();

  // titles: letters rise once the title is on screen
  const titles = [...document.querySelectorAll(".split")];
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .35 });
    titles.forEach(t => io.observe(t));
    const io2 = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io2.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0 });
    document.querySelectorAll(".rv").forEach(el => io2.observe(el));
  } else { titles.forEach(t => t.classList.add("in")); document.querySelectorAll(".rv").forEach(el => el.classList.add("in")); }
  setTimeout(() => document.querySelectorAll(".whero2 .split, .chero .split").forEach(t => t.classList.add("in")), 150);

  // scroll loop
  const prog = document.getElementById("prog");
  const panels = [...document.querySelectorAll(".stack .panel")];
  const hero = document.querySelector(".chero");
  const figs = [...document.querySelectorAll(".g img")];
  let ticking = false;
  const frame = () => {
    ticking = false;
    const vh = innerHeight, y = scrollY;
    if (prog) prog.style.transform = "scaleX(" + clamp(y / Math.max(1, document.documentElement.scrollHeight - vh), 0, 1) + ")";
    if (still) return;
    panels.forEach((p, i) => {
      const r = p.getBoundingClientRect();
      if (r.bottom < -vh * .2 || r.top > vh * 1.2) return;
      const enter = clamp(r.top / vh, 0, 1);                       // 1 = just below the screen, 0 = in place
      const nx = panels[i + 1] ? clamp(panels[i + 1].getBoundingClientRect().top / vh, 0, 1) : 1;   // the next project sliding over this one
      p.querySelector(".pimg").style.transform = "scale(" + (1 + .12 * enter + .04 * (1 - nx)) + ")";
      p.querySelector(".pin").style.transform = "translate3d(0," + ((1 - nx) * -9 + enter * 6) + "%,0)";
      p.style.setProperty("--dm", ((1 - nx) * .65).toFixed(3));
    });
    if (hero) {
      const k = clamp(y / (vh * 1.1), 0, 1);
      hero.querySelector(".cin").style.transform = "translate3d(0," + (y * .28) + "px,0) scale(" + (1 + k * .1) + ")";
      const t = hero.querySelector(".ctext");
      t.style.transform = "translate3d(0," + (y * .12) + "px,0)"; t.style.opacity = 1 - clamp(y / (vh * .6), 0, 1);
    }
  };
  // the hero film: a mix of clips that cross-dissolve, like the home page; they play by themselves (a tap starts them where the browser forbids it)
  const hv = [...document.querySelectorAll(".wbv")], list = window.WORKCLIPS || [];
  // the hero mixes big overview photos and film clips that cross-dissolve (photos with a slow push in), like the live page
  if (hv.length === 2 && window.WORKSTILLS && window.WORKSTILLS.length) {
    const lite = innerWidth <= 900 || matchMedia("(pointer: coarse)").matches || !!(navigator.connection && navigator.connection.saveData);
    const WORKEXIT = { spanish: 4.4, gyra: 3.5, locus: 3.2, hazel: 4.5, rasa: 4.5, "sentido-b2b": 4.9 };   // seconds into each clip when the dissolve out of it is finished: before its angle changes (gyra 2.0, locus 1.6), or at least 2 s after the last one (rasa)
    const L = window.WORKSTILLS.map(u => /\.mp4$/.test(u) ? (lite ? u.replace(/\.mp4$/, "-m.mp4") : u) : (lite ? u.replace(/\.jpg$/, "-m.jpg") : u)); let i = 0, cur = 0, timer = null;
    L.filter(u => /\.jpg$/.test(u)).forEach(u => { const im = new Image(); im.src = u; });
    const show = (v, u) => { v.classList.remove("zoom"); if (/\.mp4$/.test(u)) { v.poster = ""; v.src = u; v.loop = false; v.load(); const p = v.play(); if (p && p.catch) p.catch(() => {}); } else { v.pause(); v.removeAttribute("src"); v.load(); v.poster = u; void v.offsetWidth; v.classList.add("zoom"); } };
    const go = () => { i++; setJob(i % L.length); const fresh = hv[1 - cur], old = hv[cur]; show(fresh, L[i % L.length]); fresh.classList.add("on"); old.classList.remove("on"); cur = 1 - cur; const nxt = L[i % L.length], mk = /([a-z0-9-]+?)(-m)?\.mp4$/.exec(nxt); timer = setTimeout(go, mk ? Math.max(1500, ((WORKEXIT[mk[1]] || 3.5) - .9) * 1000) : 5200); };
    const jobs = window.WORKJOBS || [], jobEl = document.getElementById("wjob");
    const setJob = k => { if (!jobEl || !jobs[k]) return; const [ti, pl, href] = jobs[k]; jobEl.classList.remove("in"); setTimeout(() => { jobEl.querySelector(".wjt").textContent = ti; jobEl.querySelector(".wjp").textContent = pl; if (href) { jobEl.href = href; jobEl.removeAttribute("aria-disabled"); } else { jobEl.href = "/work/"; } jobEl.classList.add("in"); }, 350); };
    setJob(0);
    show(hv[0], L[0]); hv[0].classList.add("on");
    if (!still) timer = setTimeout(go, 5200);
  }
  if (hv.length === 2 && list.length) {
    let idx = 0, cur = 0, switching = false;
    const lite = innerWidth <= 900 || matchMedia("(pointer: coarse)").matches || !!(navigator.connection && navigator.connection.saveData);
    const load = (v, k) => { const u = list[((k % list.length) + list.length) % list.length]; v.dataset.fb = ""; v.onerror = () => { if (lite && !v.dataset.fb) { v.dataset.fb = 1; v.src = u; v.load(); } }; v.src = lite ? u.replace(/\.mp4$/, "-m.mp4") : u; v.load(); };
    const play = v => { v.muted = true; v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    load(hv[0], idx); load(hv[1], idx + 1); play(hv[0]);
    const next = () => {
      if (switching) return; switching = true;
      const old = hv[cur], fresh = hv[1 - cur];
      try { fresh.currentTime = 0; } catch (e) {} play(fresh);
      fresh.classList.add("on"); old.classList.remove("on");
      cur = 1 - cur; idx++;
      setTimeout(() => { old.pause(); load(old, idx + 1); switching = false; }, 1100);
    };
    hv.forEach((v, k) => {
      v.addEventListener("timeupdate", () => { if (k === cur && v.duration && v.currentTime >= v.duration - .9 && hv[1 - cur].readyState >= 3) next(); });
      v.addEventListener("ended", () => { if (k === cur) next(); });
    });
    addEventListener("pointerdown", () => { if (hv[cur].paused) play(hv[cur]); }, { once: true, passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && hv[cur].paused) play(hv[cur]); });
    if (still) hv.forEach(v => v.pause());
    // where the browser refuses to play video by itself (Low Power Mode on an iPhone, "never auto-play"): the stills of the same clips drift past instead, with a slow zoom, so the page keeps its mood
    const stage = document.getElementById("wst"); let stills = false, sTimer = null;
    const stillShow = () => {
      const fresh = hv[1 - cur], old = hv[cur], src = list[((idx + 1) % list.length + list.length) % list.length].replace(".mp4", ".jpg");
      fresh.removeAttribute("src"); fresh.poster = src; fresh.classList.remove("zoom"); void fresh.offsetWidth; fresh.classList.add("zoom", "on"); old.classList.remove("on"); cur = 1 - cur; idx++;
    };
    const startStills = () => { if (stills) return; stills = true; stage.classList.add("stills"); hv[cur].classList.add("zoom"); sTimer = setInterval(stillShow, 4800); };
    setTimeout(() => { if (!still && hv[cur].paused && hv[cur].currentTime === 0) startStills(); }, 1800);
    addEventListener("pointerdown", () => { if (!stills) return; const v = hv[cur]; v.poster = ""; load(v, idx); const p = v.play(); if (p && p.then) p.then(() => { stills = false; clearInterval(sTimer); stage.classList.remove("stills"); hv.forEach(x => x.classList.remove("zoom")); }).catch(() => { v.poster = list[((idx) % list.length + list.length) % list.length].replace(".mp4", ".jpg"); }); }, { once: true, passive: true });
  }
  // a counter that runs up to 100 during the intro
  const cnt = document.getElementById("wcnt");
  if (cnt) { const t0 = performance.now(); const tick = now => { const k = Math.min(1, (now - t0) / 2300), e = 1 - Math.pow(1 - k, 3); cnt.textContent = String(Math.round(e * 100)).padStart(3, "0"); if (k < 1) requestAnimationFrame(tick); else setTimeout(() => cnt.classList.add("done"), 500); }; requestAnimationFrame(tick); }

  // the running line of photos drifts with the scroll and stops while you point at one
  const rib = document.getElementById("rib"); let ribX = 0, ribHover = false;
  const pgl = document.querySelector(".pg-lt"); let pglX = 0;   // the logo band drifts like the text banners and speeds up with the scroll
  if (rib) { rib.addEventListener("mouseenter", () => ribHover = true); rib.addEventListener("mouseleave", () => ribHover = false); }

  // the opening word WORK is built from tens of thousands of fine, soft particles that live on the graphics card (WebGL): the flight in from the dark, a slow orbit, the pointer field and the scroll lift are all computed per particle by the GPU, so it stays smooth. Without WebGL the 2D version below takes over.
  const wcv = document.getElementById("wcv");
  const particlesGL = cv => {
    const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, `
      attribute vec3 aHome; attribute vec4 aSeed;
      uniform float uT, uAge, uE, uPx, uSize, uMouseOn; uniform vec2 uRes, uMouse;
      varying float vA;
      void main() {
        float delay = (aHome.x / uRes.x) * 0.9 + aSeed.x * 0.5;
        float dur = 1.7 + aSeed.y * 0.9;
        float f = clamp((uAge / 1000.0 - 0.25 - delay) / dur, 0.0, 1.0);
        float q = 1.0 - pow(1.0 - f, 4.0);
        float ang = aSeed.z * 6.2831; float far = (0.5 + aSeed.w) * max(uRes.x, uRes.y) * 0.8;
        vec3 start = vec3(uRes.x * 0.5 + cos(ang) * far, uRes.y * 0.5 + sin(ang) * far * 0.6, 800.0);
        vec3 p = mix(start, aHome, q);
        vec2 fl = vec2(sin(uT * 0.55 + aSeed.x * 6.283 + p.y * 0.011), cos(uT * 0.47 + aSeed.y * 6.283 + p.x * 0.009));
        p.xy += fl * (1.6 + 1.6 * aSeed.w) * (1.0 - uE);
        p.y += sin(p.x * 0.0075 - uT * 1.25) * 2.5 * (1.0 - uE);
        p.z += sin(p.x * 0.006 - uT * 1.0 + aSeed.z * 3.0) * 7.0 * (1.0 - uE);
        p.x += uE * (aSeed.w - 0.5) * uRes.x * 0.5; p.y += uE * (aSeed.z * 2.0 - 1.0) * uRes.y * 0.3; p.z += uE * 650.0 * (aSeed.w - 0.25);
        vec2 d = p.xy - uMouse; float dist = length(d); float R = 150.0 + uRes.x * 0.05;
        float w = smoothstep(R, 0.0, dist) * uMouseOn;
        p.xy += normalize(d + vec2(0.0001)) * w * 46.0; p.z -= w * 60.0 * (0.4 + aSeed.x);
        float F = 760.0; float sc = F / (F + max(-F * 0.8, p.z));
        vec2 s = uRes * 0.5 + (p.xy - uRes * 0.5) * sc;
        gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0);
        gl_PointSize = max(1.0, uSize * (0.7 + aSeed.y * 0.5) * sc * uPx);
        float tw = 0.72 + 0.28 * sin(uT * 1.6 + aSeed.x * 40.0); float sweep = smoothstep(0.16, 0.0, abs(fract(p.x / uRes.x - uT * 0.06) - 0.5)) * 0.55;
        vA = clamp((0.30 + 0.34 * aSeed.x + sweep) * tw * sc * (1.0 - uE * 0.55) * (0.25 + 0.75 * q), 0.0, 1.0);
      }`);
    const fs = sh(gl.FRAGMENT_SHADER, `
      precision mediump float; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.0) * vA; gl_FragColor = vec4(vec3(a), a); }`);
    if (!vs || !fs) return false;
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const U = n => gl.getUniformLocation(prog, n), A = n => gl.getAttribLocation(prog, n);
    const uni = { T: U("uT"), Age: U("uAge"), E: U("uE"), Px: U("uPx"), Size: U("uSize"), MouseOn: U("uMouseOn"), Res: U("uRes"), Mouse: U("uMouse") };
    const dpr = Math.min(2, devicePixelRatio || 1);
    let W = 0, H = 0, count = 0, born = performance.now(), es = 0;
    const mouse = { x: -9999, y: -9999, sx: -9999, sy: -9999, on: 0, target: 0 };
    const buf = gl.createBuffer();
    const build = () => {
      const r = cv.getBoundingClientRect(); W = Math.max(2, Math.round(r.width || innerWidth)); H = Math.max(2, Math.round(r.height || innerHeight));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); gl.viewport(0, 0, cv.width, cv.height);
      const pad = Math.max(20, Math.min(48, innerWidth * .04)), off = document.createElement("canvas"), og = off.getContext("2d"); off.width = W; off.height = H;
      og.font = '800 100px "Helvetica Neue", Arimo, Arial, sans-serif'; const m = og.measureText("WORK").width;
      const fsz = Math.min(100 * (W - pad * 2) / m, H * .5); og.fillStyle = "#fff"; og.font = '800 ' + fsz + 'px "Helvetica Neue", Arimo, Arial, sans-serif'; og.textAlign = "left"; og.textBaseline = "alphabetic"; og.fillText("WORK", pad - fsz * .03, H * .5 + fsz * .36);
      const d = og.getImageData(0, 0, W, H).data, step = Math.max(1.5, W / (innerWidth < 760 ? 380 : 820)), data = [];
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { const xi = Math.floor(x), yi = Math.floor(y); if (d[(yi * W + xi) * 4 + 3] > 128) data.push(x + (Math.random() - .5) * step, y + (Math.random() - .5) * step, (Math.random() - .5) * 70, Math.random(), Math.random(), Math.random(), Math.random()); }
      count = data.length / 7;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      const aH = A("aHome"), aS = A("aSeed"); gl.enableVertexAttribArray(aH); gl.vertexAttribPointer(aH, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(aS); gl.vertexAttribPointer(aS, 4, gl.FLOAT, false, 28, 12);
      gl.uniform2f(uni.Res, W, H); gl.uniform1f(uni.Px, dpr); gl.uniform1f(uni.Size, 2.3 * Math.max(.8, W / 1280));
    };
    build(); addEventListener("resize", build);
    addEventListener("pointermove", e => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; if (mouse.target === 0) { mouse.sx = mouse.x; mouse.sy = mouse.y; } mouse.target = 1; }, { passive: true });
    document.addEventListener("pointerleave", () => mouse.target = 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.clearColor(0, 0, 0, 0);
    const clamp2 = (v, a, b) => Math.min(b, Math.max(a, v));
    const frame = t => {
      const k = clamp2(scrollY / (innerHeight * .9), 0, 1), e = k * k * (3 - 2 * k);
      es += (e - es) * (still ? 1 : .09);
      mouse.sx += (mouse.x - mouse.sx) * .14; mouse.sy += (mouse.y - mouse.sy) * .14; mouse.on += (mouse.target - mouse.on) * .08;
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!(k >= 1 && es > .995)) {
        gl.uniform1f(uni.T, t / 1000); gl.uniform1f(uni.Age, still ? 99999 : t - born); gl.uniform1f(uni.E, es); gl.uniform1f(uni.MouseOn, still ? 0 : mouse.on); gl.uniform2f(uni.Mouse, mouse.sx, mouse.sy);
        gl.drawArrays(gl.POINTS, 0, count);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return true;
  };
  // the opening word WORK is built from very fine, soft particles. Nothing jitters: every particle is placed by smooth functions (an eased flight in from the dark, a slow orbit, a pointer field that bends the dots away and back, a scroll that lifts them out into depth), so the movement reads as liquid light.
  const particles2d = wcv => {
    const g = wcv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), mouse = { x: -9999, y: -9999, sx: -9999, sy: -9999, on: false };
    const spr = document.createElement("canvas"); spr.width = spr.height = 96;
    { const sg = spr.getContext("2d"), gr = sg.createRadialGradient(48, 48, 0, 48, 48, 48); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.18, "rgba(255,255,255,.7)"); gr.addColorStop(.5, "rgba(255,255,255,.16)"); gr.addColorStop(1, "rgba(255,255,255,0)"); sg.fillStyle = gr; sg.fillRect(0, 0, 96, 96); }
    let W = 0, H = 0, P = [], born = performance.now(), es = 0;
    const clamp2 = (v, a, b) => Math.min(b, Math.max(a, v)), out = t => 1 - Math.pow(1 - t, 4), sm = t => t * t * (3 - 2 * t);
    const build = () => {
      const r = wcv.getBoundingClientRect(); W = Math.max(2, Math.round(r.width || innerWidth)); H = Math.max(2, Math.round(r.height || innerHeight)); wcv.width = W * dpr; wcv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pad = Math.max(20, Math.min(48, innerWidth * .04)), off = document.createElement("canvas"), og = off.getContext("2d"); off.width = W; off.height = H;
      og.font = '800 100px "Helvetica Neue", Arimo, Arial, sans-serif'; const m = og.measureText("WORK").width;
      const fs = Math.min(100 * (W - pad * 2) / m, H * .5); og.fillStyle = "#fff"; og.font = '800 ' + fs + 'px "Helvetica Neue", Arimo, Arial, sans-serif'; og.textAlign = "left"; og.textBaseline = "alphabetic"; og.fillText("WORK", pad - fs * .03, H * .5 + fs * .36);
      const d = og.getImageData(0, 0, W, H).data, step = Math.max(2.4, W / (innerWidth < 760 ? 150 : 330)), pts = [], k = W / 1280;
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { const xi = Math.floor(x), yi = Math.floor(y); if (d[(yi * W + xi) * 4 + 3] > 128) {
        const a = Math.random() * 6.283, far = (.5 + Math.random()) * Math.max(W, H) * .8;
        pts.push({ hx: x + (Math.random() - .5) * step * .7, hy: y + (Math.random() - .5) * step * .7, ax: W / 2 + Math.cos(a) * far, ay: H / 2 + Math.sin(a) * far * .6, hz: (Math.random() - .5) * 70, s: (.5 + Math.random() * .9) * Math.max(.8, k) * 5.2, h: Math.random(), ph: Math.random() * 6.283, ph2: Math.random() * 6.283, dx: 0, dy: 0, dz: 0, delay: 250 + (x / W) * 900 + Math.random() * 500, dur: 1700 + Math.random() * 900 }); } }
      P = pts;
    };
    build(); addEventListener("resize", build);
    addEventListener("pointermove", e => { const r = wcv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; if (!mouse.on) { mouse.sx = mouse.x; mouse.sy = mouse.y; } mouse.on = true; }, { passive: true });
    document.addEventListener("pointerleave", () => mouse.on = false);
    const frame2 = t => {
      const k = clamp2(scrollY / (innerHeight * .9), 0, 1), e = sm(k), age = t - born, cx = W / 2, cy = H / 2, F = 760;
      es += (e - es) * (still ? 1 : .09);
      if (mouse.on) { mouse.sx += (mouse.x - mouse.sx) * .16; mouse.sy += (mouse.y - mouse.sy) * .16; }
      // soft trails: the previous frame fades instead of being wiped
      g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0," + (still ? 1 : .34) + ")"; g.fillRect(0, 0, W, H);
      if (k >= 1 && es > .995) { requestAnimationFrame(frame2); return; }
      g.globalCompositeOperation = "lighter";
      const R = 150 + W * .05;
      for (const p of P) {
        const f = still ? 1 : clamp2((age - p.delay) / p.dur, 0, 1), q = out(f);
        // position: eased flight in, then home + a slow orbit; the scroll lifts the word into depth and sideways
        const orbit = 2.2 * (1 - es);
        let x = p.ax + (p.hx - p.ax) * q + Math.sin(t * .00042 + p.ph) * orbit, y = p.ay + (p.hy - p.ay) * q + Math.cos(t * .00036 + p.ph2) * orbit, z = (1 - q) * 800 + p.hz;
        x += es * (p.h - .5) * W * .5; y += es * (p.h * 2 - 1) * H * .3; z += es * 650 * (p.h - .25);
        // pointer: a smooth field bends the dots away; they ease back by themselves
        let tx = 0, ty = 0, tz = 0;
        if (mouse.on && !still) { const dx = x - mouse.sx, dy = y - mouse.sy, d = Math.sqrt(dx * dx + dy * dy); if (d < R) { const w = sm(1 - d / R); tx = dx / (d || 1) * w * 46; ty = dy / (d || 1) * w * 46; tz = -w * 60 * (.4 + p.h); } }
        p.dx += (tx - p.dx) * .075; p.dy += (ty - p.dy) * .075; p.dz += (tz - p.dz) * .075;
        x += p.dx; y += p.dy; z += p.dz;
        const sc = F / (F + Math.max(-F * .8, z)), sx = cx + (x - cx) * sc, sy = cy + (y - cy) * sc, s = p.s * sc, a = clamp2((.34 + .4 * p.h) * sc * (1 - es * .55) * (.25 + .75 * q), 0, 1);
        if (a < .01) continue;
        g.globalAlpha = a; g.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      requestAnimationFrame(frame2);
    };
    requestAnimationFrame(frame2);
  };

  if (wcv && ["chrome", "weight", "liquid", "shine"].includes(new URLSearchParams(location.search).get("hero") || "weight")) wcv.remove();
  else if (wcv && !particlesGL(wcv)) particles2d(wcv);


  // hero word: WORK as liquid chrome. It condenses out of the dark like poured metal (a threshold falls over a softened mask), then keeps flowing with the pointer and the scroll speed. The particles stay around it as dust.
  const heroChrome = () => {
    const cv = document.getElementById("wch"), wk = document.getElementById("wk"); if (!cv || !wk) return false;
    const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false }); if (!gl) return false;
    const FS = `precision highp float;uniform sampler2D uM;uniform vec2 uR;uniform float uT,uC,uV,uSc;uniform vec2 uP,uS;
vec2 tf(vec2 q){return vec2(.5)+(q-vec2(.5)-uS)/uSc;}
float h(vec2 q){return texture2D(uM,tf(q)).r;}
float hs(vec2 q){float s=0.;for(int i=0;i<8;i++){float a=float(i)*.785398;s+=texture2D(uM,tf(q+vec2(cos(a),sin(a))*vec2(.003,.0055))).g;}return s/8.;}
void main(){
  vec2 q=gl_FragCoord.xy/uR; q.y=1.-q.y; float t=uT, e=1./uR.y*2.5;
  float m=h(q), b=hs(q);
  float c=smoothstep(0.,1.,uC), thr=mix(.97,.5,c);
  float shape=smoothstep(thr-.03,thr+.03,mix(b,m,smoothstep(.75,1.,c)));
  if(shape<.004){gl_FragColor=vec4(0.);return;}
  vec2 n=vec2(hs(q+vec2(e*6.,0.))-hs(q-vec2(e*6.,0.)),hs(q+vec2(0.,e*6.))-hs(q-vec2(0.,e*6.)))*1.2;
  vec3 N=normalize(vec3(n,.5+.5*(1.-b)));
  vec2 w=vec2(sin(q.y*9.+t*.9+uP.x*3.+uV*.4),cos(q.x*7.-t*.7+uP.y*3.))*(.06+min(abs(uV),30.)*.004);
  vec3 R=reflect(vec3(0.,0.,-1.),N);
  float v=R.y*1.1+R.x*.6+w.x+w.y+(uP.x-.5)*.6+uV*.01;
  float band=smoothstep(.15,.85,sin(v*3.4+t*.5)*.5+.5);
  vec3 env=mix(vec3(.04,.045,.055),vec3(.93,.94,.95),band);
  env+=vec3(.3)*pow(max(0.,sin(v*3.-1.)),6.)+vec3(.22)*pow(max(0.,sin(v*3.+2.)),8.);
  env*=.75+.25*smoothstep(.0,.5,b);
  gl_FragColor=vec4(env*shape,shape);
}`;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"), fs = sh(gl.FRAGMENT_SHADER, FS); if (!vs || !fs) return false;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n), uR = U("uR"), uT = U("uT"), uC = U("uC"), uV = U("uV"), uSc = U("uSc"), uP = U("uP"), uS = U("uS");
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(a => gl.texParameteri(gl.TEXTURE_2D, a[0], a[1]));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    let W = 0, H = 0;
    const size = () => {
      const r = cv.getBoundingClientRect(), d = Math.min(1.5, devicePixelRatio || 1), cs = getComputedStyle(wk), wr = wk.getBoundingClientRect();
      W = Math.max(2, Math.round(r.width * d)); H = Math.max(2, Math.round(r.height * d)); cv.width = W; cv.height = H; gl.viewport(0, 0, W, H);
      const fsz = parseFloat(cs.fontSize) * d, m = document.createElement("canvas"); m.width = W; m.height = H; const g = m.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      const setup = x => { x.font = "800 " + fsz + "px " + cs.fontFamily; x.textAlign = "left"; x.textBaseline = "alphabetic"; if ("letterSpacing" in x) x.letterSpacing = (-.06 * fsz) + "px"; };
      // WORK is a plain line: the layout box of the transparent h1 tells where it sits
      const x0 = (wr.left - r.left) * d, yb = (wr.top - r.top + wr.height * .5) * d + fsz * .36;
      setup(g); g.fillStyle = "#f00"; g.fillText("WORK", x0, yb);
      const sm = document.createElement("canvas"); sm.width = W; sm.height = H; const s = sm.getContext("2d"); s.fillStyle = "#000"; s.fillRect(0, 0, W, H); setup(s);
      s.fillStyle = "#0f0"; s.shadowColor = "#0f0"; for (const b of [fsz * .2, fsz * .12, fsz * .06, fsz * .02]) { s.shadowBlur = b; s.fillText("WORK", x0, yb); }
      g.globalCompositeOperation = "lighter"; g.drawImage(sm, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m); gl.uniform2f(uR, W, H);
    };
    size(); addEventListener("resize", size); if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);
    let px = .3, py = .5, tx = .3, ty = .5, vv = 0, last = scrollY, ready = false; const t0 = performance.now();
    addEventListener("pointermove", e => { const r = cv.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width; ty = (e.clientY - r.top) / r.height; }, { passive: true });
    const loop = now => {
      const age = (now - t0) / 1000, vh = innerHeight;
      if (scrollY < vh * 1.3) {
        px += (tx - px) * .06; py += (ty - py) * .06; vv += ((scrollY - last) - vv) * .12; last = scrollY;
        const y = Math.min(scrollY, vh * 1.2), k = clamp(scrollY / (vh * .9), 0, 1), e = k * k * (3 - 2 * k);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uT, still ? 3 : age); gl.uniform1f(uC, still ? 1 : clamp((age - 1.2) / 2.2, 0, 1)); gl.uniform1f(uV, vv); gl.uniform1f(uSc, 1 + e * .12);
        gl.uniform2f(uP, px, py); gl.uniform2f(uS, e * -.05, -y * .42 / (H / Math.min(1.5, devicePixelRatio || 1)));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!ready) { ready = true; document.getElementById("whero").classList.add("chrome"); }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop); return true;
  };
  // hero word: real 3D chrome letters (work-chrome.js, three.js). ?hero=particles | chrome | both | flat lets the options be compared; the default is the 3D chrome

  // hero word as liquid: flat white WORK drawn on the graphics card; the pointer drags the letters like a finger through ink, the scroll makes them wave and stretch, and they settle on their own. Falls back to the plain letters below when WebGL is missing.
  const liquidWord = () => {
    const cv = document.getElementById("wch"), w = document.getElementById("wk"), host = document.getElementById("wst"); if (!cv || !w || !host) return false;
    const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false }); if (!gl) return false;
    const N = 4;
    const FS = `precision highp float;uniform sampler2D uM;uniform vec2 uR,uS;uniform float uT,uV,uSc,uA;uniform vec4 uP[${N}];
vec2 tf(vec2 q){return vec2(.5)+(q-vec2(.5)-uS)/uSc;}
void main(){
  vec2 q=gl_FragCoord.xy/uR; q.y=1.-q.y; float asp=uR.x/uR.y, t=uT;
  vec2 d=vec2(0.);
  float k=1.-uA; // arrival: the ink settles
  d+=vec2(sin(q.y*6.+t*1.1),cos(q.x*8.+t*.8))*(.0035+k*k*k*.05);
  d+=vec2(sin(q.y*9.-t*2.1+q.x*3.),sin(q.x*7.+t*1.7))*(clamp(abs(uV)*.0009,0.,.02));
  vec2 qq=q; qq.y=.5+(q.y-.5)*(1.-clamp(abs(uV)*.0012,0.,.06));
  for(int i=0;i<${N};i++){
    vec4 p=uP[i]; vec2 r=(q-p.xy); r.x*=asp; float g=exp(-dot(r,r)*26.);
    d+=p.zw*g*.8;
    d+=vec2(-r.y,r.x)/asp*g*length(p.zw)*.9;
  }
  vec2 s=tf(qq-d);
  float a=texture2D(uM,s).a;
  float sh=clamp(length(d)*34.,0.,1.);
  vec3 col=mix(vec3(.80,.80,.79),vec3(1.),sh);
  a*=uA;
  gl_FragColor=vec4(col*a,a);
}`;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"), fs = sh(gl.FRAGMENT_SHADER, FS); if (!vs || !fs) return false;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n), uR = U("uR"), uS = U("uS"), uT = U("uT"), uV = U("uV"), uSc = U("uSc"), uA = U("uA"), uP = U("uP");
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(a => gl.texParameteri(gl.TEXTURE_2D, a[0], a[1]));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    let W = 0, H = 0, dpr = 1;
    const size = () => {
      const r = cv.getBoundingClientRect(); dpr = Math.min(1.5, devicePixelRatio || 1);
      W = Math.max(2, Math.round(r.width * dpr)); H = Math.max(2, Math.round(r.height * dpr)); cv.width = W; cv.height = H; gl.viewport(0, 0, W, H);
      const cs = getComputedStyle(w), fsz = parseFloat(cs.fontSize) * dpr, wr = w.getBoundingClientRect();
      // draw the word with the same letter positions the page uses (the transparent letters still hold the layout)
      const m = document.createElement("canvas"); m.width = W; m.height = H; const g = m.getContext("2d");
      g.font = "800 " + fsz + "px " + cs.fontFamily; g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = "#fff";
      const cy = (wr.top + wr.height / 2 - r.top) * dpr;
      [...w.querySelectorAll("i")].forEach(l => { const lr = l.getBoundingClientRect(), pad = parseFloat(getComputedStyle(l).paddingLeft) * dpr; g.fillText(l.textContent, (lr.left - r.left) * dpr + pad, cy + fsz * .358); });
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m); gl.uniform2f(uR, W, H);
    };
    // the letters must be laid out and the font loaded before the first draw
    const first = () => { size(); }; first(); addEventListener("resize", size); if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);
    // the pointer is followed by a short chain of lagging points, each easing towards the one before it; the letters are pushed by how fast those points move, so everything starts and stops softly
    const chain = Array.from({ length: N }, () => ({ x: .5, y: .5, vx: 0, vy: 0, px: .5, py: .5 })); let tx = .5, ty = .5, hasPtr = false, strength = 0, vv = 0, lastS = scrollY, born = performance.now();
    const setT = (cx, cy) => { const r = cv.getBoundingClientRect(); tx = (cx - r.left) / r.width; ty = (cy - r.top) / r.height; if (!hasPtr) { chain.forEach(c => { c.x = c.px = tx; c.y = c.py = ty; }); } hasPtr = true; };
    addEventListener("pointermove", e => setT(e.clientX, e.clientY), { passive: true });
    addEventListener("touchmove", e => { const t = e.touches[0]; if (t) setT(t.clientX, t.clientY); }, { passive: true });
    const arr = new Float32Array(N * 4), ease = [.16, .11, .08, .06];
    const loop = now => {
      const vh = innerHeight;
      vv += ((scrollY - lastS) - vv) * .1; lastS = scrollY;
      if (scrollY < vh * 1.3) {
        const k = clamp(scrollY / (vh * .9), 0, 1), e = k * k * (3 - 2 * k), y = Math.min(scrollY, vh * 1.2), r = cv.getBoundingClientRect(), ar = r.width / r.height;
        let gx = tx, gy = ty;
        chain.forEach((c, i) => { c.px = c.x; c.py = c.y; c.x += (gx - c.x) * ease[i]; c.y += (gy - c.y) * ease[i]; const nvx = (c.x - c.px) * 2.4, nvy = (c.y - c.py) * 2.4 * ar; c.vx += (nvx - c.vx) * .25; c.vy += (nvy - c.vy) * .25; gx = c.x; gy = c.y; });
        // the pull fades in when the pointer is over the opening and out when it leaves, never switching on or off
        const over = hasPtr && tx > -.05 && tx < 1.05 && ty > -.05 && ty < 1.05 ? 1 : 0; strength += (over - strength) * .08;
        chain.forEach((c, i) => { arr[i * 4] = c.x; arr[i * 4 + 1] = c.y; arr[i * 4 + 2] = clamp(c.vx, -.035, .035) * strength; arr[i * 4 + 3] = clamp(c.vy, -.035, .035) * strength; });
        const ap = clamp((now - born - 200) / 2200, 0, 1), ae = 1 - Math.pow(1 - ap, 3);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uT, still ? 2 : now / 1000); gl.uniform1f(uV, vv); gl.uniform1f(uSc, 1 + e * .12); gl.uniform1f(uA, still ? 1 : ae);
        gl.uniform2f(uS, e * -.05, -y * .42 / (H / dpr)); gl.uniform4fv(uP, arr);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.getElementById("whero").classList.add("liq");
    return true;
  };

  // hero word: plain white WORK with one soft shine (default). ?hero=particles | chrome | both | flat keeps the earlier options around for comparison
  const heroMode = new URLSearchParams(location.search).get("hero") || "weight";
  const wch = document.getElementById("wch");
  let liq = false;
  if (heroMode === "liquid") liq = liquidWord();
  if (heroMode === "weight" || heroMode === "liquid") {
    if (wch && !liq) wch.remove();
    const w = document.getElementById("wk"), ls = w ? [...w.querySelectorAll("i")] : [], rows = [];
    if (w && !liq) {
      ls.forEach((l, i) => l.style.setProperty("--i", i));
        { const T = 2000; ls.forEach(l => { let t = 200 + Math.random() * T; const n = 2 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) { setTimeout(() => l.classList.add("on"), t); t += 35 + Math.random() * 70; setTimeout(() => l.classList.remove("on"), t); t += 40 + Math.random() * 110; } setTimeout(() => l.classList.add("on"), t); }); setTimeout(() => ls.forEach(l => l.classList.add("on")), 4200); }
      const measure = () => { w.style.setProperty("--ww", w.offsetWidth + "px"); ls.forEach(l => l.style.setProperty("--ox", l.offsetLeft + "px")); };
      measure(); addEventListener("resize", measure); if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
      const set = (x, y) => { w.style.setProperty("--sx", x.toFixed(1) + "%"); w.style.setProperty("--sy", y.toFixed(1) + "%"); };
      let ps = 0, wt = ls.map(() => 120), px = null, py = null, tx = 0, ty = 0, lastMove = -1e9, lastY = scrollY, vv = 0, sweepAt = performance.now() + 900;
      const touch = matchMedia("(hover: none)").matches;
      // glitch (tape tracking + slices): frame-stepped, small, solid white, at random places. Scenes: tear (thin bands of a letter slide sideways), tape (the whole word shifts in horizontal bands), drop (a letter blinks out), hop (letter spacing jumps)
      if (!still) {
        const R = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
        const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"); svg.setAttribute("width", 0); svg.setAttribute("height", 0); svg.setAttribute("aria-hidden", "true"); svg.style.position = "absolute";
        svg.innerHTML = '<filter id="wktape" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence id="wkt" type="fractalNoise" baseFrequency="0.0015 0.09" numOctaves="1" seed="2" result="n"/><feDisplacementMap id="wkd" in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter>';
        document.body.appendChild(svg);
        const wkt = svg.querySelector("#wkt"), wkd = svg.querySelector("#wkd"), busy = new Set();
        // digital corruption on a canvas that sits over the word: the real letters are redrawn there for a few frames (100 ms each) and cut up at random: slices shifted, blocks copied elsewhere, streaks pulled out, speckle, thin eaten bars, whole blank frames. Always in one window of the word, so it is lopsided.
        // rougher, dirtier word: a little noise bites into the letter edges (re-rolled every 100 ms, so it crawls like film grain) and a soft glow sits around it
        { const ns = "http://www.w3.org/2000/svg", sv = document.createElementNS(ns, "svg"); sv.setAttribute("width", "0"); sv.setAttribute("height", "0"); sv.setAttribute("aria-hidden", "true"); sv.style.position = "absolute";
          sv.innerHTML = '<filter id="wkrough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter>'; document.body.appendChild(sv);
          const tb = sv.querySelector("feTurbulence"); let sd = 3; setInterval(() => { if (!document.hidden) tb.setAttribute("seed", sd = (sd % 97) + 1); }, 100);
          /* glitch switched off: clean word */ }
        const cv = document.createElement("canvas"); cv.className = "wkc"; cv.setAttribute("aria-hidden", "true"); w.appendChild(cv);
        const T = document.createElement("canvas"), tg = T.getContext("2d"), vg = cv.getContext("2d"); let FS = 0, DPR = 1, CW = 0, CH = 0;
        const sizeC = () => { const cs = getComputedStyle(w); FS = parseFloat(cs.fontSize); DPR = Math.min(2, devicePixelRatio || 1); CW = Math.round(w.offsetWidth); CH = Math.round(w.offsetHeight); [cv, T].forEach(c => { c.width = CW * DPR; c.height = CH * DPR; }); cv.style.width = CW + "px"; cv.style.height = CH + "px"; };
        const paintText = () => { sizeC(); tg.setTransform(DPR, 0, 0, DPR, 0, 0); tg.clearRect(0, 0, CW, CH); tg.fillStyle = "#fff"; tg.textBaseline = "alphabetic";
          ls.forEach(l => { const cs = getComputedStyle(l), wg = cs.getPropertyValue("--fw") || cs.fontWeight; tg.font = (parseInt(wg) || 800) + " " + FS + "px " + cs.fontFamily; const m = tg.measureText(l.dataset.l), A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent, LH = parseFloat(cs.lineHeight) || FS * .8, pt = parseFloat(cs.paddingTop), pl = parseFloat(cs.paddingLeft);
            tg.fillText(l.dataset.l, l.offsetLeft + pl, l.offsetTop + pt + (LH - (A + D)) / 2 + A); }); };
        // Intercell-style erosion: grainy, blobby noise eats the letters from the inside in one lopsided patch (value noise over a threshold), a few loose chips at the edge, a soft white glow, now and then a blank step or a blurred one. 100 ms per step, hard cuts.
        const hsh = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
        const vn = (x, y, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), a = hsh(ix, iy, s), b = hsh(ix + 1, iy, s), c = hsh(ix, iy + 1, s), d = hsh(ix + 1, iy + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
        const M = document.createElement("canvas"), mg = M.getContext("2d");
        const erode = (cx, cy, rx, ry, rot, power, seed, cell) => {   // paints the eaten pixels (alpha) into M, then scales it up pixelated onto the word
          const mw = Math.ceil(cv.width / cell), mh = Math.ceil(cv.height / cell); M.width = mw; M.height = mh; const im = mg.createImageData(mw, mh), d = im.data, cs = Math.cos(rot), sn = Math.sin(rot), b1 = FS * DPR * .05 / cell, b2 = FS * DPR * .016 / cell;
          for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const px = (x + .5) * cell - cx, py = (y + .5) * cell - cy, ex = (px * cs + py * sn) / rx, ey = (-px * sn + py * cs) / ry, r = Math.sqrt(ex * ex + ey * ey); if (r > 1.25) continue;
            const n = vn(x / b1, y / b1, seed) * .55 + vn(x / b2, y / b2, seed + 7) * .3 + hsh(x, y, seed + 11) * .15, t = (1 - r) * power + .32;   // inside the patch the noise has to beat a high bar to survive
            if (n < t - (r > .9 ? .08 : 0) && hsh(x, y, seed + 3) > .08 * r) { const i = (y * mw + x) * 4; d[i + 3] = 255; } }
          mg.putImageData(im, 0, 0); vg.save(); vg.imageSmoothingEnabled = false; vg.globalCompositeOperation = "destination-out"; vg.drawImage(M, 0, 0, mw * cell, mh * cell); vg.restore(); };
        const corrupt = (focus, frames) => { if (busy.has("cv")) return; busy.add("cv"); let k = 0;
          const fl = focus ? ls.indexOf(focus) : Math.floor(Math.random() * ls.length), L0 = ls[fl], P = () => 1;
          let cx = (L0.offsetLeft + L0.offsetWidth * R(.25, .75)) * DPR, cy = CH * R(.3, .75) * DPR, rx = FS * R(.4, .9) * DPR, ry = FS * R(.28, .5) * DPR; const rot = R(-.5, .5), seed = Math.floor(Math.random() * 1e5), blurAt = Math.random() < .3 ? 1 + Math.floor(Math.random() * Math.max(1, frames - 2)) : -1, blankAt = Math.random() < .35 ? Math.floor(Math.random() * frames) : -1;
          const frame = () => { paintText(); vg.setTransform(1, 0, 0, 1, 0, 0); vg.clearRect(0, 0, cv.width, cv.height);
            if (k >= frames) { cv.style.opacity = "0"; w.classList.remove("gx"); busy.delete("cv"); return; }
            w.classList.add("gx"); cv.style.opacity = "1";
            if (k === blankAt) { k++; setTimeout(frame, 100); return; }                                     // the word is gone for one step
            vg.save(); vg.shadowColor = "rgba(255,255,255,.55)"; vg.shadowBlur = FS * (k === blurAt ? .09 : .05) * DPR; if (k === blurAt) vg.filter = "blur(" + (FS * .035 * DPR) + "px)"; vg.drawImage(T, 0, 0); vg.restore();
            const grow = Math.sin(Math.PI * (k + .5) / frames), pw = .7 + grow * 1.1;                       // patch swells and shrinks over the episode
            if (k > 0 && k % 2 === 0 && Math.random() < .6) { const Lx = ls[Math.floor(Math.random() * ls.length)]; cx = (Lx.offsetLeft + Lx.offsetWidth * R(.2, .8)) * DPR; cy = CH * R(.25, .8) * DPR; rx = FS * R(.35, .9) * DPR; ry = FS * R(.25, .5) * DPR; }   // the patch hops to another letter mid-episode
            cx += R(-.03, .03) * FS * DPR; cy += R(-.03, .03) * FS * DPR;
            if (k !== blurAt) { erode(cx, cy, rx * (.8 + grow * .5), ry * (.8 + grow * .5), rot, pw, seed + k * 13, Math.max(1, Math.round(FS * DPR / 150)));
              erode(cx + R(-.4, .4) * rx, cy + R(-.4, .4) * ry, rx * .45, ry * .5, rot, pw * .7, seed + k * 29 + 5, 1); }   // finer grain on top
            k++; setTimeout(frame, 100); };
          frame(); };
        const tear = (l, frames) => corrupt(l, frames);
        // Intercell-style, bare and stepped (one step = 100 ms, hard cuts, no easing): a pattern of letters drops out of their slots and refills in random order while the spacing hops between fixed values
        const steps = (frames, per) => { let k = 0; const id = setInterval(() => { per(k); if (++k >= frames) clearInterval(id); }, 100); };
        const pattern = () => { if (busy.has("pat")) return; busy.add("pat");
          const gone = new Set(); ls.forEach(l => { if (Math.random() < .6) gone.add(l); }); if (!gone.size) gone.add(pick(ls));
          const order = [...gone].sort(() => Math.random() - .5), sp = pick([.1, .16, .24]);
          steps(order.length + 5, k => {
            if (k === 0) { gone.forEach(l => l.classList.add("sc-off")); void(sp + "em"); return; }
            if (k <= order.length) { order[k - 1].classList.remove("sc-off"); if (k % 2) void((sp * (k % 3 === 0 ? .4 : 1)) + "em"); return; }
            if (k === order.length + 1) { void((-.06 + sp * .3) + "em"); return; }
            if (k === order.length + 4) { void("-.06em"); busy.delete("pat"); }
          }); };
        const hop = () => { const sp = pick([.06, .14, .22]); steps(5, k => void((k === 4 ? -.06 : (k % 2 ? sp : -.06 + sp * .4)) + "em")); };
        const flick = l => { if (busy.has(l)) return; busy.add(l); steps(4, k => { l.classList.toggle("sc-off", k % 2 === 0); if (k === 3) { l.classList.remove("sc-off"); busy.delete(l); } }); };
        const jump = () => { if (busy.has("jmp")) return; busy.add("jmp");   // the whole word cuts to one other spot and holds there, then cuts back: no shaking, letters never move against each other
          const pos = [R(-.12, .12) * FS + "px " + (-R(.06, .22) * FS) + "px"]; if (Math.random() < .35) pos.push(R(-.14, .14) * FS + "px " + (R(.02, .1) * FS) + "px");
          let k = 0; const hold = 3 + Math.floor(Math.random() * 4); w.style.translate = pos[0];
          const id = setTimeout(function nx() { k++; if (pos[1] && k === 1) { w.style.translate = pos[1]; setTimeout(nx, hold * 60); return; } w.style.translate = ""; busy.delete("jmp"); }, hold * 100); };
        const scene = () => { const s = pick(["tear", "tear", "tear", "tear", "jump", "jump", "pattern", "flick"]), pickL = n => [...ls].sort(() => Math.random() - .5).slice(0, n);
          if (s === "tear") { corrupt(null, 5 + Math.floor(Math.random() * 8)); }
          else if (s === "jump") jump(); else if (s === "pattern") pattern(); else if (s === "hop") hop(); else pickL(1).forEach(flick);
          setTimeout(scene, 120 + Math.random() * 450); };
        // reveal: the letters rise one after the other, in random order, with a slight overshoot
        ls.forEach((l, i) => l.style.setProperty("--i", i));
        // glitch switched off on request; scene() stays available but is not started
        const cool = new Map();
        // pointer glitch switched off
      }
      addEventListener("pointermove", e => { px = e.clientX; py = e.clientY; lastMove = performance.now(); }, { passive: true });
      const rowX = [0, 0];
      const loop = now => {
        const r = w.getBoundingClientRect(), vh = innerHeight; vv += ((scrollY - lastY) - vv) * .12; lastY = scrollY;
        if (scrollY < vh * 1.4) {
          const k = clamp(scrollY / (vh * .9), 0, 1), e = k * k * (3 - 2 * k), t = now / 1000, active = now - lastMove < 2200 && px !== null;
          // shine: follows the pointer; otherwise sweeps across every few seconds; on a phone it also rides on the scroll
          if (active) { tx += ((px - r.left) / r.width * 100 - tx) * .18; ty += ((py - r.top) / r.height * 100 - ty) * .18; set(tx, ty); }
          else { const ph = ((now - sweepAt) % 6500) / 2400; if (ph >= 0 && ph <= 1) { const q = 1 - Math.pow(1 - ph, 3); tx = -30 + q * 150; ty = 40 + Math.sin(ph * 3.1) * 14; set(tx, ty); } else if (touch) { set(10 + (scrollY / vh) * 120, 45); } }
          // variable-font weight: each letter swells towards the pointer with a smooth bell-shaped falloff, a slow wave of weight keeps passing through the word, and the scroll adds to the wave
          ps += ((active && !still ? 1 : 0) - ps) * .06;
          ls.forEach((l, i) => {
            const lr0 = l.getBoundingClientRect(), cx = lr0.left + lr0.width / 2, cy = lr0.top + lr0.height / 2;
            const wave = still ? .5 : .5 + .5 * Math.sin(t * .5 - i * .22);
            let f = 0;   // the pointer no longer swells the letters: it triggers the glitch instead (below)
            const target = 520 + wave * 90 + f * (900 - 520 - wave * 90) ;
            wt[i] += (target - wt[i]) * .1;
            l.style.setProperty("--fw", clamp(wt[i], 100, 900).toFixed(0));
            l.style.setProperty("--ly", "0px");
          });
          // the glyph widths change with the weight, so the shine's reference box is re-measured
          w.style.setProperty("--ww", w.offsetWidth + "px"); ls.forEach(l => l.style.setProperty("--ox", l.offsetLeft + "px"));
          rows.forEach((sp, i) => { const W = (sp.offsetWidth / 2) || 1; rowX[i] = (rowX[i] + (i ? -1 : 1) * (still ? 0 : .5 + Math.abs(vv) * .5) + W * 4) % W; sp.style.transform = "translate3d(" + (i ? rowX[i] - W : -rowX[i]) + "px,0,0)"; });
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  } else if (heroMode === "particles" || heroMode === "flat") { if (heroMode === "particles" && wch) wch.remove(); if (heroMode === "flat") heroChrome(); }
  else heroChrome();

  // closing block: the headline as liquid chrome over a slow gradient (WebGL; plain headline stays if WebGL is missing)
  const metal = () => {
    const sec = document.getElementById("wcta"), cv = document.getElementById("wcm"); if (!sec || !cv) return;
    const gl = cv.getContext("webgl", { antialias: false, alpha: false }); if (!gl) return;
    const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const FS = `precision highp float;uniform sampler2D uM;uniform vec2 uR;uniform float uT;uniform vec2 uP;
float h(vec2 q){return texture2D(uM,q).r;}
float hs(vec2 q){float s=0.;for(int i=0;i<8;i++){float a=float(i)*.785398;s+=texture2D(uM,q+vec2(cos(a),sin(a))*vec2(.004,.007)).g;}return s/8.;}
vec3 grad(vec2 q,float t){
  vec3 a=vec3(.015,.015,.017),b=vec3(.16,.16,.17),c=vec3(.42,.42,.43),d=vec3(.07,.07,.08);
  float x=sin(q.x*2.6+t*.22+sin(q.y*2.1-t*.17)*1.3)*.5+.5, y=sin(q.y*2.9-t*.19+sin(q.x*1.7+t*.13)*1.6)*.5+.5;
  vec3 col=mix(mix(a,b,x),mix(d,c,x),y); return col*.85;}
void main(){
  vec2 q=gl_FragCoord.xy/uR; q.y=1.-q.y; float t=uT;
  vec3 bg=grad(q,t);
  float e=1./uR.y*2.5;
  float m=h(q);
  // height = blurred mask; normal from its slope
  vec2 n=vec2(hs(q+vec2(e*6.,0.))-hs(q-vec2(e*6.,0.)),hs(q+vec2(0.,e*6.))-hs(q-vec2(0.,e*6.)))*1.1;
  vec3 N=normalize(vec3(n,.5+.5*(1.-hs(q))));
  // liquid: a travelling wobble in the reflection, pulled towards the pointer
  vec2 w=vec2(sin(q.y*9.+t*.9+uP.x*3.),cos(q.x*7.-t*.7+uP.y*3.))*.06;
  vec3 R=reflect(vec3(0.,0.,-1.),N);
  float v=R.y*1.1+R.x*.6+w.x+w.y+(uP.x-.5)*.5;
  // environment: bands of dark and bright, a thin warm and cool tint, like polished chrome
  float band=sin(v*3.4+t*.5)*.5+.5; band=smoothstep(.15,.85,band);
  vec3 env=mix(vec3(.04,.045,.055),vec3(.93,.94,.95),band);
  env+=vec3(.3)*pow(max(0.,sin(v*3.-1.)),6.)+vec3(.22)*pow(max(0.,sin(v*3.+2.)),8.);
  float rim=smoothstep(.0,.5,m)*smoothstep(1.,.45,m);
  vec3 metal=env*(.75+.25*rim);
  gl_FragColor=vec4(mix(bg,metal,smoothstep(.45,.55,m)),1.);
}`;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS); if (!vs || !fs) return;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(pr, "uR"), uT = gl.getUniformLocation(pr, "uT"), uP = gl.getUniformLocation(pr, "uP");
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let W = 0, H = 0;
    // mask: red = hard text, green = softened text (the "height" the chrome bends over)
    const maskFor = () => {
      const m = document.createElement("canvas"); m.width = W; m.height = H; const g = m.getContext("2d");
      const tall = W < H * .9, fs = tall ? Math.min(W / 5.4, H * .16) : Math.min(W / 8.6, H * .30), lines = tall ? ["YOUR", "PROJECT", "NEXT?"] : ["YOUR PROJECT", "NEXT?"]; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "800 " + fs + 'px "Helvetica Neue", Arimo, Arial, sans-serif';
      const draw = fn => lines.forEach((l, i) => fn(l, W / 2, H * .36 + (i - (lines.length - 1) / 2) * fs * .98));
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#f00"; draw((l, x, y) => g.fillText(l, x, y));
      const sm = document.createElement("canvas"); sm.width = W; sm.height = H; const s = sm.getContext("2d");
      s.fillStyle = "#000"; s.fillRect(0, 0, W, H); s.fillStyle = "#0f0"; s.font = g.font; s.textAlign = "center"; s.textBaseline = "middle";
      s.shadowColor = "#0f0"; for (const b of [fs * .34, fs * .22, fs * .12, fs * .06]) { s.shadowBlur = b; s.shadowOffsetX = 0; lines.forEach((l, i) => { s.fillText(l, W / 2, H * .36 + (i - (lines.length - 1) / 2) * fs * .98); }); }
      g.globalCompositeOperation = "lighter"; g.drawImage(sm, 0, 0); return m;
    };
    const size = () => {
      const r = sec.getBoundingClientRect(), d = Math.min(1.5, devicePixelRatio || 1);
      W = Math.max(2, Math.round(r.width * d)); H = Math.max(2, Math.round(r.height * d)); cv.width = W; cv.height = H; gl.viewport(0, 0, W, H);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskFor());
      gl.uniform2f(uR, W, H);
    };
    size(); addEventListener("resize", size); if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);
    sec.classList.add("metal");
    let px = .5, py = .5, tx = .5, ty = .5, on = false;
    sec.addEventListener("pointermove", e => { const r = sec.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width; ty = (e.clientY - r.top) / r.height; }, { passive: true });
    const io = new IntersectionObserver(es => { on = es[0].isIntersecting; if (on) requestAnimationFrame(loop); }), t0 = performance.now(); io.observe(sec);
    const loop = now => { if (!on) return; px += (tx - px) * .06; py += (ty - py) * .06; gl.uniform1f(uT, still ? 3 : (now - t0) / 1000); gl.uniform2f(uP, px, py); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); if (!still) requestAnimationFrame(loop); };
    if (still) { on = true; loop(0); }
  };
  metal();

  // scroll speed (smoothed), used for skew and marquees
  let lastY = scrollY, vs = 0;
  const mqs = [...document.querySelectorAll(".mq")], wk = document.getElementById("wk");
  const eye = document.querySelector(".whero2 .eyebrow, .chero .eyebrow"), lead = document.querySelector(".whero2 .wlead, .chero .lead"), ch = document.querySelector(".chero .ctext h1"), letters = ch ? [...ch.querySelectorAll("i")] : [];
  mqs.forEach(m => { m._x = 0; });
  const fxFrame = () => {
    const v = scrollY - lastY; lastY = scrollY; vs += (v - vs) * .14;
    mqs.forEach(m => { const t = m.firstElementChild, u = t.firstElementChild, W = u.offsetWidth || 1, dir = +m.dataset.d; m._x += dir * (.5 + Math.abs(vs) * .35) * (still ? 0 : 1); m._x = ((m._x % W) + W) % W; t.style.transform = "translate3d(" + (dir > 0 ? -m._x : m._x - W) + "px,0,0)"; });
    if (wk) {
      // no pinning: the film starts to leave at once, slower than the page, while the word rushes up faster than the page, so it slides over the film and the mask shows other parts of it
      const vh = innerHeight, y = Math.min(scrollY, vh * 1.2), k = clamp(scrollY / (vh * .9), 0, 1), e = k * k * (3 - 2 * k);
      
      wk.parentNode.style.setProperty("--ty", (-y * .42).toFixed(1) + "px");
      
      
      hv.forEach(v => v.style.setProperty("--vy", (y * .5).toFixed(1) + "px"));
    }
    if (pgl && !still) { const W3 = (pgl.scrollWidth / 3) || 1; pglX = (pglX + .5 + Math.abs(vs) * .35) % W3; pgl.style.animation = "none"; pgl.style.transform = "translate3d(" + (-pglX) + "px,0,0)"; }
    if (rib && !still) { const t = rib.firstElementChild, W = t.scrollWidth / 2 || 1; if (!ribHover) ribX = (ribX + .6 + Math.abs(vs) * .5) % W; t.style.transform = "translate3d(" + (-ribX) + "px,0,0)"; }
    // the text at the top reacts too: the eyebrow and the line under WORK drift apart and fade; the project title on a project page breaks up letter by letter
    const k2 = clamp(scrollY / (innerHeight * .7), 0, 1);
    if (eye) { eye.style.transform = "translate3d(0," + (-scrollY * .85).toFixed(1) + "px,0)"; eye.style.opacity = Math.max(0, 1 - k2 * 2.2); }
    if (lead) { if (!lead.classList.contains("wlead")) lead.style.transform = "translate3d(0," + (scrollY * .22).toFixed(1) + "px,0)"; lead.style.opacity = clamp(1 - k2 * 1.6, 0, 1); }
    if (ch && scrollY < innerHeight * 1.3) {
      // the project title leaves as one calm block: it rises a little slower than the page and fades out, no letter moves on its own
      ch.style.opacity = clamp(1 - k2 * 1.25, 0, 1).toFixed(3);
    }
    requestAnimationFrame(fxFrame);
  };
  if (!still) fxFrame();

  // the wall (overview): three columns drift at different speeds; the project near the middle of the screen lights up. Values are smoothed.
  const cols = [...document.querySelectorAll(".wcol")], wfs = [...document.querySelectorAll(".wf")], heads = [...document.querySelectorAll(".wcath b")];
  const SPEED = [0, -.05, .03];
  let wy = scrollY, wbusy = false, wplace = null;
  if (cols.length) {
    wplace = () => {
      wy += (scrollY - wy) * (still ? 1 : .1); if (Math.abs(scrollY - wy) < .3) wy = scrollY;
      const vh = innerHeight;
      heads.forEach(h => { const r = h.closest(".wcat").getBoundingClientRect(); const hd = h.parentNode; hd.style.setProperty("--ho", clamp((vh * .95 - r.top) / (vh * .25), 0, 1).toFixed(2)); h.style.setProperty("--hx", (clamp((vh - r.top) / (vh * 1.2), 0, 1) * 5 * innerWidth / 100).toFixed(1) + "px"); });
      cols.forEach(col => { if (!still && innerWidth > 760) { const wr = col.parentNode.getBoundingClientRect(), off = clamp(-wr.top, -vh, wr.height); col.style.transform = "translate3d(0," + (off * SPEED[+col.dataset.k]).toFixed(1) + "px,0)"; } });
      wfs.forEach(w => {
        const r = w.getBoundingClientRect(); if (r.bottom < -vh * .3 || r.top > vh * 1.3) return;
        const d = clamp(Math.abs(r.top + r.height * .4 - vh * .5) / (vh * .55), 0, 1);
        w.style.setProperty("--dm", (.03 + d * .22).toFixed(2));
        // focus pull: a project is soft and a little small at the edges of the screen and comes into focus as it reaches the middle
        if (!still) { const f = w.classList.contains("wvid") ? 0 : clamp((d - .5) / .5, 0, 1); const fi = w.querySelector(".wfimg"); const wide = innerWidth > 760; fi.style.filter = f > .02 ? (wide ? "blur(" + (f * 9).toFixed(1) + "px) saturate(" + (1 - f * .35).toFixed(2) + ")" : "grayscale(" + (f * .95).toFixed(2) + ") brightness(" + (1 - f * .35).toFixed(2) + ")") : "none"; w._f = f; if (!wide) fi.style.transform = "scale(" + (1 - f * .06).toFixed(3) + ")"; }
        if (!still && innerWidth > 760) { w.querySelector(".wfimg").style.transform = "rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) scale(" + (1 - (w._f || 0) * .08).toFixed(3) + ")"; }
        if (!still) { const im = w.querySelector("img"); if (im) im.style.transform = "translate3d(0," + clamp(((r.top + r.height / 2 - vh / 2) / vh) * -7, -8, 8).toFixed(2) + "%,0) scale(1.06)"; }
      });
      return Math.abs(scrollY - wy) > .3;
    };
    addEventListener("scroll", () => { if (!wbusy) { wbusy = true; const l = () => { wbusy = wplace(); if (wbusy) requestAnimationFrame(l); }; requestAnimationFrame(l); } }, { passive: true });
    addEventListener("resize", wplace); wplace();
  }

  // magnetic cards (fine pointers): a photo turns a little towards the pointer and a soft shine follows it; only while you point at it
  if (matchMedia("(pointer: fine)").matches && !still) {
    const host = e => e.target.closest && e.target.closest(".wf, .gl .g");
    document.addEventListener("pointermove", e => {
      const h = host(e); if (!h) return; const r = h.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      h.style.setProperty("--ry", (x * 14).toFixed(2) + "deg"); h.style.setProperty("--rx", (-y * 12).toFixed(2) + "deg");
      h.style.setProperty("--gx", ((x + .5) * 100).toFixed(1) + "%"); h.style.setProperty("--gy", ((y + .5) * 100).toFixed(1) + "%"); h.style.setProperty("--go", 1);
    }, { passive: true });
    document.addEventListener("pointerout", e => { const h = host(e); if (!h || (e.relatedTarget && h.contains(e.relatedTarget))) return; h.style.setProperty("--ry", "0deg"); h.style.setProperty("--rx", "0deg"); h.style.setProperty("--go", 0); });
  }



  // closing call to action: the letters of LET'S WORK swell in weight towards the pointer and light up, every change eased, and settle back when it leaves
  const lw = document.querySelector(".wlw");
  if (lw) {
    const L = [...lw.querySelectorAll("i")], cur = L.map(() => 600), op = L.map(() => .7); let px = null, run = false;
    const fine = !still && matchMedia("(hover: hover)").matches;
    const step = () => {
      let moving = false;
      L.forEach((l, i) => {
        let tw = 600, to = .7;
        if (px !== null) { const r = l.getBoundingClientRect(), d = Math.abs(px - (r.left + r.width / 2)), s = r.width * 1.9, f = Math.exp(-(d * d) / (s * s)); tw = 600 + f * 300; to = .7 + f * .3; }
        cur[i] += (tw - cur[i]) * .1; op[i] += (to - op[i]) * .1;
        if (Math.abs(tw - cur[i]) > .5 || Math.abs(to - op[i]) > .004) moving = true;
        l.style.setProperty("--fw", cur[i].toFixed(0)); l.style.setProperty("--op", op[i].toFixed(3));
      });
      if (moving || px !== null) requestAnimationFrame(step); else run = false;
    };
    const go = () => { if (!run) { run = true; requestAnimationFrame(step); } };
    if (fine) { lw.addEventListener("pointermove", e => { px = e.clientX; go(); }); lw.addEventListener("pointerleave", () => { px = null; go(); }); }
  }

  // section navigation: one nav that starts large in the opening and shrinks into the sticky bar while you scroll; the section in view is lit
  const navEl = document.getElementById("wnav"), navA = document.getElementById("wna"), navs = navEl ? [...navEl.querySelectorAll(".wn")] : [];
  if (navEl && navA) {
    const secsN = navs.map(n => document.getElementById(n.dataset.c)).filter(Boolean);
    const barOf = () => document.querySelector(".wbar");
    const place = () => {
      const vh = innerHeight, ar = navA.getBoundingClientRect(), bar = barOf(), wide = innerWidth > 760;
      const heroPx = parseFloat(getComputedStyle(navEl).fontSize), smallPx = 15;
      const ty = wide ? 60 + 12 + 17 - smallPx / 2 : 60 + 14, y = Math.max(ar.top, ty);
      const t = clamp((ar.top - ty) / (vh * .5), 0, 1), sc = smallPx / heroPx + (1 - smallPx / heroPx) * t * t * (3 - 2 * t);
      navEl.style.transform = "translate3d(0," + y.toFixed(1) + "px,0) scale(" + sc.toFixed(3) + ")";
      let cur = null; secsN.forEach(s => { const r = s.getBoundingClientRect(); if (r.top < vh * .45 && r.bottom > vh * .3) cur = s.id; });
      navs.forEach(n => n.classList.toggle("on", n.dataset.c === cur));
      const ig = document.querySelector(".wig"); if (ig) document.body.classList.toggle("endbar", ig.getBoundingClientRect().top < vh * .55);
      if (bar && !navEl.classList.contains("ready")) navEl.classList.add("ready");
    };
    addEventListener("scroll", place, { passive: true }); addEventListener("resize", place); place(); setTimeout(place, 400);
    navs.forEach(a => a.addEventListener("click", e => { const t = document.getElementById(a.dataset.c); if (!t) return; e.preventDefault(); t.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" }); }));
  }

  // photo | video switch: tiles of the other kind drop out and the columns are filled again, so there are no holes
  const tog = document.getElementById("wtog");
  const secs = [...document.querySelectorAll(".wcat")].map(sec => ({ sec, cols: [...sec.querySelectorAll(".wcol")], items: [...sec.querySelectorAll(".wf")] }));
  const layout = f => {
    secs.forEach(o => {
      const vis = o.items.filter(w => f === "all" || w.dataset.type === f);
      o.items.forEach(w => { w.classList.toggle("out", !vis.includes(w)); w.remove(); });
      vis.forEach((w, i) => o.cols[i % o.cols.length].appendChild(w));
      o.sec.classList.toggle("empty", !vis.length);
    });
    wplace && wplace();
  };
  if (tog) {
    const lens = tog.querySelector(".lens");
    const moveLens = () => { const b = tog.querySelector("button.on"); if (b && lens) { lens.style.width = b.offsetWidth + "px"; lens.style.transform = "translateX(" + b.offsetLeft + "px)"; } };
    // liquid glass: a displacement map (edges bend the backdrop, centre stays flat) feeds an SVG filter used as backdrop-filter
    if (lens && window.chrome && CSS.supports("backdrop-filter", "url(#x)")) {
      const W = 160, H = 56, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const g = cv.getContext("2d"), im = g.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = Math.min(x, W - 1 - x), dy = Math.min(y, H - 1 - y), d = Math.min(dx, dy * 1.6), e = Math.max(0, 1 - d / 16), k = e * e;
        const sx = x < W / 2 ? 1 : -1, sy = y < H / 2 ? 1 : -1, vx = dx < dy * 1.6 ? sx : 0, vy = dx < dy * 1.6 ? 0 : sy, i = (y * W + x) * 4;
        im.data[i] = 128 + vx * k * 127; im.data[i + 1] = 128 + vy * k * 127; im.data[i + 2] = 128; im.data[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", 0); svg.setAttribute("height", 0); svg.style.position = "absolute"; svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = '<filter id="lensf" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="' + cv.toDataURL() + '" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="38" xChannelSelector="R" yChannelSelector="G"/></filter>';
      document.body.appendChild(svg); tog.classList.add("glass");
    }
    moveLens(); addEventListener("resize", moveLens); if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveLens);
    tog.addEventListener("click", e => { const b = e.target.closest("button[data-f]"); if (!b) return; tog.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); moveLens(); layout(b.dataset.f); });
  }

  // film tiles: the preview plays while the tile is on screen; a click opens the longer cut in a player
  const vids = [...document.querySelectorAll(".wvid video")];
  if (vids.length && "IntersectionObserver" in window) {
    const iov = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { if (!v.src) { v.src = v.dataset.src; } if (!still) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } } else v.pause(); }), { rootMargin: "600px 0px", threshold: 0 });
    vids.forEach(v => iov.observe(v));
  }
  const vb = document.getElementById("vb"), vbv = document.getElementById("vbv");
  if (vb) {
    const closeV = () => { vb.hidden = true; vbv.pause(); vbv.removeAttribute("src"); vbv.load(); document.documentElement.style.overflow = ""; };
    document.addEventListener("click", e => { const t = e.target.closest && e.target.closest(".wvid[data-full]"); if (!t) return; e.preventDefault(); vbv.src = t.dataset.full; vb.hidden = false; document.documentElement.style.overflow = "hidden"; const p = vbv.play(); if (p && p.catch) p.catch(() => {}); });
    vb.querySelector(".vb-x").addEventListener("click", closeV); vb.addEventListener("click", e => { if (e.target === vb) closeV(); });
    document.querySelectorAll(".bar a.back").forEach(a => a.addEventListener("click", e => { if (!vb.hidden) { e.preventDefault(); e.stopImmediatePropagation(); closeV(); } }, true));
    addEventListener("keydown", e => { if (!vb.hidden && e.key === "Escape") closeV(); });
  }

  // click: the clicked picture and the visible title get a transition name, so the browser can fly them into the project page
  document.addEventListener("click", e => {
    const f = e.target.closest && e.target.closest(".wf"); if (!f) return;
    const im = f.querySelector(".wfimg"); if (im) im.style.viewTransitionName = "cover";
    const t = f.querySelector(".wft"); if (t) t.style.viewTransitionName = "ptitle";
  }, true);

  // project page: the little label that stays: which photo you are on
  const lab = document.getElementById("clabel");
  const labUpdate = () => {
    if (!lab || !figs.length) return;
    let best = 0, bd = 1e9;
    figs.forEach((im, k) => { const r = im.parentNode.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - innerHeight / 2); if (d < bd) { bd = d; best = k; } });
    document.getElementById("cnow").textContent = String(best + 1);
    const gr = document.getElementById("gal").getBoundingClientRect();
    lab.classList.toggle("on", gr.top < innerHeight * .5 && gr.bottom > innerHeight * .5);
  };
  if (lab) { addEventListener("scroll", labUpdate, { passive: true }); labUpdate(); }

  // project page: the photos flow down; each moves a little against the scroll; the label keeps count
  const gl = document.getElementById("gal");
  let gbusy = false;
  // album wall: photos in one row share a lift but each column drifts at its own speed against the scroll (three speeds), the photo inside zooms out softly as it reaches the middle of the screen, and a short lag after a fast flick makes the wall feel like paper
  let gy = scrollY;
  const gfigs = [...document.querySelectorAll(".gl .g")];
  const SP = [.05, -.035, .085, -.06];
  const gplace = () => {
    const vh = innerHeight;
    gfigs.forEach((g, k) => {
      const r = g.getBoundingClientRect(); if (r.bottom < -vh * .4 || r.top > vh * 1.4) return;
      const d = (r.top + r.height / 2 - vh / 2) / vh, sp = SP[k % SP.length];
      const im = g.querySelector("img");   // the frames stay put (no overlaps); the picture inside drifts at its own speed and zooms out as it reaches the middle
      if (im) im.style.transform = "translate3d(0," + clamp(d * 100 * sp * 2.6, -5.5, 5.5).toFixed(2) + "%,0) scale(" + (1.12 + clamp(Math.abs(d), 0, 1) * .1).toFixed(3) + ")";
    });
    labUpdate();
  };
  if (gl && !still) { document.querySelectorAll(".gl .g").forEach((g, k) => g.classList.add(k % 2 ? "r" : "l")); const gl2 = () => { gplace(); requestAnimationFrame(gl2); }; gl2(); addEventListener("resize", gplace); }

  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener("scroll", req, { passive: true }); addEventListener("resize", req); frame();

  // pointer label
  const cur = document.getElementById("cur");
  if (cur && matchMedia("(pointer: fine)").matches) {
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener("mousemove", e => { x = e.clientX; y = e.clientY; }, { passive: true });
    document.addEventListener("mouseover", e => {
      const t = e.target.closest && e.target.closest(".panel, .g button");
      cur.classList.toggle("on", !!t);
      if (t) cur.firstElementChild.textContent = t.classList.contains("panel") ? "View" : "Open";
    });
    document.addEventListener("mouseleave", () => cur.classList.remove("on"));
    const move = () => { cx += (x - cx) * .2; cy += (y - cy) * .2; cur.style.transform = "translate3d(" + cx + "px," + cy + "px,0)"; requestAnimationFrame(move); };
    move();
  }

  // photo viewer
  const gal = document.getElementById("gal"), lb = document.getElementById("lb");
  if (!gal || !lb) return;
  const imgs = [...gal.querySelectorAll("img")], big = lb.querySelector("img");
  let i = 0, last = null;
  const show = n => { i = (n + imgs.length) % imgs.length; big.src = imgs[i].src; big.alt = imgs[i].alt; };
  const open = n => { last = document.activeElement; lb.hidden = false; show(n); lb.querySelector(".lb-x").focus(); document.documentElement.style.overflow = "hidden"; };
  const close = () => { lb.hidden = true; document.documentElement.style.overflow = ""; if (last) last.focus(); };
  gal.addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) open(+b.dataset.i); });
  lb.querySelector(".lb-x").addEventListener("click", close);
  lb.querySelector(".lb-p").addEventListener("click", () => show(i - 1));
  lb.querySelector(".lb-n").addEventListener("click", () => show(i + 1));
  lb.addEventListener("click", e => { if (e.target === lb) close(); });
  addEventListener("keydown", e => {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(i - 1);
    if (e.key === "ArrowRight") show(i + 1);
  });
  let x0 = null;
  lb.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", e => { if (x0 === null) return; const d = e.changedTouches[0].clientX - x0; if (Math.abs(d) > 50) show(i + (d < 0 ? 1 : -1)); x0 = null; });
})();


// a film's own page: the preview loops by itself; the button swaps in the long cut with sound
(() => {
  const hero = document.getElementById("vhero"); if (!hero) return;
  let close = document.getElementById("vclose"); const prev = document.getElementById("vprev"), btn = document.getElementById("vplay");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce && prev) { prev.removeAttribute("autoplay"); prev.pause(); }
  let full = null;
  const stop = () => { if (full) { full.pause(); full.remove(); full = null; } hero.classList.remove("playing"); if (prev && !reduce) { const p = prev.play(); if (p && p.catch) p.catch(() => {}); } document.documentElement.style.overflow = ""; };
  const start = () => {
    full = document.createElement("video"); full.className = "vfull"; full.src = window.VFULL; full.controls = true; full.playsInline = true; full.setAttribute("playsinline", "");
    hero.querySelector(".vstage").appendChild(full); hero.classList.add("playing"); if (prev) prev.pause();
    const p = full.play(); if (p && p.catch) p.catch(() => {}); full.addEventListener("ended", stop);
    hero.querySelector(".vstage").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  };
  if (close) close.remove();   // no second Back button over the film: the bar's Back button closes the film first
  document.querySelectorAll(".bar a.back").forEach(a => a.addEventListener("click", e => { if (hero.classList.contains("playing")) { e.preventDefault(); e.stopImmediatePropagation(); stop(); } }, true));
  btn && btn.addEventListener("click", start);
  hero.querySelector(".vstage").addEventListener("click", () => { if (!hero.classList.contains("playing")) start(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && hero.classList.contains("playing")) stop(); });
})();


// menu overlay and the back buttons: Escape closes the menu, a click on a link inside it just navigates
(() => {
  const mb = document.getElementById("menub"), m = document.getElementById("menu"), x = document.getElementById("menux"); if (!mb || !m) return;
  const open = o => { m.hidden = !o; mb.setAttribute("aria-expanded", o ? "true" : "false"); document.documentElement.style.overflow = o ? "hidden" : ""; if (o) x.focus(); else mb.focus(); };
  mb.addEventListener("click", () => open(m.hidden)); x.addEventListener("click", () => open(false));
  m.addEventListener("click", e => { if (e.target === m) open(false); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !m.hidden) open(false); });
})();


// social videos on a project page: they play muted while on screen; a click turns the sound on for that one (and off for the others)
(() => {
  const btns = [...document.querySelectorAll(".svb")]; if (!btns.length) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = new IntersectionObserver(es => es.forEach(e => { const v = e.target.querySelector("video"); if (e.isIntersecting) { if (v.preload !== "auto") v.preload = "auto"; if (!reduce) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } } else v.pause(); }), { rootMargin: "200px", threshold: .25 });
  btns.forEach(b => io.observe(b));
  btns.forEach(b => b.addEventListener("click", () => {
    const v = b.querySelector("video"), on = !b.classList.contains("sound");
    btns.forEach(o => { o.classList.remove("sound"); o.querySelector("video").muted = true; o.querySelector(".svs").textContent = "Sound on"; });
    if (on) { b.classList.add("sound"); v.currentTime = 0; v.muted = false; b.querySelector(".svs").textContent = "Sound on · click to mute"; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  }));
})();


// scatter reveal for text (the look of the two reference posts): characters appear in random order, each flashing through a few other glyphs before it settles
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const GL = "ABCDEFGHJKLMNOPRSTUVWXYZ0123456789/<>-", GS = "abcdefghjkmnoprstuvwxyz";
  const prep = el => {
    if (el.classList.contains("split")) { el.classList.add("scat"); return [...el.querySelectorAll("i")]; }
    if (el.classList.contains("wl2")) { const txt = el.textContent; el.setAttribute("aria-label", txt); el.textContent = ""; const out = [];   // subtitle: whole words, each one rises and fades in after the other (and never breaks inside a word)
      txt.split(" ").forEach((wd, i, all) => { const s = document.createElement("span"); s.className = "sw"; s.setAttribute("aria-hidden", "true"); s.textContent = wd; el.appendChild(s); out.push(s); if (i < all.length - 1) el.appendChild(document.createTextNode(" ")); });
      return out; }
    const txt = el.textContent; el.setAttribute("aria-label", txt); el.textContent = ""; const out = [];
    [...txt].forEach(ch => { const s = document.createElement("span"); s.className = "sc-c"; s.setAttribute("aria-hidden", "true"); s.textContent = ch; if (ch !== " ") { s.classList.add("sc-off"); out.push(s); } el.appendChild(s); });
    return out;
  };
  // digital flicker: a letter steps (100 ms, hard cuts) through code glyphs or blank, then lands on itself
  const DG = "01/\\<>[]+-=:;#%&|_ ";
  const flick = (c, steps, done) => { const orig = c.dataset.o || (c.dataset.o = c.textContent); let k = 0;
    const st = () => { if (k >= steps) { c.textContent = orig; c.classList.remove("sc-off"); done && done(); return; }
      c.classList.remove("sc-off"); const r = Math.random(); if (r < .22) c.classList.add("sc-off"); else c.textContent = DG[Math.floor(Math.random() * DG.length)]; k++; setTimeout(st, 100); };
    st(); };
  const run = (chars, dur, el) => { 
    if (el && el.classList.contains("wl2")) { setTimeout(() => chars.forEach(c => c.classList.add("in")), 700); return; }
    chars.forEach(c => { if (!c.dataset.o) c.dataset.o = c.textContent;
      if (c.closest(".split")) { let t = 150 + Math.random() * 1100; const n = 2 + Math.floor(Math.random() * 3);   // project titles: every letter blinks on and off a few times at its own moment, then stays on (same as the home title)
        for (let k = 0; k < n; k++) { setTimeout(() => c.style.opacity = "1", t); t += 35 + Math.random() * 70; setTimeout(() => c.style.opacity = "0", t); t += 40 + Math.random() * 110; }
        setTimeout(() => c.style.opacity = "1", t); }
      else setTimeout(() => flick(c, 2 + Math.floor(Math.random() * 5)), Math.random() * dur); }); };
  const targets = [...document.querySelectorAll(".chero h1.split, .vhero h1.split, .pg-hero h1.split, .wl2")];
  // the subtitle keeps living: every few seconds a wave runs through it and each letter flashes through other glyphs as it passes; letters under the pointer flip too
  const alive = () => {};   // the subtitle only animates once, on load
  targets.forEach(el => { const chars = prep(el); if (el.classList.contains("split")) chars.forEach(c => c.style.opacity = "0");
    const go = () => { if (el.classList.contains("split")) setTimeout(() => chars.forEach(c => c.style.opacity = "1"), 2600); run(chars, el.classList.contains("split") ? 900 : 1300, el); };
    if (el.classList.contains("wl2")) { el.style.pointerEvents = "auto"; alive(chars, el); }
    if (el.closest(".whero2, .chero, .vhero, .pg-hero")) setTimeout(go, 400);
    else new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { go(); o.disconnect(); } }), { threshold: .4 }).observe(el); });
})();

// videos in the "More work" cards play on their own while on screen
(() => { const vs = [...document.querySelectorAll(".mci video")]; if (!vs.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const io = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause(); }), { rootMargin: "200px", threshold: .1 });
  vs.forEach(v => io.observe(v)); })();

// the Back button goes to the page you came from (not always to Work): history when you arrived from this site, else Work
(() => { document.querySelectorAll("a.back").forEach(a => a.addEventListener("click", e => { try { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { e.preventDefault(); history.back(); } } catch (_) {} })); })();


// the scroll cue in the hero disappears as soon as you scroll
(() => { const c = document.querySelector(".wscroll"); if (!c) return; const f = () => c.classList.toggle("gone", scrollY > 60); addEventListener("scroll", f, { passive: true }); f(); })();

// "View more": the rest of a section opens on a click
document.querySelectorAll(".wmorebtn").forEach(b => b.addEventListener("click", () => { const s = document.getElementById(b.dataset.sec); if (!s) return; s.querySelectorAll("[data-more]").forEach(e => { e.hidden = false; e.removeAttribute("data-more"); }); b.remove(); }));

/* Pricing is not public. Whoever opens the private link (/?pr=<secret>) keeps a "Pricing" link while browsing the work. The secret is never in this file: it only lives in the visitor's browser. */
(() => {
  try {
    const OK = /^pricing-[a-z0-9]{4,24}$/, q = new URLSearchParams(location.search), k = q.get("pr");
    if (k && OK.test(k)) { localStorage.setItem("sv_pr", k); const kc = (q.get("k") || "").toLowerCase(); if (/^[a-z0-9-]{6,40}$/.test(kc)) localStorage.setItem("pk", kc); q.delete("pr"); q.delete("k"); if (location.pathname.indexOf("/" + k + "/") !== 0) { location.replace("/" + k + "/"); return; } history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash); }
    const v = localStorage.getItem("sv_pr"); if (!v || !OK.test(v) || location.pathname.indexOf("/" + v + "/") === 0) return;
    const href = "/" + v + "/", mk = (cls, txt) => { const a = document.createElement("a"); a.href = href; a.textContent = txt; a.className = cls; a.setAttribute("data-pr", ""); return a; };
    const st = document.createElement("style");
    st.textContent = ".prl{color:#fff;font:600 11px/1 var(--w-sans,Arial,sans-serif);letter-spacing:.14em;text-transform:uppercase;text-decoration:none;padding:10px 6px}.prl:hover{text-decoration:underline;text-underline-offset:.3em}@media(max-width:760px){.prl{display:none}}";
    document.head.appendChild(st);
    const s = document.querySelector(".menu-s"); if (s && !s.querySelector("[data-pr]")) s.insertBefore(mk("", "Pricing"), s.firstChild);
    const fp = document.querySelector('.foot a[href="/privacy/"]'); if (fp && !document.querySelector(".foot [data-pr]")) { const fa = mk(fp.className, "Pricing"); fp.parentNode.insertBefore(fa, fp); }
  } catch (_) {}
})();

/* films in the "Also at" tiles play on their own (muted, looping) while they are on screen */
(() => {
  const v = [...document.querySelectorAll("video.auto")]; if (!v.length || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const io = new IntersectionObserver(es => es.forEach(e => { const m = e.target; if (e.isIntersecting) { if (!m.src && m.dataset.src) { m.src = m.dataset.src; m.load(); } const p = m.play(); if (p && p.catch) p.catch(() => {}); } else m.pause(); }), { threshold: .35 });
  v.forEach(m => io.observe(m));
})();
