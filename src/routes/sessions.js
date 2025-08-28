// src/routes/sessions.js
// SurfAI V1 - Routes API Sessions Optimisées UX

const express = require('express');
const router = express.Router();

// Import du service de sessions rapides
let SessionQuickEntryService;
try {
  SessionQuickEntryService = require('../services/SessionQuickEntryService');
} catch (error) {
  console.log('SessionQuickEntryService non trouvé');
}

// Instance du service
let sessionService;
if (SessionQuickEntryService) {
  sessionService = new SessionQuickEntryService();
  console.log('✅ Service sessions rapides initialisé');
} else {
  console.log('❌ Service sessions rapides non disponible');
}

// ===== ROUTES SESSIONS RAPIDES =====

// GET /test - Test du service
router.get('/test', (req, res) => {
  res.json({
    status: 'success',
    message: 'API Sessions UX Optimisée opérationnelle',
    timestamp: new Date().toISOString(),
    features: [
      'Saisie rapide sessions (< 30 secondes)',
      'Auto-completion météo',
      'Géolocalisation automatique',
      'Suggestions spots intelligentes',
      'Analytics sessions utilisateur'
    ],
    serviceStatus: sessionService ? 'loaded' : 'not_loaded'
  });
});

// POST /quick - Saisie rapide session
router.post('/quick', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(500).json({
        status: 'error',
        message: 'Service sessions non disponible'
      });
    }

    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'userId requis'
      });
    }

    // Validation des données
    const validation = sessionService.validateQuickEntry(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        status: 'error',
        message: 'Données invalides',
        errors: validation.errors
      });
    }

    // Création session rapide
    const startTime = Date.now();
    const result = await sessionService.createQuickSession(userId, req.body);
    const processingTime = Date.now() - startTime;

    if (result.success) {
      res.status(201).json({
        status: 'success',
        message: 'Session enregistrée en saisie rapide',
        data: result.session,
        meta: {
          processingTime: processingTime,
          autoCompleted: result.autoCompleted,
          quickEntry: true
        }
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GET /spots/suggest - Suggestions de spots
router.get('/spots/suggest', (req, res) => {
  try {
    if (!sessionService) {
      return res.status(500).json({
        status: 'error',
        message: 'Service sessions non disponible'
      });
    }

    const { q: query, lat, lng } = req.query;
    
    if (!query) {
      return res.status(400).json({
        status: 'error',
        message: 'Paramètre de recherche "q" requis'
      });
    }

    const userLocation = (lat && lng) ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
    const suggestions = sessionService.getSpotSuggestions(query, userLocation);

    res.json({
      status: 'success',
      query: query,
      userLocation: userLocation,
      suggestions: suggestions,
      count: suggestions.length
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GET /spots/nearby - Spots à proximité
router.get('/spots/nearby', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(500).json({
        status: 'error',
        message: 'Service sessions non disponible'
      });
    }

    const { lat, lng, radius = 25 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        status: 'error',
        message: 'Coordonnées lat et lng requises'
      });
    }

    const nearbySpot = await sessionService.findNearestSpot(parseFloat(lat), parseFloat(lng));

    if (nearbySpot) {
      res.json({
        status: 'success',
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
        nearestSpot: nearbySpot,
        found: true
      });
    } else {
      res.json({
        status: 'success',
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
        nearestSpot: null,
        found: false,
        message: `Aucun spot trouvé dans un rayon de ${radius}km`
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GET /weather/auto - Auto-completion météo
router.get('/weather/auto', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(500).json({
        status: 'error',
        message: 'Service sessions non disponible'
      });
    }

    const { spot, date } = req.query;
    
    if (!spot) {
      return res.status(400).json({
        status: 'error',
        message: 'Nom du spot requis'
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    const weather = await sessionService.getWeatherForSpotAndTime(spot, targetDate);

    res.json({
      status: 'success',
      spot: spot,
      date: targetDate.toISOString(),
      weather: weather,
      autoCompleted: true
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GET /:userId/stats - Statistiques utilisateur sessions rapides
router.get('/:userId/stats', (req, res) => {
  try {
    if (!sessionService) {
      return res.status(500).json({
        status: 'error',
        message: 'Service sessions non disponible'
      });
    }

    const { userId } = req.params;
    const { days = 30 } = req.query;

    const stats = sessionService.getQuickEntryStats(userId, parseInt(days));

    res.json({
      status: 'success',
      userId: userId,
      period: `${days} derniers jours`,
      stats: stats
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// POST /demo - Créer une session démo
router.post('/demo', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(500).json({
        status: 'error',
        message: 'Service sessions non disponible'
      });
    }

    // Données de session démo réalistes
    const demoSessionData = {
      userId: req.body.userId || 'demo_user',
      spotName: 'Biarritz - Grande Plage',
      coordinates: { lat: 43.4832, lng: -1.5586 },
      rating: 8,
      duration: 90,
      notes: 'Super session matinale ! Vagues clean.',
      deviceType: 'mobile'
    };

    const result = await sessionService.createQuickSession(demoSessionData.userId, demoSessionData);

    res.status(201).json({
      status: 'success',
      message: 'Session démo créée',
      data: result,
      instructions: 'Utilisez cette structure pour vos vraies sessions'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GET /demo/flow - Flux complet démo UX
router.get('/demo/flow', (req, res) => {
  res.json({
    status: 'demo',
    title: 'Flux UX Sessions Optimisées - Démo',
    flow: [
      {
        step: 1,
        title: 'Localisation automatique',
        endpoint: 'GET /spots/nearby?lat=43.4832&lng=-1.5586',
        description: 'Trouve le spot le plus proche'
      },
      {
        step: 2,
        title: 'Auto-completion météo',
        endpoint: 'GET /weather/auto?spot=Biarritz%20Grande%20Plage',
        description: 'Récupère les conditions automatiquement'
      },
      {
        step: 3,
        title: 'Saisie rapide',
        endpoint: 'POST /quick',
        description: 'Enregistre la session en < 30 secondes',
        payload: {
          userId: 'user123',
          rating: 8,
          duration: 90,
          notes: 'Super session !'
        }
      },
      {
        step: 4,
        title: 'Statistiques mises à jour',
        endpoint: 'GET /user123/stats',
        description: 'Analytics instantanées'
      }
    ],
    testInstructions: 'Testez chaque endpoint dans l\'ordre pour voir le flux complet'
  });
});

module.exports = router;
