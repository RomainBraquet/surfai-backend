// 🏆 Recommender SurfAI — Sélectionne les meilleurs créneaux et génère les narratives
// Spec : docs/superpowers/specs/2026-03-22-moteur-prediction-ia-design.md

const { scoreSlot } = require('./scorer');

// Labels selon score — honnêtes, pas artificiellement positifs
function scoreLabel(score) {
  if (score >= 8.5) return 'Exceptionnel';
  if (score >= 7)   return 'Excellent';
  if (score >= 5.5) return 'Bon';
  if (score >= 4)   return 'Moyen';
  if (score >= 2.5) return 'Médiocre';
  return 'Mauvais';
}

// Narrative personnalisée — honnête, tient compte des caveats critiques
function buildNarrative(scoredSlot, spot) {
  const { similarSession, score, whyNotPerfect, whyGood, factors } = scoredSlot;
  const caveats = whyNotPerfect || [];
  const positives = whyGood || [];
  const hasCriticalCaveat = caveats.length > 0;

  // Détecter les problèmes spécifiques pour des messages ciblés
  const hasBigWaves = caveats.some(c => /grosses|au-dessus/i.test(c));
  const hasSmallWaves = caveats.some(c => /petites|en dessous/i.test(c));
  const hasStrongWind = caveats.some(c => /vent fort|onshore/i.test(c));
  const hasBadTide = caveats.some(c => /marée.*pas idéale/i.test(c));
  const hasBadPeriod = caveats.some(c => /période courte/i.test(c));

  // Référencer les sessions passées — seulement si score bon ET pas de caveat critique
  if (score >= 7 && !hasCriticalCaveat && similarSession?.meteo && similarSession?.spot_id === spot.id) {
    const date = new Date(similarSession.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const stars = '★'.repeat(similarSession.rating);
    return `Rappelle ta session du ${date} ici — ${stars}`;
  }

  // Score haut MAIS avec des caveats → nuancer le message
  if (score >= 7 && hasCriticalCaveat) {
    if (hasBigWaves) return 'Ça envoie du lourd — réservé aux jours où tu te sens en forme';
    if (hasStrongWind) return 'Bon potentiel mais le vent gâche la fête';
    if (hasBadTide) return 'Bon setup mais la marée n\'est pas idéale';
    if (hasBadPeriod) return 'Des vagues mais une houle courte et désorganisée';
    return 'Conditions intéressantes malgré quelques bémols';
  }

  // Messages nets selon le score — sans caveat
  if (score >= 8.5) return 'Conditions exceptionnelles — fonce !';
  if (score >= 7) return 'Très bonne session en vue';
  if (score >= 5.5 && !hasCriticalCaveat) return 'Session sympa en perspective';

  // Score moyen avec contexte
  if (score >= 5.5 && hasCriticalCaveat) {
    if (hasBigWaves) return 'Ça brasse — sortie à évaluer selon ton niveau';
    if (hasSmallWaves) return 'Petit mais surfable — idéal longboard ou foil';
    if (hasStrongWind) return 'Le vent complique les choses';
    return 'Session possible mais pas idéale';
  }

  if (score >= 4) {
    if (hasSmallWaves) return 'Vraiment petit — session galère en vue';
    if (hasStrongWind) return 'Trop de vent — conditions hachées';
    if (hasBigWaves) return 'Trop gros pour être fun';
    return 'Conditions moyennes — faisable mais sans plus';
  }

  // Score < 4 : honnêtement mauvais
  if (score >= 2.5) {
    if (hasSmallWaves && hasStrongWind) return 'Flat et venté — journée off';
    if (hasSmallWaves) return 'Pas de vagues — journée repos';
    if (hasStrongWind) return 'Tempête — reste au chaud';
    return 'Conditions médiocres — pas la peine d\'y aller';
  }
  return 'Conditions très mauvaises — oublie la session';
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
      return {
        date: best.time.split('T')[0],
        timeWindow,
        peakHour: `${peakHour}h`,
        score: best.score,
        scoreLabel: scoreLabel(best.score),
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
