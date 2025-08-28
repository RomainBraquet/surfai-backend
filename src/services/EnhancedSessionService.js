
// src/services/EnhancedSessionService.js
// Service sessions enrichi avec données Stormglass complètes

const StormglassService = require('./stormglassService');

class EnhancedSessionService {
  constructor() {
    this.stormglassService = new StormglassService();
    this.sessions = new Map(); // Stockage sessions par userId
    this.spotCoordinates = this.initializeSpotCoordinates();
  }

  // Base de données des spots avec coordonnées
  initializeSpotCoordinates() {
    return {
      'Biarritz - Grande Plage': { lat: 43.4832, lng: -1.5586 },
      'Anglet - Les Cavaliers': { lat: 43.4958, lng: -1.5133 },
      'Hendaye': { lat: 43.3731, lng: -1.7758 },
      'Hossegor - Central': { lat: 43.6615, lng: -1.4057 },
      'Capbreton': { lat: 43.6416, lng: -1.4287 },
      'Lacanau - Central': { lat: 45.0045, lng: -1.2024 },
      'Seignosse - Les Estagnots': { lat: 43.6892, lng: -1.3897 }
    };
  }

  // Crée une session avec enrichissement automatique Stormglass
  async createEnhancedSession(userId, sessionData) {
    try {
      console.log(`Création session enrichie pour ${userId}`);
      
      // Validation des données de base
      const validation = this.validateSessionData(sessionData);
      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }

      // Coordonnées du spot
      const coordinates = this.getSpotCoordinates(sessionData.spotName);
      if (!coordinates) {
        return { 
          success: false, 
          error: `Spot inconnu: ${sessionData.spotName}. Ajoutez les coordonnées manuellement.` 
        };
      }

      // Récupération des données Stormglass complètes
      const stormglassData = await this.stormglassService.getCompleteSessionData(
        coordinates.lat,
        coordinates.lng,
        sessionData.sessionDateTime
      );

      // Construction de la session enrichie
      const enrichedSession = {
        // Données utilisateur (essentielles)
        id: this.generateSessionId(),
        userId: userId,
        timestamp: new Date().toISOString(),
        
        // Données session de base
        essential: {
          spot: sessionData.spotName,
          date: sessionData.sessionDateTime,
          rating: sessionData.rating,
          duration: sessionData.duration || null,
          notes: sessionData.notes || '',
          board: sessionData.board || null
        },

        // Données complètes auto-enrichies par Stormglass
        conditions: {
          // Vagues (données complètes)
          waveHeight: stormglassData.marine.waveHeight,
          wavePeriod: stormglassData.marine.wavePeriod,        // NOUVELLE - critique
          waveDirection: stormglassData.marine.waveDirection,  // NOUVELLE
          waveQuality: stormglassData.marine.quality,

          // Vent
          windSpeed: stormglassData.marine.windSpeed,
          windDirection: stormglassData.marine.windDirection,

          // Marées (données complètes)
          tideLevel: stormglassData.tide.level,                // NOUVELLE - critique
          tideDirection: stormglassData.tide.direction,        // NOUVELLE - montante/descendante
          tideCoefficient: stormglassData.tide.coefficient,    // NOUVELLE - force marée
          tidePhase: stormglassData.tide.phase,               // NOUVELLE - basse/mi/haute
          nextTideExtreme: stormglassData.tide.nextExtreme,    // NOUVELLE - prochaine marée

          // Température
          airTemperature: stormglassData.marine.airTemperature,
          waterTemperature: stormglassData.marine.waterTemperature
        },

        // Métadonnées enrichissement
        enrichment: {
          source: 'stormglass',
          dataQuality: stormglassData.dataQuality,
          coordinates: coordinates,
          enrichedAt: new Date().toISOString(),
          manual: false
        }
      };

      // Stockage de la session
      if (!this.sessions.has(userId)) {
        this.sessions.set(userId, []);
      }
      this.sessions.get(userId).push(enrichedSession);

      return {
        success: true,
        session: enrichedSession,
        message: 'Session créée et enrichie avec données Stormglass complètes',
        dataQuality: stormglassData.dataQuality
      };

    } catch (error) {
      console.error('Erreur création session enrichie:', error.message);
      
      // Fallback : session sans enrichissement
      return this.createBasicSession(userId, sessionData, error.message);
    }
  }

  // Session de base si Stormglass échoue
  createBasicSession(userId, sessionData, errorMessage) {
    const basicSession = {
      id: this.generateSessionId(),
      userId: userId,
      timestamp: new Date().toISOString(),
      
      essential: {
        spot: sessionData.spotName,
        date: sessionData.sessionDateTime,
        rating: sessionData.rating,
        duration: sessionData.duration || null,
        notes: sessionData.notes || ''
      },

      conditions: {
        // Données de base ou estimées
        waveHeight: sessionData.waveHeight || null,
        wavePeriod: sessionData.wavePeriod || null,
        windSpeed: sessionData.windSpeed || null,
        windDirection: sessionData.windDirection || null,
        tideLevel: sessionData.tideLevel || null,
        tideDirection: sessionData.tideDirection || null
      },

      enrichment: {
        source: 'manual',
        dataQuality: 30,
        error: errorMessage,
        enrichedAt: new Date().toISOString(),
        manual: true
      }
    };

    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, []);
    }
    this.sessions.get(userId).push(basicSession);

    return {
      success: true,
      session: basicSession,
      message: 'Session créée sans enrichissement (données de base)',
      warning: `Enrichissement échoué: ${errorMessage}`
    };
  }

  // Enrichissement rétroactif des anciennes sessions
  async enrichExistingSession(userId, sessionId) {
    try {
      const userSessions = this.sessions.get(userId) || [];
      const session = userSessions.find(s => s.id === sessionId);

      if (!session) {
        return { success: false, error: 'Session non trouvée' };
      }

      if (session.enrichment?.source === 'stormglass') {
        return { success: false, error: 'Session déjà enrichie' };
      }

      const coordinates = this.getSpotCoordinates(session.essential.spot);
      if (!coordinates) {
        return { success: false, error: 'Coordonnées spot manquantes' };
      }

      // Récupération des données historiques
      const stormglassData = await this.stormglassService.getCompleteSessionData(
        coordinates.lat,
        coordinates.lng,
        session.essential.date
      );

      // Mise à jour de la session
      session.conditions = {
        ...session.conditions,
        waveHeight: stormglassData.marine.waveHeight,
        wavePeriod: stormglassData.marine.wavePeriod,
        waveDirection: stormglassData.marine.waveDirection,
        waveQuality: stormglassData.marine.quality,
        windSpeed: stormglassData.marine.windSpeed,
        windDirection: stormglassData.marine.windDirection,
        tideLevel: stormglassData.tide.level,
        tideDirection: stormglassData.tide.direction,
        tideCoefficient: stormglassData.tide.coefficient,
        tidePhase: stormglassData.tide.phase,
        airTemperature: stormglassData.marine.airTemperature,
        waterTemperature: stormglassData.marine.waterTemperature
      };

      session.enrichment = {
        source: 'stormglass',
        dataQuality: stormglassData.dataQuality,
        coordinates: coordinates,
        enrichedAt: new Date().toISOString(),
        manual: false
      };

      return {
        success: true,
        session: session,
        message: 'Session enrichie rétroactivement',
        dataQuality: stormglassData.dataQuality
      };

    } catch (error) {
      return {
        success: false,
        error: `Enrichissement échoué: ${error.message}`
      };
    }
  }

  // Récupère les sessions d'un utilisateur
  getUserSessions(userId) {
    return this.sessions.get(userId) || [];
  }

  // Analyse de la qualité des données des sessions utilisateur
  analyzeSessionDataQuality(userId) {
    const userSessions = this.getUserSessions(userId);
    
    if (userSessions.length === 0) {
      return { message: 'Aucune session trouvée' };
    }

    const analysis = {
      totalSessions: userSessions.length,
      enrichedSessions: userSessions.filter(s => s.enrichment?.source === 'stormglass').length,
      manualSessions: userSessions.filter(s => s.enrichment?.source === 'manual').length,
      averageDataQuality: 0,
      missingData: {
        wavePeriod: 0,
        tideData: 0,
        windDirection: 0
      }
    };

    // Calcul qualité moyenne
    const qualitySum = userSessions.reduce((sum, session) => {
      return sum + (session.enrichment?.dataQuality || 0);
    }, 0);
    analysis.averageDataQuality = Math.round(qualitySum / userSessions.length);

    // Analyse données manquantes
    userSessions.forEach(session => {
      if (!session.conditions.wavePeriod) analysis.missingData.wavePeriod++;
      if (!session.conditions.tideLevel) analysis.missingData.tideData++;
      if (!session.conditions.windDirection) analysis.missingData.windDirection++;
    });

    analysis.recommendations = this.generateDataQualityRecommendations(analysis);

    return analysis;
  }

  // Recommandations pour améliorer la qualité des données
  generateDataQualityRecommendations(analysis) {
    const recommendations = [];

    if (analysis.manualSessions > analysis.enrichedSessions) {
      recommendations.push('Enrichir les sessions manuelles avec les données Stormglass');
    }

    if (analysis.missingData.wavePeriod > analysis.totalSessions * 0.3) {
      recommendations.push('Période des vagues manquante - critique pour prédictions précises');
    }

    if (analysis.missingData.tideData > analysis.totalSessions * 0.5) {
      recommendations.push('Données de marée incomplètes - importantes selon les spots');
    }

    if (analysis.averageDataQuality < 70) {
      recommendations.push('Qualité des données faible - vérifier la connexion Stormglass');
    }

    return recommendations;
  }

  // Utilitaires

  getSpotCoordinates(spotName) {
    return this.spotCoordinates[spotName] || null;
  }

  addSpotCoordinates(spotName, lat, lng) {
    this.spotCoordinates[spotName] = { lat, lng };
    return true;
  }

  validateSessionData(sessionData) {
    const errors = [];
    
    if (!sessionData.spotName) errors.push('Nom du spot requis');
    if (!sessionData.sessionDateTime) errors.push('Date et heure de session requises');
    if (!sessionData.rating || sessionData.rating < 1 || sessionData.rating > 10) {
      errors.push('Rating requis (1-10)');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = EnhancedSessionService;

