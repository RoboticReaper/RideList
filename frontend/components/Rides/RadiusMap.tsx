import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader as MantineLoader, Box, Text } from '@mantine/core';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

interface RadiusMapProps {
    lat: number;
    lng: number;
    radiusMeters: number;
    type?: 'pickup' | 'dropoff';
}

export function RadiusMap({ lat, lng, radiusMeters, type = 'pickup' }: RadiusMapProps) {
    const { t } = useTranslation('common');
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const circleInstanceRef = useRef<google.maps.Circle | null>(null);
    const markerInstanceRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

    useEffect(() => {
        let isMounted = true;

        const initMap = async () => {
            setOptions({
                key: process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!,
                v: 'weekly',
                libraries: ['maps', 'marker']
            });

            try {
                const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
                const { AdvancedMarkerElement } = await importLibrary('marker') as google.maps.MarkerLibrary;

                if (!isMounted || !mapRef.current) return;

                // Initialize Map
                if (!mapInstanceRef.current) {
                    mapInstanceRef.current = new Map(mapRef.current, {
                        center: { lat, lng },
                        zoom: 13,
                        mapId: "DEMO_MAP_ID", // Required for AdvancedMarkerElement
                        disableDefaultUI: true,
                        zoomControl: true,
                    });
                } else {
                    mapInstanceRef.current.setCenter({ lat, lng });
                }

                // Initialize/Update Circle
                const circleOptions = {
                    strokeColor: type === 'pickup' ? '#228be6' : '#FD7E14',
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    fillColor: type === 'pickup' ? '#228be6' : '#FD7E14',
                    fillOpacity: 0.35,
                    map: mapInstanceRef.current,
                    center: { lat, lng },
                    radius: radiusMeters,
                };

                if (!circleInstanceRef.current) {
                    circleInstanceRef.current = new google.maps.Circle(circleOptions);
                } else {
                    circleInstanceRef.current.setOptions(circleOptions);
                }

                // Initialize/Update Marker (AdvancedMarkerElement)
                if (!markerInstanceRef.current) {
                    markerInstanceRef.current = new AdvancedMarkerElement({
                        map: mapInstanceRef.current,
                        position: { lat, lng },
                        title: type === 'pickup' ? t('map.pickup') : t('map.dropoff'),
                    });
                } else {
                    // AdvancedMarkerElement properties might differ slightly in update logic
                    markerInstanceRef.current.position = { lat, lng };
                }

                // Fit Bounds
                const bounds = circleInstanceRef.current.getBounds();
                if (bounds) {
                    mapInstanceRef.current.fitBounds(bounds);
                }

            } catch (error) {
                console.error("Error loading Google Maps:", error);
            }
        };

        if (lat && lng) {
            initMap();
        }

        return () => {
            isMounted = false;
        };
    }, [lat, lng, radiusMeters, type]);

    if (!lat || !lng) {
        return (
            <Box h={200} bg="gray.1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                <Text c="dimmed" size="sm">{t('map.unavailable')}</Text>
            </Box>
        );
    }

    return <div ref={mapRef} style={{ width: '100%', height: '250px', borderRadius: '8px' }} />;
}
