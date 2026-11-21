// 🏆 Recommender SurfAI — Sélectionne les meilleurs créneaux et génère les narratives
// Spec : docs/superpowers/specs/2026-03-22-moteur-prediction-ia-design.md

const { scoreSlot, learnWaveRange, learnWindTolerance } = require('./scorer');
const { spotTimeZone, localParts, sunTimes, isDaylightSlot } = require('./timeUtils');

// Labels selon score
function scoreLabel(score, sizeIssue, storm) {
  if (storm) return 'Tempête';
  if (score < 4 && sizeIssue === 'too_big') return 'Trop gros';
  if (score < 4 && sizeIssue === 'too_small') return 'Trop petit';
  if (score >= 8.5) return 'Exceptionnel';
  if (score >= 7)   return 'Très bon';
  if (score >= 5.5) return 'Correct';
  if (score >= 4)   return 'Moyen';
  if (score >= 2.5) return 'Faible';
  return 'Mauvais';
}

// Pick un element au hasard dans un tableau (variete des textes)
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Narrative coherente — construit UNE phrase a partir de tous les facteurs
// Regle : on part du contexte dominant (la vague) puis on qualifie avec vent/maree/periode
function buildNarrative(scoredSlot, spot) {
  const { score, whyNotPerfect, whyGood, conditions } = scoredSlot;
  const caveats = whyNotPerfect || [];
  const positives = whyGood || [];

  // Extraire les conditions brutes pour etre precis
  const waveH = conditions?.waveHeight || conditions?.swellHeight || 0;
  const windSpd = conditions?.windSpeed || 0;
  const period = conditions?.wavePeriod || 0;
  const offshore = positives.some(p => /offshore/i.test(p));
  const onshore = caveats.some(c => /onshore/i.test(c));
  const strongWind = windSpd > 30;
  const lightWind = windSpd < 12;
  const longPeriod = period >= 11;
  const shortPeriod = period > 0 && period < 7;
  const smallWaves = waveH < 0.6;
  const bigWaves = waveH > 2.5;

  // ── Taille hors de la fourchette du surfeur : on le dit avant tout ──
  if (score < 5.5 && scoredSlot.sizeIssue === 'too_big') return pick([
    'Trop gros pour ta fourchette, à regarder depuis la plage',
    'Ça dépasse ta taille de confort, prudence',
  ]);
  if (score < 5.5 && scoredSlot.sizeIssue === 'too_small') return pick([
    'Trop petit pour toi, pas grand chose à surfer',
    'En dessous de ta taille mini, journée calme',
  ]);

  // ── SCORE >= 8.5 : exceptionnel, tout est aligne ──
  if (score >= 8.5) {
    if (offshore && longPeriod) return pick([
      'Houle longue, vent offshore, les planètes sont alignées',
      'Combo parfait : beau swell et vent de terre',
      'Les conditions rêvées, à ne pas rater'
    ]);
    if (offshore) return pick([
      'Vent offshore et belles vagues, session premium',
      'Vagues propres et bien formées, ça va être beau',
    ]);
    return pick([
      'Toutes les conditions sont réunies, fonce',
      'Créneau en or, conditions au top',
    ]);
  }

  // ── SCORE 7-8.5 : tres bon, avec ou sans bemol ──
  if (score >= 7) {
    if (caveats.length === 0) {
      if (longPeriod) return pick([
        'Belle houle longue, conditions propres',
        'Swell bien formé et conditions favorables',
      ]);
      return pick([
        'Très bonne fenêtre, conditions favorables',
        'Ça s\'annonce bien sur ce créneau',
        'Les conditions sont là, bonne session en vue',
      ]);
    }
    // Bon score MAIS un bemol — on le dit sans contredire le score
    if (onshore || strongWind) return pick([
      'Beau potentiel de vagues mais le vent va brouiller un peu',
      'Bon swell en approche, le vent n\'est pas idéal mais ça reste surfable',
    ]);
    if (shortPeriod) return pick([
      'Bonne taille mais houle courte, vagues un peu désorganisées',
      'Les vagues sont là mais le swell manque de puissance',
    ]);
    return pick([
      'Bon créneau avec un petit bémol, ça vaut le déplacement',
      'Conditions solides malgré un détail perfectible',
    ]);
  }

  // ── SCORE 5.5-7 : correct, surfable ──
  if (score >= 5.5) {
    if (smallWaves) return pick([
      'Petit mais propre, idéal pour un longboard ou du cruising',
      'Vagues modestes mais les conditions sont clean',
    ]);
    if (onshore) return pick([
      'Il y a de la vague mais le vent complique la lecture',
      'Surfable mais faut accepter le clapot',
    ]);
    if (lightWind && !smallWaves) return pick([
      'Peu de vent et de la vague, session honorable',
      'Ça se tente, pas la session du siècle mais correcte',
    ]);
    return pick([
      'Créneau surfable, sans plus mais ça peut le faire',
      'Conditions moyennes-bonnes, à toi de voir',
      'Pas parfait mais y a de quoi se faire plaisir',
    ]);
  }

  // ── SCORE 4-5.5 : moyen, on previent ──
  if (score >= 4) {
    if (smallWaves && onshore) return pick([
      'Petit et venteux, ça va être compliqué',
      'Pas grand chose à se mettre sous la dent et du vent en plus',
    ]);
    if (smallWaves) return pick([
      'Vraiment petit, prends le longboard ou garde la journée pour autre chose',
      'Quasi flat, la motivation devra compenser le manque de vagues',
    ]);
    if (bigWaves) return pick([
      'Gros et agité, réservé aux plus expérimentés',
      'Ça envoie mais les conditions sont brouillonnes',
    ]);
    if (strongWind) return pick([
      'Le vent domine, mer hachée et vagues fermées',
      'Conditions ventées, compliqué de trouver du plaisir',
    ]);
    return pick([
      'Conditions moyennes, si t\'as vraiment envie d\'aller à l\'eau',
      'Sortie possible mais faut pas s\'attendre à des miracles',
    ]);
  }

  // ── SCORE 2.5-4 : faible ──
  if (score >= 2.5) {
    if (smallWaves && strongWind) return pick([
      'Flat et venteux, journée off',
      'Rien à surfer et du vent, sèche cette session',
    ]);
    if (smallWaves) return pick([
      'L\'océan est au repos, journée repos aussi',
      'Pas de vagues, profites-en pour autre chose',
    ]);
    if (strongWind) return pick([
      'Tempête, dangereux et pas fun',
      'Vent trop fort, conditions impraticables',
    ]);
    return pick([
      'Conditions faibles, ça ne vaut pas le déplacement',
      'Pas la peine d\'y aller, économise ton énergie',
    ]);
  }

  // ── SCORE < 2.5 : rien ──
  return pick([
    'Océan plat ou impraticable, journée off',
    'Rien à faire dans l\'eau aujourd\'hui',
  ]);
}

// Grouper les points horaires en fenêtres continues
function buildTimeWindow(slots) {
  if (!slots.length) return { timeWindow: null, peakHour: null };
  const best = slots.reduce((a, b) => a.score > b.score ? a : b);
  const peakHour = best.localHour;

  // Fenêtre de 3h max centrée sur le peak
  // Prendre les heures adjacentes au peak avec score >= (peak - 1.5), limitées à 3h
  const threshold = best.score - 1.5;
  const windowHours = slots
    .filter(s => s.score >= threshold)
    .map(s => s.localHour)
    .filter(h => Math.abs(h - peakHour) <= 1) // max 1h avant et 1h après le peak = 3h
    .sort((a, b) => a - b);

  if (windowHours.length === 0) return { timeWindow: `${peakHour}h`, peakHour };
  const startH = windowHours[0];
  const endH = windowHours[windowHours.length - 1] + 1;
  return {
    timeWindow: startH === endH - 1 ? `${startH}h` : `${startH}h–${endH}h`,
    peakHour,
  };
}

// Calcul du coefficient de marée à partir des extremes (PM/BM)
// Référence : amplitude moyenne vives-eaux à Brest = 6.1m (unité de hauteur SHOM)
function computeTideCoeff(tideExtremes, date) {
  if (!tideExtremes || tideExtremes.length < 2) return null;
  // Trouver la PM et BM les plus proches de cette date
  const dayStart = new Date(date + 'T00:00:00').getTime() / 1000;
  const dayEnd = dayStart + 86400;
  const dayExtremes = tideExtremes.filter(e => e.timestamp >= dayStart - 6*3600 && e.timestamp <= dayEnd + 6*3600);
  const highs = dayExtremes.filter(e => e.type === 'high');
  const lows = dayExtremes.filter(e => e.type === 'low');
  if (!highs.length || !lows.length) return null;
  const maxHigh = Math.max(...highs.map(e => e.height));
  const minLow = Math.min(...lows.map(e => e.height));
  const amplitude = maxHigh - minLow;
  // Coeff = (amplitude / amplitude_ref_brest) * 70 + 20, borné 20-120
  const coeff = Math.round((amplitude / 6.1) * 70 + 20);
  return Math.max(20, Math.min(120, coeff));
}

// Fonction principale — retourne les meilleurs créneaux pour un spot
function getBestWindows(context, maxWindows = 10) {
  const { spot, forecast, profile, pastSessions, boards } = context;

  // Heure locale du spot (le serveur est en UTC) et lumière du jour
  const timeZone = spotTimeZone(spot.lat, spot.lng);
  const sunByDate = {};
  const sunFor = date => (sunByDate[date] = sunByDate[date] || sunTimes(date, Number(spot.lat), Number(spot.lng)));

  // Fourchette de vagues du surfeur : apprise de ses sessions, sinon celle du profil
  const waveRange = learnWaveRange(pastSessions, profile);
  // Tolérance au vent : selon le niveau, puis apprise du ressenti donné à chaque session
  const windTolerance = learnWindTolerance(pastSessions, profile);

  // Scorer chaque créneau horaire
  const scored = forecast.map(point => {
    const result = scoreSlot({ ...point, spotId: spot.id }, { profile, spot, pastSessions, boards, waveRange, windTolerance });
    const local = localParts(point.time, timeZone);
    const timeMs = new Date(point.time).getTime();
    return {
      ...result, time: point.time, conditions: point,
      localDate: local.date, localHour: local.hour,
      daylight: isDaylightSlot(timeMs, sunFor(local.date)),
    };
  });

  // Filtrer : score < 4, créneaux de nuit, ET créneaux déjà passés
  const nowMs = Date.now();
  const surfable = scored.filter(s => {
    if (s.score < 4) return false;
    if (new Date(s.time).getTime() < nowMs - 3600000) return false; // passé de plus d'1h = exclu
    return s.daylight;
  });

  // Grouper par demi-journée locale (matin avant 13h, après-midi ensuite)
  const groups = {};
  surfable.forEach(s => {
    const period = s.localHour < 13 ? 'morning' : 'afternoon';
    const key = `${s.localDate}_${period}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  // Sélectionner le meilleur créneau par groupe
  const windows = Object.values(groups)
    .map(slots => {
      const best = slots.reduce((a, b) => a.score > b.score ? a : b);
      const { timeWindow, peakHour } = buildTimeWindow(slots);
      const date = best.localDate;
      const tideCoeff = computeTideCoeff(best.conditions.tideExtremes, date);
      return {
        date,
        timeWindow,
        peakHour: `${peakHour}h`,
        score: best.score,
        scoreLabel: scoreLabel(best.score, best.sizeIssue, best.storm),
        tideCoeff,
        conditions: {
          waveHeight: best.conditions.waveHeight,
          windSpeed: best.conditions.windSpeed,
          windDirection: best.conditions.windDirection,
          wavePeriod: best.conditions.wavePeriod,
          tidePhase: best.conditions.tidePhase,
          tideLevel: best.conditions.tideLevel,
          waveDirection: best.conditions.waveDirection,
          swellDirection: best.conditions.swellDirection,
          swellPeriod: best.conditions.swellPeriod,
          windGust: best.conditions.windGust,
          windWaveHeight: best.conditions.windWaveHeight,
          swellHeight: best.conditions.swellHeight,
          waterTemp: best.conditions.waterTemp,
          airTemp: best.conditions.airTemp,
        },
        factors: best.factors,
        reminder: best.reminder || null,
        confidence: best.confidence || 'single',
        whyGood: best.whyGood,
        whyNotPerfect: best.whyNotPerfect,
        boardSuggestion: best.boardSuggestion,
        narrative: buildNarrative(best, spot),
        similarSession: best.similarSession,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxWindows);

  // Scores heure par heure (heures de jour, heure locale du spot) pour l'affichage détaillé
  const hourlyScores = scored
    .filter(s => s.daylight)
    .map(s => ({
      time: s.time,
      hour: s.localHour,
      date: s.localDate,
      score: s.score,
      scoreLabel: scoreLabel(s.score, s.sizeIssue, s.storm),
      sizeIssue: s.sizeIssue || null,
      storm: !!s.storm,
      confidence: s.confidence || 'single',
      conditions: {
        waveHeight: s.conditions.waveHeight,
        windSpeed: s.conditions.windSpeed,
        windDirection: s.conditions.windDirection,
        wavePeriod: s.conditions.wavePeriod,
        tidePhase: s.conditions.tidePhase,
        tideLevel: s.conditions.tideLevel,
        waveDirection: s.conditions.waveDirection,
        swellDirection: s.conditions.swellDirection,
        swellPeriod: s.conditions.swellPeriod,
        windGust: s.conditions.windGust,
        windWaveHeight: s.conditions.windWaveHeight,
        precipitation: s.conditions.precipitation,
        waterTemp: s.conditions.waterTemp,
        airTemp: s.conditions.airTemp,
      },
    }));

  return {
    spot: { id: spot.id, name: spot.name, city: spot.city, lat: spot.lat, lng: spot.lng },
    timeZone,
    generatedAt: new Date().toISOString(),
    windows,
    hourlyScores,
    waveRange,
    windTolerance,
    calibrationLevel: waveRange.confidence,
    totalSessionsAnalyzed: pastSessions.filter(s => s.meteo).length,
  };
}

module.exports = { getBestWindows };
