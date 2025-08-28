// src/routes/profile.js
// SurfAI V1 - Routes API pour Profil Utilisateur - VERSION DEBUG

const express = require('express');
const router = express.Router();

// Test simple sans service d'abord
console.log('📋 Chargement des routes profil...');

// ===== ROUTE DE TEST BASIQUE =====
router.get('/test', (req, res) => {
  console.log('🔍 Route /test appelée');
  res.json({
    status: 'success',
    message: 'Routes profil chargées avec succès !',
    timestamp: new Date().toISOString(),
    debug: {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// ===== TEST AVEC SERVICE =====
let profileService = null;

try {
  console.log('🔄 Tentative de chargement du service...');
  const EnhancedUserProfileService = require('../services/EnhancedUserProfileService');
  profileService = new EnhancedUserProfileService();
  console.log('✅ Service profil chargé avec succès !');
} catch (error) {
  console.error('❌ Erreur chargement service:', error.message);
  console.error('📁 Chemin testé:', '../services/EnhancedUserProfileService');
}

// Route de diagnostic du service
router.get('/service-status', (req, res) => {
  res.json({
    status: profileService ? 'success' : 'error',
    serviceLoaded: !!profileService,
    error: profileService ? null : 'Service non chargé',
    timestamp: new Date().toISOString()
  });
});

// ===== ROUTES CONDITIONNELLES =====

if (profileService) {
  console.log('✅ Ajout des routes avec service...');

  // POST /create - Créer profil
  router.post('/create', async (req, res) => {
    try {
      const profileData = req.body;
      
      if (!profileData.name || !profileData.email) {
        return res.status(400).json({
          status: 'error',
          message: 'Nom et email requis'
        });
      }

      const newProfile = profileService.createUserProfile(profileData);
      
      res.status(201).json({
        status: 'success',
        message: 'Profil créé avec succès',
        data: newProfile
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /:userId - Récupérer profil
  router.get('/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const profile = profileService.getUserProfile(userId);
      
      res.json({
        status: 'success',
        data: profile
      });
    } catch (error) {
      res.status(404).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /demo/create - Créer un profil de démo
  router.get('/demo/create', (req, res) => {
    try {
      const demoProfile = profileService.createUserProfile({
        name: 'Demo Surfer',
        email: 'demo@surfai.com',
        location: 'Biarritz, France',
        surfLevel: 5,
        minWaveSize: 0.8,
        maxWaveSize: 2.0,
        optimalWaveSize: 1.2
      });

      res.json({
        status: 'success',
        message: 'Profil démo créé',
        data: demoProfile,
        instructions: `Utilisez GET /api/v1/profile/${demoProfile.id} pour récupérer ce profil`
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

} else {
  console.log('❌ Routes limitées - service non disponible');
  
  // Routes mock sans service
  router.post('/create', (req, res) => {
    res.status(500).json({
      status: 'error',
      message: 'Service profil non chargé - impossible de créer un profil',
      debug: 'Vérifiez src/services/EnhancedUserProfileService.js'
    });
  });

  router.get('/:userId', (req, res) => {
    res.status(500).json({
      status: 'error',
      message: 'Service profil non chargé - impossible de récupérer le profil'
    });
  });
}

// Route de diagnostic complète
router.get('/debug/full', (req, res) => {
  res.json({
    status: 'debug',
    router: 'OK',
    serviceStatus: profileService ? 'loaded' : 'not_loaded',
    availableRoutes: [
      'GET /test',
      'GET /service-status', 
      'GET /debug/full',
      profileService ? 'POST /create' : 'POST /create (disabled)',
      profileService ? 'GET /:userId' : 'GET /:userId (disabled)',
      profileService ? 'GET /demo/create' : 'GET /demo/create (disabled)'
    ],
    timestamp: new Date().toISOString()
  });
});

console.log('📋 Routes profil configurées');

module.exports = router;
