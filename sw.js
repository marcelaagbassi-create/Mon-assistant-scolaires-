// ══════════════════════════════════════════
//  SERVICE WORKER — Mon Assistant Scolaires
//  Version 2.0.0
// ══════════════════════════════════════════

const CACHE_NAME   = 'mas-cache-v2';
const STATIC_CACHE = 'mas-static-v2';

const STATIC_ASSETS = [
  './mon-assistant-scolaires-2.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-32.png',
  './icon-16.png',
  './favicon.ico',
];

// ══ INSTALLATION ══
self.addEventListener('install', event => {
  console.log('[SW] Install v2.0');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS)
        .catch(e => console.warn('[SW] Cache partiel:', e))
      )
      .then(() => self.skipWaiting())
  );
});

// ══ ACTIVATION ══
self.addEventListener('activate', event => {
  console.log('[SW] Activate v2.0');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map(k => { console.log('[SW] Delete old cache:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

// ══ FETCH — Network First + Cache Fallback ══
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bypass : APIs externes, méthodes non-GET
  if(
    event.request.method !== 'GET' ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('corsproxy.io') ||
    url.hostname.includes('cloudinary.com')
  ) return;

  // Fonts — Cache First
  if(url.hostname.includes('fonts.g')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if(cached) return cached;
        return fetch(event.request).then(res => {
          if(res && res.status === 200){
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Assets statiques — Cache First
  if(STATIC_ASSETS.some(a => url.pathname.endsWith(a.replace('./',''))) ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(res => {
          if(res && res.status === 200){
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Tout le reste — Network First
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if(res && res.status === 200 && event.request.method === 'GET'){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then(cached => {
        if(cached) return cached;
        if(event.request.destination === 'document'){
          return caches.match('./mon-assistant-scolaires-2.html');
        }
      }))
  );
});

// ══ PUSH NOTIFICATIONS ══
self.addEventListener('push', event => {
  let data = { title: '🎓 Mon Assistant Scolaires', body: 'Tu as un rappel !', tag: 'mas' };
  try { if(event.data) data = { ...data, ...event.data.json() }; } catch(e){}

  const options = {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    image: data.image || undefined,
    vibrate: [100, 60, 100, 60, 200],
    tag: data.tag || 'mas-notif',
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: { url: data.url || './' },
    actions: [
      { action: 'open',  title: '📖 Ouvrir',  icon: './icon-32.png' },
      { action: 'close', title: 'Plus tard' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ══ NOTIFICATION CLICK ══
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if(event.action === 'close') return;

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Ouvrir dans un onglet existant si possible
        for(const client of clientList){
          if(client.url.includes('mon-assistant') && 'focus' in client){
            return client.focus();
          }
        }
        // Sinon ouvrir un nouvel onglet
        if(clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// ══ NOTIFICATION CLOSE (analytics future) ══
self.addEventListener('notificationclose', event => {
  console.log('[SW] Notification fermée:', event.notification.tag);
});

// ══ BACKGROUND SYNC (pour envoi différé) ══
self.addEventListener('sync', event => {
  if(event.tag === 'sync-rappels'){
    console.log('[SW] Background sync rappels');
  }
});

// ══ MESSAGE depuis l'app ══
self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING') self.skipWaiting();

  if(event.data?.type === 'SHOW_NOTIF'){
    const { title, body, tag } = event.data;
    self.registration.showNotification(title || '🎓 Mon Assistant Scolaires', {
      body: body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [100, 50, 100],
      tag: tag || 'mas-msg',
    });
  }
});
