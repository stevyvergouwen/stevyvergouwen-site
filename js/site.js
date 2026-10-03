/* Stevy Vergouwen - the page's behaviour. Reads data/site.json (made by
   tools/maak_media.py from his Dropbox folders) and builds the work, the
   folders view, the photos and the player from it. */

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(hover: none)").matches;
  const pad2 = n => String(n).padStart(2, "0");
  const tc = (sec, fps = 25) => {
    const f = Math.floor((sec % 1) * fps), s = Math.floor(sec);
    return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}:${pad2(f)}`;
  };

  gsap.registerPlugin(ScrollTrigger);

  // ------------------------------------------------------------ smooth scroll
  let lenis = null;
  if (!calm && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  const scrollTo = target => lenis ? lenis.scrollTo(target, { offset: 0, duration: 1.6 }) : document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
  $$('a[href^="#"]').forEach(a => a.addEventListener("click", e => { e.preventDefault(); scrollTo(a.getAttribute("href") === "#top" ? 0 : a.getAttribute("href")); }));

  // ------------------------------------------------------------------ cursor
  const cursor = $(".cursor"), label = $(".cursor-label");
  let cx = innerWidth / 2, cy = innerHeight / 2;
  if (!touch) {
    const toX = gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3" });
    const toY = gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3" });
    addEventListener("pointermove", e => { cx = e.clientX; cy = e.clientY; toX(cx); toY(cy); });
    document.addEventListener("pointerover", e => {
      const t = e.target.closest("[data-cursor]");
      cursor.classList.toggle("is-big", !!t);
      label.textContent = t ? t.dataset.cursor : "";
    });
  }

  // ------------------------------------------------------------------ clocks
  const clock = $("[data-clock]");
  const breda = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const tickClock = () => { clock.textContent = `Breda ${breda()}`; };
  tickClock(); setInterval(tickClock, 10000);
  $("[data-year]").textContent = new Date().getFullYear();

  // -------------------------------------------------------------------- data
  fetch("data/site.json").then(r => r.json()).then(build).catch(err => {
    console.error(err);
    $(".intro-num").textContent = "No media yet - run tools/maak_media.py";
  });

  function build(site) {
    const jobs = site.jobs;
    hero(jobs, site.photos);
    work(site);
    photos(site.photos);
    player();
    intro();
  }

  // -------------------------------------------------------------------- hero
  // film and photo take turns: a drop from a clip, then a photo that slowly
  // closes in, then the next drop - he shoots both, the banner shows both
  function hero(jobs, photos) {
    const clips = jobs.flatMap(j => j.clips.map(c => ({ kind: "film", ...c, job: j })));
    const tall = innerHeight > innerWidth;
    let stills = photos.filter(p => (p.h > p.w) === tall);
    if (stills.length < 3) stills = photos;
    stills = stills.map(p => ({ kind: "photo", ...p }));
    const mix = arr => arr.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const a = mix(clips), b = mix(stills), slides = [];
    for (let n = 0; n < Math.max(a.length, b.length); n++) {
      if (a[n % a.length]) slides.push(a[n % a.length]);
      if (b.length) slides.push(b[n % b.length]);
    }
    if (!slides.length) return;

    const v = $(".hero-video"), img = $(".hero-photo"), out = $("[data-hero-tc]"), now = $("[data-hero-now]");
    let k = -1, cur = null, timer = 0, inView = true;
    v.loop = false;
    const next = () => {
      clearTimeout(timer);
      k = (k + 1) % slides.length; cur = slides[k];
      if (cur.kind === "film") {
        v.src = cur.loop; v.play().catch(() => {});
        v.addEventListener("playing", () => {
          gsap.to(v, { opacity: 1, duration: 1.2, ease: "power2.out" });
          gsap.to(img, { opacity: 0, duration: 1.2, ease: "power2.out" });
        }, { once: true });
        now.textContent = `Film · ${cur.job.artist} · ${cur.job.title} · ${cur.job.date}`;
      } else {
        const pic = new Image();
        pic.onload = () => {
          img.src = cur.src;
          gsap.fromTo(img, { scale: 1.1 }, { scale: 1, duration: 6.5, ease: "none" });
          gsap.to(img, { opacity: 1, duration: 1.2, ease: "power2.out" });
          gsap.to(v, { opacity: 0, duration: 1.2, ease: "power2.out", onComplete: () => v.pause() });
          out.textContent = "Still";
          timer = setTimeout(next, 5200);
        };
        pic.onerror = () => next();
        pic.src = cur.src;
        now.textContent = `Photo · ${cur.event} · ${cur.date}`;
      }
    };
    v.addEventListener("timeupdate", () => { if (cur?.kind === "film") out.textContent = `TC ${tc(v.currentTime)}`; });
    v.addEventListener("ended", next);
    // a browser may hold a muted video until it can play, or stop it in a
    // hidden tab: while the hero is on screen a film keeps running, off screen it rests
    new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (cur?.kind === "film") inView ? v.play().catch(() => {}) : v.pause();
    }).observe($(".hero"));
    v.addEventListener("canplay", () => { if (inView && cur?.kind === "film") v.play().catch(() => {}); });
    setInterval(() => { if (inView && cur?.kind === "film" && v.paused && !document.hidden) v.play().catch(() => {}); }, 1000);
    next();
    if (!calm) {
      gsap.to(".hero-media", { scale: 1.22, yPercent: 8, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
      gsap.to(".hero-title", { yPercent: -30, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "70% top", scrub: true } });
    }
  }

  // -------------------------------------------------------------------- work
  function work(site) {
    const grid = $("[data-grid]"), folders = $("[data-folders]"), filters = $("[data-filters]");
    const jobs = site.jobs;
    $("[data-count]").textContent = `(${pad2(jobs.length)})`;

    grid.innerHTML = jobs.map((j, n) => `
      <a class="job" href="#" data-job="${j.id}" data-cat="${j.category}" data-cursor="Play">
        <div class="frame">
          <img src="${j.clips[0].poster}" alt="${j.artist} - ${j.title}" loading="lazy">
          <video muted playsinline loop preload="none" src="${j.clips[0].loop}"></video>
          <span class="frame-tc">00:00:00:00</span>
        </div>
        <div class="meta">
          <span class="no">${pad2(n + 1)}</span>
          <span class="artist">${j.artist}</span>
          <span class="date">${j.date}</span>
          <span class="folder">${j.title} · ${j.clips.length} clips</span>
        </div>
      </a>`).join("");

    // filters: only the categories that have work in them
    const cats = site.categories.filter(c => jobs.some(j => j.category === c.id));
    filters.innerHTML = [`<button class="filter is-on" data-filter="all">All<sup>${jobs.length}</sup></button>`]
      .concat(cats.map(c => `<button class="filter" data-filter="${c.id}">${c.name}<sup>${jobs.filter(j => j.category === c.id).length}</sup></button>`)).join("");
    filters.addEventListener("click", e => {
      const b = e.target.closest(".filter"); if (!b) return;
      $$(".filter", filters).forEach(x => x.classList.toggle("is-on", x === b));
      const f = b.dataset.filter;
      const cards = $$(".job", grid);
      gsap.to(cards, { opacity: 0, y: 20, duration: 0.25, stagger: 0.02, onComplete: () => {
        cards.forEach(c => { c.hidden = f !== "all" && c.dataset.cat !== f; });
        gsap.fromTo(cards.filter(c => !c.hidden), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: "power3.out" });
        ScrollTrigger.refresh();
      } });
    });

    // hover plays the loop; on a phone the card in view plays
    const start = card => {
      const v = $("video", card), t = $(".frame-tc", card);
      v.play().then(() => card.classList.add("is-playing")).catch(() => {});
      card._tc = setInterval(() => { t.textContent = tc(v.currentTime); }, 40);
    };
    const stop = card => {
      const v = $("video", card);
      v.pause(); card.classList.remove("is-playing"); clearInterval(card._tc);
    };
    $$(".job", grid).forEach(card => {
      if (touch) return;
      card.addEventListener("pointerenter", () => start(card));
      card.addEventListener("pointerleave", () => stop(card));
    });
    if (touch) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        e.target.classList.toggle("is-live", e.isIntersecting);
        e.isIntersecting ? start(e.target) : stop(e.target);
      }), { threshold: 0.6 });
      $$(".job", grid).forEach(c => io.observe(c));
    }
    $$(".job", grid).forEach(card => card.addEventListener("click", e => {
      e.preventDefault(); openPlayer(jobs.find(j => j.id === card.dataset.job));
    }));

    // reveal: the frame wipes open from below, the words follow
    if (!calm) {
      $$(".job", grid).forEach(card => {
        gsap.from($(".frame", card), { clipPath: "inset(100% 0 0 0)", duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: card, start: "top 88%" } });
        gsap.from($(".frame img", card), { scale: 1.35, duration: 1.8, ease: "expo.out", scrollTrigger: { trigger: card, start: "top 88%" } });
        gsap.from($$(".meta > *", card), { y: 16, opacity: 0, duration: 0.9, stagger: 0.06, ease: "power3.out", scrollTrigger: { trigger: card, start: "top 80%" } });
      });
      gsap.from(".work .section-title", { yPercent: 60, opacity: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: ".work", start: "top 75%" } });
    }

    // folders: category > artist > YYYY.MM | job, as in Dropbox
    const byCat = cats.map(c => ({ c, artists: [...new Set(jobs.filter(j => j.category === c.id).map(j => j.artist))] }));
    folders.innerHTML = byCat.map(({ c, artists }) => `
      <div class="tree-cat">${c.name} / Artists</div>
      ${artists.map(a => {
        const mine = jobs.filter(j => j.category === c.id && j.artist === a);
        return `<div class="tree-artist"><span class="ico">▾</span><span class="name">${a}</span><span class="n">${mine.length} ${mine.length === 1 ? "job" : "jobs"}</span></div>` +
          mine.map(j => `<a href="#" class="tree-job" data-job="${j.id}" data-cursor="Play">
            <span></span><span class="ico">▸</span><span>${j.folder}</span><span class="type">16X9</span><span class="clips">${pad2(j.clips.length)} clips</span></a>`).join("");
      }).join("")}`).join("");
    const prev = $(".folder-preview"), pv = $("video", prev);
    const toX = gsap.quickTo(prev, "x", { duration: 0.5, ease: "power3" }), toY = gsap.quickTo(prev, "y", { duration: 0.5, ease: "power3" });
    folders.addEventListener("pointermove", e => { toX(e.clientX + 24); toY(e.clientY - 100); });
    $$(".tree-job", folders).forEach(row => {
      const j = jobs.find(x => x.id === row.dataset.job);
      row.addEventListener("pointerenter", () => { if (!pv.src.endsWith(j.clips[0].loop)) pv.src = j.clips[0].loop; pv.play().catch(() => {}); prev.classList.add("is-on"); });
      row.addEventListener("pointerleave", () => { prev.classList.remove("is-on"); pv.pause(); });
      row.addEventListener("click", e => { e.preventDefault(); openPlayer(j); });
    });

    $$(".view").forEach(b => b.addEventListener("click", () => {
      $$(".view").forEach(x => x.classList.toggle("is-on", x === b));
      const f = b.dataset.view === "folders";
      grid.hidden = f; folders.hidden = !f; filters.style.visibility = f ? "hidden" : "";
      if (f && !calm) gsap.from([...folders.children], { opacity: 0, x: -20, duration: 0.6, stagger: 0.04, ease: "power3.out" });
      ScrollTrigger.refresh();
    }));
  }

  // ------------------------------------------------------------------- photo
  // a calm grid: rows of equal height, each photo in its own shape, no words;
  // a click shows it big
  function photos(list) {
    const grid = $("[data-photo-grid]");
    if (!list.length) { $(".photo").hidden = true; return; }
    list = [...list].sort((a, b) => b.date.localeCompare(a.date));
    $("[data-photo-count]").textContent = `(${pad2(list.length)})`;
    grid.innerHTML = list.map((p, n) => `
      <figure class="pic" style="--r:${(p.w / p.h).toFixed(4)}" data-n="${n}" data-cursor="View">
        <img src="${p.small}" alt="${p.event}, ${p.date}" loading="lazy">
      </figure>`).join("");
    if (!calm) {
      gsap.set(".pic", { opacity: 0, y: 24 });
      ScrollTrigger.batch(".pic", { start: "top 92%", once: true,
        onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 1, stagger: 0.05, ease: "power3.out" }) });
    }

    const box = $("[data-lightbox]"), img = $("[data-lightbox-img]"), count = $("[data-lightbox-count]");
    let n = 0;
    const show = () => {
      const p = list[n];
      img.src = p.src; img.alt = `${p.event}, ${p.date}`;
      count.textContent = `${pad2(n + 1)} / ${pad2(list.length)}`;
      [list[(n + 1) % list.length], list[(n - 1 + list.length) % list.length]].forEach(q => { new Image().src = q.src; });
      if (!calm) gsap.fromTo(img, { opacity: 0, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" });
    };
    const open = i => { n = i; box.hidden = false; lenis?.stop(); show(); };
    const close = () => { box.hidden = true; lenis?.start(); };
    const step = d => { n = (n + d + list.length) % list.length; show(); };
    $$(".pic", grid).forEach(fig => fig.addEventListener("click", () => open(+fig.dataset.n)));
    $("[data-lightbox-close]").addEventListener("click", close);
    $("[data-lightbox-prev]").addEventListener("click", () => step(-1));
    $("[data-lightbox-next]").addEventListener("click", () => step(1));
    box.addEventListener("click", e => { if (e.target === box) close(); });
    addEventListener("keydown", e => {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    });
  }

  // ------------------------------------------------------------------ player
  let openPlayer = () => {};
  function player() {
    const box = $("[data-player]"), v = $("[data-player-video]"), title = $("[data-player-title]"), count = $("[data-player-count]");
    let job = null, n = 0;
    const show = () => {
      const c = job.clips[n];
      v.src = c.src; v.poster = c.poster; v.play().catch(() => {});
      title.innerHTML = `<b>${job.artist}</b>${job.title} · ${job.date}`;
      count.textContent = `${pad2(n + 1)} / ${pad2(job.clips.length)}`;
    };
    const close = () => { v.pause(); v.removeAttribute("src"); v.load(); box.hidden = true; lenis?.start(); };
    openPlayer = j => {
      job = j; n = 0; box.hidden = false; lenis?.stop(); show();
      if (!calm) gsap.fromTo(box, { clipPath: "inset(50% 0 50% 0)" }, { clipPath: "inset(0% 0 0% 0)", duration: 0.8, ease: "expo.inOut" });
    };
    const step = d => { n = (n + d + job.clips.length) % job.clips.length; show(); };
    $("[data-player-close]").addEventListener("click", close);
    $("[data-player-prev]").addEventListener("click", () => step(-1));
    $("[data-player-next]").addEventListener("click", () => step(1));
    v.addEventListener("ended", () => step(1));
    addEventListener("keydown", e => {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    });
  }

  // ------------------------------------------------------------------- intro
  function intro() {
    const done = () => { document.body.classList.remove("is-loading"); lenis?.start(); ScrollTrigger.refresh(); };
    if (calm) { $(".intro").remove(); done(); return; }
    const num = $(".intro-num"), t = { s: 0 };
    const tl = gsap.timeline();
    tl.to(t, { s: 3.2, duration: 1.6, ease: "power2.inOut", onUpdate: () => { num.textContent = tc(t.s); } })
      .to(".intro-tc, .intro-mark", { opacity: 0, duration: 0.3 })
      .to(".intro", { clipPath: "inset(0 0 100% 0)", duration: 1.1, ease: "expo.inOut", onComplete: () => $(".intro").remove() })
      .from(".hero-title .line > *", { yPercent: 110, duration: 1.3, stagger: 0.09, ease: "expo.out" }, "-=0.5")
      .from(".hero-foot, .top", { opacity: 0, duration: 1, stagger: 0.1 }, "-=0.9")
      .add(done, "-=0.8");
  }
})();
