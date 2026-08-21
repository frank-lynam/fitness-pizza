/**
 * Fitness Pizza - Service Worker
 * Provides offline functionality and caching
 * Version 2.9.22
 */

const CACHE_NAME = 'fitness-pizza-v2.9.26';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/styles.css',
    '/css/mobile.css',
    '/css/charts.css',
    '/js/app.js',
    '/js/db.js',
    '/js/ui.js',
    '/js/api.js',
    '/js/utils/calorie-calc.js',
    '/js/utils/date-utils.js',
    '/js/utils/validation.js',
    '/js/utils/pi-controller.js',
    '/js/components/macro-form.js',
    '/js/components/workout-form.js',
    '/js/components/measurement-form.js',
    '/js/components/food-library.js',
    '/js/components/workout-library.js',
    '/js/components/photo-upload.js',
    '/js/components/chart-renderer.js',
    '/js/components/dashboard.js',
    '/js/easter-eggs.js',
    '/js/components/run-tracker.js',
    '/img/icons/icon-192.png',
    '/img/icons/icon-512.png',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('Service Worker: Skip waiting');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Cache failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Claiming clients');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Network-only for API calls (Claude API)
    if (url.hostname === 'api.anthropic.com') {
        event.respondWith(fetch(request));
        return;
    }

    // Cache-first strategy for everything else
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version
                    return cachedResponse;
                }

                // Not in cache, fetch from network
                return fetch(request)
                    .then((response) => {
                        // Don't cache if not a success response
                        if (!response || response.status !== 200 || response.type === 'error') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Cache the new resource
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(request, responseToCache);
                            });

                        return response;
                    })
                    .catch((error) => {
                        console.error('Service Worker: Fetch failed', error);

                        // Return offline page if available
                        if (request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }

                        throw error;
                    });
            })
    );
});

// Message event - handle messages from the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
