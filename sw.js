// ══════════════════════════════════════════
//  SERVICE WORKER — Mon Assistant Scolaires
//  Version 1.0.0
// ══════════════════════════════════════════

const CACHE_NAME = 'mas-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/mon-assistant-scolaires-2.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;900&display=swap'
];

// ── INSTALLATION : mise en cache des assets ──
self.addEventListener('install', event => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Mise en cache des assets');
      return cache.addAll(ASSETS_TO_CACHE.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Certains assets non mis en cache:', err));
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATION : nettoyage des anciens caches ──
self.addEventListener('activate', event => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Suppression ancien cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH : stratégie Network First avec fallback cache ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les appels API Anthropic et Firebase (toujours réseau)
  if (
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('corsproxy.io') ||
    event.request.method !== 'GET'
  ) {
    return; // laisser passer sans interception
  }

  // Fonts Google — Cache First
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Autres assets — Network First avec fallback cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback pour les pages HTML
          if (event.request.destination === 'document') {
            return caches.match('/mon-assistant-scolaires-2.html');
          }
        });
      })
  );
});

// ── PUSH NOTIFICATIONS (pour rappels futurs) ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Mon Assistant Scolaires';
  const options = {
    body: data.body || 'Tu as un rappel !',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Ouvrir' },
      { action: 'close', title: 'Fermer' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});
