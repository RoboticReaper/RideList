import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

const options = {
    key: process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!,
    v: 'weekly',
    libraries: ['places'],
};

let initialized = false;

export const initMaps = () => {
    if (!initialized) {
        setOptions(options);
        initialized = true;
    }
};

export { importLibrary };