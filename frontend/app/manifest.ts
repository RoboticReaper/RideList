import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'RideList',
        short_name: 'RideList',
        description: 'Carpooling made easy.',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
            {
                src: '/logo_small.svg',
                sizes: '192x192',
                type: 'image/svg',
            },
            {
                src: '/logo.svg',
                sizes: '512x512',
                type: 'image/svg',
            },
        ],
    };
}
