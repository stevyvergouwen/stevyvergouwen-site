/* English / Nederlands. English lives in the HTML itself; Dutch lives here.
   Any element with data-i18n="key" is swapped; data-i18n-attr="attr:key" does
   the same for an attribute. The choice is remembered. T(key, english) gives
   a string to code that builds markup. */
(() => {
  const NL = {
    // holding page
    tagline: 'Gemaakt voor de nacht.<br><span>Gebouwd voor het merk.</span>',
    sub: 'Visuals voor artiesten, events en merken. Portfolio binnenkort online.',
    desc: 'Gemaakt voor de nacht. Gebouwd voor het merk. Visuals voor artiesten, events en merken - Stevy Vergouwen, Breda.',
    terms: 'Algemene voorwaarden', termsUrl: '/algemene-voorwaarden/',
    // portfolio
    work: 'Werk', photo: 'Foto', shop: 'Shop', about: 'Over', book: 'Boeken',
    grid: 'Raster', folders: 'Mappen', soon: 'Binnenkort', scroll: 'Scroll',
    all: 'Alles', artists: 'Artiesten', job: 'job', jobs: 'jobs', clips: 'clips',
    film: 'Film', still: 'Beeld', play: 'Afspelen', open: 'Openen', mail: 'Mail',
    prints: 'Prints', printsWhat: "Foto's op papier",
    lutsWhat: 'De grade uit deze films',
    presetsWhat: 'Lightroom, voor de nacht',
    tutorialsWhat: 'Events filmen en monteren',
    toolsWhat: 'Gemaakt voor de montage',
    tutorials: 'Tutorials', tools: 'Tools', presets: 'Presets',
    bookBig: 'Boek een nacht, een shoot, een video <span>→</span>',
    aboutText: 'Gemaakt voor de nacht.<br>Gebouwd voor het merk.',
    footer: 'Visuals voor artiesten, events en merken · Breda',
    close: 'Sluiten', view: 'Bekijk', noMedia: 'Nog geen media - draai tools/maak_media.py', prevClip: 'Vorige clip', nextClip: 'Volgende clip', prevPhoto: 'Vorige foto', nextPhoto: 'Volgende foto', prev: 'Vorig', next: 'Volgend',
    events: 'Events', 'commercial & brands': 'Commercieel & merken', 'portraits & presskits': "Portretten & presskits",
    // terms panel
    vwTitle: 'Algemene voorwaarden', vwHead: 'Algemene<br>voorwaarden', vwVersion: 'Versie 3 oktober 2026', pdf: 'Pdf'
  };
  const saved = (() => { try { return localStorage.getItem("taal"); } catch (e) { return null; } })();
  let lang = saved || ((navigator.language || "en").toLowerCase().startsWith("nl") ? "nl" : "en");
  const orig = new WeakMap(), origAttr = new WeakMap();

  const T = (key, en) => (lang === "nl" && NL[key] != null) ? NL[key] : en;
  const get = () => lang;

  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll("[data-i18n]").forEach(el => {
      if (!orig.has(el)) orig.set(el, el.innerHTML);
      const k = el.dataset.i18n;
      el.innerHTML = (lang === "nl" && NL[k] != null) ? NL[k] : orig.get(el);
    });
    root.querySelectorAll("[data-i18n-attr]").forEach(el => {
      const keep = origAttr.get(el) || {};
      origAttr.set(el, keep);
      el.dataset.i18nAttr.split(";").forEach(pair => {
        const [attr, k] = pair.split(":");
        if (!(attr in keep)) keep[attr] = el.getAttribute(attr) || "";
        el.setAttribute(attr, (lang === "nl" && NL[k] != null) ? NL[k] : keep[attr]);
      });
    });
    document.querySelectorAll(".taal button").forEach(b => b.classList.toggle("is-on", b.dataset.lang === lang));
  }

  function set(l) {
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem("taal", l); } catch (e) {}
    apply();
    dispatchEvent(new CustomEvent("taalchange", { detail: l }));
    // pages that build their markup from data (the portfolio) rebuild by reloading
    if (document.querySelector("[data-grid]")) location.reload();
  }

  function mount() {
    const css = document.createElement("style");
    css.textContent = `.taal{display:inline-flex;gap:2px;font:inherit;letter-spacing:.14em;text-transform:uppercase}
.taal button{font:inherit;color:#8b8880;background:none;border:0;padding:0 4px;cursor:pointer;letter-spacing:inherit}
.taal button:hover,.taal button.is-on{color:#ebe7e0}
.taal.is-float{position:fixed;top:clamp(16px,3vw,40px);right:clamp(16px,3vw,40px);z-index:110}
.taal span{color:#2c2b29}`;
    document.head.appendChild(css);
    const box = document.createElement("div");
    box.className = "taal";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Language");
    box.innerHTML = '<button type="button" data-lang="en">EN</button><span>/</span><button type="button" data-lang="nl">NL</button>';
    box.addEventListener("click", e => { const b = e.target.closest("button[data-lang]"); if (b) set(b.dataset.lang); });
    const slot = document.querySelector(".top-right") || document.querySelector(".top");
    if (slot && slot.classList.contains("top-right")) slot.insertBefore(box, slot.firstChild);
    else if (slot) slot.appendChild(box);
    else { box.classList.add("is-float"); document.body.appendChild(box); }
    apply();
  }

  window.taal = { T, get, set, apply, NL };
  window.T = T;
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount); else mount();
})();
