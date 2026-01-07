import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { getMessaging } from 'firebase-admin/messaging';

const STORAGE_BUCKET = "ridelist-e9048.firebasestorage.app"

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: STORAGE_BUCKET
    });
}

export const adminAuth = getAuth();
export const adminMessaging = getMessaging(); // For FCM

export const bucket = getStorage().bucket(STORAGE_BUCKET);


