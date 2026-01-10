
import { PoolClient } from 'pg';
import { useServerTranslation } from '@/app/i18n/server';
import { pool } from '@/app/api/lib/db';

export async function getUserLanguage(userId: string | null, client?: PoolClient): Promise<string> {
    if (!userId) return 'en';
    const db = client || pool;
    try {
        const res = await db.query('SELECT language FROM settings_global WHERE id = $1', [userId]);
        return res.rows[0]?.language || 'en';
    } catch (error) {
        console.warn('Failed to fetch user language, defaulting to en:', error);
        return 'en';
    }
}

export async function getTranslationForUser(userId: string | null, client?: PoolClient) {
    const lang = await getUserLanguage(userId, client);
    const { t } = await useServerTranslation(lang, 'common');
    return t;
}

export async function getTranslation(lang: string = 'en') {
    const { t } = await useServerTranslation(lang, 'common');
    return t;
}
