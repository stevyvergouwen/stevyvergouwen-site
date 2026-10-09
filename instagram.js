/* Latest Instagram posts: reads a JSON feed (behold.so style) set on the section's data-feed and shows the newest as a square grid.
   No feed set = the section stays hidden. Nothing is stored or sent from the visitor's browser except the feed request itself. */
(() => {
  const sec = document.querySelector(".igfeed");
  if (!sec || !sec.dataset.feed) return;
  const grid = sec.querySelector(".igg");
  fetch(sec.dataset.feed, { cache: "force-cache" }).then(r => (r.ok ? r.json() : Promise.reject())).then(d => {
    const posts = (d.posts || d.items || d || []).slice(0, 6);
    if (!posts.length) return;
    const pick = p => (p.sizes && (p.sizes.medium || p.sizes.large || p.sizes.small) || {}).mediaUrl || p.thumbnailUrl || p.mediaUrl || p.url;
    posts.forEach((p, i) => {
      const src = pick(p), link = p.permalink || p.link;
      if (!src || !link) return;
      const a = document.createElement("a");
      a.href = link; a.target = "_blank"; a.rel = "noopener";
      a.setAttribute("aria-label", (p.caption || "Instagram post " + (i + 1)).slice(0, 120));
      const img = document.createElement("img");
      img.src = src; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      a.appendChild(img); grid.appendChild(a);
    });
    if (grid.children.length) sec.hidden = false;
  }).catch(() => {});
})();
