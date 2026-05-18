// 🏆 Recommender SurfAI — Sélectionne les meilleurs créneaux et génère les narratives
// Spec : docs/superpowers/specs/2026-03-22-moteur-prediction-ia-design.md

const { scoreSlot } = require('./scorer');

// Labels selon score
function scoreLabel(score) {
  if (score >= 8.5) return 'Exceptionnel';
  if (score >= 7)   return 'Tres bon';
  if (score >= 5.5) return 'Correct';
  if (score >= 4)   return 'Moyen';
  if (score >= 2.5) return 'Faible';
  return 'Plat';
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

  // ── SCORE >= 8.5 : exceptionnel, tout est aligne ──
  if (score >= 8.5) {
    if (offshore && longPeriod) return pick([
      'Houle longue, vent offshore — les planetes sont alignees',
      'Combo parfait : beau swell et vent de terre',
      'Les conditions revees — a ne pas rater'
    ]);
    if (offshore) return pick([
      'Vent offshore et belles vagues — session premium',
      'Vagues propres et bien formees — ca va etre beau',
    ]);
    return pick([
      'Toutes les conditions sont reunies — fonce',
      'Creneau en or — conditions au top',
    ]);
  }

  // ── SCORE 7-8.5 : tres bon, avec ou sans bemol ──
  if (score >= 7) {
    if (caveats.length === 0) {
      if (longPeriod) return pick([
        'Belle houle longue, conditions propres',
        'Swell bien forme et conditions favorables',
      ]);
      return pick([
        'Tres bonne fenetre — conditions favorables',
        'Ca s\'annonce bien sur ce creneau',
        'Les conditions sont la, bonne session en vue',
      ]);
    }
    // Bon score MAIS un bemol — on le dit sans contredire le score
    if (onshore || strongWind) return pick([
      'Beau potentiel de vagues mais le vent va brouiller un peu',
      'Bon swell en approche — le vent n\'est pas ideal mais ca reste surfable',
    ]);
    if (shortPeriod) return pick([
      'Bonne taille mais houle courte — vagues un peu desorganisees',
      'Les vagues sont la mais le swell manque de puissance',
    ]);
    return pick([
      'Bon creneau avec un petit bemol — ca vaut le deplacement',
      'Conditions solides malgre un detail perfectible',
    ]);
  }

  // ── SCORE 5.5-7 : correct, surfable ──
  if (score >= 5.5) {
    if (smallWaves) return pick([
      'Petit mais propre — ideal pour un longboard ou du cruising',
      'Vagues modestes mais les conditions sont clean',
    ]);
    if (onshore) return pick([
      'Il y a de la vague mais le vent complique la lecture',
      'Surfable mais faut accepter le clapot',
    ]);
    if (lightWind && !smallWaves) return pick([
      'Peu de vent et de la vague — session honorable',
      'Ca se tente — pas la session du siecle mais correcte',
    ]);
    return pick([
      'Creneau surfable — sans plus mais ca peut le faire',
      'Conditions moyennes-bonnes, a toi de voir',
      'Pas parfait mais y a de quoi se faire plaisir',
    ]);
  }

  // ── SCORE 4-5.5 : moyen, on previent ──
  if (score >= 4) {
    if (smallWaves && onshore) return pick([
      'Petit et venteux — ca va etre complique',
      'Pas grand chose a se mettre sous la dent et du vent en plus',
    ]);
    if (smallWaves) return pick([
      'Vraiment petit — prends le longboard ou garde la journee pour autre chose',
      'Quasi flat — la motivation devra compenser le manque de vagues',
    ]);
    if (bigWaves) return pick([
      'Gros et agite — reserve aux plus experimentes',
      'Ca envoie mais les conditions sont brouillonnes',
    ]);
    if (strongWind) return pick([
      'Le vent domine — mer hachee et vagues fermees',
      'Conditions ventees — complique de trouver du plaisir',
    ]);
    return pick([
      'Conditions moyennes — si t\'as vraiment envie d\'aller a l\'eau',
      'Sortie possible mais faut pas s\'attendre a des miracles',
    ]);
  }

  // ── SCORE 2.5-4 : faible ──
  if (score >= 2.5) {
    if (smallWaves && strongWind) return pick([
      'Flat et venteux — journee off',
      'Rien a surfer et du vent — seche cette session',
    ]);
    if (smallWaves) return pick([
      'L\'ocean est au repos — journee repos aussi',
      'Pas de vagues — profites-en pour autre chose',
    ]);
    if (strongWind) return pick([
      'Tempete — dangereux et pas fun',
      'Vent trop fort — conditions impraticables',
    ]);
    return pick([
      'Conditions faibles — ca ne vaut pas le deplacement',
      'Pas la peine d\'y aller — economise ton energie',
    ]);
  }

  // ── SCORE < 2.5 : rien ──
  return pick([
    'Ocean plat ou impraticable — journee off',
    'Rien a faire dans l\'eau aujourd\'hui',
  ]);
}

// Grouper les points horaires en fenêtres continues
function buildTimeWindow(slots) {
  if (!slots.length) return { timeWindow: null, peakHour: null };
  const best = slots.reduce((a, b) => a.score > b.score ? a : b);
  const peakHour = new Date(best.time).getHours();

  // Fenêtre de 3h max centrée sur le peak
  // Prendre les heures adjacentes au peak avec score >= (peak - 1.5), limitées à 3h
  const threshold = best.score - 1.5;
  const windowHours = slots
    .filter(s => s.score >= threshold)
    .map(s => new Date(s.time).getHours())
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

  // Scorer chaque créneau horaire
  const scored = forecast.map(point => {
    const result = scoreSlot(point, { profile, spot, pastSessions, boards });
    return { ...result, time: point.time, conditions: point };
  });

  // Filtrer les créneaux non surfables (score < 4) et nocturnes (avant 6h, après 21h)
  const surfable = scored.filter(s => {
    if (s.score < 4) return false;
    const hour = new Date(s.time).getHours();
    return hour >= 6 && hour <= 21;
  });

  // Grouper par demi-journée (matin: 6-12, après-midi: 12-21)
  const groups = {};
  surfable.forEach(s => {
    const date = s.time.split('T')[0];
    const hour = new Date(s.time).getHours();
    const period = hour < 12 ? 'morning' : 'afternoon';
    const key = `${date}_${period}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  // Sélectionner le meilleur créneau par groupe
  const windows = Object.values(groups)
    .map(slots => {
      const best = slots.reduce((a, b) => a.score > b.score ? a : b);
      const { timeWindow, peakHour } = buildTimeWindow(slots);
      const date = best.time.split('T')[0];
      const tideCoeff = computeTideCoeff(best.conditions.tideExtremes, date);
      return {
        date,
        timeWindow,
        peakHour: `${peakHour}h`,
        score: best.score,
        scoreLabel: scoreLabel(best.score),
        tideCoeff,
        conditions: {
          waveHeight: best.conditions.waveHeight,
          windSpeed: best.conditions.windSpeed,
          windDirection: best.conditions.windDirection,
          wavePeriod: best.conditions.wavePeriod,
          tidePhase: best.conditions.tidePhase,
          swellHeight: best.conditions.swellHeight,
          waterTemp: best.conditions.waterTemp,
          airTemp: best.conditions.airTemp,
        },
        factors: best.factors,
        whyGood: best.whyGood,
        whyNotPerfect: best.whyNotPerfect,
        boardSuggestion: best.boardSuggestion,
        narrative: buildNarrative(best, spot),
        similarSession: best.similarSession,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxWindows);

  // Scores heure par heure (6h-21h) pour l'affichage détaillé
  const hourlyScores = scored
    .filter(s => {
      const h = new Date(s.time).getHours();
      return h >= 6 && h <= 21;
    })
    .map(s => ({
      time: s.time,
      hour: new Date(s.time).getHours(),
      date: s.time.split('T')[0],
      score: s.score,
      conditions: {
        waveHeight: s.conditions.waveHeight,
        windSpeed: s.conditions.windSpeed,
        windDirection: s.conditions.windDirection,
        wavePeriod: s.conditions.wavePeriod,
        tidePhase: s.conditions.tidePhase,
        waterTemp: s.conditions.waterTemp,
        airTemp: s.conditions.airTemp,
      },
    }));

  return {
    spot: { id: spot.id, name: spot.name, city: spot.city, lat: spot.lat, lng: spot.lng },
    generatedAt: new Date().toISOString(),
    windows,
    hourlyScores,
    calibrationLevel: scored[0]?.calibrationLevel || 0.10,
    totalSessionsAnalyzed: pastSessions.filter(s => s.meteo).length,
  };
}

module.exports = { getBestWindows };
