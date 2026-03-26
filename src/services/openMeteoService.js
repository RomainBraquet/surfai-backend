// Service Open-Meteo — conditions marines gratuites, sans clé API
const axios = require('axios');

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetch current conditions for multiple spots
 * @param {Array<{id, lat, lng}>} spots
 * @returns {Object} { spotId: { waveHeight, wavePeriod, waveDirection, windSpeed, windDirection } }
 */
async function getConditions(spots) {
    if (!spots.length) return {};

    const lats = spots.map(s => s.lat).join(',');
    const lngs = spots.map(s => s.lng).join(',');

    const [marineRes, weatherRes] = await Promise.all([
        axios.get(MARINE_URL, {
            params: {
                latitude: lats,
                longitude: lngs,
                current: 'wave_height,wave_period,wave_direction',
            },
            timeout: 8000,
        }).catch(() => null),
        axios.get(WEATHER_URL, {
            params: {
                latitude: lats,
                longitude: lngs,
                current: 'wind_speed_10m,wind_direction_10m',
            },
            timeout: 8000,
        }).catch(() => null),
    ]);

    const result = {};

    // Open-Meteo retourne un array si plusieurs coords, un objet si une seule
    const marineData = marineRes?.data;
    const weatherData = weatherRes?.data;

    spots.forEach((spot, i) => {
        const marine = Array.isArray(marineData) ? marineData[i] : (i === 0 ? marineData : null);
        const weather = Array.isArray(weatherData) ? weatherData[i] : (i === 0 ? weatherData : null);

        const mc = marine?.current || {};
        const wc = weather?.current || {};

        result[spot.id] = {
            waveHeight: mc.wave_height ?? null,
            wavePeriod: mc.wave_period ?? null,
            waveDirection: mc.wave_direction ?? null,
            windSpeed: wc.wind_speed_10m ?? null,
            windDirection: degreesToCardinal(wc.wind_direction_10m),
        };
    });

    return result;
}

function degreesToCardinal(deg) {
    if (deg == null || isNaN(deg)) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

module.exports = { getConditions };
