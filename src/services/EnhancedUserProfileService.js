// src/services/EnhancedUserProfileService.js
// SurfAI V1 - Service de Profil Utilisateur Étendu - VERSION COMPLÈTE

class EnhancedUserProfileService {
  constructor() {
    // Base de données temporaire en mémoire (sera remplacée par vraie DB plus tard)
    this.users = new Map();
    this.sessions = new Map();
    this.spots = new Map();
    
    // Initialisation des données de test
    this.initializeTestData();
  }

  // ===== GESTION PROFIL UTILISATEUR =====
  
  createUserProfile(userData) {
    const userId = this.generateId();
    const profile = {
      id: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // INFOS PERSONNELLES
      personal: {
        name: userData.name || '',
        email: userData.email || '',
        location: userData.location || '',
        timezone: userData.timezone || 'Europe/Paris'
      },
      
      // NIVEAU SURF (1-10 au lieu de 4 catégories)
      surfLevel: {
        overall: userData.surfLevel || 1, // 1-10
        progression: {
          paddling: userData.paddling || 1,
          takeoff: userData.takeoff || 1,
          turning: userData.turning || 1,
          tubeRiding: userData.tubeRiding || 1
        },
        experience: {
          yearsActive: userData.yearsActive || 0,
          sessionsCount: 0, // Auto-calculé
          lastSession: null
        }
      },
      
      // ÉQUIPEMENT DÉTAILLÉ
      equipment: {
        boards: userData.boards || [],
        suits: userData.suits || [],
        accessories: userData.accessories || []
      },
      
      // PRÉFÉRENCES PHYSIQUES
      preferences: {
        waveSize: {
          min: userData.minWaveSize || 0.3, // mètres
          max: userData.maxWaveSize || 2.0,
          optimal: userData.optimalWaveSize || 1.2
        },
        windTolerance: {
          onshore: userData.onshoreWind || 15, // km/h max
          offshore: userData.offshoreWind || 25,
          sideshore: userData.sideshoreWind || 20
        },
        crowdTolerance: userData.crowdTolerance || 'medium', // low/medium/high
        waterTemp: {
          min: userData.minWaterTemp || 12 // °C
        }
      },
      
      // SPOTS FAVORIS & HISTORIQUE
      spots: {
        favorites: userData.favoriteSpots || [],
        history: [], // Auto-rempli par les sessions
        blacklist: userData.blacklistedSpots || []
      },
      
      // DISPONIBILITÉS
      availability: {
        schedule: userData.schedule || {
          monday: { available: false, timeSlots: [] },
          tuesday: { available: false, timeSlots: [] },
          wednesday: { available: false, timeSlots: [] },
          thursday: { available: false, timeSlots: [] },
          friday: { available: false, timeSlots: [] },
          saturday: { available: true, timeSlots: ['06:00-12:00', '14:00-18:00'] },
          sunday: { available: true, timeSlots: ['06:00-12:00', '14:00-18:00'] }
        },
        travelDistance: userData.maxTravelDistance || 30, // km
        notificationPrefs: {
          advance: userData.notificationAdvance || 24, // heures
          types: userData.notificationTypes || ['optimal', 'alternative']
        }
      },
      
      // OBJECTIFS PERSONNELS
      goals: {
        current: userData.currentGoals || [],
        achievements: [],
        progressTracking: {
          sessionsThisMonth: 0,
          progressionPoints: 0,
          challengesCompleted: []
        }
      }
    };
    
    this.users.set(userId, profile);
    return profile;
  }

  updateUserProfile(userId, updates) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('Utilisateur non trouvé');
    }
    
    // Mise à jour profonde des objets
    const updatedUser = this.deepMerge(user, updates);
    updatedUser.updatedAt = new Date().toISOString();
    
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  getUserProfile(userId) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('Utilisateur non trouvé');
    }
    return user;
  }

  // ===== GESTION ÉQUIPEMENT =====
  
  addBoard(userId, boardData) {
    const user = this.getUserProfile(userId);
    
    const board = {
      id: this.generateId(),
      type: boardData.type, // shortboard, longboard, fish, etc.
      brand: boardData.brand || '',
      model: boardData.model || '',
      dimensions: {
        length: boardData.length || 0,
        width: boardData.width || 0,
        thickness: boardData.thickness || 0,
        volume: boardData.volume || 0
      },
      conditions: {
        minWaveSize: boardData.minWaveSize || 0.3,
        maxWaveSize: boardData.maxWaveSize || 2.0,
        optimalWaveSize: boardData.optimalWaveSize || 1.2
      },
      notes: boardData.notes || '',
      addedAt: new Date().toISOString()
    };
    
    user.equipment.boards.push(board);
    this.users.set(userId, user);
    
    return board;
  }

  // ===== GESTION SESSIONS =====
  
  addSession(userId, sessionData) {
    const user = this.getUserProfile(userId);
    const sessionId = this.generateId();
    
    const session = {
      id: sessionId,
      userId: userId,
      date: sessionData.date || new Date().toISOString(),
      spot: {
        name: sessionData.spotName || '',
        coordinates: sessionData.coordinates || null
      },
      conditions: {
        waveHeight: sessionData.waveHeight || 0,
        wavePeriod: sessionData.wavePeriod || 0,
        windSpeed: sessionData.windSpeed || 0,
        windDirection: sessionData.windDirection || '',
        tide: sessionData.tide || ''
      },
      equipment: {
        board: sessionData.boardId || null,
        suit: sessionData.suitId || null
      },
      rating: {
        overall: sessionData.rating || 5,
        waves: sessionData.waveRating || 5,
        crowd: sessionData.crowdRating || 5,
        fun: sessionData.funRating || 5
      },
      duration: sessionData.duration || 60, // minutes
      notes: sessionData.notes || '',
      photos: sessionData.photos || []
    };
    
    this.sessions.set(sessionId, session);
    
    // Mise à jour des statistiques utilisateur
    user.surfLevel.experience.sessionsCount += 1;
    user.surfLevel.experience.lastSession = session.date;
    user.goals.progressTracking.sessionsThisMonth += 1;
    
    // Ajout du spot à l'historique
    if (!user.spots.history.find(spot => spot.name === session.spot.name)) {
      user.spots.history.push({
        name: session.spot.name,
        coordinates: session.spot.coordinates,
        sessionsCount: 1,
        lastVisit: session.date,
        averageRating: session.rating.overall
      });
    } else {
      const spotHistory = user.spots.history.find(spot => spot.name === session.spot.name);
      spotHistory.sessionsCount += 1;
      spotHistory.lastVisit = session.date;
      // Recalcul de la moyenne (simplifié)
      spotHistory.averageRating = (spotHistory.averageRating + session.rating.overall) / 2;
    }
    
    this.users.set(userId, user);
    
    return session;
  }

  getUserSessions(userId, limit = 10, offset = 0) {
    const userSessions = Array.from(this.sessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(offset, offset + limit);
    
    return {
      sessions: userSessions,
      total: Array.from(this.sessions.values()).filter(session => session.userId === userId).length,
      limit,
      offset
    };
  }

  // ===== GESTION SPOTS FAVORIS =====
  
  addFavoriteSpot(userId, spotId, reason = '') {
    const user = this.getUserProfile(userId);
    
    const favorite = {
      spotId,
      reason,
      addedAt: new Date().toISOString()
    };
    
    if (!user.spots.favorites.find(fav => fav.spotId === spotId)) {
      user.spots.favorites.push(favorite);
      this.users.set(userId, user);
    }
    
    return favorite;
  }

  // ===== RECOMMANDATIONS PERSONNALISÉES =====
  
  getPersonalizedRecommendations(userId, lat, lng, days = 3) {
    const user = this.getUserProfile(userId);
    
    // Mock de recommandations basées sur le profil
    const recommendations = {
      user: {
        name: user.personal.name,
        level: user.surfLevel.overall,
        preferences: user.preferences.waveSize
      },
      location: { lat, lng },
      recommendations: [
        {
          spot: 'Biarritz - Grande Plage',
          distance: 2.5,
          score: this.calculateSpotScore(user, { waveHeight: 1.2, windSpeed: 10 }),
          conditions: {
            waveHeight: 1.2,
            period: 12,
            windSpeed: 10,
            windDirection: 'E'
          },
          suitability: 'Parfait pour votre niveau',
          bestTime: '09:00-12:00'
        },
        {
          spot: 'Anglet - Les Cavaliers',
          distance: 5.2,
          score: this.calculateSpotScore(user, { waveHeight: 1.5, windSpeed: 15 }),
          conditions: {
            waveHeight: 1.5,
            period: 10,
            windSpeed: 15,
            windDirection: 'NE'
          },
          suitability: 'Bon pour progression',
          bestTime: '14:00-17:00'
        }
      ],
      alternatives: [
        {
          spot: 'Hendaye',
          distance: 18.5,
          reason: 'Conditions plus protégées',
          score: this.calculateSpotScore(user, { waveHeight: 0.8, windSpeed: 8 })
        }
      ]
    };
    
    return recommendations;
  }

  // ===== SUIVI PROGRESSION =====
  
  getProgressTracking(userId) {
    const user = this.getUserProfile(userId);
    const sessions = this.getUserSessions(userId, 50, 0);
    
    return {
      currentLevel: user.surfLevel.overall,
      progression: user.surfLevel.progression,
      stats: {
        totalSessions: user.surfLevel.experience.sessionsCount,
        thisMonth: user.goals.progressTracking.sessionsThisMonth,
        averageRating: this.calculateAverageRating(sessions.sessions),
        favoriteSpots: user.spots.favorites.length
      },
      goals: user.goals,
      nextLevel: {
        target: user.surfLevel.overall + 1,
        requirements: this.getNextLevelRequirements(user.surfLevel.overall)
      }
    };
  }

  // ===== MÉTHODES UTILITAIRES =====
  
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  deepMerge(target, source) {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target))
            Object.assign(output, { [key]: source[key] });
          else
            output[key] = this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  calculateSpotScore(user, conditions) {
    let score = 5.0;
    
    // Facteur taille de vague
    const waveOptimal = user.preferences.waveSize.optimal;
    const waveHeight = conditions.waveHeight;
    const waveFactor = 1 - Math.abs(waveHeight - waveOptimal) / waveOptimal;
    score *= waveFactor;
    
    // Facteur vent
    const windTolerance = user.preferences.windTolerance.onshore;
    const windFactor = Math.max(0, 1 - conditions.windSpeed / windTolerance);
    score *= windFactor;
    
    // Facteur niveau
    const levelFactor = Math.min(1, user.surfLevel.overall / 10);
    score *= (0.7 + 0.3 * levelFactor);
    
    return Math.round(score * 10) / 10;
  }

  calculateAverageRating(sessions) {
    if (sessions.length === 0) return 0;
    const total = sessions.reduce((sum, session) => sum + session.rating.overall, 0);
    return Math.round((total / sessions.length) * 10) / 10;
  }

  getNextLevelRequirements(currentLevel) {
    const requirements = {
      1: ['Apprendre à ramer', 'Première mousse'],
      2: ['Take-off en mousse', '10 sessions'],
      3: ['Take-off vague verte', 'Comprendre les priorités'],
      4: ['Premier virage', '25 sessions'],
      5: ['Bottom turn', 'Surf en autonomie'],
      6: ['Cut back', '50 sessions'],
      7: ['Tube riding débutant', 'Surf spots variés'],
      8: ['Manoeuvres avancées', '100+ sessions'],
      9: ['Compétition locale', 'Mentor autres surfeurs'],
      10: ['Expert local', 'Toutes conditions']
    };
    
    return requirements[currentLevel + 1] || ['Niveau maximum atteint'];
  }

  initializeTestData() {
    // Création d'un utilisateur de test
    const testUser = this.createUserProfile({
      name: 'Jean Surfer',
      email: 'jean@surfai.com',
      location: 'Biarritz, France',
      surfLevel: 6,
      minWaveSize: 0.8,
      maxWaveSize: 2.5,
      optimalWaveSize: 1.5,
      maxTravelDistance: 35
    });
    
    // Ajout d'une session test
    this.addSession(testUser.id, {
      spotName: 'Biarritz - Grande Plage',
      waveHeight: 1.2,
      windSpeed: 12,
      windDirection: 'E',
      rating: 8,
      duration: 90,
      notes: 'Super session matinale !'
    });
  }
}

// Export de la classe
module.exports = EnhancedUserProfileService;
