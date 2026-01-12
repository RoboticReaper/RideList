import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'RideList',
        short_name: 'RideList',
        description: 'Verified carpooling for the UIUC community.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#4F8CC9',

        icons: [
            // Android / PWA icons
            {
                src: '/icon-android-192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/icon-android-512.png',
                sizes: '512x512',
                type: 'image/png',
            },

            {
                src: '/android-maskable-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable',
            },
            {
                src: '/android-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    };
}
