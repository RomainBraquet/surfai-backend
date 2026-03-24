// 🌊 Routes météo pour SurfAI
// Version complète avec vraie API Stormglass

const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const stormglassService = require('../services/stormglassService');
const predictionService = require('../services/predictionService');
const smartSessionsService = require('../services/smartSessionsService');

console.log('🌊 Chargement des routes météo avec Stormglass...');

// 📡 GET /api/v1/weather/forecast
// Route principale qui remplace l'appel direct à Stormglass
router.get('/forecast', [
  // Validation des paramètres
  query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide'),
  query('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide'),
  query('days').optional().isInt({ min: 1, max: 7 }).withMessage('Nombre de jours invalide (1-7)'),
  query('spot_id').optional().isInt().withMessage('ID spot invalide')
], async (req, res) => {
  try {
    // Validation des entrées
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Paramètres invalides',
        details: errors.array()
      });
    }

    console.log('🌊 Requête prévisions météo reçue:', req.query);

    const { lat, lng, days = 3, spot_id } = req.query;

    // Utiliser coordonnées du spot ou coordonnées par défaut
    let coordinates = { lat, lng };

    // Si pas de coordonnées mais un spot_id, récupérer les coordonnées du spot
    // TODO: Implémenter getSpotCoordinates avec Supabase
    if (spot_id && !lat && !lng) {
      // Pour l'instant, coordonnées par défaut
      coordinates = {
        lat: process.env.DEFAULT_LAT || 43.4832,
        lng: process.env.DEFAULT_LNG || -1.5586
      };
    }

    // Coordonnées par défaut si rien fourni
    if (coordinates.lat === undefined || coordinates.lat === null || coordinates.lng === undefined || coordinates.lng === null) {
      coordinates = {
        lat: process.env.DEFAULT_LAT || 43.4832,
        lng: process.env.DEFAULT_LNG || -1.5586
      };
    }

    // Appel à l'API Stormglass réelle
    const forecastData = await stormglassService.getForecast(
      coordinates.lat,
      coordinates.lng,
      parseInt(days)
    );

    // Enrichir avec l'intelligence prédictive
    const enrichedData = await predictionService.processForecastData(
      forecastData,
      req.query.user_level || 'intermediate'
    );

    // Ajouter statistiques et meilleures sessions
    const finalData = {
      ...enrichedData,
      statistics: calculateForecastStats(enrichedData.forecast),
      bestSessions: findBestSessions(enrichedData.forecast),
      coordinates: coordinates
    };

    res.json(finalData);

  } catch (error) {
    console.error('❌ Erreur route forecast:', error);
    res.status(500).json({
      error: 'Erreur récupération prévisions',
      message: error.message,
      type: error.name || 'UnknownError'
    });
  }
});

// 🎯 POST /api/v1/weather/quality-prediction
// Prédit la qualité d'une session selon les conditions
router.post('/quality-prediction', async (req, res) => {
  try {
    console.log('🎯 Requête prédiction qualité reçue');

    const { wave_height, wind_speed, wind_direction, user_level } = req.body;

    // Validation basique
    if (!wave_height || !wind_speed) {
      return res.status(400).json({
        error: 'Paramètres manquants',
        message: 'wave_height et wind_speed sont requis'
      });
    }

    // Calcul simple de qualité (on améliorera dans la partie suivante)
    let score = 1;

    // Score selon hauteur de vagues
    if (wave_height >= 1 && wave_height <= 2.5) {
      score += 2;
    } else if (wave_height >= 0.8 && wave_height <= 3) {
      score += 1;
    }

    // Score selon vent
    if (wind_speed < 15) {
      score += 2;
    } else if (wind_speed < 25) {
      score += 1;
    }

    const prediction = {
      success: true,
      prediction: {
        score: Math.min(5, score),
        rating: score >= 4 ? 'Excellent' : score >= 3 ? 'Bon' : 'Moyen',
        confidence: 0.85,
        factors: {
          wave_height: wave_height,
          wind_speed: wind_speed,
          wind_direction: wind_direction || 'N/A'
        },
        recommendations: score >= 4 ?
          '🏄‍♂️ Conditions excellentes ! Foncez !' :
          '🤔 Conditions moyennes, restez prudent'
      },
      meta: {
        user_level: user_level || 'intermediate',
        calculation_time: new Date().toISOString()
      }
    };

    res.json(prediction);

  } catch (error) {
    console.error('❌ Erreur prédiction qualité:', error);
    res.status(500).json({
      error: 'Erreur prédiction',
      message: error.message
    });
  }
});

// 🧠 GET /api/v1/weather/smart-slots
// Analyse intelligente des créneaux optimaux
router.get('/smart-slots', [
  query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide'),
  query('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide'),
  query('days').optional().isInt({ min: 1, max: 7 }).withMessage('Nombre de jours invalide (1-7)'),
  query('user_level').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']).withMessage('Niveau invalide'),
  query('spot').optional().isString().withMessage('Nom du spot invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Paramètres invalides',
        details: errors.array()
      });
    }

    console.log('🧠 Requête créneaux intelligents:', req.query);

    const { lat, lng, days = 3, user_level = 'intermediate', spot = 'Biarritz' } = req.query;

    // Coordonnées par défaut si non fournies
    const coordinates = {
      lat: lat || process.env.DEFAULT_LAT || 43.4832,
      lng: lng || process.env.DEFAULT_LNG || -1.5586
    };

    // Récupérer les prévisions météo
    const forecastData = await stormglassService.getForecast(
      coordinates.lat,
      coordinates.lng,
      parseInt(days)
    );

    // Enrichir avec l'intelligence prédictive
    const enrichedData = await predictionService.processForecastData(
      forecastData,
      user_level
    );

    // Analyser les créneaux optimaux
    const smartSlots = await smartSessionsService.analyzeOptimalSlots(
      enrichedData,
      user_level,
      spot
    );

    res.json({
      success: true,
      ...smartSlots,
      coordinates: coordinates,
      requestParams: {
        days: parseInt(days),
        userLevel: user_level,
        spot: spot
      }
    });

  } catch (error) {
    console.error('❌ Erreur créneaux intelligents:', error);
    res.status(500).json({
      error: 'Erreur analyse créneaux intelligents',
      message: error.message
    });
  }
});
router.get('/test', async (req, res) => {
  try {
    // Test basique
    const basicTest = {
      success: true,
      message: '🌊 Routes météo opérationnelles !',
      endpoints: {
        forecast: 'GET /api/v1/weather/forecast',
        quality: 'POST /api/v1/weather/quality-prediction',
        test: 'GET /api/v1/weather/test',
        stormglassTest: 'GET /api/v1/weather/test-stormglass'
      },
      stormglass_configured: !!process.env.STORMGLASS_API_KEY
    };

    // Si la clé Stormglass est configurée, tester la connexion
    if (process.env.STORMGLASS_API_KEY) {
      console.log('🧪 Test connexion Stormglass...');
      const stormglassTest = await stormglassService.testConnection();
      basicTest.stormglass_test = stormglassTest;
    }

    res.json(basicTest);

  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      stormglass_configured: !!process.env.STORMGLASS_API_KEY
    });
  }
});

// 🧪 Route dédiée au test Stormglass
router.get('/test-stormglass', async (req, res) => {
  try {
    if (!process.env.STORMGLASS_API_KEY) {
      return res.status(400).json({
        error: 'Clé Stormglass manquante',
        message: 'Configurez STORMGLASS_API_KEY dans le fichier .env'
      });
    }

    console.log('🧪 Test complet Stormglass...');
    const testResult = await stormglassService.testConnection();

    res.json({
      ...testResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erreur test Stormglass:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'Vérifiez votre clé API dans le fichier .env'
    });
  }
});

// 🔄 Fonctions utilitaires pour enrichir les données
function calculateForecastStats(forecast) {
  if (!forecast || forecast.length === 0) return null;

  const validPoints = forecast.filter(p => p.waveHeight && p.windSpeed);
  if (validPoints.length === 0) return null;

  const waveHeights = validPoints.map(p => p.waveHeight);
  const windSpeeds = validPoints.map(p => p.windSpeed);
  const qualities = validPoints.map(p => p.quality);

  return {
    totalPoints: forecast.length,
    validPoints: validPoints.length,
    waveStats: {
      min: Math.min(...waveHeights),
      max: Math.max(...waveHeights),
      avg: Math.round((waveHeights.reduce((a, b) => a + b, 0) / waveHeights.length) * 10) / 10
    },
    windStats: {
      min: Math.min(...windSpeeds),
      max: Math.max(...windSpeeds),
      avg: Math.round((windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length) * 10) / 10
    },
    qualityStats: {
      min: Math.min(...qualities),
      max: Math.max(...qualities),
      avg: Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 10) / 10
    }
  };
}

function findBestSessions(forecast) {
  if (!forecast || forecast.length === 0) return [];

  return forecast
    .filter(p => p.quality >= 3.5) // Sessions de qualité
    .sort((a, b) => b.quality - a.quality) // Tri par qualité décroissante
    .slice(0, 5) // Top 5
    .map(session => ({
      time: session.time,
      hour: session.hour,
      quality: session.quality,
      waveHeight: session.waveHeight,
      windSpeed: session.windSpeed,
      offshore: session.offshore,
      recommendation: session.quality >= 4.5 ? '🏄‍♂️ Session excellente !' :
        session.quality >= 4 ? '👍 Bonne session' : '🤔 Session correcte'
    }));
}
// 🧪 TEST DEBUG
router.get('/debug-test', (req, res) => {
  console.log('🧪 Route debug-test appelée');
  res.json({ message: 'Route debug fonctionne !', timestamp: new Date().toISOString() });
});

// 📍 GET /api/v1/weather/current?lat=X&lng=Y — météo actuelle pour la home page
router.get('/current', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, error: 'lat et lng requis' });
    }

    const weatherData = await stormglassService.getForecast(lat, lng, 2);
    const nowSec = Date.now() / 1000;
    const current = weatherData.forecast && (
      weatherData.forecast.find(p => p.timestamp >= nowSec) || weatherData.forecast[0]
    );

    const degreesToCompass = (deg) => {
      if (deg == null) return '';
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    };

    // Marée via endpoint dédié Stormglass
    const tideExtremes = await stormglassService.getTideExtremes(lat, lng, 2);
    const nextTide = stormglassService.getNextTideFromExtremes(tideExtremes, nowSec);

    res.json({
      success: true,
      weather: current ? {
        waveHeight:    current.waveHeight,
        windSpeed:     current.windSpeed,
        windDirection: degreesToCompass(current.windDirection),
        wavePeriod:    current.wavePeriod,
        waterTemp:     current.waterTemp != null ? current.waterTemp : null,
        tideHeight:    current.tideHeight,
        tidePhase:     current.tidePhase,
        nextTide,
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;