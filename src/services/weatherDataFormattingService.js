// src/services/weatherDataFormattingService.js
// Service d'harmonisation des données météo/maritimes selon le référentiel SurfAI
// Transforme les données brutes en format standardisé avec emojis et traductions

class WeatherDataFormattingService {
  
  /**
   * Harmonise toutes les données selon le référentiel exact
   * @param {Object} rawData - Données brutes depuis Stormglass ou base de données
   * @returns {Object} - Données formatées selon le standard SurfAI
   */
  static formatCompleteWeatherData(rawData) {
    return {
      // DONNÉES PRINCIPALES
      waveHeight: this.formatWaveHeight(rawData.waveHeight || rawData.wave_height),
      wavePeriod: this.formatWavePeriod(rawData.wavePeriod || rawData.wave_period),
      windSpeed: this.formatWindSpeed(rawData.windSpeed || rawData.wind_speed),
      windDirection: this.formatWindDirection(rawData.windDirection || rawData.wind_direction),
      
      // DONNÉES MARÉE COMPLÈTES
      tideState: this.formatTideState(rawData.tideDirection || rawData.tide),
      tideCoefficient: this.formatTideCoefficient(rawData.tideCoefficient || rawData.tide_coefficient),
      tideHeight: this.formatTideHeight(rawData.tideLevel || rawData.tide_height),
      
      // DONNÉES SECONDAIRES
      waterTemperature: this.formatWaterTemperature(rawData.waterTemperature || rawData.water_temperature),
      
      // Métadonnées
      timestamp: rawData.time || rawData.timestamp,
      quality: rawData.quality || null
    };
  }

  /**
   * DONNÉES PRINCIPALES - Formatage selon référentiel exact
   */

  // Hauteur vagues : format uniforme "1.2m"
  static formatWaveHeight(height) {
    if (height === null || height === undefined) return null;
    const numHeight = parseFloat(height);
    if (isNaN(numHeight)) return null;
    
    return `${numHeight.toFixed(1)}m`;
  }

  // Période vagues : "10s" (ACTUELLEMENT MANQUANTE - CRITIQUE)
  static formatWavePeriod(period) {
    if (period === null || period === undefined) return null;
    const numPeriod = parseFloat(period);
    if (isNaN(numPeriod)) return null;
    
    return `${Math.round(numPeriod)}s`;
  }

  // Vitesse vent : "15 km/h" (avec conversion noeuds→km/h)
  static formatWindSpeed(speed) {
    if (speed === null || speed === undefined) return null;
    let numSpeed = parseFloat(speed);
    if (isNaN(numSpeed)) return null;
    
    // Conversion si nécessaire (détection automatique m/s -> km/h)
    if (numSpeed < 50) {
      numSpeed = numSpeed * 3.6; // m/s vers km/h
    }
    
    return `${Math.round(numSpeed)} km/h`;
  }

  // Direction vent : "W" + "Ouest" + emoji "⬅️"
  static formatWindDirection(direction) {
    if (direction === null || direction === undefined) return null;
    
    let degrees;
    if (typeof direction === 'string') {
      degrees = this.cardinalTodegrees(direction);
    } else {
      degrees = parseFloat(direction);
    }
    
    if (isNaN(degrees)) return null;
    
    const cardinal = this.degreesToCardinal(degrees);
    const french = this.cardinalToFrench(cardinal);
    const emoji = this.getDirectionEmoji(degrees);
    
    return {
      cardinal: cardinal,
      french: french,
      emoji: emoji,
      degrees: Math.round(degrees),
      formatted: `${cardinal} ${french} ${emoji}`
    };
  }

  /**
   * DONNÉES MARÉE COMPLÈTES
   */

  // État : "Mi-marée montante" + emoji
  static formatTideState(tideDirection, tidePhase = null) {
    if (!tideDirection) return null;
    
    let state = '';
    let emoji = '';
    
    // Déterminer l'état complet
    if (tideDirection === 'rising') {
      if (tidePhase === 'low') {
        state = 'Marée montante';
        emoji = '📈';
      } else if (tidePhase === 'mid') {
        state = 'Mi-marée montante';
        emoji = '🌊';
      } else {
        state = 'Marée montante';
        emoji = '📈';
      }
    } else if (tideDirection === 'falling') {
      if (tidePhase === 'high') {
        state = 'Marée descendante';
        emoji = '📉';
      } else if (tidePhase === 'mid') {
        state = 'Mi-marée descendante';
        emoji = '🌊';
      } else {
        state = 'Marée descendante';
        emoji = '📉';
      }
    } else if (tideDirection === 'high') {
      state = 'Pleine mer';
      emoji = '🔝';
    } else if (tideDirection === 'low') {
      state = 'Basse mer';
      emoji = '🔽';
    } else {
      state = 'État inconnu';
      emoji = '❓';
    }
    
    return {
      state: state,
      emoji: emoji,
      formatted: `${state} ${emoji}`
    };
  }

  // Coefficient : "75" + catégorie "Moyen" (ACTUELLEMENT MANQUANT - CRITIQUE)
  static formatTideCoefficient(coefficient) {
    if (coefficient === null || coefficient === undefined) return null;
    const numCoeff = parseInt(coefficient);
    if (isNaN(numCoeff)) return null;
    
    let category = '';
    if (numCoeff < 45) {
      category = 'Faible';
    } else if (numCoeff < 70) {
      category = 'Moyen';
    } else if (numCoeff < 95) {
      category = 'Fort';
    } else {
      category = 'Très fort';
    }
    
    return {
      value: numCoeff,
      category: category,
      formatted: `${numCoeff} (${category})`
    };
  }

  // Hauteur marée : "2.5m" (ACTUELLEMENT MANQUANT - CRITIQUE)
  static formatTideHeight(height) {
    if (height === null || height === undefined) return null;
    const numHeight = parseFloat(height);
    if (isNaN(numHeight)) return null;
    
    return `${numHeight.toFixed(1)}m`;
  }

  /**
   * DONNÉES SECONDAIRES
   */

  // Température eau : "15.0°C" + confort "Fraîche"
  static formatWaterTemperature(temp) {
    if (temp === null || temp === undefined) return null;
    const numTemp = parseFloat(temp);
    if (isNaN(numTemp)) return null;
    
    let comfort = '';
    if (numTemp < 10) {
      comfort = 'Très froide';
    } else if (numTemp < 15) {
      comfort = 'Froide';
    } else if (numTemp < 18) {
      comfort = 'Fraîche';
    } else if (numTemp < 22) {
      comfort = 'Bonne';
    } else if (numTemp < 26) {
      comfort = 'Chaude';
    } else {
      comfort = 'Très chaude';
    }
    
    return {
      value: numTemp,
      comfort: comfort,
      formatted: `${numTemp.toFixed(1)}°C (${comfort})`
    };
  }

  /**
   * MÉTHODES UTILITAIRES POUR CONVERSIONS
   */

  // Convertit degrés en direction cardinale
  static degreesToCardinal(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  }

  // Convertit direction cardinale en degrés
  static cardinalToD egrees(cardinal) {
    const cardinals = {
      'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
      'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
      'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
      'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
    };
    return cardinals[cardinal.toUpperCase()] || 0;
  }

  // Traductions françaises des directions
  static cardinalToFrench(cardinal) {
    const translations = {
      'N': 'Nord', 'NNE': 'Nord-Nord-Est', 'NE': 'Nord-Est', 'ENE': 'Est-Nord-Est',
      'E': 'Est', 'ESE': 'Est-Sud-Est', 'SE': 'Sud-Est', 'SSE': 'Sud-Sud-Est',
      'S': 'Sud', 'SSW': 'Sud-Sud-Ouest', 'SW': 'Sud-Ouest', 'WSW': 'Ouest-Sud-Ouest',
      'W': 'Ouest', 'WNW': 'Ouest-Nord-Ouest', 'NW': 'Nord-Ouest', 'NNW': 'Nord-Nord-Ouest'
    };
    return translations[cardinal] || cardinal;
  }

  // Emojis pour les directions du vent
  static getDirectionEmoji(degrees) {
    if (degrees >= 337.5 || degrees < 22.5) return '⬆️';      // N
    if (degrees >= 22.5 && degrees < 67.5) return '↗️';       // NE  
    if (degrees >= 67.5 && degrees < 112.5) return '➡️';      // E
    if (degrees >= 112.5 && degrees < 157.5) return '↘️';     // SE
    if (degrees >= 157.5 && degrees < 202.5) return '⬇️';     // S
    if (degrees >= 202.5 && degrees < 247.5) return '↙️';     // SW
    if (degrees >= 247.5 && degrees < 292.5) return '⬅️';     // W
    if (degrees >= 292.5 && degrees < 337.5) return '↖️';     // NW
    return '❓';
  }

  /**
   * MÉTHODES D'INTÉGRATION POUR VOTRE SYSTÈME EXISTANT
   */

  // Formate les données d'un point de prévision Stormglass
  static formatStormglassForecastPoint(stormglassPoint) {
    return this.formatCompleteWeatherData({
      waveHeight: stormglassPoint.waveHeight,
      wavePeriod: stormglassPoint.wavePeriod,
      windSpeed: stormglassPoint.windSpeed,
      windDirection: stormglassPoint.windDirection,
      tideDirection: stormglassPoint.tideDirection,
      tideCoefficient: stormglassPoint.tideCoefficient,
      tideLevel: stormglassPoint.tideLevel,
      waterTemperature: stormglassPoint.waterTemperature,
      time: stormglassPoint.time,
      quality: stormglassPoint.quality
    });
  }

  // Formate les données depuis la cache Supabase
  static formatSupabaseWeatherCache(cacheRow) {
    return this.formatCompleteWeatherData({
      wave_height: cacheRow.wave_height,
      wave_period: cacheRow.wave_period,
      wind_speed: cacheRow.wind_speed,
      wind_direction: cacheRow.wind_direction,
      tide: cacheRow.tide,
      tide_coefficient: cacheRow.tide_coefficient,
      tide_height: cacheRow.tide_height,
      water_temperature: cacheRow.water_temperature,
      timestamp: cacheRow.timestamp,
      confidence: cacheRow.confidence
    });
  }

  /**
   * VALIDATION DES DONNÉES CRITIQUES
   */

  // Vérifie que toutes les données critiques sont présentes
  static validateCriticalData(formattedData) {
    const missing = [];
    const warnings = [];

    // Données absolument critiques
    if (!formattedData.waveHeight) missing.push('Hauteur des vagues');
    if (!formattedData.wavePeriod) missing.push('Période des vagues');
    if (!formattedData.windSpeed) missing.push('Vitesse du vent');
    
    // Données importantes mais non bloquantes
    if (!formattedData.windDirection) warnings.push('Direction du vent');
    if (!formattedData.tideCoefficient) warnings.push('Coefficient de marée');
    if (!formattedData.tideHeight) warnings.push('Hauteur de marée');

    return {
      isValid: missing.length === 0,
      missing: missing,
      warnings: warnings,
      completeness: this.calculateDataCompleteness(formattedData)
    };
  }

  // Calcule le pourcentage de complétude des données
  static calculateDataCompleteness(formattedData) {
    const fields = [
      'waveHeight', 'wavePeriod', 'windSpeed', 'windDirection',
      'tideState', 'tideCoefficient', 'tideHeight', 'waterTemperature'
    ];
    
    const presentFields = fields.filter(field => 
      formattedData[field] !== null && formattedData[field] !== undefined
    );
    
    return Math.round((presentFields.length / fields.length) * 100);
  }

  /**
   * MÉTHODE PRINCIPALE POUR L'API
   * Utilise cette méthode dans vos routes weather.js
   */
  static formatForAPI(rawData, includeMetadata = true) {
    const formatted = this.formatCompleteWeatherData(rawData);
    const validation = this.validateCriticalData(formatted);

    const result = {
      // Données formatées selon le référentiel
      marine: {
        waveHeight: formatted.waveHeight,
        wavePeriod: formatted.wavePeriod,
        windSpeed: formatted.windSpeed,
        windDirection: formatted.windDirection?.formatted || null
      },
      tide: {
        state: formatted.tideState?.formatted || null,
        coefficient: formatted.tideCoefficient?.formatted || null,
        height: formatted.tideHeight
      },
      environment: {
        waterTemperature: formatted.waterTemperature?.formatted || null
      }
    };

    if (includeMetadata) {
      result.metadata = {
        timestamp: formatted.timestamp,
        quality: formatted.quality,
        dataCompleteness: validation.completeness,
        validation: validation,
        formattedBy: 'WeatherDataFormattingService v1.0'
      };
    }

    return result;
  }
}

module.exports = WeatherDataFormattingService;
