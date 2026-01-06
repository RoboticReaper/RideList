
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
        icon: '/logo_small.png', // Assuming this exists
        data: payload.data // Pass data through
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function (event) {
    console.log('[firebase-messaging-sw.js] Notification click Received.', event.notification.data);

    event.notification.close();

    const link = event.notification.data?.open_link || event.notification.data?.fcm_options?.link || event.notification.data?.link || '/';

    // This looks to see if the current is already open and focuses if it is
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function (windowClients) {
            // Check if there is already a window/tab open with the target URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(link) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(link);
            }
        })
    );
});
