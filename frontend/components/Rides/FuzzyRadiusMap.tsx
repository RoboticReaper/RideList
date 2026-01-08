import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Text } from '@mantine/core';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

interface HelperBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

interface FuzzyRadiusMapProps {
    bounds: HelperBounds;
    type?: 'pickup' | 'dropoff';
    userLocation?: { lat: number; lng: number } | null;
}

export function FuzzyRadiusMap({ bounds, type = 'pickup', userLocation }: FuzzyRadiusMapProps) {
    const { t } = useTranslation('common');
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const rectangleInstanceRef = useRef<google.maps.Rectangle | null>(null);
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

                // Calculate center from bounds
                const centerLat = (bounds.north + bounds.south) / 2;
                const centerLng = (bounds.east + bounds.west) / 2;

                // Initialize Map
                if (!mapInstanceRef.current) {
                    mapInstanceRef.current = new Map(mapRef.current, {
                        center: { lat: centerLat, lng: centerLng },
                        zoom: 13,
                        mapId: "DEMO_MAP_ID",
                        disableDefaultUI: true,
                        zoomControl: true,
                    });
                } else {
                    mapInstanceRef.current.setCenter({ lat: centerLat, lng: centerLng });
                }

                // Initialize/Update Rectangle (Obfuscated Zone)
                const rectangleOptions = {
                    strokeColor: type === 'pickup' ? '#228be6' : '#FD7E14',
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    fillColor: type === 'pickup' ? '#228be6' : '#FD7E14',
                    fillOpacity: 0.35,
                    map: mapInstanceRef.current,
                    bounds: bounds,
                };

                if (!rectangleInstanceRef.current) {
                    rectangleInstanceRef.current = new google.maps.Rectangle(rectangleOptions);
                } else {
                    rectangleInstanceRef.current.setOptions(rectangleOptions);
                }

                // Initialize/Update User Location Marker (if provided)
                if (userLocation) {
                    if (!markerInstanceRef.current) {
                        const pinElement = new google.maps.marker.PinElement({
                            background: "#228be6",
                            borderColor: "#1864ab",
                            glyphColor: "white",
                        });

                        markerInstanceRef.current = new AdvancedMarkerElement({
                            map: mapInstanceRef.current,
                            position: userLocation,
                            content: pinElement.element,
                            title: t('map.you'), // Or "Your Selection"
                        });
                    } else {
                        markerInstanceRef.current.position = userLocation;
                        markerInstanceRef.current.map = mapInstanceRef.current;
                    }
                } else {
                    if (markerInstanceRef.current) {
                        markerInstanceRef.current.map = null;
                    }
                }

                // Fit Bounds
                // We fit bounds to the obfuscated box so the user sees the general area
                const googleBounds = new google.maps.LatLngBounds(
                    { lat: bounds.south, lng: bounds.west },
                    { lat: bounds.north, lng: bounds.east }
                );

                // If user location is outside, include it
                if (userLocation) {
                    googleBounds.extend(userLocation);
                }

                mapInstanceRef.current.fitBounds(googleBounds);

            } catch (error) {
                console.error("Error loading Google Maps:", error);
            }
        };

        if (bounds) {
            initMap();
        }

        return () => {
            isMounted = false;
        };
    }, [bounds, type, userLocation]);

    if (!bounds) {
        return (
            <Box h={200} bg="gray.1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                <Text c="dimmed" size="sm">{t('map.unavailable')}</Text>
            </Box>
        );
    }

    return <div ref={mapRef} style={{ width: '100%', height: '250px', borderRadius: '8px' }} />;
}
