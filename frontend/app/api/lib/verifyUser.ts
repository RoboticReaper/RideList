import { adminAuth } from './firebase-admin';

export type VerifiedUser = {
    uid: string;
    email: string | null;
    emailVerified: boolean;
};

export async function verifyUserFromRequest(
    authHeader?: string
): Promise<VerifiedUser> {
    if (!authHeader?.startsWith('Bearer ')) {
        throw new Error('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);

    const decoded = await adminAuth.verifyIdToken(token);

    return {
        uid: decoded.uid,
        email: decoded.email ?? null,
        emailVerified: decoded.email_verified ?? false,
    };
}
