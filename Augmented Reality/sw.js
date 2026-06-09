const CACHE_NAME = "euclid-ar-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=8",
  "./app.js?v=8",
  "./manifest.webmanifest",
  "./Euclid_spacecraft.png",
  "./Training%20Images/targets/IMG_2564.DNG.png",
  "./Training%20Images/targets/IMG_2565.DNG.png",
  "./Training%20Images/targets/IMG_2566.DNG.png",
  "./Training%20Images/targets/IMG_2567.DNG.png",
  "./Training%20Images/targets/IMG_2568.DNG.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => (
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => (
      cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
    ))
  );
});
