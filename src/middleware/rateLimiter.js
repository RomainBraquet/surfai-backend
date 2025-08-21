// ⚡ Rate Limiter pour SurfAI
// Évite l'abus de l'API et protège les ressources

const rateLimit = require('express-rate-limit');

// Rate limiter standard pour les routes météo
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes par IP par fenêtre de 15 minutes
  message: {
    error: 'Trop de requêtes',
    message: 'Limite de taux dépassée. Réessayez dans 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Retourne les headers standard rate limit
  legacyHeaders: false, // Désactive les headers legacy
  handler: (req, res) => {
    console.log(`🚨 Rate limit dépassé pour IP: ${req.ip}`);
    res.status(429).json({
      error: 'Trop de requêtes',
      message: 'Vous avez dépassé la limite de 100 requêtes par 15 minutes.',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
      ip: req.ip
    });
  }
});

// Rate limiter strict pour les opérations sensibles
const strictRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20, // 20 requêtes par heure
  message: {
    error: 'Limite stricte atteinte',
    message: 'Trop de requêtes sensibles. Réessayez dans 1 heure.',
    code: 'STRICT_RATE_LIMIT'
  }
});

// Rate limiter léger pour les routes publiques
const lightRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 requêtes par 5 minutes
  message: {
    error: 'Ralentissez',
    message: 'Trop de requêtes rapides. Attendez 5 minutes.',
    code: 'LIGHT_RATE_LIMIT'
  }
});

module.exports = { 
  rateLimiter,
  strictRateLimiter,
  lightRateLimiter 
};