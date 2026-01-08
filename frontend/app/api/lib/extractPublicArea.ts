export function extractPublicArea(geocodeResult: any) {
    console.log(geocodeResult);
    // 1. Normalization: Handle both "wrapped" API responses and "unwrapped" objects
    let result = geocodeResult;

    // If the input has a 'results' array (Standard Google API structure), unwrap it.
    if (geocodeResult?.results && Array.isArray(geocodeResult.results)) {
        result = geocodeResult.results[0];
    }

    // 2. Safety Check
    if (!result?.address_components) {
        console.warn("Missing address_components", result);
        return 'Nearby';
    }

    const components = result.address_components;

    // 3. Helper with Strict Allow List
    const get = (type: string) =>
        components.find((c: any) => c.types?.includes(type))?.long_name;

    // 4. Extraction Hierarchy
    // "Downtown" in your log is a 'neighborhood'
    const neighborhood = get('neighborhood');

    // "Boston" is 'locality'
    const city = get('locality') || get('postal_town');

    // "Suffolk County" is 'administrative_area_level_2'
    const county = get('administrative_area_level_2');

    // "Massachusetts" is 'administrative_area_level_1'
    const state = get('administrative_area_level_1');

    const township = get('administrative_area_level_3');
    const sublocality = get('sublocality') || get('sublocality_level_1');

    // 5. Logic to build the string

    // PRIORITY 1: Neighborhood + City (e.g. "Downtown, Boston")
    if (neighborhood && city) {
        return `${neighborhood}, ${city}`;
    }

    // PRIORITY 2: Sublocality + City (e.g. "Brooklyn, New York")
    if (sublocality && city) {
        return `${sublocality}, ${city}`;
    }

    // PRIORITY 3: Township + State (e.g. "Lower Merion, PA")
    if (township && state) {
        return `${township}, ${state}`;
    }

    // PRIORITY 4: City + State (e.g. "Boston, MA")
    if (city && state) {
        return `${city}, ${state}`;
    }

    // PRIORITY 5: County + State (e.g. "Suffolk County, MA")
    if (county && state) {
        return `${county}, ${state}`;
    }

    return city || township || county || state || 'Nearby';
}