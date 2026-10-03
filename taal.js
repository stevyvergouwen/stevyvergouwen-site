/* Language. The site's own titles, headings and buttons are always English.
   The terms are complete in one language: everything inside the terms panel
   (title, headings, buttons, text) follows the EN / NL switch in the header.
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

  function mount() {
    const css = document.createElement("style");
    css.textContent = `.taal{display:inline-flex;gap:2px;font:inherit;letter-spacing:.14em;text-transform:uppercase}
.taal button{font:inherit;color:#8b8880;background:none;border:0;padding:0 4px;cursor:pointer;letter-spacing:inherit}
.taal button:hover,.taal button.is-on{color:#ebe7e0}
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
    apply();
  }

  window.taal = { get, set, T, apply, NL };
  window.T = T;
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount); else mount();
})();
