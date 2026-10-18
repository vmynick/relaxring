/* RelaxRing — service worker: az app otthonon kívül, offline is elindul.
   A __VERSION__ helyére az install.sh ír időbélyeget, így minden frissítés új gyorsítótárat kap. */
const CACHE = "relaxring-__VERSION__";
const SHELL = ["./", "index.html", "fonts.css", "manifest.json", "favicon-32.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "fonts/inter-latin.woff2", "fonts/inter-latin-ext.woff2", "voice/voices.json"];   // a felvett hangok mp3-jai első használatkor kerülnek a gyorsítótárba

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Azonnal a gyorsítótárból indul, közben a háttérben frissít (ha elérhető a szerver).
// Az oldalbetöltés kulcsa a cím ?… nélkül, így a gyorsindítás (?r=478) offline is ugyanazt az oldalt kapja.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  const key = e.request.mode === "navigate" ? e.request.url.split("?")[0] : e.request;
  e.respondWith(
    caches.match(key).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
