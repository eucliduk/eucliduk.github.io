const CACHE_NAME = "euclid-ar-v20";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=20",
  "./app.js?v=20",
  "./manifest.webmanifest",
  "./Euclid_spacecraft.png",
  "./assets/euclid_wordmark_dark.png",
  "./assets/euclid_wordmark.png",
  "./Training%20Images/targets-small/IMG_2564.target.jpg",
  "./Training%20Images/targets-small/IMG_2565.target.jpg",
  "./Training%20Images/targets-small/IMG_2566.target.jpg",
  "./Training%20Images/targets-small/IMG_2567.target.jpg",
  "./Training%20Images/targets-small/IMG_2568.target.jpg"
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
