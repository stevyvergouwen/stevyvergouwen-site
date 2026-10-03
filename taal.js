/* Language. The site's own titles, headings and buttons are always English.
   The terms are complete in one language: everything inside the terms panel
   (title, headings, buttons, text) follows the EN / NL switch inside the terms panel.
   Elements with data-i18n="key" are swapped; the choice is remembered. */
(() => {
  const NL = {
    vwHead: 'Algemene<br>voorwaarden', vwVersion: 'Versie oktober 2026', pdf: 'Pdf', close: 'Sluiten'
  };
  const saved = (() => { try { return localStorage.getItem("taal"); } catch (e) { return null; } })();
  let lang = saved || ((navigator.language || "en").toLowerCase().startsWith("nl") ? "nl" : "en");
  const orig = new WeakMap();
  const get = () => lang;
  const T = (key, en) => en; // the site's own labels stay English

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(el => {
      if (!orig.has(el)) orig.set(el, el.innerHTML);
      const k = el.dataset.i18n;
      el.innerHTML = (lang === "nl" && NL[k] != null) ? NL[k] : orig.get(el);
    });
    document.querySelectorAll("[data-lang], [data-vw-lang]").forEach(b => b.classList.toggle("is-on", (b.dataset.lang || b.dataset.vwLang) === lang));
  }

  function set(l) {
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem("taal", l); } catch (e) {}
    apply();
    dispatchEvent(new CustomEvent("taalchange", { detail: l }));
  }

  function mount() { apply(); }

  window.taal = { get, set, T, apply, NL };
  window.T = T;
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount); else mount();
})();
