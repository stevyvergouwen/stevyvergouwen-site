/* Algemene voorwaarden - opens as a panel on the same page. Any link with
   data-voorwaarden opens it; so does the address #algemene-voorwaarden. */
(() => {
  const HASH = "#algemene-voorwaarden";
  let panel = null, loaded = false, lastFocus = null;

  function build() {
    panel = document.createElement("div");
    panel.className = "vw";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Algemene voorwaarden");
    panel.setAttribute("data-lenis-prevent", "");
    panel.innerHTML = `
      <div class="vw-bar">
        <div class="vw-title">Stevy Vergouwen<span>Versie 3 oktober 2026</span></div>
        <div class="vw-actions"><button type="button" data-vw-print>Pdf</button><button type="button" data-vw-close>Close</button></div>
      </div>
      <div class="vw-scroll" data-vw-scroll><div class="vw-wrap">
        <div class="vw-head"><h2>Algemene<br>voorwaarden</h2></div>
        <div class="vw-body" data-vw-body></div>
      </div></div>`;
    document.body.appendChild(panel);
    panel.querySelector("[data-vw-close]").addEventListener("click", close);
    panel.querySelector("[data-vw-print]").addEventListener("click", () => window.print());
    addEventListener("keydown", e => { if (e.key === "Escape" && panel.classList.contains("is-open")) close(); });
  }

  function load() {
    if (loaded) return;
    loaded = true;
    const body = panel.querySelector("[data-vw-body]");
    fetch("/algemene-voorwaarden/inhoud.html").then(r => r.text()).then(html => {
      body.innerHTML = html;
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
    }).catch(() => { loaded = false; body.innerHTML = '<p class="vw-intro">Kon de voorwaarden niet laden. Mail info@shotbystevy.com.</p>'; });
  }

  function open() {
    if (!panel) build();
    load();
    lastFocus = document.activeElement;
    document.body.classList.add("vw-open");
    panel.classList.add("is-open");
    panel.querySelector("[data-vw-close]").focus({ preventScroll: true });
    if (location.hash !== HASH) history.replaceState(null, "", HASH);
  }

  function close() {
    panel.classList.remove("is-open");
    document.body.classList.remove("vw-open");
    if (location.hash === HASH) history.replaceState(null, "", location.pathname + location.search);
    lastFocus?.focus?.({ preventScroll: true });
  }

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-voorwaarden]");
    if (a) { e.preventDefault(); open(); }
  });
  const sync = () => { if (location.hash === HASH) open(); else if (panel?.classList.contains("is-open")) close(); };
  addEventListener("hashchange", sync);
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", sync); else sync();
})();
