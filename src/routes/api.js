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

module.exports = router;