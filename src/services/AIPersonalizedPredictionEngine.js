/**
 * SurfAI - Moteur IA Personnalisé Réel
 * Analyse statistique des sessions utilisateur pour prédictions personnalisées
 * Version Production avec algorithmes réels
 */

class AIPersonalizedPredictionEngine {
    constructor() {
        this.userProfiles = new Map(); // Cache des profils analysés
        this.userSessions = new Map(); // Sessions par utilisateur
        this.spotDatabase = this.initializeSpotDatabase();
        
        // Poids pour l'algorithme de scoring personnalisé
        this.scoringWeights = {
            waveHeight: 0.25,
            waveDirection: 0.20,
            windSpeed: 0.20,
            windDirection: 0.15,
            wavePeriod: 0.10,
            tideHeight: 0.10
        };
        
        // Seuils de qualité
        this.qualityThresholds = {
            excellent: 8.0,
            good: 6.0,
            average: 4.0
        };
    }

    initializeSpotDatabase() {
        return {
            'biarritz': {
                name: 'Biarritz',
                lat: 43.4832,
                lng: -1.5586,
                optimalWindDirections: ['NE', 'E', 'SE'],
                optimalWaveDirections: ['NW', 'W', 'SW'],
                seasonality: {
                    summer: { avgWaveHeight: 1.2, consistency: 0.6 },
                    winter: { avgWaveHeight: 2.1, consistency: 0.8 }
                }
            },
            'hossegor': {
                name: 'Hossegor',
                lat: 43.6615,
                lng: -1.4057,
                optimalWindDirections: ['NE', 'E', 'SE'],
                optimalWaveDirections: ['NW', 'W', 'SW'],
                seasonality: {
                    summer: { avgWaveHeight: 1.5, consistency: 0.7 },
                    winter: { avgWaveHeight: 2.5, consistency: 0.9 }
                }
            },
            'anglet': {
                name: 'Anglet',
                lat: 43.4949,
                lng: -1.5031,
                optimalWindDirections: ['NE', 'E', 'SE'],
                optimalWaveDirections: ['NW', 'W', 'SW'],
                seasonality: {
                    summer: { avgWaveHeight: 1.1, consistency: 0.5 },
                    winter: { avgWaveHeight: 1.9, consistency: 0.7 }
                }
            }
        };
    }

    /**
     * Analyse les sessions d'un utilisateur pour extraire ses préférences
     * @param {string} userId - ID utilisateur
     * @param {Array} sessions - Sessions de surf de l'utilisateur
     * @returns {Object} - Profil de préférences personnalisées
     */
    analyzeSurferPreferences(userId, sessions) {
        if (!sessions || sessions.length < 3) {
            throw new Error('Minimum 3 sessions requises pour analyse personnalisée');
        }

        // Filtrer les sessions de qualité (rating >= 6)
        const goodSessions = sessions.filter(s => s.rating >= this.qualityThresholds.good);
        const excellentSessions = sessions.filter(s => s.rating >= this.qualityThresholds.excellent);

        if (goodSessions.length === 0) {
            throw new Error('Aucune session de qualité suffisante pour analyse');
        }

        const preferences = {
            userId,
            totalSessions: sessions.length,
            goodSessions: goodSessions.length,
            excellentSessions: excellentSessions.length,
            
            // Analyse des préférences de vagues
            wavePreferences: this.analyzeWavePreferences(excellentSessions, goodSessions),
            
            // Analyse des préférences de vent
            windPreferences: this.analyzeWindPreferences(excellentSessions, goodSessions),
            
            // Analyse des spots favoris
            spotPreferences: this.analyzeSpotPreferences(excellentSessions, goodSessions),
            
            // Analyse temporelle (heures, saisons)
            timePreferences: this.analyzeTimePreferences(excellentSessions, goodSessions),
            
            // Analyse des conditions idéales
            idealConditions: this.calculateIdealConditions(excellentSessions),
            
            // Insights comportementaux
            behavioralInsights: this.generateBehavioralInsights(sessions, excellentSessions),
            
            // Dernière mise à jour
            lastUpdated: new Date().toISOString(),
            
            // Score de fiabilité de l'analyse
            reliabilityScore: this.calculateReliabilityScore(sessions)
        };

        // Mise en cache du profil
        this.userProfiles.set(userId, preferences);
        
        return preferences;
    }

    /**
     * Analyse les préférences de vagues
     */
    analyzeWavePreferences(excellentSessions, goodSessions) {
        const allGoodSessions = [...excellentSessions, ...goodSessions];
        
        // Hauteur de vagues optimale
        const waveHeights = allGoodSessions.map(s => s.conditions.waveHeight).filter(h => h > 0);
        const optimalWaveHeight = this.calculateWeightedAverage(waveHeights, excellentSessions.map(s => s.conditions.waveHeight));
        
        // Direction des vagues préférée
        const waveDirections = allGoodSessions.map(s => s.conditions.waveDirection).filter(d => d);
        const preferredWaveDirection = this.getMostFrequent(waveDirections);
        
        // Période des vagues
        const wavePeriods = allGoodSessions.map(s => s.conditions.wavePeriod).filter(p => p > 0);
        const optimalWavePeriod = this.calculateWeightedAverage(wavePeriods, excellentSessions.map(s => s.conditions.wavePeriod));
        
        return {
            optimalHeight: {
                value: Math.round(optimalWaveHeight * 10) / 10,
                range: {
                    min: Math.round((Math.min(...waveHeights)) * 10) / 10,
                    max: Math.round((Math.max(...waveHeights)) * 10) / 10
                },
                confidence: this.calculateConfidence(waveHeights)
            },
            preferredDirection: preferredWaveDirection,
            optimalPeriod: {
                value: Math.round(optimalWavePeriod),
                confidence: this.calculateConfidence(wavePeriods)
            }
        };
    }

    /**
     * Analyse les préférences de vent
     */
    analyzeWindPreferences(excellentSessions, goodSessions) {
        const allGoodSessions = [...excellentSessions, ...goodSessions];
        
        // Vitesse de vent optimale
        const windSpeeds = allGoodSessions.map(s => s.conditions.windSpeed).filter(w => w >= 0);
        const optimalWindSpeed = this.calculateWeightedAverage(windSpeeds, excellentSessions.map(s => s.conditions.windSpeed));
        
        // Direction du vent préférée
        const windDirections = allGoodSessions.map(s => s.conditions.windDirection).filter(d => d);
        const preferredWindDirection = this.getMostFrequent(windDirections);
        
        // Tolérance au vent
        const windTolerance = this.calculateWindTolerance(allGoodSessions);
        
        return {
            optimalSpeed: {
                value: Math.round(optimalWindSpeed),
                range: {
                    min: Math.min(...windSpeeds),
                    max: Math.max(...windSpeeds)
                },
                confidence: this.calculateConfidence(windSpeeds)
            },
            preferredDirection: preferredWindDirection,
            tolerance: windTolerance
        };
    }

    /**
     * Analyse des spots favoris
     */
    analyzeSpotPreferences(excellentSessions, goodSessions) {
        const allGoodSessions = [...excellentSessions, ...goodSessions];
        
        // Comptage des sessions par spot
        const spotCounts = {};
        const spotRatings = {};
        
        allGoodSessions.forEach(session => {
            const spot = session.spot.toLowerCase();
            spotCounts[spot] = (spotCounts[spot] || 0) + 1;
            
            if (!spotRatings[spot]) {
                spotRatings[spot] = [];
            }
            spotRatings[spot].push(session.rating);
        });
        
        // Calcul des moyennes par spot
        const spotPreferences = Object.keys(spotCounts).map(spot => ({
            name: spot,
            sessionsCount: spotCounts[spot],
            averageRating: spotRatings[spot].reduce((a, b) => a + b, 0) / spotRatings[spot].length,
            frequency: spotCounts[spot] / allGoodSessions.length
        })).sort((a, b) => b.averageRating - a.averageRating);
        
        return {
            favorite: spotPreferences[0],
            ranking: spotPreferences,
            diversity: spotPreferences.length
        };
    }

    /**
     * Analyse des préférences temporelles
     */
    analyzeTimePreferences(excellentSessions, goodSessions) {
        const allGoodSessions = [...excellentSessions, ...goodSessions];
        
        // Analyse des heures préférées
        const hours = allGoodSessions.map(s => new Date(s.date).getHours());
        const preferredHour = this.getMostFrequentNumber(hours);
        
        // Analyse des saisons
        const seasons = allGoodSessions.map(s => this.getSeason(new Date(s.date)));
        const preferredSeason = this.getMostFrequent(seasons);
        
        return {
            preferredHour,
            preferredSeason,
            hourDistribution: this.getDistribution(hours),
            seasonDistribution: this.getDistribution(seasons)
        };
    }

    /**
     * Calcule les conditions idéales basées sur les meilleures sessions
     */
    calculateIdealConditions(excellentSessions) {
        if (excellentSessions.length === 0) {
            return null;
        }
        
        const conditions = excellentSessions.map(s => s.conditions);
        
        return {
            waveHeight: this.calculateAverage(conditions.map(c => c.waveHeight)),
            windSpeed: this.calculateAverage(conditions.map(c => c.windSpeed)),
            waveDirection: this.getMostFrequent(conditions.map(c => c.waveDirection)),
            windDirection: this.getMostFrequent(conditions.map(c => c.windDirection)),
            wavePeriod: this.calculateAverage(conditions.map(c => c.wavePeriod)),
            basedOnSessions: excellentSessions.length
        };
    }

    /**
     * Génère des insights comportementaux personnalisés
     */
    generateBehavioralInsights(allSessions, excellentSessions) {
        const insights = [];
        
        // Insight sur la hauteur des vagues
        if (excellentSessions.length > 0) {
            const avgExcellentWaveHeight = this.calculateAverage(excellentSessions.map(s => s.conditions.waveHeight));
            insights.push(`Vous excellez avec des vagues de ${avgExcellentWaveHeight.toFixed(1)}m en moyenne`);
        }
        
        // Insight sur la progression
        const recentSessions = allSessions.slice(-5);
        const oldSessions = allSessions.slice(0, Math.min(5, allSessions.length - 5));
        
        if (recentSessions.length > 0 && oldSessions.length > 0) {
            const recentAvg = this.calculateAverage(recentSessions.map(s => s.rating));
            const oldAvg = this.calculateAverage(oldSessions.map(s => s.rating));
            
            if (recentAvg > oldAvg + 0.5) {
                insights.push(`Votre niveau s'améliore ! +${(recentAvg - oldAvg).toFixed(1)} points récemment`);
            }
        }
        
        // Insight sur la constance
        const ratings = allSessions.map(s => s.rating);
        const consistency = 1 - (this.calculateStandardDeviation(ratings) / this.calculateAverage(ratings));
        
        if (consistency > 0.8) {
            insights.push('Vous êtes très constant dans vos performances');
        } else if (consistency < 0.5) {
            insights.push('Vos performances varient selon les conditions');
        }
        
        return insights;
    }

    /**
     * Prédit la qualité d'une session future basée sur les conditions météo
     * @param {string} userId - ID utilisateur
     * @param {Object} futureConditions - Conditions météo prédites
     * @param {string} spotName - Nom du spot
     * @returns {Object} - Prédiction avec score personnalisé
     */
    predictSessionQuality(userId, futureConditions, spotName) {
        const userProfile = this.userProfiles.get(userId);
        
        if (!userProfile) {
            throw new Error('Profil utilisateur non trouvé. Analysez d\'abord les sessions.');
        }
        
        const spot = this.spotDatabase[spotName.toLowerCase()];
        if (!spot) {
            throw new Error(`Spot ${spotName} non reconnu`);
        }
        
        // Calcul du score personnalisé basé sur les préférences utilisateur
        const personalizedScore = this.calculatePersonalizedScore(userProfile, futureConditions, spot);
        
        // Génération des recommandations
        const recommendations = this.generateRecommendations(userProfile, futureConditions, personalizedScore);
        
        // Calcul de la confiance de la prédiction
        const confidence = this.calculatePredictionConfidence(userProfile, futureConditions);
        
        return {
            userId,
            spot: spotName,
            predictedScore: Math.round(personalizedScore * 10) / 10,
            confidence: Math.round(confidence * 100),
            conditions: futureConditions,
            recommendations,
            reasoning: this.explainPrediction(userProfile, futureConditions, personalizedScore),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Calcule le score personnalisé basé sur les préférences de l'utilisateur
     */
    calculatePersonalizedScore(userProfile, conditions, spot) {
        let totalScore = 0;
        const weights = this.scoringWeights;
        
        // Score hauteur des vagues
        const waveHeightScore = this.calculateWaveHeightScore(
            conditions.waveHeight,
            userProfile.wavePreferences.optimalHeight.value,
            userProfile.wavePreferences.optimalHeight.range
        );
        totalScore += waveHeightScore * weights.waveHeight;
        
        // Score direction des vagues
        const waveDirectionScore = this.calculateDirectionScore(
            conditions.waveDirection,
            userProfile.wavePreferences.preferredDirection,
            spot.optimalWaveDirections
        );
        totalScore += waveDirectionScore * weights.waveDirection;
        
        // Score vitesse du vent
        const windSpeedScore = this.calculateWindSpeedScore(
            conditions.windSpeed,
            userProfile.windPreferences.optimalSpeed.value,
            userProfile.windPreferences.tolerance
        );
        totalScore += windSpeedScore * weights.windSpeed;
        
        // Score direction du vent
        const windDirectionScore = this.calculateDirectionScore(
            conditions.windDirection,
            userProfile.windPreferences.preferredDirection,
            spot.optimalWindDirections
        );
        totalScore += windDirectionScore * weights.windDirection;
        
        // Score période des vagues
        const wavePeriodScore = this.calculateWavePeriodScore(
            conditions.wavePeriod,
            userProfile.wavePreferences.optimalPeriod.value
        );
        totalScore += wavePeriodScore * weights.wavePeriod;
        
        // Normalisation sur une échelle de 0 à 10
        return Math.max(0, Math.min(10, totalScore * 10));
    }

    /**
     * Méthodes utilitaires pour les calculs statistiques
     */
    calculateAverage(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        const validNumbers = numbers.filter(n => typeof n === 'number' && !isNaN(n));
        return validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length;
    }

    calculateWeightedAverage(numbers, weights) {
        if (!numbers || numbers.length === 0) return 0;
        const validNumbers = numbers.filter(n => typeof n === 'number' && !isNaN(n));
        const validWeights = weights ? weights.filter(n => typeof n === 'number' && !isNaN(n)).slice(0, validNumbers.length) : validNumbers.map(() => 1);
        
        if (validWeights.length === 0) return this.calculateAverage(validNumbers);
        
        const weightedSum = validNumbers.reduce((sum, num, i) => sum + (num * (validWeights[i] || 1)), 0);
        const totalWeight = validWeights.reduce((sum, weight) => sum + weight, 0);
        
        return weightedSum / totalWeight;
    }

    calculateStandardDeviation(numbers) {
        const avg = this.calculateAverage(numbers);
        const squaredDiffs = numbers.map(n => Math.pow(n - avg, 2));
        return Math.sqrt(this.calculateAverage(squaredDiffs));
    }

    getMostFrequent(array) {
        if (!array || array.length === 0) return null;
        
        const frequency = {};
        array.forEach(item => {
            frequency[item] = (frequency[item] || 0) + 1;
        });
        
        return Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
    }

    getMostFrequentNumber(numbers) {
        const frequency = {};
        numbers.forEach(num => {
            frequency[num] = (frequency[num] || 0) + 1;
        });
        
        return parseInt(Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b));
    }

    calculateConfidence(values) {
        if (values.length < 2) return 0.5;
        const cv = this.calculateStandardDeviation(values) / this.calculateAverage(values);
        return Math.max(0.1, Math.min(1.0, 1 - cv));
    }

    calculateReliabilityScore(sessions) {
        const factors = [
            sessions.length / 20, // Plus de sessions = plus fiable
            sessions.filter(s => s.rating >= 6).length / sessions.length, // Pourcentage de bonnes sessions
            new Set(sessions.map(s => s.spot)).size / 10, // Diversité des spots
            1 - (Date.now() - new Date(sessions[sessions.length - 1].date)) / (365 * 24 * 60 * 60 * 1000) // Récence
        ];
        
        return Math.max(0.1, Math.min(1.0, factors.reduce((a, b) => a + b, 0) / factors.length));
    }

    // Scores spécialisés pour chaque condition
    calculateWaveHeightScore(actual, optimal, range) {
        const distance = Math.abs(actual - optimal);
        const tolerance = (range.max - range.min) / 2;
        return Math.max(0, 1 - (distance / tolerance));
    }

    calculateWindSpeedScore(actual, optimal, tolerance) {
        const distance = Math.abs(actual - optimal);
        return Math.max(0, 1 - (distance / (tolerance * optimal)));
    }

    calculateDirectionScore(actual, preferred, optimalDirections) {
        if (actual === preferred) return 1.0;
        if (optimalDirections && optimalDirections.includes(actual)) return 0.8;
        return 0.4;
    }

    calculateWavePeriodScore(actual, optimal) {
        const distance = Math.abs(actual - optimal);
        return Math.max(0, 1 - (distance / optimal));
    }

    // Méthodes auxiliaires
    getSeason(date) {
        const month = date.getMonth();
        if (month >= 2 && month <= 4) return 'spring';
        if (month >= 5 && month <= 7) return 'summer';
        if (month >= 8 && month <= 10) return 'autumn';
        return 'winter';
    }

    getDistribution(array) {
        const freq = {};
        array.forEach(item => freq[item] = (freq[item] || 0) + 1);
        return freq;
    }

    calculateWindTolerance(sessions) {
        const windSpeeds = sessions.map(s => s.conditions.windSpeed);
        const std = this.calculateStandardDeviation(windSpeeds);
        return Math.min(0.5, std / this.calculateAverage(windSpeeds));
    }

    calculatePredictionConfidence(userProfile, conditions) {
        return userProfile.reliabilityScore * 0.8 + 
               (userProfile.totalSessions / 50) * 0.2;
    }

    generateRecommendations(userProfile, conditions, score) {
        const recommendations = [];
        
        if (score >= 8) {
            recommendations.push("Conditions exceptionnelles pour vous !");
        } else if (score >= 6) {
            recommendations.push("Bonnes conditions, allez-y !");
        } else if (score >= 4) {
            recommendations.push("Conditions moyennes, parfait pour s'entraîner");
        } else {
            recommendations.push("Conditions difficiles, restez prudent");
        }
        
        // Recommandations spécifiques basées sur les écarts
        const waveHeightDiff = Math.abs(conditions.waveHeight - userProfile.wavePreferences.optimalHeight.value);
        if (waveHeightDiff > 0.5) {
            if (conditions.waveHeight > userProfile.wavePreferences.optimalHeight.value) {
                recommendations.push("Vagues plus grosses que votre préférence habituelle");
            } else {
                recommendations.push("Vagues plus petites que votre préférence habituelle");
            }
        }
        
        return recommendations;
    }

    explainPrediction(userProfile, conditions, score) {
        return `Score basé sur vos ${userProfile.totalSessions} sessions analysées. ` +
               `Vous préférez généralement des vagues de ${userProfile.wavePreferences.optimalHeight.value}m ` +
               `avec un vent de ${userProfile.windPreferences.optimalSpeed.value}km/h. ` +
               `Les conditions prédites (vagues: ${conditions.waveHeight}m, vent: ${conditions.windSpeed}km/h) ` +
               `correspondent à ${Math.round((score/10)*100)}% à vos préférences.`;
    }

    /**
     * API publique - Endpoint principal pour l'analyse complète
     */
    async analyzeUserAndPredict(userId, sessions, futureConditions, spotName) {
        try {
            // 1. Analyser les préférences utilisateur
            const preferences = this.analyzeSurferPreferences(userId, sessions);
            
            // 2. Prédire la qualité de la session future
            const prediction = this.predictSessionQuality(userId, futureConditions, spotName);
            
            // 3. Retourner l'analyse complète
            return {
                success: true,
                analysis: {
                    userPreferences: preferences,
                    prediction: prediction,
                    summary: {
                        sessionsAnalyzed: sessions.length,
                        reliabilityScore: preferences.reliabilityScore,
                        predictedScore: prediction.predictedScore,
                        confidence: prediction.confidence
                    }
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = AIPersonalizedPredictionEngine;

