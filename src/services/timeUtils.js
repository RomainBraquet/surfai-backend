// 🕐 Heure locale du spot et lumière du jour
// Le serveur tourne en UTC : toute heure affichée doit être calculée dans le fuseau du spot.

const tzlookup = require('tz-lookup');

const tzCache = new Map();
function spotTimeZone(lat, lng) {
  const key = `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  if (!tzCache.has(key)) {
    let tz = 'UTC';
    try { tz = tzlookup(Number(lat), Number(lng)); } catch (e) { /* coordonnées invalides → UTC */ }
    tzCache.set(key, tz);
  }
  return tzCache.get(key);
}

const fmtCache = new Map();
function formatter(timeZone) {
  if (!fmtCache.has(timeZone)) {
    fmtCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }));
  }
  return fmtCache.get(timeZone);
}

// Date (YYYY-MM-DD) et heure (0-23) locales d'un instant, dans un fuseau donné
function localParts(time, timeZone) {
  const parts = {};
  formatter(timeZone).formatToParts(new Date(time)).forEach(p => { parts[p.type] = p.value; });
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parseInt(parts.hour, 10) % 24 };
}

// Lever et coucher du soleil (en millisecondes UTC) pour une date locale et une position
// Équation du lever du soleil, précision de l'ordre de la minute — suffisant pour filtrer la nuit.
function sunTimes(localDate, lat, lng) {
  const rad = Math.PI / 180;
  const [y, m, d] = localDate.split('-').map(Number);
  const jDate = Date.UTC(y, m - 1, d, 12) / 86400000 + 2440587.5;
  const n = Math.round(jDate - 2451545.0 + 0.0008);
  const jStar = n - lng / 360;
  const M = ((357.5291 + 0.98560028 * jStar) % 360 + 360) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = ((M + C + 180 + 102.9372) % 360 + 360) % 360;
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.44 * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosOmega = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec);
  if (cosOmega > 1) return { sunrise: null, sunset: null, polar: 'night' };
  if (cosOmega < -1) return { sunrise: null, sunset: null, polar: 'day' };
  const omega = Math.acos(cosOmega) / rad;
  const toMs = j => (j - 2440587.5) * 86400000;
  return { sunrise: toMs(jTransit - omega / 360), sunset: toMs(jTransit + omega / 360), polar: null };
}

// Un créneau d'une heure est surfable s'il tient dans la lumière du jour
// (tolérance de 20 minutes d'aube et de crépuscule).
const TWILIGHT_MS = 20 * 60 * 1000;
function isDaylightSlot(timeMs, sun) {
  if (sun.polar === 'night') return false;
  if (sun.polar === 'day') return true;
  return timeMs >= sun.sunrise - TWILIGHT_MS && timeMs + 3600000 <= sun.sunset + TWILIGHT_MS;
}

module.exports = { spotTimeZone, localParts, sunTimes, isDaylightSlot };
