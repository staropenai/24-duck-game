const CACHE_NAME = "24-duck-game-v36-slogan-20260627";
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./support.html",
  "./style_v33.css",
  "./app_v33.js",
  "./family_card_assets.js",
  "./twenty_four_bruteforce_catalog_v19.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/family_cards/family_card_v02_01.jpg",
  "./assets/family_cards/family_card_v02_02.jpg",
  "./assets/family_cards/family_card_v02_03.jpg",
  "./assets/family_cards/family_card_v02_04.jpg",
  "./assets/family_cards/family_card_v02_05.jpg",
  "./assets/family_cards/family_card_v02_06.jpg",
  "./assets/family_cards/family_card_v02_07.jpg",
  "./assets/family_cards/family_card_v02_08.jpg",
  "./assets/family_cards/family_card_v02_09.jpg",
  "./assets/family_cards/family_card_v02_10.jpg",
  "./assets/family_cards/family_card_v02_11.jpg",
  "./assets/family_cards/family_card_v02_12.jpg",
  "./assets/family_cards/family_card_v02_13.jpg",
  "./assets/family_cards/family_card_v02_14.jpg",
  "./assets/family_cards/family_card_v02_15.jpg",
  "./assets/family_cards/family_card_v02_16.jpg",
  "./assets/family_cards/family_card_v02_17.jpg",
  "./assets/family_cards/family_card_v02_18.jpg",
  "./assets/family_cards/family_card_v02_19.jpg",
  "./assets/family_cards/family_card_v02_20.jpg",
  "./assets/family_cards/family_card_v02_21.jpg",
  "./assets/family_cards/family_card_v02_22.jpg",
  "./assets/family_cards/family_card_v02_23.jpg",
  "./assets/family_cards/family_card_v02_24.jpg",
  "./assets/family_cards/family_card_v02_25.jpg",
  "./assets/family_cards/family_card_v02_26.jpg",
  "./assets/family_cards/family_card_v02_27.jpg",
  "./assets/family_cards/family_card_v02_28.jpg",
  "./assets/family_cards/family_card_v02_29.jpg",
  "./assets/family_cards/family_card_v02_30.jpg",
  "./assets/family_cards/family_card_v02_31.jpg",
  "./assets/family_cards/family_card_v02_32.jpg",
  "./assets/family_cards/family_card_v02_33.jpg",
  "./assets/family_cards/family_card_v02_34.jpg",
  "./assets/family_cards/family_card_v02_35.jpg",
  "./assets/family_cards/family_card_v02_36.jpg",
  "./assets/family_cards/family_card_v02_37.jpg",
  "./assets/family_cards/family_card_v02_38.jpg",
  "./assets/family_cards/family_card_v02_39.jpg",
  "./assets/family_cards/family_card_v02_40.jpg",
  "./assets/family_cards/family_card_v02_41.jpg",
  "./assets/family_cards/family_card_v02_42.jpg",
  "./assets/family_cards/family_card_v02_43.jpg",
  "./assets/family_cards/family_card_v02_44.jpg",
  "./assets/family_cards/family_card_v02_45.jpg",
  "./assets/family_cards/family_card_v02_46.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
