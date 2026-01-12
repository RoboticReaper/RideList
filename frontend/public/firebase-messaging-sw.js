self.__FIREBASE_SW_VERSION__ = 'v0.0.1';

// Scripts for firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase
// Note: These should match your client config, but hardcoded here for SW context
// (Env vars not available in SW usually without build step injection)
firebase.initializeApp({
    apiKey: "AIzaSyBQTf11FYB8WDQs4OjxWOcefFrrvPO8jb8",
    authDomain: "ridelist-e9048.firebaseapp.com",
    projectId: "ridelist-e9048",
    storageBucket: "ridelist-e9048.firebasestorage.app",
    messagingSenderId: "898027842198",
    appId: "1:898027842198:web:11fcf4b1bc24648c9970b7",
    measurementId: "G-1CWS12QM2J"
});

const messaging = firebase.messaging();


messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // Customize notification here if needed
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo_small.svg',
        data: payload.data // Pass data through
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const link = event.notification.data?.open_link || event.notification.data?.fcm_options?.link || event.notification.data?.link || '/';
    const urlToOpen = new URL(link, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function (windowClients) {
            // 1. Check if there is already a window/tab open with the EXACT target URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }

            // 2. If no exact match, but we have ANY client open, reuse it by navigating
            // This ensures PWA stays in one window rather than spawning new ones
            if (windowClients.length > 0) {
                const client = windowClients[0];
                if ('focus' in client && 'navigate' in client) {
                    client.focus();
                    return client.navigate(urlToOpen);
                }
            }

            // 3. If no client is open, open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
