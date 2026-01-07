export function extractPublicArea(geocodeResult: any) {
    console.log(geocodeResult);
    let components = null;
    if (Array.isArray(geocodeResult.results)) {
        components = geocodeResult.results[0].address_components;
    } else {
        components = geocodeResult.results.address_components;
    }
    console.log(components)

    const get = (type: string) =>
        components.find((c: any) => c.types.includes(type))?.long_name;

    const neighborhood =
        get('neighborhood') ||
        get('sublocality') ||
        get('sublocality_level_1');

    const city = get('locality');
    const state = get('administrative_area_level_1');

    if (neighborhood && city) {
        return `${neighborhood}, ${city}`;
    }

    if (city && state) {
        return `${city}, ${state}`;
    }

    if (city) return city;

    return state || 'Nearby';
}
