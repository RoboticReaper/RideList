import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const firebaseAdminServiceAccount = require('./ridelist-firebase-admin-service-account.json');

if (!getApps().length) {
    initializeApp({
        credential: cert(firebaseAdminServiceAccount),
    });
}

export const adminAuth = getAuth();
export const adminMessaging = getMessaging(); // For FCM
import { getMessaging } from 'firebase-admin/messaging';


