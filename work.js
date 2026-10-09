/* Work pages: the sticky bar line and the photo viewer */
(() => {
  const bar = () => document.body.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", bar, { passive: true }); bar();

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
