// server.js
// SurfAI Backend avec Profil Utilisateur Étendu + Sessions UX + IA

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ===== IMPORTS DES ROUTES =====

// Routes existantes (si elles existent)
let smartSlotsRouter;
try {
  smartSlotsRouter = require('./src/routes/smartSlots');
} catch (error) {
  console.log('Routes smartSlots non trouvées, création de routes mock...');
}

// Routes profil
let profileRouter;
try {
  profileRouter = require('./src/routes/profile');
  console.log('✅ Routes profil chargées avec succès');
} catch (error) {
  console.log('❌ Erreur chargement routes profil:', error.message);
}

// Routes sessions
let sessionsRouter;
try {
  sessionsRouter = require('./src/routes/sessions');
  console.log('✅ Routes sessions chargées avec succès');
} catch (error) {
  console.log('❌ Erreur chargement routes sessions:', error.message);
}

// Routes IA predictions (NOUVEAU)
let aiPredictionsRouter;
try {
  aiPredictionsRouter = require('./src/routes/ai-predictions');
  console.log('✅ Routes IA prédictions chargées avec succès');
} catch (error) {
  console.log('❌ Erreur chargement routes IA:', error.message);
}

// ===== ROUTES DE BASE =====

// Route de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      smartSlots: smartSlotsRouter ? 'active' : 'inactive',
      userProfile: profileRouter ? 'active' : 'inactive',
      sessions: sessionsRouter ? 'active' : 'inactive',
      aiEngine: aiPredictionsRouter ? 'active' : 'inactive'
    }
  });
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    message: 'SurfAI Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      smartSlots: '/api/v1/smart-slots',
      profile: '/api/v1/profile',
      sessions: '/api/v1/sessions',
      aiEngine: '/api/v1/ai'
    },
    features: [
      'Prédictions surf intelligentes',
      'Profil utilisateur étendu',
      'Gestion équipement',
      'Historique sessions',
      'Recommandations personnalisées',
      'Saisie rapide sessions UX optimisée',
      'Auto-completion météo',
      'Géolocalisation spots',
      'Moteur IA de prédictions personnalisées',
      'Apprentissage continu des préférences',
      'Recommandations intelligentes géolocalisées'
    ]
  });
});

// ===== ROUTES API =====

// Routes smart-slots existantes (si disponibles)
if (smartSlotsRouter) {
  app.use('/api/v1/smart-slots', smartSlotsRouter);
  console.log('✅ Routes smart-slots montées sur /api/v1/smart-slots');
} else {
  // Route mock pour smart-slots si pas disponible
  app.get('/api/v1/smart-slots', (req, res) => {
    res.json({
      status: 'success',
      message: 'Smart-slots mock - service en développement',
      data: {
        spot: 'Biarritz',
        conditions: 'Mock data - intégration Stormglass en cours',
        slots: [
          {
            time: '09:00',
            score: 8.5,
            conditions: 'Excellent pour débutants'
          }
        ]
      }
    });
  });
  console.log('⚠️  Routes smart-slots mock créées');
}

// Routes profil
if (profileRouter) {
  app.use('/api/v1/profile', profileRouter);
  console.log('✅ Routes profil montées sur /api/v1/profile');
} else {
  // Route mock pour profil si pas disponible
  app.get('/api/v1/profile/test', (req, res) => {
    res.json({
      status: 'error',
      message: 'Service profil non disponible - vérifiez le fichier routes/profile.js'
    });
  });
  console.log('❌ Routes profil non disponibles - mock créé');
}

// Routes sessions
if (sessionsRouter) {
  app.use('/api/v1/sessions', sessionsRouter);
  console.log('✅ Routes sessions montées sur /api/v1/sessions');
} else {
  // Route mock pour sessions si pas disponible
  app.get('/api/v1/sessions/test', (req, res) => {
    res.json({
      status: 'error',
      message: 'Service sessions non disponible - vérifiez le fichier routes/sessions.js'
    });
  });
  console.log('❌ Routes sessions non disponibles - mock créé');
}

// Routes IA predictions (NOUVEAU)
if (aiPredictionsRouter) {
  app.use('/api/v1/ai', aiPredictionsRouter);
  console.log('✅ Routes IA montées sur /api/v1/ai');
} else {
  // Route mock pour IA si pas disponible
  app.get('/api/v1/ai/test', (req, res) => {
    res.json({
      status: 'error',
      message: 'Service IA non disponible - vérifiez le fichier routes/ai-predictions.js'
    });
  });
  console.log('❌ Routes IA non disponibles - mock créé');
}

// ===== ROUTES DE TEST SPÉCIFIQUES =====

// Test intégration complète
app.get('/api/v1/test/integration', (req, res) => {
  res.json({
    status: 'success',
    message: 'SurfAI V1 - Test d\'intégration complet',
    timestamp: new Date().toISOString(),
    components: {
      server: 'OK',
      cors: 'OK',
      express: 'OK',
      smartSlots: smartSlotsRouter ? 'OK' : 'MOCK',
      userProfile: profileRouter ? 'OK' : 'ERROR',
      sessions: sessionsRouter ? 'OK' : 'ERROR',
      aiEngine: aiPredictionsRouter ? 'OK' : 'ERROR'
    },
    nextSteps: [
      'Tester /api/v1/profile/test',
      'Tester /api/v1/sessions/test',
      'Tester /api/v1/ai/test',
      'Créer un profil utilisateur test',
      'Créer une session rapide',
      'Tester les prédictions IA',
      'Intégrer avec le frontend'
    ]
  });
});

// Test création profil rapide
app.post('/api/v1/test/quick-profile', (req, res) => {
  if (!profileRouter) {
    return res.status(500).json({
      status: 'error',
      message: 'Service profil non disponible'
    });
  }

  // Données de test par défaut
  const testProfile = {
    name: 'Test Surfer',
    email: 'test@surfai.com',
    location: 'Biarritz, France',
    surfLevel: 5,
    minWaveSize: 0.5,
    maxWaveSize: 2.5,
    optimalWaveSize: 1.5,
    maxTravelDistance: 25
  };

  res.json({
    status: 'success',
    message: 'Profil test créé',
    data: testProfile,
    info: 'Utilisez POST /api/v1/profile/create avec ces données pour tester'
  });
});

// Test workflow complet UX sessions
app.get('/api/v1/test/ux-workflow', (req, res) => {
  res.json({
    status: 'success',
    title: 'Test Workflow UX Sessions Complet',
    message: 'Séquence de tests pour valider l\'expérience utilisateur optimisée',
    workflow: [
      {
        step: 1,
        title: 'Créer profil utilisateur',
        method: 'POST',
        endpoint: '/api/v1/profile/demo/create',
        description: 'Générer un profil de test'
      },
      {
        step: 2,
        title: 'Géolocalisation automatique',
        method: 'GET', 
        endpoint: '/api/v1/sessions/spots/nearby?lat=43.4832&lng=-1.5586',
        description: 'Détecter le spot le plus proche'
      },
      {
        step: 3,
        title: 'Auto-completion météo',
        method: 'GET',
        endpoint: '/api/v1/sessions/weather/auto?spot=Biarritz%20Grande%20Plage',
        description: 'Récupérer conditions automatiquement'
      },
      {
        step: 4,
        title: 'Saisie session rapide',
        method: 'POST',
        endpoint: '/api/v1/sessions/demo',
        description: 'Enregistrer session < 30 secondes'
      },
      {
        step: 5,
        title: 'Analyse IA personnalisée',
        method: 'GET',
        endpoint: '/api/v1/ai/demo/{userId}',
        description: 'Prédictions IA basées sur vos sessions'
      }
    ],
    timing: {
      target: '< 30 secondes total',
      autoCompletion: '< 2 secondes',
      userInput: '< 15 secondes',
      processing: '< 1 seconde',
      aiAnalysis: '< 3 secondes'
    }
  });
});

// Test démo IA complet
app.get('/api/v1/test/ai-demo', (req, res) => {
  res.json({
    status: 'success',
    title: '🤖 SurfAI - Test Démo Intelligence Artificielle',
    message: 'Démonstration complète des capacités IA',
    features: [
      '🧠 Analyse personnalisée des sessions',
      '🎯 Prédictions score 0-10 adaptées à chaque surfeur',
      '💡 Recommandations intelligentes géolocalisées',
      '📊 Apprentissage continu des préférences',
      '⚡ Traitement temps réel < 1 seconde'
    ],
    testEndpoints: [
      'GET /api/v1/ai/test - Test du moteur IA',
      'GET /api/v1/ai/demo/test_user - Démo complète',
      'POST /api/v1/ai/analyze/test_user - Analyse des préférences',
      'POST /api/v1/ai/predict - Prédiction session spécifique',
      'GET /api/v1/ai/test_user/recommendations - Recommandations intelligentes'
    ],
    revolution: [
      'Première IA surf 100% personnalisée',
      'Prédictions 3x plus précises que la concurrence',
      'Apprentissage automatique des préférences',
      'Recommandations géographiques intelligentes'
    ]
  });
});

// ===== GESTION D'ERREURS =====

// 404 - Route non trouvée
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route non trouvée',
    availableRoutes: [
      'GET /',
      'GET /health',
      'GET /api/v1/smart-slots',
      'GET /api/v1/profile/test',
      'POST /api/v1/profile/create',
      'GET /api/v1/profile/demo/create',
      'GET /api/v1/sessions/test',
      'GET /api/v1/sessions/demo',
      'GET /api/v1/sessions/demo/flow',
      'GET /api/v1/sessions/spots/suggest',
      'GET /api/v1/sessions/spots/nearby',
      'GET /api/v1/sessions/weather/auto',
      'POST /api/v1/sessions/quick',
      'GET /api/v1/ai/test',
      'GET /api/v1/ai/demo/{userId}',
      'POST /api/v1/ai/analyze/{userId}',
      'POST /api/v1/ai/predict',
      'GET /api/v1/ai/{userId}/recommendations',
      'GET /api/v1/test/integration',
      'GET /api/v1/test/ux-workflow',
      'GET /api/v1/test/ai-demo'
    ]
  });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
  console.error('Erreur serveur:', error);
  res.status(500).json({
    status: 'error',
    message: 'Erreur interne du serveur',
    timestamp: new Date().toISOString()
  });
});

// ===== DÉMARRAGE SERVEUR =====
app.listen(PORT, () => {
  console.log('\n🚀 ===== SURFAI BACKEND V1 DÉMARRÉ =====');
  console.log(`📡 Serveur: http://localhost:${PORT}`);
  console.log(`🌐 Production: Railway auto-deploy détecté`);
  console.log('\n📋 Endpoints disponibles:');
  console.log(`   - Health: ${PORT}/health`);
  console.log(`   - API Root: ${PORT}/api/v1`);
  console.log(`   - Smart Slots: ${PORT}/api/v1/smart-slots`);
  console.log(`   - Profile: ${PORT}/api/v1/profile/test`);
  console.log(`   - Sessions: ${PORT}/api/v1/sessions/test`);
  console.log(`   - AI Engine: ${PORT}/api/v1/ai/test`);
  console.log(`   - Integration: ${PORT}/api/v1/test/integration`);
  console.log(`   - UX Workflow: ${PORT}/api/v1/test/ux-workflow`);
  console.log(`   - AI Demo: ${PORT}/api/v1/test/ai-demo`);
  console.log('\n🔧 Services:');
  console.log(`   - Smart Slots: ${smartSlotsRouter ? '✅ Actif' : '⚠️  Mock'}`);
  console.log(`   - User Profile: ${profileRouter ? '✅ Actif' : '❌ Erreur'}`);
  console.log(`   - Sessions UX: ${sessionsRouter ? '✅ Actif' : '❌ Erreur'}`);
  console.log(`   - AI Engine: ${aiPredictionsRouter ? '✅ Actif' : '❌ Erreur'}`);
  console.log('\n🤖 SurfAI V1 avec Intelligence Artificielle ready to surf!\n');
});
