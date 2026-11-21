// 📡 Collector SurfAI — Agrège toutes les sources de données en un contexte unifié
// Spec : docs/superpowers/specs/2026-03-22-moteur-prediction-ia-design.md

const stormglassService = require('./stormglassService');
const shomService = require('./shomService');
const db = require('./supabaseService');

// Marée à un instant donné, à partir des pleines et basses mers encadrantes.
// tideLevel : 0 = basse mer, 1 = pleine mer (interpolation en cosinus, comme une vraie marée).
// tidePhase : 'low' / 'high' dans l'heure de l'étale, sinon 'rising' / 'falling'.
function tideAt(ts, extremes) {
  const prev = [...extremes].reverse().find(e => e.timestamp <= ts);
  const next = extremes.find(e => e.timestamp > ts);
  if (!prev && !next) return { tidePhase: 'unknown', tideLevel: null };

  let tideLevel = null;
  if (prev && next && next.timestamp > prev.timestamp) {
    const progress = (ts - prev.timestamp) / (next.timestamp - prev.timestamp); // 0 → 1
    const curve = (1 - Math.cos(Math.PI * progress)) / 2;                        // 0 → 1 en cosinus
    tideLevel = next.type === 'high' ? curve : 1 - curve;
    tideLevel = Math.round(tideLevel * 100) / 100;
  }

  const nearest = [prev, next].filter(Boolean)
    .sort((a, b) => Math.abs(a.timestamp - ts) - Math.abs(b.timestamp - ts))[0];
  let tidePhase;
  if (Math.abs(nearest.timestamp - ts) <= 1800) tidePhase = nearest.type; // étale : 'high' | 'low'
  else if (next) tidePhase = next.type === 'high' ? 'rising' : 'falling';
  else tidePhase = prev.type === 'high' ? 'falling' : 'rising';

  return { tidePhase, tideLevel };
}

// Les sessions ont été enregistrées sous plusieurs formats au fil du temps.
// On les ramène au format du moteur (vent en km/h) sans toucher à la base.
function normalizeSession(session) {
  let meteo = session.meteo;
  if (!meteo) return session;

  // Météo enregistrée comme un texte éclaté caractère par caractère → on la reconstitue
  if (typeof meteo === 'object' && Object.prototype.hasOwnProperty.call(meteo, '0')) {
    try {
      const text = Object.keys(meteo).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b).map(k => meteo[k]).join('');
      let parsed = JSON.parse(text);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      meteo = parsed;
    } catch (e) {
      return { ...session, meteo: null };
    }
  }
  if (typeof meteo === 'string') {
    try { meteo = JSON.parse(meteo); } catch (e) { return { ...session, meteo: null }; }
  }

  // Format brut Stormglass (reconnaissable à airTemperature / cloudCover) : vent en m/s → km/h
  if (meteo && (meteo.airTemperature !== undefined || meteo.cloudCover !== undefined) && typeof meteo.windSpeed === 'number') {
    meteo = { ...meteo, windSpeed: Math.round(meteo.windSpeed * 3.6 * 10) / 10 };
  }
  return { ...session, meteo };
}

// Données du surfeur : chargées une seule fois, puis partagées entre tous les spots analysés
// Le moteur n'apprend que des sessions enregistrées à partir de cette date.
// Les sessions antérieures sont des exemples saisis pour travailler l'interface : elles restent visibles
// dans l'historique mais ne doivent influencer aucune note.
const LEARNING_START = process.env.LEARNING_START || '2026-11-21';
function countsForLearning(session) {
  return String(session.created_at || '').slice(0, 10) >= LEARNING_START;
}

async function collectUserData(userId) {
  const [profile, sessions, boards] = await Promise.all([
    db.getProfile(userId),
    db.getSessionsWithMeteo(userId),
    db.getBoards(userId),
  ]);
  return {
    userId,
    profile: profile || { surf_level: 'intermediate', min_wave_height: 0.8, max_wave_height: 2.0 },
    pastSessions: (sessions || []).filter(countsForLearning).map(normalizeSession),
    boards: boards || [],
  };
}

// Contexte complet d'un spot : prévisions + marées + données du surfeur
// Deux avis valent mieux qu'un. Stormglass donne les vagues, la houle, la température de l'eau et les marées ;
// Open-Meteo donne un second avis sur les vagues et le vent, les rafales, et la mer du vent séparée de la houle.
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
// La période que les surfeurs lisent partout (Surfline, Y a du surf…) est la période de pic de la houle.
// Les fournisseurs donnent souvent une période moyenne, plus courte d'environ 30 %. On ramène tout au pic.
function peakPeriodOf(peak, mean) {
  if (peak != null) return Math.round(peak);
  return mean != null ? Math.round(mean * 1.3) : null;
}
function agreement(sg, om) {
  if (!sg || !om) return 'single';
  let level = 'high';
  if (sg.waveHeight != null && om.waveHeight != null) {
    const mean = (sg.waveHeight + om.waveHeight) / 2, gap = mean > 0 ? Math.abs(sg.waveHeight - om.waveHeight) / mean : 0;
    if (gap > 0.4 && Math.abs(sg.waveHeight - om.waveHeight) > 0.5) level = 'low'; else if (gap > 0.25) level = 'medium';
  }
  if (sg.windSpeed != null && om.windSpeed != null) {
    const gap = Math.abs(sg.windSpeed - om.windSpeed);
    if (gap > 15) level = 'low'; else if (gap > 8 && level === 'high') level = 'medium';
  }
  return level;
}
function mergePoint(p, o) {
  if (!o) return { ...p, peakPeriod: peakPeriodOf(null, p.swellPeriod != null ? p.swellPeriod : p.wavePeriod), confidence: 'single', sources: { stormglass: true, openMeteo: false } };
  const out = { ...p };
  // Vagues : la moyenne des deux avis
  if (p.waveHeight != null && o.waveHeight != null) out.waveHeight = r1((p.waveHeight + o.waveHeight) / 2);
  else if (p.waveHeight == null) out.waveHeight = r1(o.waveHeight);
  // Vent : par prudence, le plus fort des deux, avec sa direction
  if (o.windSpeed != null && (p.windSpeed == null || o.windSpeed >= p.windSpeed)) { out.windSpeed = r1(o.windSpeed); out.windDirection = o.windDirection != null ? Math.round(o.windDirection) : p.windDirection; }
  out.windGust = o.windGust != null ? Math.round(o.windGust) : null;
  // Houle principale et mer du vent
  if (out.swellPeriod == null && o.swellPeriod != null) out.swellPeriod = Math.round(o.swellPeriod);
  if (out.swellHeight == null && o.swellHeight != null) out.swellHeight = r1(o.swellHeight);
  if (out.swellDirection == null && o.swellDirection != null) out.swellDirection = Math.round(o.swellDirection);
  if (out.waveDirection == null && o.waveDirection != null) out.waveDirection = Math.round(o.waveDirection);
  if (out.wavePeriod == null && o.wavePeriod != null) out.wavePeriod = Math.round(o.wavePeriod);
  out.peakPeriod = peakPeriodOf(o.swellPeakPeriod, o.swellPeriod != null ? o.swellPeriod : (p.swellPeriod != null ? p.swellPeriod : p.wavePeriod));
  out.windWaveHeight = r1(o.windWaveHeight);
  out.precipitation = o.precipitation;
  if (out.airTemp == null && o.airTemp != null) out.airTemp = r1(o.airTemp);
  out.confidence = agreement(p, o);
  out.sources = { stormglass: { waveHeight: p.waveHeight, windSpeed: p.windSpeed, wavePeriod: p.wavePeriod },
                  openMeteo: { waveHeight: r1(o.waveHeight), windSpeed: r1(o.windSpeed), windGust: out.windGust } };
  return out;
}
// Quand Stormglass est indisponible (quota), l'app continue sur Open-Meteo seul, sans marées ni température d'eau.
function pointsFromOpenMeteo(om) {
  return [...om.entries()].sort((a, b) => a[0] - b[0]).filter(([, o]) => o.waveHeight != null).map(([ts, o]) => ({
    time: new Date(ts * 1000).toISOString(), timestamp: ts, hour: new Date(ts * 1000).getUTCHours(),
    waveHeight: r1(o.waveHeight), wavePeriod: o.wavePeriod != null ? Math.round(o.wavePeriod) : null,
    waveDirection: o.waveDirection != null ? Math.round(o.waveDirection) : null,
    windSpeed: r1(o.windSpeed), windDirection: o.windDirection != null ? Math.round(o.windDirection) : null,
    windGust: o.windGust != null ? Math.round(o.windGust) : null,
    swellHeight: r1(o.swellHeight), swellPeriod: o.swellPeriod != null ? Math.round(o.swellPeriod) : null,
    peakPeriod: peakPeriodOf(o.swellPeakPeriod, o.swellPeriod != null ? o.swellPeriod : o.wavePeriod),
    swellDirection: o.swellDirection != null ? Math.round(o.swellDirection) : null,
    windWaveHeight: r1(o.windWaveHeight), precipitation: o.precipitation, airTemp: r1(o.airTemp), waterTemp: null,
    tidePhase: 'unknown', tideLevel: null, confidence: 'single', sources: { stormglass: false, openMeteo: true },
  }));
}

async function buildContext(spot, userData, days = 5) {
  const openMeteo = require('./openMeteoService');
  const [sgResult, om] = await Promise.all([
    stormglassService.getForecast(spot.lat, spot.lng, days).then(data => ({ data })).catch(error => ({ error })),
    openMeteo.getHourly(spot.lat, spot.lng, days).catch(() => null),
  ]);
  if (sgResult.error && !om) throw sgResult.error;

  let forecast;
  if (sgResult.data) {
    forecast = sgResult.data.forecast.map(p => mergePoint(p, om ? om.get(p.timestamp) : null));
    // Marées : pleines et basses mers, puis niveau et phase pour chaque heure
    try {
      const tideExtremes = await stormglassService.getTideExtremes(spot.lat, spot.lng, days);
      if (tideExtremes.length > 0) forecast = forecast.map(point => ({ ...point, ...tideAt(point.timestamp, tideExtremes), tideExtremes }));
    } catch (e) {
      console.warn('⚠️ Stormglass tide indisponible:', e.message);
    }
  } else {
    console.warn('⚠️ Stormglass indisponible, prévisions Open-Meteo seules :', sgResult.error.message);
    forecast = pointsFromOpenMeteo(om);
  }

  return { spot, forecast, ...userData, collectedAt: new Date().toISOString(), degraded: !sgResult.data };
}

async function collectContext(spotId, userId, days = 5) {
  console.log(`📡 Collecte contexte: spot=${spotId} user=${userId} days=${days}`);
  const [spot, userData] = await Promise.all([db.getSpotById(spotId), collectUserData(userId)]);
  if (!spot) throw new Error(`Spot ${spotId} introuvable`);
  return buildContext(spot, userData, days);
}

module.exports = { collectContext, collectUserData, buildContext, tideAt, normalizeSession, mergePoint, agreement, countsForLearning };
