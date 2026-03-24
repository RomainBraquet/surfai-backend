// 🏄‍♂️ SurfAI Backend - Serveur principal
// Point d'entrée de l'application

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🏄‍♂️ Démarrage SurfAI Backend...');

// 🛡️ Middlewares (simplifiés pour Vercel serverless)
if (!process.env.VERCEL) {
  app.use(helmet());
  app.use(morgan('combined'));
}
app.use(compression());

// 🌐 CORS — autorise le frontend local (localhost et fichiers directs)
app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:8080',
      'https://surfai-app.vercel.app',
    ];
    // Autorise : pas d'origin (Postman), "null" (file://), .vercel.app, ou liste blanche
    if (!origin || origin === 'null' || allowed.includes(origin) || origin?.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 🏥 Health check - test simple pour vérifier que le serveur fonctionne
app.get('/health', (req, res) => {
  res.json({
    status: '✅ OK',
    message: 'SurfAI Backend fonctionne parfaitement !',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      stormglass: process.env.STORMGLASS_API_KEY ? '🌊 Configuré' : '❌ Manquant',
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// 📡 Routes API - on les ajoutera dans la partie suivante
app.use('/api/v1', require('./src/routes/api'));

// 🏠 Route racine
app.get('/', (req, res) => {
  res.json({
    message: '🏄‍♂️ Bienvenue sur SurfAI Backend !',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api/v1',
      weather: '/api/v1/weather/forecast'
    },
    documentation: 'https://github.com/votre-projet/surfai-backend'
  });
});

// 🚨 Gestion d'erreurs globales
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err);
  res.status(500).json({
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur s\'est produite',
    timestamp: new Date().toISOString()
  });
});

// 🚫 Route 404 - page non trouvée
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    message: `La route ${req.originalUrl} n'existe pas`,
    availableRoutes: ['/', '/health', '/api/v1']
  });
});

// 🚀 Démarrage du serveur (seulement en local, pas sur Vercel)
if (!process.env.VERCEL) app.listen(PORT, () => {
  console.log('\n🌊 ================================');
  console.log('🏄‍♂️ SurfAI Backend DÉMARRÉ !');
  console.log('🌊 ================================');
  console.log(`🚀 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API: http://localhost:${PORT}/api/v1`);
  console.log('🌊 ================================\n');
});

// 🛡️ Gestion propre de l'arrêt du serveur
process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur SurfAI...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur SurfAI...');
  process.exit(0);
});

module.exports = app;