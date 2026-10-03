/* Algemene voorwaarden - opens as a panel on the same page. Any link with
   data-voorwaarden opens it; so does the address #algemene-voorwaarden. */
(() => {
  const HASHES = ["#terms", "#algemene-voorwaarden"];
  const L = () => (window.taal ? window.taal.get() : "en");
  const T = (k, en) => (window.taal ? window.taal.T(k, en) : en);
  const myHash = () => "#terms";
  const isHash = () => HASHES.includes(location.hash);
  let panel = null, loaded = false, lastFocus = null;

  function build() {
    panel = document.createElement("div");
    panel.className = "vw";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Terms and conditions");
    panel.setAttribute("data-lenis-prevent", "");
    panel.innerHTML = `
      <div class="vw-bar">
        <div class="vw-title">Stevy Vergouwen<span data-i18n="vwVersion">Version October 2026</span></div>
        <div class="vw-actions"><span class="vw-lang" role="group" aria-label="Language of the text"><button type="button" data-vw-lang="en">EN</button><i>/</i><button type="button" data-vw-lang="nl">NL</button></span><button type="button" data-vw-print data-i18n="pdf">Pdf</button><button type="button" data-vw-close data-i18n="close">Close</button></div>
      </div>
      <div class="vw-scroll" data-vw-scroll><div class="vw-wrap">
        <div class="vw-head"><h2 data-i18n="vwHead">Terms &amp;<br>conditions</h2></div>
        <div class="vw-body" data-vw-body></div>
      </div></div>`;
    document.body.appendChild(panel);
    window.taal?.apply(panel);
    const mark = () => panel.querySelectorAll("[data-vw-lang]").forEach(b => b.classList.toggle("is-on", b.dataset.vwLang === L()));
    panel.querySelectorAll("[data-vw-lang]").forEach(b => b.addEventListener("click", () => window.taal?.set(b.dataset.vwLang)));
    addEventListener("taalchange", mark); mark();
    panel.querySelector("[data-vw-close]").addEventListener("click", close);
    panel.querySelector("[data-vw-print]").addEventListener("click", () => window.print());
    addEventListener("keydown", e => { if (e.key === "Escape" && panel.classList.contains("is-open")) close(); });
  }

  function load() {
    if (loaded) return;
    loaded = true;
    const body = panel.querySelector("[data-vw-body]");
    fetch(L() === "nl" ? "/algemene-voorwaarden/inhoud.nl.html" : "/algemene-voorwaarden/inhoud.en.html").then(r => r.text()).then(html => {
      body.innerHTML = html;
      body.lang = L();
      const sc = panel.querySelector("[data-vw-scroll]");
      const links = [...body.querySelectorAll(".vw-toc a")];
      links.forEach(a => a.addEventListener("click", e => {
        e.preventDefault();
        const t = body.querySelector(a.getAttribute("href"));
        if (t) sc.scrollTo({ top: sc.scrollTop + t.getBoundingClientRect().top - sc.getBoundingClientRect().top - 24, behavior: "smooth" });
      }));
      if ("IntersectionObserver" in window) {
        const byId = Object.fromEntries(links.map(a => [a.getAttribute("href").slice(1), a]));
        const io = new IntersectionObserver(es => es.forEach(en => {
          if (!en.isIntersecting) return;
          links.forEach(a => a.removeAttribute("aria-current"));
          byId[en.target.id]?.setAttribute("aria-current", "true");
        }), { root: sc, rootMargin: "-10% 0px -80% 0px" });
        body.querySelectorAll(".article").forEach(s => io.observe(s));
      }
    }).catch(() => { loaded = false; body.innerHTML = '<p class="vw-intro">Could not load the terms / Kon de voorwaarden niet laden. info@shotbystevy.com</p>'; });
  }

  function open() {
    if (!panel) build();
    load();
    lastFocus = document.activeElement;
    document.body.classList.add("vw-open");
    panel.classList.add("is-open");
    panel.querySelector("[data-vw-close]").focus({ preventScroll: true });
    if (location.hash !== myHash()) history.replaceState(null, "", myHash());
  }

  function close() {
    panel.classList.remove("is-open");
    document.body.classList.remove("vw-open");
    if (isHash()) history.replaceState(null, "", location.pathname + location.search);
    lastFocus?.focus?.({ preventScroll: true });
  }

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-voorwaarden]");
    if (a) { e.preventDefault(); open(); }
  });
  const sync = () => { if (isHash()) open(); else if (panel?.classList.contains("is-open")) close(); };
  addEventListener("hashchange", sync);
  addEventListener("taalchange", () => {
    if (!panel) return;
    loaded = false;
    load();
    if (isHash()) history.replaceState(null, "", myHash());
  });
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", sync); else sync();
})();
