
/**
 * Calculates the Great Circle distance (Haversine formula) between two points.
 * Returns distance in meters.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Snaps a coordinate to a grid to hide exact location.
 * @param lat - Real Latitude
 * @param lng - Real Longitude
 * @param precision - Grid size in degrees (default 0.002 is ~220m)
 */
export function getFuzzyLocation(lat: number, lng: number, precision = 0.002) {
    // We use a simple rounding method to snap to the nearest grid line
    const fuzzyLat = Math.round(lat / precision) * precision;
    const fuzzyLng = Math.round(lng / precision) * precision;

    return {
        lat: Number(fuzzyLat.toFixed(6)), // Prevent float precision artifacts
        lng: Number(fuzzyLng.toFixed(6))
    };
}

/**
 * Simple pseudo-random number generator (Mulberry32) for deterministic results
 * based on a seed string.
 */
function seededRandom(seed: string) {
    let t = 0;
    for (let i = 0; i < seed.length; i++) {
        t += seed.charCodeAt(i);
    }
    // Add some large prime mixing
    let a = t + 0x6D2B79F5;

    return function () {
        a = Math.imul(a ^ (a >>> 15), a | 1);
        a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
        return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
    }
}

/**
 * Generates a random bounding box that includes the driver's radius
 * but is NOT centered on the driver.
 * Uses a seed (tripId) to ensure deterministic bounds for the same trip.
 */
export function createObfuscatedBounds(
    driverLat: number,
    driverLng: number,
    radiusMeters: number,
    seed: string
) {
    const random = seededRandom(seed); // Initialize PRNG with trip ID

    // 1. Convert radius meters to approximate degrees
    // 1 deg latitude ~= 111,320 meters
    const latDegrees = radiusMeters / 111320;

    // 1 deg longitude changes based on latitude (cosine correction)
    const lngDegrees = radiusMeters / (111320 * Math.cos(driverLat * (Math.PI / 180)));

    // 2. Add a "Safety Padding" (e.g., 50% extra space) to the box
    // This ensures the box is big enough to be shifted around
    const latPadding = latDegrees * 0.5;
    const lngPadding = lngDegrees * 0.5;

    // 3. Generate Random Offsets
    // We want the driver to be *somewhere* in the box, but not the center.
    // Randomly deciding how much extra space is North vs South, East vs West.
    const randomLatShift = random(); // 0.0 to 1.0 (deterministic)
    const randomLngShift = random();

    // 4. Calculate Bounds
    // The "North" bound is the driver's location + radius + (some random portion of padding)
    const north = driverLat + latDegrees + (latPadding * randomLatShift);
    const south = driverLat - latDegrees - (latPadding * (1 - randomLatShift));

    const east = driverLng + lngDegrees + (lngPadding * randomLngShift);
    const west = driverLng - lngDegrees - (lngPadding * (1 - randomLngShift));

    return {
        north,
        south,
        east,
        west
    };
}

/**
 * Calculates distance between two points in meters (Haversine formula).
 * Essential for checking if the picked point is actually close enough.
 */
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const toRad = (deg: number) => deg * (Math.PI / 180);

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Validates a pickup location against the driver's real constraints.
 * Includes a tolerance buffer for "Fuzzy" UI mismatches.
 */
export function isPickupValid(
    driverLat: number,
    driverLng: number,
    pickupLat: number,
    pickupLng: number,
    maxRadiusMeters: number,
    toleranceMeters = 150 // Allow 150m error margin for grid snapping
) {
    const distance = getDistanceMeters(driverLat, driverLng, pickupLat, pickupLng);

    return {
        isValid: distance <= (maxRadiusMeters + toleranceMeters),
        distance: Math.round(distance),
        limit: maxRadiusMeters
    };
}
