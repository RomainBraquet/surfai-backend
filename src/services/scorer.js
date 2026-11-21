// 🎯 Scorer SurfAI — Score composite 0-10 par créneau horaire
// Spec : docs/superpowers/specs/2026-03-22-moteur-prediction-ia-design.md

// Poids des facteurs (somme = 1.0)
// La personnalisation ne passe plus par un facteur « sessions proches » (qui ne faisait que
// refléter la moyenne des notes récentes) mais par la fourchette de vagues apprise des sessions.
const WEIGHTS = {
  wind:   0.375,
  waves:  0.25,
  period: 0.1875,
  spot:   0.1875,
};

function computeWeights() {
  return { ...WEIGHTS, history: 0 };
}

// ─── Fourchette de vagues apprise ───────────────────────
// Ce que le surfeur déclare dans son profil n'est qu'un point de départ.
// Dès qu'il a assez de sessions, on apprend sa vraie zone de confort :
//   - ressenti « parfait »            → cette taille est dans sa zone (preuve forte)
//   - session notée 4 ou 5 sans ressenti → probablement dans sa zone (preuve faible)
//   - ressenti « trop petit »          → sa taille mini est au-dessus
//   - ressenti « trop gros »           → sa taille maxi est en dessous
const MIN_SESSIONS_TO_LEARN = 5;
const FULL_CONFIDENCE_SESSIONS = 15;

// Poids d'une session selon son ancienneté : divisé par deux tous les `halfLifeDays` jours
function recencyWeight(date, halfLifeDays) {
  const t = date ? new Date(date).getTime() : NaN;
  if (!Number.isFinite(t)) return 1;
  const ageDays = Math.max(0, (Date.now() - t) / 86400000);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function sessionSizeFeel(session) {
  return session.size_feel || session.meteo?.sizeFeel || null;
}

function sessionWaveHeight(session) {
  const m = session.meteo;
  if (!m || typeof m.waveHeight !== 'number') return null;
  return Math.max(m.waveHeight, typeof m.swellHeight === 'number' ? m.swellHeight : 0);
}

function weightedQuantile(points, q) {
  const sorted = [...points].sort((x, y) => x.h - y.h);
  const total = sorted.reduce((sum, p) => sum + p.w, 0);
  let acc = 0;
  for (const p of sorted) {
    acc += p.w;
    if (acc >= q * total) return p.h;
  }
  return sorted[sorted.length - 1].h;
}

function learnWaveRange(pastSessions, profile) {
  const declared = {
    min: profile?.min_wave_height || 0.8,
    max: profile?.max_wave_height || 2.0,
  };
  const base = { ...declared, source: 'declared', basedOnSessions: 0, confidence: 0, declared };

  const good = [], tooSmall = [], tooBig = [];
  (pastSessions || []).forEach(s => {
    const h = sessionWaveHeight(s);
    if (h == null) return;
    const feel = sessionSizeFeel(s);
    // Les sessions récentes pèsent plus : la fourchette suit la progression du surfeur
    const recency = recencyWeight(s.date, 365);
    if (feel === 'perfect') good.push({ h, w: 1 * recency });
    else if (feel === 'too_small') { if (recency >= 0.25) tooSmall.push(h); }
    else if (feel === 'too_big') { if (recency >= 0.25) tooBig.push(h); }
    else if (s.rating >= 4) good.push({ h, w: 0.5 * recency });
  });

  const evidence = good.length + tooSmall.length + tooBig.length;
  if (good.length < 3 || evidence < MIN_SESSIONS_TO_LEARN) {
    return { ...base, basedOnSessions: evidence };
  }

  let learnedMin = weightedQuantile(good, 0.1);
  let learnedMax = weightedQuantile(good, 0.9);
  const center = weightedQuantile(good, 0.5);
  // Les « trop petit » remontent le mini, les « trop gros » abaissent le maxi
  const smallBelow = tooSmall.filter(h => h < center);
  const bigAbove = tooBig.filter(h => h > center);
  if (smallBelow.length) learnedMin = Math.max(learnedMin, Math.max(...smallBelow) + 0.1);
  if (bigAbove.length) learnedMax = Math.min(learnedMax, Math.min(...bigAbove) - 0.1);
  if (learnedMax < learnedMin + 0.3) learnedMax = learnedMin + 0.3;

  // On glisse progressivement du profil déclaré vers la fourchette apprise
  const confidence = Math.min(1, evidence / FULL_CONFIDENCE_SESSIONS);
  const round = v => Math.round(v * 10) / 10;
  return {
    min: round(declared.min + (learnedMin - declared.min) * confidence),
    max: round(declared.max + (learnedMax - declared.max) * confidence),
    source: 'learned',
    basedOnSessions: evidence,
    confidence: Math.round(confidence * 100) / 100,
    declared,
  };
}

// ─── Facteur Vent (0-10) ────────────────────────────────
// ─── Tolérance au vent apprise ──────────────────────────
// Le vent est le critère le plus important, et tout le monde ne le supporte pas pareil.
// Point de départ selon le niveau, puis affinage avec le ressenti donné à chaque session
// (« propre », « gênant », « trop fort »). Valable sur tous les spots : ça parle du surfeur.
const WIND_SCALE_BY_LEVEL = { beginner: 20, intermediate: 25, advanced: 30, expert: 30 };
const WIND_SCALE_MIN = 14, WIND_SCALE_MAX = 36;
const WIND_BOTHER_RATIO = 0.83; // avec une échelle E, le vent devient gênant vers 0,83 × E km/h

function sessionWindFeel(session) {
  return session.wind_feel || session.meteo?.windFeel || null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function learnWindTolerance(pastSessions, profile) {
  const defaultScale = WIND_SCALE_BY_LEVEL[profile?.surf_level] || 25;
  const base = { scale: defaultScale, botherKmh: Math.round(defaultScale * WIND_BOTHER_RATIO), source: 'level', basedOnSessions: 0, confidence: 0 };

  const clean = [], bother = [];
  (pastSessions || []).forEach(s => {
    const feel = sessionWindFeel(s);
    const m = s.meteo;
    if (!feel || !m || typeof m.windSpeed !== 'number') return;
    // Un vent de terre gêne beaucoup moins : il n'apprend rien sur la tolérance au vent de mer
    const waveDir = m.swellDirection != null ? m.swellDirection : m.waveDirection;
    if (m.windDirection != null && waveDir != null) {
      const d = Math.abs(m.windDirection - waveDir) % 360;
      if ((d > 180 ? 360 - d : d) > 120) return;
    }
    if (feel === 'clean') clean.push(m.windSpeed);
    else if (feel === 'annoying' || feel === 'too_much') bother.push(m.windSpeed);
  });

  const n = clean.length + bother.length;
  if (n < 3) return { ...base, basedOnSessions: n };

  let botherKmh;
  if (bother.length) {
    const typicalBother = median(bother);
    const cleanBelow = clean.filter(v => v <= typicalBother);
    botherKmh = cleanBelow.length ? (Math.max(...cleanBelow) + typicalBother) / 2 : Math.min(...bother);
  } else {
    // Que des sessions « propres » : il supporte au moins le vent le plus fort qu'il a trouvé propre
    botherKmh = Math.max(defaultScale * WIND_BOTHER_RATIO, Math.max(...clean) * 1.15);
  }

  const confidence = Math.min(1, n / 10);
  const learnedScale = botherKmh / WIND_BOTHER_RATIO;
  const scale = Math.min(WIND_SCALE_MAX, Math.max(WIND_SCALE_MIN, defaultScale + (learnedScale - defaultScale) * confidence));
  return {
    scale: Math.round(scale * 10) / 10,
    botherKmh: Math.round(scale * WIND_BOTHER_RATIO),
    source: 'learned',
    basedOnSessions: n,
    confidence: Math.round(confidence * 100) / 100,
  };
}

function scoreWind(windSpeed, windDirection, idealWindDirections, waveDirection, scale = 25) {
  if (typeof windSpeed !== 'number' || Number.isNaN(windSpeed)) windSpeed = 0;
  // windSpeed en km/h, windDirection en degrés (0-360)
  const speedKmh = windSpeed || 0; // toujours en km/h (converti a la collecte)

  // Courbe continue gaussienne au lieu de paliers
  // 0→10, 10→8.5, 15→7.0, 20→5.3, 25→3.7, 30→2.4, 40→0.8
  const speedScore = 10 * Math.exp(-Math.pow(speedKmh / scale, 2));

  // Scoring offshore : compare direction vent vs direction vagues
  let offshoreBonus = 0;
  if (windDirection != null && waveDirection != null) {
    const diff = Math.abs(windDirection - waveDirection);
    const normalized = diff > 180 ? 360 - diff : diff;
    if (normalized > 150)      offshoreBonus = 2.0;   // offshore pur
    else if (normalized > 120) offshoreBonus = 1.5;   // cross-offshore
    else if (normalized > 60)  offshoreBonus = 0;     // cross-shore
    else if (normalized > 30)  offshoreBonus = -1.0;  // cross-onshore
    else                       offshoreBonus = -1.5;  // onshore pur
  }

  // Bonus direction idéale du spot (si connue)
  let spotDirBonus = 0;
  if (windDirection != null && idealWindDirections?.length > 0) {
    const dir = degreesToCardinal(windDirection);
    if (idealWindDirections.includes(dir)) spotDirBonus = 0.5;
  }

  return Math.min(10, Math.max(0, speedScore + offshoreBonus + spotDirBonus));
}

// ─── Facteur Vagues + Houle (0-10) ──────────────────────
function scoreWaves(waveHeight, swellHeight, profile) {
  const combined = Math.max(waveHeight || 0, swellHeight || 0);
  const min = profile.min_wave_height || 0.8;
  const max = profile.max_wave_height || 2.0;
  const optimal = (min + max) / 2;

  if (combined >= min && combined <= max) {
    // Dans la fourchette — peak au centre
    const distFromOptimal = Math.abs(combined - optimal) / ((max - min) / 2);
    return 10 - distFromOptimal * 2;
  } else if (combined < min) {
    const shortfall = (min - combined) / min;
    return Math.max(0, 6 - shortfall * 10);
  } else {
    const excess = (combined - max) / max;
    return Math.max(0, 6 - excess * 8);
  }
}

// ─── Facteur Période (0-10) ─────────────────────────────
function scorePeriod(period) {
  if (!period) return 4; // neutre si inconnu (pas 3 — on ne pénalise pas l'absence)
  // Courbe sigmoïde : transition douce entre 6-14s, plateau au-dessus
  // 5s→2.4, 7s→3.6, 8s→4.4, 10s→6.0, 12s→7.6, 14s→8.8, 16s→9.5
  return Math.min(10, 2 + 8 / (1 + Math.exp(-0.6 * (period - 10))));
}

// ─── Facteur Adéquation Spot (0-10) ─────────────────────
function scoreSpot(slot, spot) {
  let score = 5; // base neutre

  if (spot.ideal_wind?.length > 0 && slot.windDirection != null) {
    const dir = degreesToCardinal(slot.windDirection);
    if (spot.ideal_wind.includes(dir)) score += 2.5;
  }

  if (spot.ideal_swell?.length > 0 && slot.swellDirection != null) {
    const dir = degreesToCardinal(slot.swellDirection);
    if (spot.ideal_swell.includes(dir)) score += 2.5;
  }

  return Math.min(10, score);
}

// ─── Bonus Marée ────────────────────────────────────────
// Impact réel sur le Pays Basque : la marée peut rendre un spot dangereux ou parfait
// Catégorie de marée : 'low' | 'mid' | 'high' | null
// Priorité au niveau (tideLevel : 0 = basse mer, 1 = pleine mer), sinon la phase
function tideCategory(slot) {
  if (typeof slot.tideLevel === 'number') {
    if (slot.tideLevel < 0.25) return 'low';
    if (slot.tideLevel > 0.75) return 'high';
    return 'mid';
  }
  const phaseMap = { low: 'low', high: 'high', rising: 'mid', falling: 'mid' };
  return phaseMap[slot.tidePhase] || null;
}

function tideBonus(slot, idealTide) {
  const category = tideCategory(slot);
  if (!category) return 0;

  // Spot sans fiche marée → neutre (on ne récompense pas l'absence d'information)
  if (!idealTide?.length) return 0;

  // Marée idéale → bonus
  if (idealTide.includes(category)) return 1.0;

  // Marée opposée à l'idéale → pénalité forte
  const isOpposite = (idealTide.includes('low') && category === 'high' && !idealTide.includes('mid')) ||
                     (idealTide.includes('high') && category === 'low' && !idealTide.includes('mid'));
  if (isOpposite) return -1.5;

  // Marée pas idéale mais pas opposée
  return -0.5;
}

// ─── Board Suggestion ───────────────────────────────────
// Attention : beaucoup de surfeurs n'ont qu'une board et surfent tout avec.
// La suggestion doit être utile, pas culpabilisante.
function suggestBoard(slot, pastSessions, boards) {
  if (!boards?.length) return null;
  const waveH = Math.max(slot.waveHeight || 0, slot.swellHeight || 0);

  // Cas 1 : Une seule board → pas besoin de suggérer, c'est évident
  if (boards.length === 1) {
    return {
      board: boards[0],
      confidence: 1.0,
      method: 'only_board',
      reason: 'Ta fidèle compagne',
      basedOnSessions: 0,
    };
  }

  // Cas 2 : Plusieurs boards — regarder d'abord l'historique réel
  // (ce que le surfeur FAIT est plus important que ce qu'il a déclaré)
  const goodSessions = pastSessions.filter(s => s.rating >= 4 && s.meteo && s.board_id);
  if (goodSessions.length >= 3) {
    function similarity(s) {
      const dWave = Math.abs((s.meteo.waveHeight || 0) - waveH) / 3;
      const dWind = Math.abs((s.meteo.windSpeed || 0) - (slot.windSpeed || 0)) / 40;
      // Décroissance temporelle aussi ici
      const ageInDays = (Date.now() - new Date(s.date).getTime()) / 86400000;
      const recency = Math.exp(-ageInDays / 180);
      return recency / (1 + Math.sqrt(dWave ** 2 + dWind ** 2));
    }

    const similar = goodSessions
      .map(s => ({ board_id: s.board_id, sim: similarity(s) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 7);

    const boardCounts = {};
    similar.forEach(({ board_id }) => {
      boardCounts[board_id] = (boardCounts[board_id] || 0) + 1;
    });
    const topBoardId = Object.entries(boardCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const board = boards.find(b => String(b.id) === String(topBoardId));

    if (board) {
      // Vérifier si le surfeur utilise toujours la même board (mono-board de fait)
      const uniqueBoards = new Set(goodSessions.map(s => s.board_id));
      if (uniqueBoards.size === 1) {
        return {
          board,
          confidence: 1.0,
          method: 'always_same',
          reason: 'Ta board de toutes les sessions',
          basedOnSessions: goodSessions.length,
        };
      }

      return {
        board,
        confidence: Math.round((boardCounts[topBoardId] / similar.length) * 100) / 100,
        method: 'history',
        reason: 'Celle que tu prends dans ces conditions',
        basedOnSessions: similar.length,
      };
    }
  }

  // Cas 3 : Pas assez de sessions — utiliser le sweet spot déclaré
  const matchingBoards = boards
    .filter(b => b.sweet_spot_wave_min && b.sweet_spot_wave_max)
    .filter(b => waveH >= b.sweet_spot_wave_min && waveH <= b.sweet_spot_wave_max)
    .sort((a, b) => {
      const centerA = (a.sweet_spot_wave_min + a.sweet_spot_wave_max) / 2;
      const centerB = (b.sweet_spot_wave_min + b.sweet_spot_wave_max) / 2;
      return Math.abs(centerA - waveH) - Math.abs(centerB - waveH);
    });

  if (matchingBoards.length > 0) {
    return {
      board: matchingBoards[0],
      confidence: 0.7,
      method: 'sweet_spot',
      reason: `Dans son sweet spot (${waveH.toFixed(1).replace('.', ',')} m)`,
      basedOnSessions: 0,
    };
  }

  // Cas 4 : Aucun match — ne rien suggérer plutôt que suggérer n'importe quoi
  return null;
}

// ─── Utilitaires ────────────────────────────────────────
function degreesToCardinal(deg) {
  if (deg === null || deg === undefined) return null;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Rafales en km/h → coefficient appliqué à la note (1 = sans effet)
function rafalesGate(gust) {
  if (gust == null || gust <= 25) return 1;
  if (gust <= 40) return 1 - (gust - 25) / 15 * 0.55;      // 25 → 1 ; 40 → 0,45
  if (gust <= 55) return 0.45 - (gust - 40) / 15 * 0.23;   // 40 → 0,45 ; 55 → 0,22
  return 0.2;
}

// ─── Explications lisibles ────────────────────────────────
function buildWhyGood(slot, windScore, wavesScore, periodScore, tideAdj, spotScore, profile, spot, memory) {
  const reasons = [];   // pourquoi c'est bien
  const caveats = [];   // points d'attention

  // --- Vent ---
  const speedKmh = slot.windSpeed || 0;
  const gust = slot.windGust || 0;
  if (gust >= 30) {
    caveats.push('Rafales à ' + Math.round(gust) + ' km/h' + (gust >= 45 ? ', plan d\'eau soufflé' : ', vent irrégulier'));
  } else if (windScore >= 9) {
    if (speedKmh <= 8) reasons.push('Conditions glassy, quasi pas de vent');
    else reasons.push('Vent léger de terre (' + Math.round(speedKmh) + ' km/h), vagues propres');
  } else if (windScore >= 7) {
    // Vérifier si c'est grâce à l'offshore
    if (slot.windDirection != null && slot.waveDirection != null) {
      const diff = Math.abs(slot.windDirection - slot.waveDirection);
      const norm = diff > 180 ? 360 - diff : diff;
      if (norm > 120) reasons.push('Vent offshore, vagues propres et creuses');
      else reasons.push('Vent modéré et bien orienté');
    } else {
      reasons.push('Vent faible (' + Math.round(speedKmh) + ' km/h)');
    }
  } else if (windScore < 4) {
    if (speedKmh > 30) caveats.push('Vent fort (' + Math.round(speedKmh) + ' km/h), conditions difficiles');
    else caveats.push('Vent onshore, vagues hachées');
  }

  // --- Vagues ---
  const waveH = Math.max(slot.waveHeight || 0, slot.swellHeight || 0);
  if (wavesScore >= 8) {
    reasons.push('Vagues parfaites pour toi (' + waveH.toFixed(1).replace('.', ',') + ' m)');
  } else if (wavesScore >= 6) {
    reasons.push('Taille de vagues dans ta zone (' + waveH.toFixed(1).replace('.', ',') + ' m)');
  } else if (wavesScore < 4) {
    if (waveH < (profile.min_wave_height || 0.8)) {
      caveats.push('Vagues petites (' + waveH.toFixed(1).replace('.', ',') + ' m), en dessous de tes préférences');
    } else {
      caveats.push('Vagues grosses (' + waveH.toFixed(1).replace('.', ',') + ' m), au-dessus de tes préférences');
    }
  }

  // --- Période ---
  const period = slot.wavePeriod || 0;
  if (period >= 12) {
    reasons.push('Période longue (' + Math.round(period) + ' s), vagues puissantes et espacées');
  } else if (period > 0 && period < 7) {
    caveats.push('Période courte (' + Math.round(period) + ' s), vagues désorganisées');
  }

  // --- Marée ---
  const tideCat = tideCategory(slot);
  const tideLabel = { low: 'Marée basse', high: 'Marée haute', mid: 'Mi-marée' }[tideCat];
  if (tideLabel && tideAdj >= 1.0) {
    reasons.push(tideLabel + ', idéale pour ce spot');
  } else if (tideLabel && tideAdj <= -1.0) {
    caveats.push(tideLabel + ', pas idéale pour ce spot');
  }

  if (slot.windWaveHeight != null && slot.waveHeight && slot.windWaveHeight / slot.waveHeight >= 0.4) caveats.push('Mer hachée par le vent');
  if (slot.confidence === 'low') caveats.push('Les prévisions ne sont pas d\'accord entre elles, à confirmer');

  // --- Mémoire du spot : on rappelle un vécu, pas une date ---
  const reminder = memoryReminder(memory);
  if (reminder?.tone === 'good') reasons.push(reminder.text);
  else if (reminder?.tone === 'bad') caveats.push(reminder.text);

  return { whyGood: reasons, whyNotPerfect: caveats, reminder: reminder || null };
}

// ─── Bonus Communautaire ─────────────────────────────────
// S'active automatiquement quand le profil communautaire du spot a assez de data
function scoreCommunity(slot, communityProfile) {
  if (!communityProfile || communityProfile.confidence < 0.3) return { bonus: 0, active: false };

  const waveH = Math.max(slot.waveHeight || 0, slot.swellHeight || 0);
  let bonus = 0;

  // Les conditions matchent le sweet spot communautaire ?
  if (communityProfile.wave_sweet_min && communityProfile.wave_sweet_max) {
    if (waveH >= communityProfile.wave_sweet_min && waveH <= communityProfile.wave_sweet_max) {
      bonus += 0.8 * communityProfile.confidence;
    } else if (waveH < communityProfile.wave_sweet_min * 0.7 || waveH > communityProfile.wave_sweet_max * 1.3) {
      bonus -= 0.5 * communityProfile.confidence;
    }
  }

  // Le vent est dans les bonnes directions communautaires ?
  if (communityProfile.best_wind_dirs?.length > 0 && slot.windDirection != null) {
    const dir = degreesToCardinal(slot.windDirection);
    if (communityProfile.best_wind_dirs.includes(dir)) {
      bonus += 0.4 * communityProfile.confidence;
    }
  }

  // La marée communautaire
  if (communityProfile.tide_good?.length > 0 && slot.tidePhase) {
    const category = tideCategory(slot);
    if (communityProfile.tide_good.includes(slot.tidePhase) || communityProfile.tide_good.includes(category)) {
      bonus += 0.3 * communityProfile.confidence;
    }
    if (communityProfile.tide_bad?.includes(slot.tidePhase)) {
      bonus -= 0.5 * communityProfile.confidence;
    }
  }

  return {
    bonus: Math.round(Math.min(1.5, Math.max(-1.0, bonus)) * 10) / 10,
    active: true,
    confidence: communityProfile.confidence,
    sessionCount: communityProfile.session_count,
  };
}

// ─── Mémoire du spot ─────────────────────────────────────
// Ce que le surfeur a vécu SUR CE SPOT, dans des conditions proches, fait bouger la prévision.
// Règle stricte : une session ne se compare qu'à une prévision du même spot — les mêmes chiffres
// ne donnent pas la même vague ailleurs.
function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Ressemblance entre une session passée et un créneau à venir : 1 = identique, 0 = rien à voir.
// On compare tout ce qui est connu des deux côtés : taille, période, vent (force et direction),
// direction de houle, niveau de marée.
function sessionSimilarity(session, slot) {
  const m = session.meteo;
  const diffs = []; // { d: écart normalisé, w: poids du critère }
  const sH = sessionWaveHeight(session);
  const fH = Math.max(slot.waveHeight || 0, slot.swellHeight || 0);
  if (sH == null || !fH) return 0; // sans la taille des vagues, pas de comparaison possible
  diffs.push({ d: (sH - fH) / Math.max(0.3, fH * 0.25), w: 1.5 });
  if (typeof m.windSpeed !== 'number' || typeof slot.windSpeed !== 'number') return 0;
  // Le vent, force et direction, est le critère qui pèse le plus
  diffs.push({ d: (m.windSpeed - slot.windSpeed) / 8, w: 2 });
  if (m.windDirection != null && slot.windDirection != null && Math.max(m.windSpeed, slot.windSpeed) > 8) {
    diffs.push({ d: angleDiff(m.windDirection, slot.windDirection) / 40, w: 2 });
  }
  if (m.wavePeriod && slot.wavePeriod) diffs.push({ d: (m.wavePeriod - slot.wavePeriod) / 3, w: 1 });
  const sSwell = m.swellDirection != null ? m.swellDirection : m.waveDirection;
  const fSwell = slot.swellDirection != null ? slot.swellDirection : slot.waveDirection;
  if (sSwell != null && fSwell != null) diffs.push({ d: angleDiff(sSwell, fSwell) / 30, w: 1 });
  if (typeof m.tideLevel === 'number' && typeof slot.tideLevel === 'number') diffs.push({ d: (m.tideLevel - slot.tideLevel) / 0.35, w: 1 });

  // Données anciennes mal formées (texte à la place d'un nombre) : on ignore le critère
  const usable = diffs.filter(x => Number.isFinite(x.d));
  if (usable.length < 2) return 0;
  const totalW = usable.reduce((sum, x) => sum + x.w, 0);
  const distance = Math.sqrt(usable.reduce((sum, x) => sum + x.w * x.d * x.d, 0) / totalW);
  return Math.exp(-distance * distance);
}

const SIMILAR_THRESHOLD = 0.4;   // en dessous, la session ne ressemble pas assez
const MEMORY_MAX_ADJUST = 1.5;   // la mémoire déplace la note de 1,5 point au plus

function spotMemory(slot, pastSessions, spotId) {
  const none = { adjustment: 0, sessionsHere: 0, similarCount: 0, bestGood: null, worstBad: null, goodCount: 0, badCount: 0 };
  if (!spotId) return none;
  const here = (pastSessions || []).filter(s => s.spot_id === spotId && s.rating >= 1 && s.meteo);
  if (!here.length) return none;

  const similar = here
    .map(s => ({ s, sim: sessionSimilarity(s, slot) }))
    .filter(x => x.sim >= SIMILAR_THRESHOLD)
    .map(x => ({ ...x, w: x.sim * recencyWeight(x.s.date, 730) }))
    .sort((a, b) => b.sim - a.sim);
  if (!similar.length) return { ...none, sessionsHere: here.length };

  const totalW = similar.reduce((sum, x) => sum + x.w, 0);
  const avgRating = similar.reduce((sum, x) => sum + x.s.rating * x.w, 0) / totalW;
  // Une seule session très proche pèse un tiers ; trois et plus pèsent plein
  const strength = Math.min(1, totalW / 3);
  const adjustment = Math.round(((avgRating - 3) / 2) * strength * MEMORY_MAX_ADJUST * 10) / 10;

  return {
    adjustment,
    sessionsHere: here.length,
    similarCount: similar.length,
    bestGood: similar.find(x => x.s.rating >= 4)?.s || null,
    worstBad: similar.find(x => x.s.rating <= 2)?.s || null,
    goodCount: similar.filter(x => x.s.rating >= 4).length,
    badCount: similar.filter(x => x.s.rating <= 2).length,
  };
}

// Le rappel affiché au surfeur. Personne ne se souvient d'une date de session :
// on rappelle ce qu'il a vécu, avec ses propres mots quand il a laissé une note.
function memoryReminder(memory) {
  if (!memory || !memory.similarCount) return null;
  if (memory.adjustment > 0 && memory.bestGood) {
    const note = (memory.bestGood.notes || '').trim().replace(/\s+/g, ' ');
    if (note && note.length <= 70) {
      return { tone: 'good', text: 'Tu connais ces conditions ici. Tu avais noté : « ' + note + ' »' };
    }
    if (memory.goodCount >= 2) return { tone: 'good', text: 'Tu as déjà eu ces conditions ici ' + memory.goodCount + ' fois, et tu avais aimé' };
    if (memory.bestGood.rating >= 5) return { tone: 'good', text: 'Tu as déjà eu ces conditions ici, et tu avais adoré' };
    return { tone: 'good', text: 'Tu as déjà eu ces conditions ici, et c\'était une bonne session' };
  }
  if (memory.adjustment < 0 && memory.worstBad) {
    return { tone: 'bad', text: 'Tu as déjà eu ces conditions ici, et ça ne t\'avait pas plu' };
  }
  return null;
}

// ─── Fonction principale ─────────────────────────────────
function scoreSlot(slot, context) {
  const { spot, pastSessions = [], boards = [], communityProfile = null } = context;
  const sessionsWithMeteo = pastSessions.filter(s => s.meteo).length;
  const weights = computeWeights();
  // Fourchette de vagues : apprise des sessions si possible, sinon celle du profil
  const waveRange = context.waveRange || learnWaveRange(pastSessions, context.profile);
  const profile = { ...context.profile, min_wave_height: waveRange.min, max_wave_height: waveRange.max };

  const windTolerance = context.windTolerance || learnWindTolerance(pastSessions, context.profile);
  const windScore    = scoreWind(slot.windSpeed, slot.windDirection, spot.ideal_wind, slot.waveDirection, windTolerance.scale);
  const wavesScore   = scoreWaves(slot.waveHeight, slot.swellHeight, profile);
  // La période qui compte est celle de la houle principale, pas la moyenne brouillée par la mer du vent
  const periodScore  = scorePeriod(slot.swellPeriod || slot.wavePeriod);
  const spotScore    = scoreSpot(slot, spot);
  const tideAdj      = tideBonus(slot, spot.ideal_tide);

  const community = scoreCommunity(slot, communityProfile);

  // Mémoire : ce que le surfeur a déjà vécu sur ce spot dans des conditions proches
  const memory = spotMemory(slot, pastSessions, slot.spotId || spot.id);
  const similarSession = memory.bestGood;

  const rawScore =
    windScore    * weights.wind   +
    wavesScore   * weights.waves  +
    periodScore  * weights.period +
    spotScore    * weights.spot   +
    tideAdj +
    community.bonus +
    memory.adjustment;

  // Conditions nécessaires : sans vagues à ta taille, ou avec un vent destructeur,
  // rien d'autre ne peut sauver le créneau. On multiplie au lieu d'additionner.
  //   vagues dans la fourchette (score >= 6) → ×1 ; plat ou énorme (score 0) → ×0.2
  //   vent correct (score >= 4) → ×1 ; vent destructeur (score 0) → ×0.5
  const sizeGate = 0.2 + 0.8 * Math.min(1, wavesScore / 6);
  const windGate = 0.5 + 0.5 * Math.min(1, windScore / 4);
  // Rafales : un vent moyen correct ne dit rien d'un plan d'eau soufflé par à-coups
  const gust = slot.windGust;
  const gustGate = rafalesGate(gust);
  // Mer du vent : quand elle pèse lourd face à la houle, la mer est hachée même si la taille est bonne
  const chop = slot.windWaveHeight != null && slot.waveHeight ? slot.windWaveHeight / slot.waveHeight : 0;
  const chopGate = chop >= 0.6 ? 0.7 : chop >= 0.4 ? 0.85 : 1;
  let cappedScore = rawScore * sizeGate * windGate * gustGate * chopGate;

  // Tempête : on ne recommande jamais, quoi que disent les autres critères
  const storm = (gust != null && gust >= 50) || ((slot.waveHeight || 0) >= 3.5 && (slot.windSpeed || 0) >= 30);
  if (storm) cappedScore = Math.min(cappedScore, 2.5);
  // Une houle courte ne fait jamais une session exceptionnelle, même propre et à la bonne taille
  const swellPeriod = slot.swellPeriod || slot.wavePeriod;
  if (swellPeriod != null && swellPeriod < 7) cappedScore = Math.min(cappedScore, 6.4);
  else if (swellPeriod != null && swellPeriod < 9) cappedScore = Math.min(cappedScore, 7.9);
  // Quand les deux sources se contredisent, on ne promet pas une session exceptionnelle
  if (slot.confidence === 'low') cappedScore = Math.min(cappedScore, 6.9);

  const score = Math.round(Math.min(10, Math.max(0, cappedScore)) * 10) / 10;

  // Diagnostic de taille pour les libellés
  const combinedWave = Math.max(slot.waveHeight || 0, slot.swellHeight || 0);
  const sizeIssue = wavesScore >= 4 ? null
    : (combinedWave < (profile.min_wave_height || 0.8) ? 'too_small' : 'too_big');

  const boardSuggestion = score >= 6 ? suggestBoard(slot, pastSessions, boards) : null;

  // Trouver la session similaire la plus proche pour la narrative

  const why = buildWhyGood(slot, windScore, wavesScore, periodScore, tideAdj, spotScore, profile, spot, memory);

  return {
    score,
    factors: {
      wind:    { score: Math.round(windScore * 10) / 10,    weight: weights.wind },
      waves:   { score: Math.round(wavesScore * 10) / 10,   weight: weights.waves },
      period:  { score: Math.round(periodScore * 10) / 10,  weight: weights.period },
      history: { score: null, weight: 0, basedOnSessions: sessionsWithMeteo },
      spot:    { score: Math.round(spotScore * 10) / 10,     weight: weights.spot },
      tide:    { bonus: tideAdj },
      community: community,
      memory: { adjustment: memory.adjustment, sessionsHere: memory.sessionsHere, similarCount: memory.similarCount },
    },
    reminder: why.reminder,
    whyGood: community.active && community.bonus > 0
      ? [...why.whyGood, `👥 Confirmé par ${community.sessionCount} sessions terrain (confiance ${Math.round(community.confidence * 100)}%)`]
      : why.whyGood,
    whyNotPerfect: community.active && community.bonus < 0
      ? [...why.whyNotPerfect, `👥 Retours terrain mitigés sur ce spot dans ces conditions`]
      : why.whyNotPerfect,
    boardSuggestion,
    similarSession,
    memory,
    sizeIssue,
    storm,
    confidence: slot.confidence || 'single',
    waveRange,
    windTolerance,
    calibrationLevel: waveRange.confidence,
  };
}

module.exports = { rafalesGate, scoreSlot, learnWaveRange, learnWindTolerance, memoryReminder, computeWeights, degreesToCardinal, buildWhyGood, tideCategory, spotMemory, sessionSimilarity };
