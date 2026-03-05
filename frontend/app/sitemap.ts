
import { MetadataRoute } from 'next';
import { pool } from '@/app/api/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const BASE_URL = 'https://www.ridelist.app';

    // 1. Fetch bookable trips from database
    const publicPages = await pool.query(
        `SELECT id, created_at, modified_at
     FROM trips WHERE status = 'bookable'
     ORDER BY created_at DESC LIMIT 30000`
    );
    // 2. Map them into the format Next.js expects
    const dynamicUrls: MetadataRoute.Sitemap = publicPages.rows.map((page) => ({
        url: `${BASE_URL}/rides/${page.id}`,
        lastModified: page.modified_at ? new Date(page.modified_at) : new Date(page.created_at),
        changeFrequency: 'daily' as const,
        priority: 0.8,
    }));

    // 3. Return static routes + dynamic routes
    return [
        {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 1,
        },
        {
            url: `${BASE_URL}/search`,
            changeFrequency: 'daily' as const,
            priority: 0.9,
        },
        {
            url: `${BASE_URL}/newRide`,
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        },
        {
            url: `${BASE_URL}/how`,
            changeFrequency: 'monthly' as const,
            priority: 0.6,
        },
        {
            url: `${BASE_URL}/trustsafety`,
            changeFrequency: 'monthly' as const,
            priority: 0.5,
        },
        {
            url: `${BASE_URL}/auth`,
            changeFrequency: 'monthly' as const,
            priority: 0.5,
        },
        {
            url: `${BASE_URL}/privacy`,
            changeFrequency: 'monthly' as const,
            priority: 0.4,
        },
        {
            url: `${BASE_URL}/tos`,
            changeFrequency: 'monthly' as const,
            priority: 0.4,
        },
        ...dynamicUrls,
    ];
}