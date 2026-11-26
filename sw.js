const CACHE = "shot-sheet-v083";
const FILES = ["./index.html", "./styles.css", "./charge.js", "./pdf.js", "./app.js", "./manifest.json", "./icon.png", "./icon512.png", "./sert-wings.png", "./apple-touch-icon.png", "./favicon.svg"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.startsWith("shot-sheet-") && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () {
    return caches.match(e.request).then(function (r) { return r || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error()); });
  }));
});
