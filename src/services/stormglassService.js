// src/services/stormglassService.js
// Service Stormglass pour SurfAI - Version complète avec données marées
// Basé sur votre service existant + améliorations pour données complètes

const axios = require('axios');

class StormglassService {
  constructor() {
    this.apiKey = process.env.STORMGLASS_API_KEY || 'dec28c24-0a52-11f0-a364-0242ac130003-dec28c88-0a52-11f0-a364-0242ac130003';
    this.baseURL = 'https://api.stormglass.io/v2';
    
    if (!this.apiKey) {
      console.error('STORMGLASS_API_KEY manquante dans .env');
      throw new Error('STORMGLASS_API_KEY manquante dans les variables d\'environnement');
    }

    // Configuration du client HTTP (votre config existante améliorée)
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log('Service Stormglass initialisé avec données complètes');
  }

  // VOTRE MÉTHODE EXISTANTE AMÉLIORÉE avec données marées
  async getForecast(lat, lng, days = 3) {
    try {
      console.log(`Appel Stormglass API: ${lat}, ${lng} (${days} jours)`);
      
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = Math.floor((Date.now() + (days * 24 * 60 * 60 * 1000)) / 1000);
      
      // PARAMÈTRES ENRICHIS - ajout données marées
      const params = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        params: 'waveHeight,wavePeriod,waveDirection,windSpeed,windDirection,swellHeight,swellPeriod,swellDirection,seaLevel',
        start: startTime,
        end: endTime,
        source: 'sg'
      };

      console.log('Paramètres Stormglass enrichis:', params);
      
      const response = await this.client.get('/weather/point', { params });

      // AJOUT: Récupération des données de marées extremes en parallèle
      const tideExtremes = await this.getTideExtremes(lat, lng, startTime, endTime);

      console.log(`Données reçues: ${response.data.hours?.length || 0} points + marées`);
      
      const processedData = this.processEnhancedStormglassData(response.data, tideExtremes);
      
      return {
        success: true,
        source: 'stormglass',
        coordinates: { lat: parseFloat(lat), lng: parseFloat(lng) },
        forecast: processedData,
        meta: {
          requestTime: new Date().toISOString(),
          dataPoints: processedData.length,
          daysRequested: days,
          apiCalls: 2, // weather + tide
          tideExtremes: tideExtremes?.length || 0
        }
      };

    } catch (error) {
      console.error('Erreur Stormglass API:', error.response?.data || error.message);
      
      if (error.response?.status === 429) {
        throw new Error('Limite API Stormglass atteinte. Réessayez plus tard.');
      } else if (error.response?.status === 401) {
        throw new Error('Clé API Stormglass invalide ou expirée');
      } else if (error.response?.status === 422) {
        throw new Error('Paramètres de localisation invalides');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout de l\'API Stormglass (>15s)');
      }
      
      throw new Error(`Erreur API météo: ${error.message}`);
    }
  }

  // NOUVELLE MÉTHODE: Récupération des marées extremes
  async getTideExtremes(lat, lng, startTime, endTime) {
    try {
      console.log('Récupération données marées extremes...');
      
      const response = await this.client.get('/tide/extremes/point', {
        params: {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          start: startTime,
          end: endTime
        }
      });

      return response.data.data.map(extreme => ({
        time: extreme.time,
        height: extreme.height,
        type: extreme.type // 'high' ou 'low'
      }));

    } catch (error) {
      console.warn('Données marées indisponibles:', error.message);
      return [];
    }
  }

  // MÉTHODE AMÉLIORÉE: Processing avec données marées
  processEnhancedStormglassData(rawData, tideExtremes = []) {
    if (!rawData.hours || !Array.isArray(rawData.hours)) {
      throw new Error('Format de données Stormglass invalide');
    }

    console.log(`Traitement de ${rawData.hours.length} points + ${tideExtremes.length} marées...`);

    return rawData.hours.map((hour, index) => {
      try {
        const time = new Date(hour.time);
        
        const getFirstValue = (param) => {
          if (!hour[param]) return null;
          const sources = Object.keys(hour[param]);
          return sources.length > 0 ? hour[param][sources[0]] : null;
        };

        // Données existantes
        const waveHeight = getFirstValue('waveHeight');
        const wavePeriod = getFirstValue('wavePeriod');
        const waveDirection = getFirstValue('waveDirection');
        const windSpeed = getFirstValue('windSpeed');
        const windDirection = getFirstValue('windDirection');
        const swellHeight = getFirstValue('swellHeight');
        const swellPeriod = getFirstValue('swellPeriod');
        
        // NOUVELLES DONNÉES MARÉES
        const seaLevel = getFirstValue('seaLevel');
        const tideData = this.calculateTideDataForTime(time, tideExtremes, seaLevel);

        const offshore = this.isOffshore(windDirection, waveDirection);
        
        // QUALITÉ ENRICHIE avec données marées
        const quality = this.calculateEnhancedQuality({
          waveHeight,
          windSpeed,
          wavePeriod,
          offshore,
          tidePhase: tideData.phase,
          tideDirection: tideData.direction
        });

        return {
          time: time.toISOString(),
          timestamp: Math.floor(time.getTime() / 1000),
          hour: time.getHours(),
          
          // Données vagues (existantes)
          waveHeight: waveHeight ? Math.round(waveHeight * 10) / 10 : null,
          wavePeriod: wavePeriod ? Math.round(wavePeriod) : null,
          waveDirection: waveDirection ? Math.round(waveDirection) : null,
          
          // Données vent (existantes)
          windSpeed: windSpeed ? Math.round(windSpeed * 3.6 * 10) / 10 : null,
          windDirection: windDirection ? Math.round(windDirection) : null,
          
          // Données houle (existantes)
          swellHeight: swellHeight ? Math.round(swellHeight * 10) / 10 : null,
          swellPeriod: swellPeriod ? Math.round(swellPeriod) : null,
          
          // NOUVELLES DONNÉES MARÉES COMPLÈTES
          tideLevel: seaLevel ? Math.round(seaLevel * 100) / 100 : null,
          tideDirection: tideData.direction, // 'rising', 'falling', 'high', 'low'
          tidePhase: tideData.phase, // 'low', 'mid', 'high'
          tideCoefficient: tideData.coefficient,
          nextTideExtreme: tideData.nextExtreme,
          
          // Calculs (améliorés)
          offshore: offshore,
          quality: quality,
          
          dataIndex: index
        };
      } catch (error) {
        console.warn(`Erreur traitement point ${index}:`, error.message);
        return null;
      }
    }).filter(point => point !== null);
  }

  // NOUVELLE MÉTHODE: Calcul données marées pour un moment donné
  calculateTideDataForTime(targetTime, tideExtremes, seaLevel) {
    const targetTimestamp = targetTime.getTime();
    
    // Trouver marées précédente et suivante
    let previousTide = null;
    let nextTide = null;
    
    for (const extreme of tideExtremes) {
      const extremeTime = new Date(extreme.time).getTime();
      
      if (extremeTime <= targetTimestamp) {
        previousTide = extreme;
      } else if (extremeTime > targetTimestamp && !nextTide) {
        nextTide = extreme;
        break;
      }
    }

    // Déterminer direction marée
    let direction = 'unknown';
    if (previousTide && nextTide) {
      if (previousTide.type === 'low' && nextTide.type === 'high') {
        direction = 'rising';
      } else if (previousTide.type === 'high' && nextTide.type === 'low') {
        direction = 'falling';
      }
    } else if (previousTide) {
      direction = previousTide.type === 'low' ? 'rising' : 'falling';
    }

    // Phase marée basée sur niveau
    let phase = 'mid';
    if (seaLevel !== null) {
      if (seaLevel < -0.3) phase = 'low';
      else if (seaLevel > 0.3) phase = 'high';
    }

    // Coefficient approximatif
    const coefficient = this.calculateTideCoefficient(seaLevel, previousTide, nextTide);

    return {
      direction,
      phase,
      coefficient,
      nextExtreme: nextTide ? {
        time: nextTide.time,
        type: nextTide.type,
        height: nextTide.height,
        hoursUntil: (new Date(nextTide.time).getTime() - targetTimestamp) / (1000 * 60 * 60)
      } : null
    };
  }

  // MÉTHODE AMÉLIORÉE: Qualité avec données marées
  calculateEnhancedQuality(conditions) {
    const { waveHeight, windSpeed, wavePeriod, offshore, tidePhase, tideDirection } = conditions;
    
    if (!waveHeight || !windSpeed) return 1;
    
    let score = 1;
    
    // Score vagues (identique)
    if (waveHeight >= 1 && waveHeight <= 2.5) {
      score += 2.5;
    } else if (waveHeight >= 0.8 && waveHeight <= 3) {
      score += 1.5;
    } else if (waveHeight >= 0.5 && waveHeight <= 4) {
      score += 0.5;
    }
    
    // Score vent (identique)
    const windKmh = windSpeed * 3.6;
    if (windKmh < 10) {
      score += 2;
    } else if (windKmh < 20) {
      score += 1;
    } else if (windKmh < 30) {
      score += 0.5;
    }
    
    // Bonus période (identique)
    if (wavePeriod >= 12) {
      score += 1;
    } else if (wavePeriod >= 8) {
      score += 0.5;
    }
    
    // Bonus offshore (identique)
    if (offshore) {
      score += 0.5;
    }
    
    // NOUVEAU: Bonus marées
    if (tideDirection === 'rising' && tidePhase === 'mid') {
      score += 0.5; // Marée montante mi-marée = optimal
    } else if (tidePhase === 'mid') {
      score += 0.25; // Mi-marée toujours bien
    }
    
    return Math.min(5, Math.max(1, Math.round(score * 10) / 10));
  }

  // Méthodes utilitaires (vos méthodes existantes conservées)
  isOffshore(windDir, waveDir) {
    if (!windDir || !waveDir) return false;
    const diff = Math.abs(windDir - waveDir);
    const normalizedDiff = diff > 180 ? 360 - diff : diff;
    return normalizedDiff > 90 && normalizedDiff < 270;
  }

  calculateTideCoefficient(seaLevel, previousTide, nextTide) {
    if (!seaLevel) return 50; // Valeur par défaut
    
    // Calcul basique basé sur amplitude
    const amplitude = Math.abs(seaLevel);
    return Math.max(20, Math.min(120, Math.round(30 + (amplitude * 90))));
  }

  // NOUVELLE MÉTHODE: Données complètes pour une session spécifique
  async getCompleteSessionData(lat, lng, sessionDateTime) {
    try {
      const sessionTime = new Date(sessionDateTime);
      const startTime = Math.floor((sessionTime.getTime() - 60 * 60 * 1000) / 1000); // 1h avant
      const endTime = Math.floor((sessionTime.getTime() + 60 * 60 * 1000) / 1000);   // 1h après

      // Récupération données pour période courte autour de la session
      const result = await this.getForecast(lat, lng, 1);
      
      // Trouver les données les plus proches de l'heure de session
      const targetTime = sessionTime.getTime();
      let closestData = result.forecast[0];
      let minDiff = Math.abs(new Date(closestData.time).getTime() - targetTime);

      for (const data of result.forecast) {
        const diff = Math.abs(new Date(data.time).getTime() - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestData = data;
        }
      }

      return {
        sessionDateTime: sessionDateTime,
        coordinates: { lat, lng },
        marine: {
          waveHeight: closestData.waveHeight,
          wavePeriod: closestData.wavePeriod,
          waveDirection: closestData.waveDirection,
          windSpeed: closestData.windSpeed,
          windDirection: closestData.windDirection,
          quality: closestData.quality
        },
        tide: {
          level: closestData.tideLevel,
          direction: closestData.tideDirection,
          phase: closestData.tidePhase,
          coefficient: closestData.tideCoefficient,
          nextExtreme: closestData.nextTideExtreme
        },
        dataQuality: minDiff < 60 * 60 * 1000 ? 95 : 75, // Qualité selon proximité temporelle
        source: 'stormglass'
      };
    } catch (error) {
      throw new Error(`Impossible de récupérer les données complètes: ${error.message}`);
    }
  }

  // VOTRE MÉTHODE DE TEST AMÉLIORÉE
  async testConnection() {
    try {
      console.log('Test connexion Stormglass avec données complètes...');
      
      const testLat = 43.4832;
      const testLng = -1.5586;
      
      const result = await this.getForecast(testLat, testLng, 1);
      
      // Test données marées
      const samplePoint = result.forecast[0];
      const hasTideData = samplePoint.tideLevel !== null;
      
      return {
        success: true,
        message: 'Connexion Stormglass réussie avec données enrichies !',
        dataPoints: result.forecast.length,
        tideDataAvailable: hasTideData,
        sampleData: {
          waves: {
            height: samplePoint.waveHeight,
            period: samplePoint.wavePeriod,
            direction: samplePoint.waveDirection
          },
          tides: hasTideData ? {
            level: samplePoint.tideLevel,
            direction: samplePoint.tideDirection,
            phase: samplePoint.tidePhase,
            coefficient: samplePoint.tideCoefficient
          } : 'Non disponible',
          quality: samplePoint.quality
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        suggestion: 'Vérifiez votre clé API dans le fichier .env'
      };
    }
  }
}

  // Récupère les données de marées complètes
  async getTideData(lat, lng, startTime = null, endTime = null) {
    try {
      const start = startTime || new Date().toISOString();
      const end = endTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const response = await axios.get(`${this.baseUrl}/tide/extremes/point`, {
        params: {
          lat: lat,
          lng: lng,
          start: start.slice(0, 19),
          end: end.slice(0, 19)
        },
        headers: {
          'Authorization': this.apiKey
        },
        timeout: this.timeout
      });

      const tideCoeffResponse = await axios.get(`${this.baseUrl}/tide/sea-level/point`, {
        params: {
          lat: lat,
          lng: lng,
          start: start.slice(0, 19),
          end: end.slice(0, 19)
        },
        headers: {
          'Authorization': this.apiKey
        },
        timeout: this.timeout
      });

      return this.processTideData(response.data, tideCoeffResponse.data);
    } catch (error) {
      console.error('Erreur Stormglass Marées:', error.message);
      throw new Error(`Impossible de récupérer les données de marées: ${error.message}`);
    }
  }

  // Données complètes pour une session (toutes les données critiques)
  async getCompleteSessionData(lat, lng, sessionDateTime) {
    try {
      const sessionTime = new Date(sessionDateTime);
      const startTime = new Date(sessionTime.getTime() - 60 * 60 * 1000); // 1h avant
      const endTime = new Date(sessionTime.getTime() + 60 * 60 * 1000);   // 1h après

      // Récupération parallèle des données
      const [marineData, tideData] = await Promise.all([
        this.getMarineData(lat, lng, startTime.toISOString(), endTime.toISOString()),
        this.getTideData(lat, lng, startTime.toISOString(), endTime.toISOString())
      ]);

      // Trouver les données les plus proches de l'heure de session
      const sessionMarineData = this.findClosestTimeData(marineData, sessionDateTime);
      const sessionTideData = this.calculateTideAtTime(tideData, sessionDateTime);

      return {
        sessionDateTime: sessionDateTime,
        coordinates: { lat, lng },
        marine: sessionMarineData,
        tide: sessionTideData,
        dataQuality: this.calculateDataQuality(sessionMarineData, sessionTideData),
        source: 'stormglass'
      };
    } catch (error) {
      console.error('Erreur données session complètes:', error.message);
      throw new Error(`Impossible de récupérer les données complètes: ${error.message}`);
    }
  }

  // Traite les données marines brutes
  processMarineData(rawData) {
    if (!rawData.hours || rawData.hours.length === 0) {
      throw new Error('Aucune donnée marine reçue');
    }

    return rawData.hours.map(hour => ({
      time: hour.time,
      waveHeight: this.extractValue(hour.waveHeight),
      wavePeriod: this.extractValue(hour.wavePeriod),
      waveDirection: this.extractValue(hour.waveDirection),
      windSpeed: this.extractValue(hour.windSpeed),
      windDirection: this.extractValue(hour.windDirection),
      airTemperature: this.extractValue(hour.airTemperature),
      waterTemperature: this.extractValue(hour.waterTemperature),
      quality: this.calculateWaveQuality(
        this.extractValue(hour.waveHeight),
        this.extractValue(hour.wavePeriod),
        this.extractValue(hour.windSpeed)
      )
    }));
  }

  // Traite les données de marées
  processTideData(extremesData, seaLevelData) {
    const extremes = extremesData.data || [];
    const seaLevel = seaLevelData.hours || [];

    return {
      extremes: extremes.map(extreme => ({
        time: extreme.time,
        height: extreme.height,
        type: extreme.type // 'high' ou 'low'
      })),
      seaLevel: seaLevel.map(level => ({
        time: level.time,
        height: this.extractValue(level.seaLevel),
        coefficient: this.calculateTideCoefficient(this.extractValue(level.seaLevel))
      }))
    };
  }

  // Trouve les données les plus proches d'un moment donné
  findClosestTimeData(dataArray, targetDateTime) {
    if (!dataArray || dataArray.length === 0) return null;

    const targetTime = new Date(targetDateTime).getTime();
    
    let closest = dataArray[0];
    let minDiff = Math.abs(new Date(closest.time).getTime() - targetTime);

    for (const data of dataArray) {
      const diff = Math.abs(new Date(data.time).getTime() - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = data;
      }
    }

    return closest;
  }

  // Calcule l'état de la marée à un moment précis
  calculateTideAtTime(tideData, targetDateTime) {
    const targetTime = new Date(targetDateTime);
    const extremes = tideData.extremes;
    const seaLevel = tideData.seaLevel;

    // Trouver le niveau de mer le plus proche
    const closestLevel = this.findClosestTimeData(seaLevel, targetDateTime);
    
    // Déterminer si marée montante ou descendante
    const direction = this.calculateTideDirection(extremes, targetDateTime);
    
    // Calculer le coefficient approximatif
    const coefficient = this.calculateTideCoefficient(closestLevel?.height || 0);

    return {
      time: targetDateTime,
      level: closestLevel?.height || 0,
      direction: direction, // 'rising', 'falling', 'high', 'low'
      coefficient: coefficient,
      phase: this.getTidePhase(closestLevel?.height || 0),
      nextExtreme: this.findNextTideExtreme(extremes, targetDateTime)
    };
  }

  // Détermine la direction de la marée
  calculateTideDirection(extremes, targetDateTime) {
    const targetTime = new Date(targetDateTime).getTime();
    
    let previousExtreme = null;
    let nextExtreme = null;

    for (const extreme of extremes) {
      const extremeTime = new Date(extreme.time).getTime();
      
      if (extremeTime <= targetTime) {
        previousExtreme = extreme;
      } else if (extremeTime > targetTime && !nextExtreme) {
        nextExtreme = extreme;
        break;
      }
    }

    if (!previousExtreme) return 'unknown';
    if (!nextExtreme) return previousExtreme.type === 'high' ? 'falling' : 'rising';

    // Si on vient d'une marée basse et on va vers une haute
    if (previousExtreme.type === 'low' && nextExtreme.type === 'high') {
      return 'rising';
    }
    // Si on vient d'une marée haute et on va vers une basse
    if (previousExtreme.type === 'high' && nextExtreme.type === 'low') {
      return 'falling';
    }

    return 'unknown';
  }

  // Calcule le coefficient de marée approximatif
  calculateTideCoefficient(seaLevel) {
    // Approximation basique - à améliorer avec données réelles
    const normalizedLevel = Math.abs(seaLevel);
    return Math.max(20, Math.min(120, Math.round(20 + (normalizedLevel * 100))));
  }

  // Détermine la phase de marée
  getTidePhase(level) {
    const absLevel = Math.abs(level);
    if (absLevel < 0.3) return 'low';
    if (absLevel > 0.7) return 'high';
    return 'mid';
  }

  // Trouve le prochain extrême de marée
  findNextTideExtreme(extremes, targetDateTime) {
    const targetTime = new Date(targetDateTime).getTime();
    
    for (const extreme of extremes) {
      if (new Date(extreme.time).getTime() > targetTime) {
        return {
          time: extreme.time,
          type: extreme.type,
          height: extreme.height,
          hoursUntil: (new Date(extreme.time).getTime() - targetTime) / (1000 * 60 * 60)
        };
      }
    }
    
    return null;
  }

  // Calcule la qualité des vagues
  calculateWaveQuality(waveHeight, wavePeriod, windSpeed) {
    let quality = 0;
    
    // Score hauteur (0-4)
    if (waveHeight >= 0.8 && waveHeight <= 3) {
      quality += waveHeight >= 1.2 && waveHeight <= 2.5 ? 4 : 2;
    }
    
    // Score période (0-4) - CRITIQUE
    if (wavePeriod >= 8) {
      quality += wavePeriod >= 12 ? 4 : wavePeriod >= 10 ? 3 : 2;
    }
    
    // Score vent (0-2)
    if (windSpeed <= 15) {
      quality += windSpeed <= 10 ? 2 : 1;
    }

    return Math.round(quality * 10 / 10); // Score sur 10
  }

  // Extrait la valeur d'un objet de données Stormglass
  extractValue(dataObject) {
    if (!dataObject) return null;
    
    // Stormglass renvoie plusieurs sources, on prend la première disponible
    const sources = ['sg', 'noaa', 'meteo', 'meto', 'fcoo', 'fmi'];
    
    for (const source of sources) {
      if (dataObject[source] !== undefined && dataObject[source] !== null) {
        return dataObject[source];
      }
    }
    
    return null;
  }

  // Calcule la qualité des données reçues
  calculateDataQuality(marineData, tideData) {
    let quality = 0;
    let maxQuality = 0;

    // Vérification données marine
    if (marineData) {
      maxQuality += 6;
      if (marineData.waveHeight !== null) quality += 1;
      if (marineData.wavePeriod !== null) quality += 2; // Plus important
      if (marineData.windSpeed !== null) quality += 1;
      if (marineData.windDirection !== null) quality += 1;
      if (marineData.waveDirection !== null) quality += 1;
    }

    // Vérification données marée
    if (tideData) {
      maxQuality += 4;
      if (tideData.level !== null) quality += 2;
      if (tideData.direction !== 'unknown') quality += 1;
      if (tideData.coefficient > 0) quality += 1;
    }

    return maxQuality > 0 ? Math.round((quality / maxQuality) * 100) : 0;
  }

  // Test de connexion à l'API
  async testConnection() {
    try {
      const testResponse = await this.getMarineData(43.4832, -1.5586, 
        new Date().toISOString(), 
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );

      return {
        success: true,
        message: 'Connexion Stormglass réussie',
        dataPoints: testResponse.length,
        sampleData: testResponse[0] || null
      };
    } catch (error) {
      return {
        success: false,
        message: 'Échec connexion Stormglass',
        error: error.message
      };
    }
  }
}

// Export instance singleton (comme dans votre code)
module.exports = new StormglassService();
