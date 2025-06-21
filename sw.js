const CACHE_NAME = 'kalendar-reminder-beta1-v1';
const urlsToCache = [
    '/',
    'index.html',
    'style.css',
    'app.js',
    'manifest.json',
    'icon-72x72.png',
    'icon-192x192.png',
    'icon-512x512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aberto');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Removendo cache antigo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    console.log('Service Worker ativado');
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    console.log('Retornando do cache:', event.request.url);
                    return response;
                }
                console.log('Buscando na rede:', event.request.url);
                return fetch(event.request);
            })
    );
});

self.addEventListener('push', event => {
    console.log('Notificação push recebida');
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: 'icon-192x192.png',
        badge: 'icon-72x72.png',
        vibrate: [200, 100, 200]
    };
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', event => {
    console.log('Notificação clicada');
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
