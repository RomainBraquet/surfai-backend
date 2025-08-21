// 🔐 Middleware d'authentification pour SurfAI
// Protège les routes sensibles

// Vérifier la clé API pour les routes protégées
const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY_HASH;
  
  // Vérifier si la clé API est fournie et correcte
  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({
      error: 'Non autorisé',
      message: 'Clé API manquante ou invalide',
      code: 'UNAUTHORIZED',
      hint: 'Ajoutez le header "X-API-Key" avec la bonne clé'
    });
  }
  
  // Authentification réussie, continuer
  console.log('✅ Authentification API réussie');
  next();
};

// Middleware optionnel pour les routes publiques mais avec logging
const optionalAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey) {
    console.log('🔍 Clé API détectée sur route publique');
  }
  
  next();
};

module.exports = { 
  authenticateAPI,
  optionalAuth 
};