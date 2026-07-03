/* Service worker Krontrol — PWA installable + notifications push.
   v2 : purge tous les caches à l'activation (remplace un éventuel ancien
   service worker qui servirait des fichiers périmés). */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cles = await caches.keys();
      await Promise.all(cles.map((c) => caches.delete(c)));
      await self.clients.claim();
    })()
  );
});

// Notifications push (affectation publiée, rappel 19h, acompte traité, récap dispo)
self.addEventListener('push', (event) => {
  let data = { title: 'Krontrol', body: '', url: '/app' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    data.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
