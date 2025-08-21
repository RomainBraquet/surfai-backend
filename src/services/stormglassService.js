// 🌊 Service Stormglass pour SurfAI
// Gère les appels sécurisés à l'API météo marine

const axios = require('axios');

class StormglassService {
  constructor() {
    this.apiKey = process.env.STORMGLASS_API_KEY;
    this.baseURL = 'https://api.stormglass.io/v2';
    
    if (!this.apiKey) {
      console.error('❌ STORMGLASS_API_KEY manquante dans .env');
      throw new Error('STORMGLASS_API_KEY manquante dans les variables d\'environnement');
    }

    // Configuration du client HTTP
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15 secondes timeout
    });

    console.log('✅ Service Stormglass initialisé');
  }

  // 🌊 Récupérer prévisions météo marine
  async getForecast(lat, lng, days = 3) {
    try {
      console.log(`🌊 Appel Stormglass API: ${lat}, ${lng} (${days} jours)`);
      
      // Calcul des timestamps
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = Math.floor((Date.now() + (days * 24 * 60 * 60 * 1000)) / 1000);
      
      const params = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        params: 'waveHeight,wavePeriod,waveDirection,windSpeed,windDirection,swellHeight,swellPeriod,swellDirection',
        start: startTime,
        end: endTime,
        source: 'sg' // Source Stormglass prioritaire
      };

      console.log('📡 Paramètres Stormglass:', params);
      
      const response = await this.client.get('/weather/point', { params });

      console.log(`✅ Données reçues: ${response.data.hours?.length || 0} points`);
      
      // Traitement des données Stormglass
      const processedData = this.processStormglassData(response.data);
      
      return {
        success: true,
        source: 'stormglass',
        coordinates: { lat: parseFloat(lat), lng: parseFloat(lng) },
        forecast: processedData,
        meta: {
          requestTime: new Date().toISOString(),
          dataPoints: processedData.length,
          daysRequested: days,
          apiCalls: 1
        }
      };

    } catch (error) {
      console.error('❌ Erreur Stormglass API:', error.response?.data || error.message);
      
      // Gestion spécifique des erreurs API
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

  // 🔄 Traiter les données brutes de Stormglass
  processStormglassData(rawData) {
    if (!rawData.hours || !Array.isArray(rawData.hours)) {
      throw new Error('Format de données Stormglass invalide - pas de données horaires');
    }

    console.log(`🔄 Traitement de ${rawData.hours.length} points de données...`);

    return rawData.hours.map((hour, index) => {
      try {
        const time = new Date(hour.time);
        
        // Fonction pour extraire la première valeur disponible
        const getFirstValue = (param) => {
          if (!hour[param]) return null;
          const sources = Object.keys(hour[param]);
          return sources.length > 0 ? hour[param][sources[0]] : null;
        };

        // Extraction des données principales
        const waveHeight = getFirstValue('waveHeight');
        const wavePeriod = getFirstValue('wavePeriod');
        const waveDirection = getFirstValue('waveDirection');
        const windSpeed = getFirstValue('windSpeed');
        const windDirection = getFirstValue('windDirection');
        const swellHeight = getFirstValue('swellHeight');
        const swellPeriod = getFirstValue('swellPeriod');

        // Calculs dérivés
        const offshore = this.isOffshore(windDirection, waveDirection);
        const quality = this.calculateBasicQuality({
          waveHeight,
          windSpeed,
          wavePeriod,
          offshore
        });

        return {
          time: time.toISOString(),
          timestamp: Math.floor(time.getTime() / 1000),
          hour: time.getHours(),
          // Données primaires
          waveHeight: waveHeight ? Math.round(waveHeight * 10) / 10 : null,
          wavePeriod: wavePeriod ? Math.round(wavePeriod) : null,
          waveDirection: waveDirection ? Math.round(waveDirection) : null,
          windSpeed: windSpeed ? Math.round(windSpeed * 3.6 * 10) / 10 : null, // m/s vers km/h
          windDirection: windDirection ? Math.round(windDirection) : null,
          // Données de houle
          swellHeight: swellHeight ? Math.round(swellHeight * 10) / 10 : null,
          swellPeriod: swellPeriod ? Math.round(swellPeriod) : null,
          // Calculs
          offshore: offshore,
          quality: quality,
          // Métadonnées
          dataIndex: index
        };
      } catch (error) {
        console.warn(`⚠️ Erreur traitement point ${index}:`, error.message);
        return null;
      }
    }).filter(point => point !== null); // Retirer les points invalides
  }

  // 🧭 Déterminer si le vent est offshore (favorable)
  isOffshore(windDir, waveDir) {
    if (!windDir || !waveDir) return false;
    
    // Calculer la différence angulaire
    const diff = Math.abs(windDir - waveDir);
    const normalizedDiff = diff > 180 ? 360 - diff : diff;
    
    // Offshore si l'angle est entre 90° et 270° (vent vient de la terre)
    return normalizedDiff > 90 && normalizedDiff < 270;
  }

  // ⭐ Calcul qualité basique de session
  calculateBasicQuality(conditions) {
    const { waveHeight, windSpeed, wavePeriod, offshore } = conditions;
    
    if (!waveHeight || !windSpeed) return 1;
    
    let score = 1;
    
    // Score selon hauteur de vagues (optimal: 1-2.5m)
    if (waveHeight >= 1 && waveHeight <= 2.5) {
      score += 2.5;
    } else if (waveHeight >= 0.8 && waveHeight <= 3) {
      score += 1.5;
    } else if (waveHeight >= 0.5 && waveHeight <= 4) {
      score += 0.5;
    }
    
    // Score selon vent (optimal: < 15 km/h)
    const windKmh = windSpeed * 3.6; // Conversion m/s vers km/h
    if (windKmh < 10) {
      score += 2;
    } else if (windKmh < 20) {
      score += 1;
    } else if (windKmh < 30) {
      score += 0.5;
    }
    
    // Bonus période de vagues (plus c'est long, mieux c'est)
    if (wavePeriod >= 12) {
      score += 1;
    } else if (wavePeriod >= 8) {
      score += 0.5;
    }
    
    // Bonus vent offshore
    if (offshore) {
      score += 0.5;
    }
    
    // Normaliser entre 1 et 5
    return Math.min(5, Math.max(1, Math.round(score * 10) / 10));
  }

  // 🧪 Tester la connexion API
  async testConnection() {
    try {
      console.log('🧪 Test connexion Stormglass...');
      
      // Test avec coordonnées Biarritz
      const testLat = 43.4832;
      const testLng = -1.5586;
      
      const result = await this.getForecast(testLat, testLng, 1);
      
      return {
        success: true,
        message: '✅ Connexion Stormglass réussie !',
        dataPoints: result.forecast.length,
        sampleData: result.forecast.slice(0, 2) // Premiers points
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

// Export instance singleton
module.exports = new StormglassService();