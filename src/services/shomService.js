// Service SHOM — Données de marée (Service Hydrographique français)
// API gratuite : https://maree.shom.fr

const axios = require('axios');
const db = require('./supabaseService');

const SHOM_BASE = 'https://maree.shom.fr/api/v1';

// Calcul de la phase de marée depuis un tableau de hauteurs horaires
function computePhases(hourlyData) {
  return hourlyData.map((point, i) => {
    const prev = hourlyData[i - 1];
    const next = hourlyData[i + 1];
    let phase = 'unknown';
    if (prev && next) {
      if (point.height_cm > prev.height_cm && point.height_cm > next.height_cm) phase = 'high';
      else if (point.height_cm < prev.height_cm && point.height_cm < next.height_cm) phase = 'low';
      else if (point.height_cm > prev.height_cm) phase = 'rising';
      else phase = 'falling';
    }
    return { ...point, phase };
  });
}

async function getTideData(spotId, shomPortCode, dateStr) {
  // dateStr format: 'YYYY-MM-DD'
  if (!shomPortCode) return null;

  // Vérifier le cache Supabase
  const cached = await db.getTideCache(spotId, dateStr);
  if (cached) {
    console.log(`💾 Cache marée utilisé: ${shomPortCode} ${dateStr}`);
    return cached;
  }

  try {
    console.log(`🌊 Appel SHOM: ${shomPortCode} ${dateStr}`);
    const response = await axios.get(`${SHOM_BASE}/tides`, {
      params: { harbour: shomPortCode, duration: 24, nbDays: 1 },
      timeout: 10000,
    });

    const raw = response.data;
    // Valider que la réponse est bien un tableau JSON
    if (!Array.isArray(raw) || raw.length === 0) {
      console.warn(`⚠️ SHOM réponse invalide pour ${shomPortCode}: format inattendu`);
      return null;
    }
    // Construire tableau horaire depuis les données SHOM
    // SHOM retourne des points à haute fréquence — on ré-échantillonne à 24 points
    const hourlyData = [];
    for (let h = 0; h < 24; h++) {
      // Trouver le point SHOM le plus proche de cette heure
      const targetMs = new Date(`${dateStr}T${String(h).padStart(2,'0')}:00:00`).getTime();
      const closest = raw.reduce((best, p) => {
        const diff = Math.abs(new Date(p.time || p.datetime).getTime() - targetMs);
        const bestDiff = Math.abs(new Date(best.time || best.datetime).getTime() - targetMs);
        return diff < bestDiff ? p : best;
      });
      hourlyData.push({
        hour: h,
        height_cm: Math.round(closest.height || closest.hauteur || 0),
      });
    }

    const tideData = computePhases(hourlyData);
    await db.setTideCache(spotId, dateStr, tideData);
    return tideData;

  } catch (error) {
    console.warn(`⚠️ SHOM indisponible pour ${shomPortCode}: ${error.message}`);
    return null;
  }
}

// Récupère les marées pour N jours à partir d'aujourd'hui
async function getTideDataForDays(spotId, shomPortCode, days = 5) {
  const results = {};
  const today = new Date();
  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    results[dateStr] = await getTideData(spotId, shomPortCode, dateStr);
  }
  return results; // { 'YYYY-MM-DD': [hourlyPoints] | null }
}

// Obtenir la phase de marée pour une heure donnée
function getTideAtHour(tideDataForDate, hour) {
  if (!tideDataForDate) return { height_cm: null, phase: 'unknown' };
  return tideDataForDate.find(p => p.hour === hour) || { height_cm: null, phase: 'unknown' };
}

module.exports = { getTideDataForDays, getTideAtHour };
