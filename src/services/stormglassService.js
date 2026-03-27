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

    // 💾 Cache double : mémoire (rapide) + Supabase (persiste entre redémarrages)
    this.cache = new Map();
    this.CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 heures
    this.supabase = null; // initialisé au premier appel

    console.log('✅ Service Stormglass initialisé');
  }

  // Initialiser le client Supabase pour le cache persistant
  getSupabase() {
    if (!this.supabase) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
        if (url && key) this.supabase = createClient(url, key);
      } catch(e) { /* pas de Supabase = cache mémoire uniquement */ }
    }
    return this.supabase;
  }

  // Lire depuis le cache Supabase
  async getFromSupabaseCache(cacheKey) {
    const sb = this.getSupabase();
    if (!sb) return null;
    try {
      const { data } = await sb
        .from('forecast_cache')
        .select('data, cached_at')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .single();
      if (data) {
        const ageMin = Math.round((Date.now() - new Date(data.cached_at).getTime()) / 60000);
        console.log(`💾 Cache Supabase utilisé (${ageMin}min)`);
        return data.data;
      }
    } catch(e) { /* cache miss */ }
    return null;
  }

  // Écrire dans le cache Supabase
  async writeToSupabaseCache(cacheKey, forecastData) {
    const sb = this.getSupabase();
    if (!sb) return;
    try {
      const now = new Date();
      const expires = new Date(now.getTime() + this.CACHE_DURATION_MS);
      await sb.from('forecast_cache').upsert({
        cache_key: cacheKey,
        data: forecastData,
        cached_at: now.toISOString(),
        expires_at: expires.toISOString(),
      });
    } catch(e) { console.warn('⚠️ Écriture cache Supabase échouée:', e.message); }
  }

  // 🌊 Récupérer prévisions météo marine
  async getForecast(lat, lng, days = 3) {
    try {
      // Vérifier le cache mémoire (rapide)
      const cacheKey = `${lat.toFixed(4)}-${lng.toFixed(4)}-${days}`;
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION_MS) {
        const ageMin = Math.round((Date.now() - cached.timestamp) / 60000);
        console.log(`💾 Cache mémoire utilisé (${ageMin}min)`);
        return cached.data;
      }

      // Vérifier le cache Supabase (persiste entre redémarrages)
      const supabaseCached = await this.getFromSupabaseCache(cacheKey);
      if (supabaseCached) {
        this.cache.set(cacheKey, { data: supabaseCached, timestamp: Date.now() });
        return supabaseCached;
      }

      console.log(`🌊 Appel Stormglass API: ${lat}, ${lng} (${days} jours)`);

      // Calcul des timestamps
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = Math.floor((Date.now() + (days * 24 * 60 * 60 * 1000)) / 1000);

      const params = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        params: 'waveHeight,wavePeriod,waveDirection,windSpeed,windDirection,swellHeight,swellPeriod,swellDirection,waterTemperature,seaLevel',
        start: startTime,
        end: endTime,
        source: 'sg' // Source Stormglass prioritaire
      };

      console.log('📡 Paramètres Stormglass:', params);

      const response = await this.client.get('/weather/point', { params });

      console.log(`✅ Données reçues: ${response.data.hours?.length || 0} points`);

      // Traitement des données Stormglass
      const processedData = this.processStormglassData(response.data);

      const result = {
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

      // Sauvegarder en cache mémoire + Supabase
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      this.writeToSupabaseCache(cacheKey, result); // async, pas d'await (non bloquant)
      console.log(`💾 Résultat mis en cache mémoire + Supabase (clé: ${cacheKey})`);

      return result;

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

    const processedPoints = rawData.hours.map((hour, index) => {
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
        const waterTemp = getFirstValue('waterTemperature');
        const seaLevel = getFirstValue('seaLevel');

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
          waterTemp: waterTemp ? Math.round(waterTemp * 10) / 10 : null,
          seaLevel: seaLevel != null ? Math.round(seaLevel * 100) / 100 : null,
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

    if (processedPoints.length === 0 && rawData.hours.length > 0) {
      console.warn('⚠️ Tous les points de données ont été filtrés ou sont invalides');
    }

    // Enrichir avec les phases de marée si seaLevel disponible
    return this.computeTidePhases(processedPoints);
  }

  // 🌊 Calculer les phases de marée depuis seaLevel
  computeTidePhases(points) {
    if (!points.some(p => p.seaLevel != null)) return points;
    return points.map((p, i) => {
      if (p.seaLevel == null) return { ...p, tidePhase: 'unknown', tideHeight: null };
      const prev = points[i - 1];
      const next = points[i + 1];
      let tidePhase = 'unknown';
      if (prev?.seaLevel != null && next?.seaLevel != null) {
        const rising = p.seaLevel > prev.seaLevel;
        const wasRising = prev.seaLevel > (points[i - 2]?.seaLevel ?? prev.seaLevel);
        if (rising && !wasRising && Math.abs(p.seaLevel - prev.seaLevel) > 0.02) tidePhase = 'low';
        else if (!rising && wasRising && Math.abs(p.seaLevel - prev.seaLevel) > 0.02) tidePhase = 'high';
        else tidePhase = rising ? 'rising' : 'falling';
      } else {
        tidePhase = (next?.seaLevel != null && next.seaLevel > p.seaLevel) ? 'rising' : 'falling';
      }
      return { ...p, tidePhase, tideHeight: p.seaLevel };
    });
  }

  // ⏭️ Prochain high ou low tide après un timestamp donné
  getNextTide(forecast, fromTimestampSec) {
    const upcoming = forecast.filter(
      p => p.timestamp > fromTimestampSec && (p.tidePhase === 'high' || p.tidePhase === 'low')
    );
    if (!upcoming.length) return null;
    const next = upcoming[0];
    return {
      phase: next.tidePhase,
      time: next.time,
      height: next.tideHeight,
      label: (next.tidePhase === 'high' ? '⬆' : '⬇') + ' ' + new Date(next.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };
  }

  // 🧭 Déterminer si le vent est offshore (favorable)
  isOffshore(windDir, waveDir) {
    if ((!windDir && windDir !== 0) || (!waveDir && waveDir !== 0)) return false;

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

  // 🌊 Récupère les prochaines marées hautes/basses via l'endpoint dédié Stormglass
  async getTideExtremes(lat, lng, days = 2) {
    const cacheKey = `tide-${parseFloat(lat).toFixed(4)}-${parseFloat(lng).toFixed(4)}-${days}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 6 * 3600 * 1000) {
      return cached.data;
    }
    try {
      const now = Math.floor(Date.now() / 1000);
      const end = now + 86400 * days;
      const response = await this.client.get('/tide/extremes/point', {
        params: { lat: parseFloat(lat), lng: parseFloat(lng), start: now, end }
      });
      const extremes = (response.data.data || []).map(e => ({
        time:   e.time,
        timestamp: Math.floor(new Date(e.time).getTime() / 1000),
        type:   e.type,         // 'high' | 'low'
        height: Math.round(e.height * 100) / 100,
        label:  (e.type === 'high' ? '⬆' : '⬇') + ' ' + new Date(e.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
      }));
      this.cache.set(cacheKey, { data: extremes, timestamp: Date.now() });
      return extremes;
    } catch (e) {
      console.warn('⚠️ Stormglass tide extremes indisponible:', e.message);
      return [];
    }
  }

  // ⏭️ Prochain high ou low à partir d'un timestamp
  getNextTideFromExtremes(extremes, fromTimestampSec) {
    const next = extremes.find(e => e.timestamp > fromTimestampSec);
    return next || null;
  }
}

// Export instance singleton
module.exports = new StormglassService();