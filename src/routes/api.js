// 📡 Routes principales de l'API SurfAI
const express = require('express');
const router = express.Router();

// Middleware d'authentification et rate limiting
const { authenticateAPI } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');

console.log('📡 Chargement des routes API...');

// 🌊 Routes météo (PRINCIPALES - remplacent l'appel direct à Stormglass)
// Ces routes sont publiques mais avec rate limiting pour éviter l'abus
router.use('/weather', rateLimiter, require('./weather'));

// 🏄‍♂️ Routes sessions (protégées par authentification)
// router.use('/sessions', authenticateAPI, require('./sessions'));

// 🎯 Routes prédictions intelligentes (protégées)
// router.use('/predictions', authenticateAPI, require('./predictions'));

// 📍 Routes spots (publiques)
// router.use('/spots', require('./spots'));

// 🧪 Route de test simple
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '🧪 API SurfAI fonctionne !',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /api/v1/test',
      'GET /api/v1/weather/forecast',
      'POST /api/v1/weather/quality-prediction'
    ]
  });
});

// 📊 Route d'informations sur l'API
router.get('/info', (req, res) => {
  res.json({
    name: 'SurfAI API',
    version: '1.0.0',
    description: 'API intelligente pour prédictions de surf',
    endpoints: {
      weather: {
        forecast: 'GET /api/v1/weather/forecast',
        quality: 'POST /api/v1/weather/quality-prediction'
      }
    },
    rateLimit: '100 requêtes par 15 minutes',
    cors: 'Configuré pour développement local'
  });
});

// ========================================
// ROUTES ADAPTEURS — Compatibilité frontend
// ========================================

// Coordonnées des spots principaux
const SPOT_COORDS = {
  'biarritz': { lat: 43.4832, lng: -1.5586 },
  'hossegor': { lat: 43.6617, lng: -1.4278 },
  'anglet': { lat: 43.5109, lng: -1.5213 },
  'lacanau': { lat: 44.9833, lng: -1.2000 },
  'capbreton': { lat: 43.6431, lng: -1.4434 },
  'seignosse': { lat: 43.6667, lng: -1.4167 },
  'biscarrosse': { lat: 44.4500, lng: -1.2500 },
};

// Adapteur : /api/v1/ai/test → alias de /api/v1/test
router.get('/ai/test', (req, res) => {
  res.json({ status: 'UPGRADED_TO_V2', message: '🤖 SurfAI IA Engine opérationnel', version: '2.0' });
});

// Adapteur : /api/v1/ai/demo/:userId → analyse réelle depuis Supabase
router.get('/ai/demo/:userId', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const userId = req.params.userId;

    const [sessions, profile] = await Promise.all([
      db.getSessions(userId),
      db.getProfile(userId),
    ]);

    // Calcul des préférences depuis les sessions réelles
    const sessionsWithMeteo = sessions.filter(s => s.meteo);
    const goodSessions = sessions.filter(s => s.rating >= 4);
    const goodWithMeteo = goodSessions.filter(s => s.meteo);

    const avgWaveHeight = goodWithMeteo.length > 0
      ? goodWithMeteo.reduce((sum, s) => sum + (s.meteo.waveHeight || 0), 0) / goodWithMeteo.length
      : (profile?.min_wave_height ? (profile.min_wave_height + profile.max_wave_height) / 2 : 1.5);

    const avgWindSpeed = goodWithMeteo.length > 0
      ? goodWithMeteo.reduce((sum, s) => sum + (s.meteo.windSpeed || 0), 0) / goodWithMeteo.length
      : 15;

    // Spot favori (le plus surfé)
    const spotCount = {};
    sessions.forEach(s => { spotCount[s.spot_id] = (spotCount[s.spot_id] || 0) + 1; });
    const favoriteSpotId = Object.entries(spotCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    const favoriteSpot = sessions.find(s => s.spot_id === favoriteSpotId)?.spots;

    // Heure préférée
    const hours = sessions.filter(s => s.time).map(s => parseInt(s.time.split(':')[0]));
    const avgHour = hours.length > 0 ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length) : 9;

    const insights = [];
    if (sessions.length === 0) insights.push('Enregistrez vos premières sessions pour personnaliser les recommandations');
    else if (goodWithMeteo.length > 0) insights.push(`Vous surfez mieux avec des vagues de ${avgWaveHeight.toFixed(1)}m`);
    if (sessions.length > 5) insights.push(`${sessions.length} sessions analysées`);

    res.json({
      success: true,
      userId,
      userPreferences: {
        totalSessions: sessions.length,
        wavePreferences: { optimalHeight: { value: Math.round(avgWaveHeight * 10) / 10 } },
        windPreferences: { preferredDirection: 'Offshore', optimalSpeed: { value: Math.round(avgWindSpeed) } },
        spotPreferences: { favorite: { name: favoriteSpot?.name || 'Biarritz' } },
        timePreferences: { preferredHour: avgHour },
        behavioralInsights: insights,
        reliabilityScore: Math.min(1, sessions.length / 20),
      },
      profile,
      message: `Analyse de ${sessions.length} sessions réelles`,
    });
  } catch (error) {
    console.error('Erreur ai/demo:', error.message);
    res.json({
      success: true,
      userId: req.params.userId,
      userPreferences: {
        totalSessions: 0,
        wavePreferences: { optimalHeight: { value: 1.5 } },
        windPreferences: { preferredDirection: 'Offshore', optimalSpeed: { value: 15 } },
        spotPreferences: { favorite: { name: 'Biarritz' } },
        timePreferences: { preferredHour: 9 },
        behavioralInsights: ['Connectez Supabase pour personnaliser les recommandations'],
        reliabilityScore: 0,
      },
    });
  }
});

// Adapteur : /api/v1/sessions/weather/auto?spot=X → redirige vers /weather/forecast
router.get('/sessions/weather/auto', async (req, res) => {
  try {
    const spotName = (req.query.spot || 'biarritz').toLowerCase();
    const coords = SPOT_COORDS[spotName] || SPOT_COORDS['biarritz'];
    const days = req.query.days || 3;
    const userLevel = req.query.user_level || 'intermediate';

    // Appel interne au service météo
    const stormglassService = require('../services/stormglassService');
    const predictionService = require('../services/predictionService');

    const weatherData = await stormglassService.getForecast(coords.lat, coords.lng, days);
    const predictions = await predictionService.processForecastData(weatherData, userLevel);

    // Extraire les conditions actuelles (premier point >= maintenant, ou le premier)
    const nowSec = Date.now() / 1000;
    const currentPoint = weatherData.forecast && (
      weatherData.forecast.find(p => p.timestamp >= nowSec) || weatherData.forecast[0]
    );

    // Convertir degrés → direction cardinale
    const degreesToCompass = (deg) => {
      if (deg === null || deg === undefined) return 'N';
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    };

    const weather = currentPoint ? {
      waveHeight:    currentPoint.waveHeight,
      wavePeriod:    currentPoint.wavePeriod,
      windSpeed:     currentPoint.windSpeed,
      windDirection: degreesToCompass(currentPoint.windDirection),
      tidePhase:     currentPoint.tidePhase || 'unknown',
      tideHeight:    currentPoint.tideHeight || null,
      waterTemp:     currentPoint.waterTemp || null,
      confidence:    0.8,
      quality:       currentPoint.quality,
      offshore:      currentPoint.offshore,
    } : {};

    res.json({
      success: true,
      spot: req.query.spot || 'Biarritz',
      coords,
      weather,
      forecast: weatherData.forecast,
      predictions,
      message: `Prévisions pour ${req.query.spot || 'Biarritz'}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/sessions/quick → sauvegarde session + capture météo automatique
router.post('/sessions/quick', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const stormglassService = require('../services/stormglassService');
    const { userId, spotId, date, time, rating, notes, boardId } = req.body;
    // Ressenti sur la taille des vagues : 'too_small' | 'perfect' | 'too_big' (facultatif)
    const sizeFeel = ['too_small', 'perfect', 'too_big'].includes(req.body.sizeFeel) ? req.body.sizeFeel : null;
    // Ressenti sur le vent : 'clean' | 'annoying' | 'too_much' (facultatif)
    const windFeel = ['clean', 'annoying', 'too_much'].includes(req.body.windFeel) ? req.body.windFeel : null;

    let meteo = null;

    // Capture météo automatique si spot connu
    if (spotId) {
      try {
        const spot = await db.getSpotById(spotId);
        if (spot) {
          // Heure de la session : l'heure saisie est l'heure locale du spot
          const { spotTimeZone, localParts } = require('../services/timeUtils');
          const day = (date || new Date().toISOString()).split('T')[0];
          let sessionMs;
          if (time) {
            // On cherche l'instant UTC dont l'heure locale au spot correspond à l'heure saisie
            const tz = spotTimeZone(spot.lat, spot.lng);
            const wanted = parseInt(String(time).split(':')[0], 10);
            const minutes = parseInt(String(time).split(':')[1] || '0', 10);
            sessionMs = new Date(`${day}T${String(wanted).padStart(2, '0')}:00:00Z`).getTime();
            for (let shift = -14; shift <= 14; shift++) {
              const candidate = sessionMs + shift * 3600000;
              const local = localParts(candidate, tz);
              if (local.date === day && local.hour === wanted) { sessionMs = candidate; break; }
            }
            sessionMs += minutes * 60000;
          } else {
            sessionMs = date ? new Date(date).getTime() : Date.now();
          }

          // Météo du jour et de l'heure réellement surfés (et non celle du jour de saisie)
          const closest = sessionMs <= Date.now() + 5 * 86400000
            ? await stormglassService.getConditionsAt(spot.lat, spot.lng, sessionMs)
            : null;

          if (closest) {
            meteo = {
              waveHeight: closest.waveHeight,
              wavePeriod: closest.wavePeriod,
              waveDirection: closest.waveDirection,
              windSpeed: closest.windSpeed,      // km/h
              windDirection: closest.windDirection,
              swellHeight: closest.swellHeight,
              swellDirection: closest.swellDirection,
              capturedFor: new Date(sessionMs).toISOString(),
            };
            // Marée au moment de la session : indispensable pour reconnaître plus tard des conditions proches
            try {
              const { tideAt } = require('../services/collector');
              const extremes = await stormglassService.getTideExtremesAround(spot.lat, spot.lng, sessionMs);
              if (extremes.length) {
                const tide = tideAt(Math.floor(sessionMs / 1000), extremes);
                if (tide.tideLevel != null) { meteo.tideLevel = tide.tideLevel; meteo.tidePhase = tide.tidePhase; }
              }
            } catch (tideError) {
              console.warn('⚠️ Marée de la session non capturée:', tideError.message);
            }
            console.log(`📡 Météo capturée pour session: ${JSON.stringify(meteo)}`);
          }
        }
      } catch (meteoError) {
        console.warn('⚠️ Capture météo échouée (session sauvegardée sans météo):', meteoError.message);
      }
    }

    // Le ressenti est rangé avec la météo de la session : c'est lui qui apprend la fourchette
    if (sizeFeel) meteo = { ...(meteo || {}), sizeFeel };
    if (windFeel) meteo = { ...(meteo || {}), windFeel };

    const session = await db.createSession({
      user_id: userId,
      spot_id: spotId,
      date: date || new Date().toISOString(),
      time: time || null,
      rating: rating || null,
      notes: notes || '',
      board_id: boardId || null,
      meteo,
    });

    // Snapshot communautaire anonymisé (si météo + rating disponibles)
    if (meteo && rating && spotId) {
      try {
        const sessionDate = new Date(date || new Date());
        await db.supabase.from('spot_session_snapshots').insert({
          spot_id: spotId,
          wave_height: meteo.waveHeight || null,
          wind_speed: meteo.windSpeed || null,
          wind_direction: meteo.windDirection || null,
          wave_period: meteo.wavePeriod || null,
          swell_height: meteo.swellHeight || null,
          tide_phase: meteo.tidePhase || null,
          rating_norm: Math.round((rating / 5) * 100) / 100,
          month: sessionDate.getMonth() + 1,
          year: sessionDate.getFullYear(),
        });
        console.log('📊 Snapshot communautaire créé');
      } catch (snapError) {
        console.warn('⚠️ Snapshot communautaire échoué:', snapError.message);
      }
    }

    res.json({
      success: true,
      message: meteo ? 'Session enregistrée avec météo capturée automatiquement' : 'Session enregistrée (météo non disponible)',
      session,
      meteoCapture: meteo !== null,
    });
  } catch (error) {
    console.error('Erreur sessions/quick:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/sessions/list?userId=X → liste des sessions depuis Supabase
router.get('/sessions/list', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });
    const sessions = await db.getSessions(userId);
    res.json({ success: true, sessions, count: sessions.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/sessions/:id → modifier une session
router.put('/sessions/:id', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const { userId, rating, notes, date, time, board_id } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });
    const updates = {};
    if (rating !== undefined) updates.rating = rating;
    if (notes !== undefined) updates.notes = notes;
    if (date !== undefined) updates.date = date;
    if (time !== undefined) updates.time = time;
    if (board_id !== undefined) updates.board_id = board_id;
    const session = await db.updateSession(req.params.id, userId, updates);
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/sessions/:id?userId=X → supprimer une session
router.delete('/sessions/:id', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });
    await db.deleteSession(req.params.id, userId);
    res.json({ success: true, message: 'Session supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/spots → liste des spots depuis Supabase
router.get('/spots', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const spots = await db.getSpots();
    res.json({ success: true, spots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── ROUTES FAVORIS ──────────────────────────────────

// GET /api/v1/favorites?userId=X
router.get('/favorites', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });
    const { data: favRows, error } = await db.supabase
      .from('user_favorite_spots')
      .select('spot_id')
      .eq('user_id', userId);
    if (error) throw error;
    const spotIds = (favRows || []).map(r => r.spot_id);
    if (!spotIds.length) return res.json({ success: true, favorites: [] });
    const { data: spots } = await db.supabase
      .from('spots')
      .select('id, name, city, lat, lng, surf_zone, country')
      .in('id', spotIds);
    res.json({ success: true, favorites: spots || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/favorites/toggle { userId, spotId }
router.post('/favorites/toggle', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const { userId, spotId } = req.body;
    if (!userId || !spotId) return res.status(400).json({ success: false, error: 'userId et spotId requis' });

    const { data: existing } = await db.supabase
      .from('user_favorite_spots')
      .select('spot_id')
      .eq('user_id', userId)
      .eq('spot_id', spotId);

    if (existing?.length) {
      await db.supabase.from('user_favorite_spots').delete().eq('user_id', userId).eq('spot_id', spotId);
      res.json({ success: true, isFavorite: false });
    } else {
      await db.supabase.from('user_favorite_spots').upsert({ user_id: userId, spot_id: spotId });
      res.json({ success: true, isFavorite: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/spots/conditions?spotIds=id1,id2,id3
router.get('/spots/conditions', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const openMeteo = require('../services/openMeteoService');
    const spotIds = (req.query.spotIds || '').split(',').filter(Boolean);
    if (!spotIds.length) return res.json({ success: true, conditions: {} });

    const { data: spots } = await db.supabase
      .from('spots')
      .select('id, lat, lng')
      .in('id', spotIds);

    const validSpots = (spots || []).filter(s => s.lat && s.lng);
    const conditions = await openMeteo.getConditions(validSpots);
    res.json({ success: true, conditions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── ROUTES PRÉDICTIONS ──────────────────────────────────

// GET /api/v1/predictions/best-windows?userId=X&days=5[&lat=..&lng=..&radius=30]
// Accueil : les spots du surfeur (favoris + déjà surfés), puis 2 ou 3 spots à découvrir
// à proximité quand leurs conditions sont meilleures. Rien au-delà du rayon (30 km par défaut).
const DISCOVERY_RADIUS_KM = 30;
const DISCOVERY_MAX = 3;

function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get('/predictions/best-windows', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const { collectUserData, buildContext } = require('../services/collector');
    const { getBestWindows } = require('../services/recommender');

    const userId = req.query.userId;
    const days = parseInt(req.query.days) || 5;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });

    const userLat = parseFloat(req.query.lat), userLng = parseFloat(req.query.lng);
    const hasPosition = Number.isFinite(userLat) && Number.isFinite(userLng);
    const radius = Math.min(100, Math.max(5, parseFloat(req.query.radius) || DISCOVERY_RADIUS_KM));
    const distanceFromUser = spot => hasPosition && spot.lat != null
      ? Math.round(haversineKm(userLat, userLng, Number(spot.lat), Number(spot.lng)) * 10) / 10 : null;

    const [allKnown, userData] = await Promise.all([db.getFavoriteSpots(userId), collectUserData(userId)]);

    // 1. Spots connus du surfeur — s'il est localisé, seulement ceux à portée
    const knownSpots = hasPosition ? allKnown.filter(s => distanceFromUser(s) <= radius) : allKnown;
    const analyze = (spot, maxWindows) => buildContext(spot, userData, days)
      .then(ctx => ({ ...getBestWindows(ctx, maxWindows), distanceKm: distanceFromUser(spot) }))
      .catch(err => ({ spot: { id: spot.id, name: spot.name, lat: spot.lat, lng: spot.lng }, error: err.message, windows: [] }));
    const knownResults = await Promise.all(knownSpots.map(spot => analyze(spot, 6)));

    // 2. Spots à découvrir : jamais surfés, pas en favori, à moins de `radius` km
    //    du surfeur (ou, sans position, de l'un de ses spots connus)
    // Seulement quand l'app transmet la position (ou le demande) : les écrans qui ne savent pas
    // encore présenter un « spot à découvrir » ne reçoivent que les spots connus.
    const wantDiscovery = hasPosition || req.query.discover === '1';
    let discoveryResults = [];
    const anchors = !wantDiscovery ? [] : hasPosition ? [{ lat: userLat, lng: userLng }] : allKnown.map(s => ({ lat: Number(s.lat), lng: Number(s.lng) }));
    if (anchors.length) {
      const knownIds = new Set([...allKnown.map(s => s.id), ...userData.pastSessions.map(s => s.spot_id)]);
      const pad = radius / 111;
      const box = {
        latMin: Math.min(...anchors.map(a => a.lat)) - pad, latMax: Math.max(...anchors.map(a => a.lat)) + pad,
        lngMin: Math.min(...anchors.map(a => a.lng)) - pad * 1.6, lngMax: Math.max(...anchors.map(a => a.lng)) + pad * 1.6,
      };
      const { data: nearby } = await db.supabase
        .from('spots')
        .select('id, name, city, lat, lng, ideal_wind, ideal_swell, ideal_tide, shom_port_code')
        .gte('lat', box.latMin).lte('lat', box.latMax).gte('lng', box.lngMin).lte('lng', box.lngMax)
        .limit(300);
      const candidates = (nearby || [])
        .filter(s => !knownIds.has(s.id))
        .map(s => ({ ...s, _dist: Math.min(...anchors.map(a => haversineKm(a.lat, a.lng, Number(s.lat), Number(s.lng)))) }))
        .filter(s => s._dist <= radius)
        .sort((a, b) => a._dist - b._dist)
        .slice(0, 40);
      // Quota : chaque zone de prévision coûte 2 appels par jour
      const stormglass = require('../services/stormglassService');
      // Les zones déjà chargées pour les spots connus ne coûtent rien ; on y ajoute 2 zones nouvelles au plus
      const knownCells = new Set(knownSpots.map(s => stormglass.cellKey(s.lat, s.lng)));
      const newCells = [...new Set(candidates.map(s => stormglass.cellKey(s.lat, s.lng)))].filter(c => !knownCells.has(c)).slice(0, 2);
      const cells = [...knownCells, ...newCells];
      const reachable = candidates.filter(s => cells.includes(stormglass.cellKey(s.lat, s.lng)));

      const bestKnown = Math.max(0, ...knownResults.map(r => r.windows[0]?.score || 0));
      const scored = await Promise.all(reachable.map(spot => analyze(spot, 3)
        .then(r => ({ ...r, discovery: true, distanceKm: Math.round(spot._dist * 10) / 10 }))));
      discoveryResults = scored
        .filter(r => r.windows.length && r.windows[0].score > bestKnown)   // seulement si c'est mieux que chez lui
        .sort((a, b) => b.windows[0].score - a.windows[0].score)
        .slice(0, DISCOVERY_MAX);
    }

    if (!knownResults.length && !discoveryResults.length) {
      return res.json({ success: true, message: 'Aucun spot à portée', results: [] });
    }
    res.json({ success: true, userId, days, radiusKm: radius, results: [...knownResults, ...discoveryResults] });
  } catch (error) {
    console.error('Erreur best-windows:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/predictions/spot/:spotId?userId=X&days=5
// Prévisions détaillées pour un spot spécifique
router.get('/predictions/spot/:spotId', async (req, res) => {
  try {
    const { collectContext } = require('../services/collector');
    const { getBestWindows } = require('../services/recommender');

    const { spotId } = req.params;
    const userId = req.query.userId;
    const days = parseInt(req.query.days) || 5;
    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });

    const ctx = await collectContext(spotId, userId, days);
    const result = getBestWindows(ctx, 10);

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur predictions/spot:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/weather/current?lat=X&lng=Y
router.get('/weather/current', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, error: 'lat et lng requis' });
    }

    const stormglassService = require('../services/stormglassService');
    const shomService = require('../services/shomService');

    const weatherData = await stormglassService.getForecast(lat, lng, 1);

    const nowSec = Date.now() / 1000;
    const current = weatherData.forecast && (
      weatherData.forecast.find(p => p.timestamp >= nowSec) || weatherData.forecast[0]
    );

    const degreesToCompass = (deg) => {
      if (deg == null) return '';
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    };

    // Marée — port le plus proche selon longitude
    const shomPort = lng < -1.8 ? 'CPB' : 'BIA'; // Hossegor/Capbreton vs Biarritz/Anglet
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const nowHour = today.getHours();
    let nextTide = null;
    try {
      const tideData = await shomService.getTideData('home_geo', shomPort, dateStr);
      if (tideData) {
        const upcoming = tideData.filter(p => p.hour > nowHour && (p.phase === 'high' || p.phase === 'low'));
        if (upcoming.length > 0) {
          const next = upcoming[0];
          nextTide = {
            phase: next.phase,
            hour: next.hour,
            label: (next.phase === 'high' ? '⬆' : '⬇') + ' ' + String(next.hour).padStart(2, '0') + 'h'
          };
        }
      }
    } catch (e) { /* fallback silencieux */ }

    // Météo atmosphérique via Open-Meteo (température air + conditions)
    let airTempOM = null;
    let weatherCode = null;
    try {
      const axios = require('axios');
      const omRes = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: { latitude: lat, longitude: lng, current: 'temperature_2m,weather_code' },
        timeout: 5000,
      });
      airTempOM = omRes.data?.current?.temperature_2m ?? null;
      weatherCode = omRes.data?.current?.weather_code ?? null;
    } catch (e) { /* fallback silencieux */ }

    const airTemp = current?.airTemp ?? airTempOM;

    res.json({
      success: true,
      lat, lng,
      weather: current ? {
        waveHeight:    current.waveHeight,
        windSpeed:     current.windSpeed,
        windDirection: degreesToCompass(current.windDirection),
        wavePeriod:    current.wavePeriod,
        waterTemp:     current.waterTemp != null ? current.waterTemp : null,
        airTemp:       airTemp != null ? Math.round(airTemp) : null,
        weatherCode:   weatherCode,
        nextTide,
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── NOTIFICATIONS / EMAIL PREDICTIONS ──────────────────

// POST/GET /api/v1/notifications/send-predictions
// Protected by x-cron-secret header or Vercel cron Authorization header
async function handleSendPredictions(req, res) {
  try {
    // Auth: verify cron secret (x-cron-secret header or Vercel Authorization Bearer)
    const cronSecret = req.headers['x-cron-secret']
      || (req.headers['authorization'] || '').replace('Bearer ', '');
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const db = require('../services/supabaseService');
    const { collectContext } = require('../services/collector');
    const { getBestWindows } = require('../services/recommender');

    // Get all profiles with email predictions enabled
    const profiles = await db.getProfilesWithEmailPredictions();
    if (!profiles.length) {
      return res.json({ success: true, message: 'Aucun utilisateur avec notifications actives', sent: 0 });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return res.status(500).json({ success: false, error: 'RESEND_API_KEY manquante' });
    }

    let sent = 0;
    let errors = [];

    for (const profile of profiles) {
      try {
        // Get user email from Supabase auth
        const { data: { user } } = await db.supabase.auth.admin.getUserById(profile.id);
        if (!user?.email) continue;

        // Get favorite spots
        const favoriteSpots = await db.getFavoriteSpots(profile.id);
        if (!favoriteSpots.length) continue;

        // Collect predictions for each spot (3 days)
        const spotResults = [];
        for (const spot of favoriteSpots.slice(0, 3)) {
          try {
            const ctx = await collectContext(spot.id, profile.id, 3);
            const result = getBestWindows(ctx, 4);
            spotResults.push({ spot, windows: result.windows || [] });
          } catch (e) {
            spotResults.push({ spot, windows: [], error: e.message });
          }
        }

        // Build HTML email
        const nickname = profile.nickname || profile.pseudo || 'Surfeur';
        const spotsHtml = spotResults.map(sr => {
          const windowsHtml = sr.windows.length
            ? sr.windows.map(w => {
              const date = new Date(w.start * 1000);
              const dayStr = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
              const hourStr = date.getHours() + 'h';
              const score = w.score ? Math.round(w.score * 100) : '?';
              return `<tr>
                <td style="padding:6px 10px;border-bottom:1px solid #eee">${dayStr} ${hourStr}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee">${w.waveHeight ? w.waveHeight.toFixed(1) + 'm' : '-'}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee">${score}%</td>
              </tr>`;
            }).join('')
            : '<tr><td colspan="3" style="padding:10px;color:#999">Pas de creneau ideal prevu</td></tr>';

          return `
            <div style="margin-bottom:20px">
              <h3 style="color:#0d2137;margin:0 0 8px">${sr.spot.name || 'Spot'} ${sr.spot.city ? '(' + sr.spot.city + ')' : ''}</h3>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <thead><tr style="background:#f0f4ff">
                  <th style="padding:6px 10px;text-align:left">Creneau</th>
                  <th style="padding:6px 10px;text-align:left">Vagues</th>
                  <th style="padding:6px 10px;text-align:left">Score</th>
                </tr></thead>
                <tbody>${windowsHtml}</tbody>
              </table>
            </div>`;
        }).join('');

        const emailHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="text-align:center;margin-bottom:24px">
              <h1 style="color:#0d2137;font-size:22px;margin:0">SurfAI - Tes previsions surf</h1>
              <p style="color:#666;font-size:14px;margin:4px 0 0">Salut ${nickname} ! Voici tes meilleurs creneaux.</p>
            </div>
            ${spotsHtml}
            <div style="text-align:center;margin-top:24px;padding:16px;background:#f0f4ff;border-radius:8px">
              <p style="color:#666;font-size:12px;margin:0">Tu peux desactiver ces emails dans ton profil SurfAI.</p>
            </div>
          </div>`;

        // Send via Resend API
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'SurfAI <onboarding@resend.dev>',
            to: user.email,
            subject: `SurfAI - Tes previsions surf`,
            html: emailHtml
          })
        });

        if (resendResponse.ok) {
          sent++;
        } else {
          const errBody = await resendResponse.text();
          errors.push({ userId: profile.id, error: errBody });
        }

        // Send push notification if mobile token exists
        if (profile.expo_push_token) {
          try {
            const { Expo } = require('expo-server-sdk');
            const expo = new Expo();
            if (Expo.isExpoPushToken(profile.expo_push_token)) {
              const bestSpot = spotResults.find(sr => sr.windows.length > 0);
              if (bestSpot) {
                const topScore = bestSpot.windows[0]?.score ? Math.round(bestSpot.windows[0].score * 10) : '?';
                const [receipt] = await expo.sendPushNotificationsAsync([{
                  to: profile.expo_push_token,
                  title: 'SurfAI',
                  body: `Score ${topScore}/10 a ${bestSpot.spot.name}`,
                  data: { spotId: bestSpot.spot.id, score: topScore },
                  sound: 'default',
                }]);
                if (receipt.status === 'error') {
                  // Invalid token — clean up
                  await db.supabase.from('profiles').update({ expo_push_token: null }).eq('id', profile.id);
                }
              }
            }
          } catch (pushErr) {
            console.warn('Push notification failed for', profile.id, pushErr.message);
          }
        }
      } catch (userError) {
        errors.push({ userId: profile.id, error: userError.message });
      }
    }

    res.json({
      success: true,
      message: `Predictions envoyees`,
      sent,
      total: profiles.length,
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    console.error('Erreur send-predictions:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}
router.post('/notifications/send-predictions', handleSendPredictions);
router.get('/notifications/send-predictions', handleSendPredictions);

// ─── PUSH NOTIFICATIONS ──────────────────────────────────

// POST /api/v1/push-token — save Expo push token for mobile app
router.post('/push-token', async (req, res) => {
  try {
    const db = require('../services/supabaseService');
    const { userId, token } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ success: false, error: 'userId and token required' });
    }

    await db.supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);

    console.log(`📱 Push token saved for user ${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur push-token:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;