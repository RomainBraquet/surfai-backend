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

// ─── Prévisions heure par heure : second avis sur les vagues et le vent, rafales, houle séparée ───
// Gratuit et mondial. Mis en cache 3 h par maille de 0,25°, comme Stormglass.
const hourlyCache = new Map();
const HOURLY_TTL = 3 * 60 * 60 * 1000;
function cell(v) { return (Math.round(Number(v) / 0.25) * 0.25).toFixed(2); }

async function getHourly(lat, lng, days = 6) {
    const la = cell(lat), lo = cell(lng), n = Math.min(8, Math.max(1, days + 1));
    const key = `${la}_${lo}_${n}`;
    const hit = hourlyCache.get(key);
    if (hit && Date.now() - hit.at < HOURLY_TTL) return hit.data;

    // Pour les vagues on vise le point exact (une maille peut tomber sur la terre) ; le vent est pris à la maille
    const [marineRes, weatherRes] = await Promise.all([
        axios.get(MARINE_URL, { timeout: 9000, params: {
            latitude: lat, longitude: lng, timezone: 'GMT', forecast_days: n, cell_selection: 'sea',
            hourly: 'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_peak_period,swell_wave_direction,wind_wave_height,sea_level_height_msl,sea_surface_temperature',
        } }).catch(() => null),
        axios.get(WEATHER_URL, { timeout: 9000, params: {
            latitude: lat, longitude: lng, timezone: 'GMT', forecast_days: n,
            hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,temperature_2m',
        } }).catch(() => null),
    ]);
    const m = marineRes?.data?.hourly, w = weatherRes?.data?.hourly;
    if (!m && !w) return null;

    const out = new Map();
    const stamp = t => Math.floor(Date.parse(t + ':00Z') / 1000);
    const num = v => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
    (w?.time || []).forEach((t, k) => {
        out.set(stamp(t), {
            windSpeed: num(w.wind_speed_10m[k]), windGust: num(w.wind_gusts_10m[k]), windDirection: num(w.wind_direction_10m[k]),
            precipitation: num(w.precipitation[k]), airTemp: num(w.temperature_2m[k]),
        });
    });
    (m?.time || []).forEach((t, k) => {
        const ts = stamp(t), cur = out.get(ts) || {};
        out.set(ts, { ...cur,
            waveHeight: num(m.wave_height[k]), wavePeriod: num(m.wave_period[k]), waveDirection: num(m.wave_direction[k]),
            swellHeight: num(m.swell_wave_height[k]), swellPeriod: num(m.swell_wave_period[k]), swellPeakPeriod: num((m.swell_wave_peak_period || [])[k]), swellDirection: num(m.swell_wave_direction[k]),
            windWaveHeight: num(m.wind_wave_height[k]),
            seaLevel: num((m.sea_level_height_msl || [])[k]), waterTemp: num((m.sea_surface_temperature || [])[k]),
        });
    });
    hourlyCache.set(key, { at: Date.now(), data: out });
    return out;
}

module.exports = { getConditions, getHourly };
