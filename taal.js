/* Language. Titles, headings and buttons are always English; only running
   body text (the terms) can switch to Dutch. This file keeps the choice
   (remembered, default from the browser) and announces changes. */
(() => {
  const saved = (() => { try { return localStorage.getItem("taal"); } catch (e) { return null; } })();
  let lang = saved || ((navigator.language || "en").toLowerCase().startsWith("nl") ? "nl" : "en");
  const get = () => lang;
  const set = l => {
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem("taal", l); } catch (e) {}
    dispatchEvent(new CustomEvent("taalchange", { detail: l }));
  };
  const T = (key, en) => en; // labels stay English
  window.taal = { get, set, T, apply() {} };
  window.T = T;
})();
