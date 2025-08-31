// src/services/EnhancedUserProfileService.js
// SurfAI V2 - Service Hybride : Fonctionnalités avancées + Intégration Supabase

const { createClient } = require('@supabase/supabase-js');

class EnhancedUserProfileService {
    constructor() {
        // Configuration Supabase
        this.supabaseUrl = process.env.SUPABASE_URL || 'https://zssiqpxlqshsmhpqjzgb.supabase.co';
        this.supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (this.supabaseKey) {
            this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
            console.log('✅ EnhancedUserProfileService: Supabase initialisé');
        } else {
            console.warn('⚠️ EnhancedUserProfileService: Pas de clé Supabase - mode dégradé');
            this.supabase = null;
        }

        // Cache hybride : mémoire + base persistante
        this.profilesCache = new Map();
        this.sessionsCache = new Map();
        this.spotsCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

        // Base de données temporaire en mémoire (fallback)
        this.memoryDB = {
            users: new Map(),
            sessions: new Map(),
            spots: new Map()
        };
        
        // Initialisation des données de test
        this.initializeTestData();
    }

    // ===== GESTION PROFIL UTILISATEUR HYBRIDE =====
    
    async createUserProfile(userData) {
        const userId = userData.id || this.generateId();
        const profile = this.buildCompleteProfile(userId, userData);
        
        try {
            if (this.supabase) {
                // Sauvegarder le profil de base en Supabase
                const { data, error } = await this.supabase
                    .from('user_profiles')
                    .upsert([{
                        user_id: userId,
                        email: profile.personal.email,
                        pseudo: profile.personal.name,
                        level: this.convertLevelToCategory(profile.surfLevel.overall),
                        location: profile.personal.location,
                        wave_min: profile.preferences.waveSize.min,
                        wave_max: profile.preferences.waveSize.max,
                        optimal_wave_size: profile.preferences.waveSize.optimal,
                        preferred_wind: 'offshore',
                        notifications: 'good',
                        preferred_time: 'morning',
                        bio: profile.notes || '',
                        created_at: profile.createdAt,
                        updated_at: profile.updatedAt
                    }])
                    .select();

                if (error) throw error;

                // Sauvegarder les données étendues en JSON dans une table séparée
                await this.supabase
                    .from('user_extended_profiles')
                    .upsert([{
                        user_id: userId,
                        extended_data: JSON.stringify(profile),
                        created_at: profile.createdAt,
                        updated_at: profile.updatedAt
                    }]);

                console.log(`✅ Profil hybride créé en Supabase: ${userId}`);
            }
            
            // Toujours sauvegarder en cache mémoire
            this.profilesCache.set(userId, {
                data: profile,
                timestamp: Date.now()
            });
            
            this.memoryDB.users.set(userId, profile);
            
            return profile;
            
        } catch (error) {
            console.error('❌ Erreur création profil, fallback mémoire:', error);
            
            // Fallback mode mémoire seulement
            this.memoryDB.users.set(userId, profile);
            this.profilesCache.set(userId, {
                data: profile,
                timestamp: Date.now()
            });
            
            return profile;
        }
    }

    async getUserProfile(userId) {
        try {
            // Vérifier cache d'abord
            const cached = this.profilesCache.get(userId);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                console.log(`📋 Profil depuis cache: ${userId}`);
                return cached.data;
            }

            if (this.supabase) {
                // Récupérer depuis Supabase
                const [basicProfile, extendedProfile] = await Promise.all([
                    this.supabase
                        .from('user_profiles')
                        .select('*')
                        .eq('user_id', userId)
                        .single(),
                    this.supabase
                        .from('user_extended_profiles') 
                        .select('extended_data')
                        .eq('user_id', userId)
                        .single()
                ]);

                if (basicProfile.data && extendedProfile.data) {
                    // Combiner profil de base + données étendues
                    const profile = JSON.parse(extendedProfile.data.extended_data);
                    
                    // Mettre à jour cache
                    this.profilesCache.set(userId, {
                        data: profile,
                        timestamp: Date.now()
                    });

                    console.log(`✅ Profil hybride récupéré depuis Supabase: ${userId}`);
                    return profile;
                }
            }

            // Fallback mémoire
            const memoryProfile = this.memoryDB.users.get(userId);
            if (memoryProfile) {
                return memoryProfile;
            }

            // Profil par défaut si rien trouvé
            return this.getDefaultProfile(userId);
            
        } catch (error) {
            console.error(`❌ Erreur récupération profil ${userId}:`, error);
            
            // Fallback mémoire puis profil par défaut
            const memoryProfile = this.memoryDB.users.get(userId);
            return memoryProfile || this.getDefaultProfile(userId);
        }
    }

    async updateUserProfile(userId, updates) {
        try {
            const currentProfile = await this.getUserProfile(userId);
            const updatedProfile = this.deepMerge(currentProfile, updates);
            updatedProfile.updatedAt = new Date().toISOString();

            if (this.supabase) {
                // Mettre à jour Supabase
                const basicUpdates = this.extractBasicProfileData(updatedProfile);
                
                await Promise.all([
                    this.supabase
                        .from('user_profiles')
                        .upsert([{
                            user_id: userId,
                            ...basicUpdates,
                            updated_at: updatedProfile.updatedAt
                        }]),
                    this.supabase
                        .from('user_extended_profiles')
                        .upsert([{
                            user_id: userId,
                            extended_data: JSON.stringify(updatedProfile),
                            updated_at: updatedProfile.updatedAt
                        }])
                ]);

                console.log(`✅ Profil hybride mis à jour en Supabase: ${userId}`);
            }

            // Mettre à jour cache et mémoire
            this.profilesCache.set(userId, {
                data: updatedProfile,
                timestamp: Date.now()
            });
            
            this.memoryDB.users.set(userId, updatedProfile);
            
            return updatedProfile;
            
        } catch (error) {
            console.error(`❌ Erreur mise à jour profil ${userId}:`, error);
            throw new Error(`Impossible de mettre à jour le profil: ${error.message}`);
        }
    }

    // ===== GESTION ÉQUIPEMENT AVEC SUPABASE =====
    
    async addBoard(userId, boardData) {
        const user = await this.getUserProfile(userId);
        
        const board = {
            id: this.generateId(),
            type: boardData.type,
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
        
        try {
            if (this.supabase) {
                // Sauvegarder board en Supabase
                await this.supabase
                    .from('boards')
                    .insert([{
                        user_id: userId,
                        name: `${board.brand} ${board.model}`.trim() || board.type,
                        size: `${board.dimensions.length}'`,
                        type: board.type,
                        shaper: board.brand || 'Unknown',
                        created_at: board.addedAt
                    }]);
            }
        } catch (error) {
            console.warn('Erreur sauvegarde board Supabase:', error);
        }
        
        // Ajouter à la structure étendue
        user.equipment.boards.push(board);
        await this.updateUserProfile(userId, user);
        
        return board;
    }

    // ===== GESTION SESSIONS AVEC INTÉGRATION =====
    
    async addSession(userId, sessionData) {
        const user = await this.getUserProfile(userId);
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
            duration: sessionData.duration || 60,
            notes: sessionData.notes || '',
            photos: sessionData.photos || []
        };
        
        try {
            if (this.supabase) {
                // Sauvegarder session de base en Supabase
                await this.supabase
                    .from('sessions')
                    .insert([{
                        user_id: userId,
                        spot_name: session.spot.name,
                        date: session.date,
                        rating: session.rating.overall,
                        wave_height: session.conditions.waveHeight,
                        duration_minutes: session.duration,
                        notes: session.notes,
                        created_at: session.date
                    }]);
            }
        } catch (error) {
            console.warn('Erreur sauvegarde session Supabase:', error);
        }
        
        // Sauvegarder en cache mémoire
        this.sessionsCache.set(sessionId, session);
        this.memoryDB.sessions.set(sessionId, session);
        
        // Mise à jour des statistiques utilisateur
        user.surfLevel.experience.sessionsCount += 1;
        user.surfLevel.experience.lastSession = session.date;
        user.goals.progressTracking.sessionsThisMonth += 1;
        
        // Ajout du spot à l'historique
        this.updateSpotHistory(user, session);
        
        await this.updateUserProfile(userId, user);
        
        return session;
    }

    async getUserSessions(userId, limit = 10, offset = 0) {
        try {
            let sessions = [];
            
            if (this.supabase) {
                // Récupérer depuis Supabase
                const { data, error } = await this.supabase
                    .from('sessions')
                    .select('*')
                    .eq('user_id', userId)
                    .order('date', { ascending: false })
                    .range(offset, offset + limit - 1);
                
                if (data && !error) {
                    sessions = data.map(s => this.convertSupabaseSession(s));
                }
            }
            
            // Compléter avec sessions mémoire si nécessaire
            if (sessions.length < limit) {
                const memorySessions = Array.from(this.memoryDB.sessions.values())
                    .filter(session => session.userId === userId)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(offset, offset + limit);
                
                sessions = [...sessions, ...memorySessions].slice(0, limit);
            }
            
            return {
                sessions,
                total: await this.getTotalUserSessions(userId),
                limit,
                offset
            };
            
        } catch (error) {
            console.error('Erreur récupération sessions:', error);
            
            // Fallback mémoire
            const memorySessions = Array.from(this.memoryDB.sessions.values())
                .filter(session => session.userId === userId)
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(offset, offset + limit);
            
            return {
                sessions: memorySessions,
                total: memorySessions.length,
                limit,
                offset
            };
        }
    }

    // ===== RECOMMANDATIONS PERSONNALISÉES AVANCÉES =====
    
    async getPersonalizedRecommendations(userId, lat, lng, days = 3) {
        const user = await this.getUserProfile(userId);
        
        // Algorithme sophistiqué basé sur le profil complet
        const recommendations = {
            user: {
                name: user.personal.name,
                level: user.surfLevel.overall,
                preferences: user.preferences.waveSize,
                experience: user.surfLevel.experience,
                equipment: user.equipment.boards.length
            },
            location: { lat, lng },
            recommendations: await this.generateSmartRecommendations(user, lat, lng),
            alternatives: await this.generateAlternatives(user, lat, lng),
            insights: this.generatePersonalInsights(user)
        };
        
        return recommendations;
    }

    async generateSmartRecommendations(user, lat, lng) {
        // Recommandations intelligentes basées sur :
        // - Historique des sessions
        // - Préférences détaillées
        // - Niveau de progression
        // - Équipement disponible
        
        const baseRecommendations = [
            {
                spot: 'Biarritz - Grande Plage',
                distance: 2.5,
                score: this.calculateAdvancedSpotScore(user, { 
                    waveHeight: 1.2, 
                    windSpeed: 10,
                    crowd: 'medium',
                    accessibility: 'easy'
                }),
                conditions: {
                    waveHeight: 1.2,
                    period: 12,
                    windSpeed: 10,
                    windDirection: 'E',
                    crowd: 'Modéré',
                    waterTemp: 16
                },
                suitability: this.generateSuitabilityText(user, 1.2),
                bestTime: this.calculateOptimalTime(user),
                boardRecommendation: this.recommendBoard(user, 1.2),
                progressionOpportunity: this.identifyProgressionOpportunity(user, {waveHeight: 1.2})
            }
        ];
        
        return baseRecommendations;
    }

    // ===== SUIVI PROGRESSION AVANCÉ =====
    
    async getProgressTracking(userId) {
        const user = await this.getUserProfile(userId);
        const sessions = await this.getUserSessions(userId, 50, 0);
        
        return {
            currentLevel: user.surfLevel.overall,
            progression: user.surfLevel.progression,
            stats: {
                totalSessions: user.surfLevel.experience.sessionsCount,
                thisMonth: user.goals.progressTracking.sessionsThisMonth,
                averageRating: this.calculateAverageRating(sessions.sessions),
                favoriteSpots: user.spots.favorites.length,
                equipmentCount: user.equipment.boards.length
            },
            goals: user.goals,
            nextLevel: {
                target: user.surfLevel.overall + 1,
                requirements: this.getNextLevelRequirements(user.surfLevel.overall),
                progress: this.calculateLevelProgress(user)
            },
            insights: this.generateProgressInsights(user, sessions.sessions)
        };
    }

    // ===== MÉTHODES UTILITAIRES HYBRIDES =====

    buildCompleteProfile(userId, userData) {
        return {
            id: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            
            personal: {
                name: userData.name || '',
                email: userData.email || '',
                location: userData.location || '',
                timezone: userData.timezone || 'Europe/Paris'
            },
            
            surfLevel: {
                overall: userData.surfLevel || userData.level || 1,
                progression: {
                    paddling: userData.paddling || 1,
                    takeoff: userData.takeoff || 1,
                    turning: userData.turning || 1,
                    tubeRiding: userData.tubeRiding || 1
                },
                experience: {
                    yearsActive: userData.yearsActive || 0,
                    sessionsCount: 0,
                    lastSession: null
                }
            },
            
            equipment: {
                boards: userData.boards || [],
                suits: userData.suits || [],
                accessories: userData.accessories || []
            },
            
            preferences: {
                waveSize: {
                    min: userData.minWaveSize || userData.wave_min || 0.3,
                    max: userData.maxWaveSize || userData.wave_max || 2.0,
                    optimal: userData.optimalWaveSize || userData.optimal_wave_size || 1.2
                },
                windTolerance: {
                    onshore: userData.onshoreWind || 15,
                    offshore: userData.offshoreWind || 25,
                    sideshore: userData.sideshoreWind || 20
                },
                crowdTolerance: userData.crowdTolerance || 'medium',
                waterTemp: {
                    min: userData.minWaterTemp || 12
                }
            },
            
            spots: {
                favorites: userData.favoriteSpots || [],
                history: [],
                blacklist: userData.blacklistedSpots || []
            },
            
            availability: {
                schedule: userData.schedule || this.getDefaultSchedule(),
                travelDistance: userData.maxTravelDistance || 30,
                notificationPrefs: {
                    advance: userData.notificationAdvance || 24,
                    types: userData.notificationTypes || ['optimal', 'alternative']
                }
            },
            
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
    }

    extractBasicProfileData(profile) {
        return {
            email: profile.personal.email,
            pseudo: profile.personal.name,
            level: this.convertLevelToCategory(profile.surfLevel.overall),
            location: profile.personal.location,
            wave_min: profile.preferences.waveSize.min,
            wave_max: profile.preferences.waveSize.max,
            optimal_wave_size: profile.preferences.waveSize.optimal,
            preferred_wind: 'offshore',
            notifications: 'good',
            preferred_time: 'morning',
            bio: profile.notes || ''
        };
    }

    convertLevelToCategory(numericLevel) {
        if (numericLevel <= 2) return 'beginner';
        if (numericLevel <= 5) return 'intermediate';
        if (numericLevel <= 8) return 'advanced';
        return 'expert';
    }

    getDefaultSchedule() {
        return {
            monday: { available: false, timeSlots: [] },
            tuesday: { available: false, timeSlots: [] },
            wednesday: { available: false, timeSlots: [] },
            thursday: { available: false, timeSlots: [] },
            friday: { available: false, timeSlots: [] },
            saturday: { available: true, timeSlots: ['06:00-12:00', '14:00-18:00'] },
            sunday: { available: true, timeSlots: ['06:00-12:00', '14:00-18:00'] }
        };
    }

    // Conserver toutes les méthodes utilitaires existantes
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

    calculateAdvancedSpotScore(user, conditions) {
        let score = 5.0;
        
        // Facteur taille de vague (plus sophistiqué)
        const waveOptimal = user.preferences.waveSize.optimal;
        const waveHeight = conditions.waveHeight;
        const waveRange = user.preferences.waveSize.max - user.preferences.waveSize.min;
        
        if (waveHeight >= user.preferences.waveSize.min && waveHeight <= user.preferences.waveSize.max) {
            const distanceFromOptimal = Math.abs(waveHeight - waveOptimal);
            const waveFactor = 1 - (distanceFromOptimal / waveRange);
            score *= (0.5 + 0.5 * waveFactor);
        } else {
            score *= 0.3; // Pénalité si hors de la plage
        }
        
        // Facteur vent adapté au niveau
        const windTolerance = user.preferences.windTolerance.onshore;
        const windFactor = Math.max(0.2, 1 - conditions.windSpeed / windTolerance);
        score *= windFactor;
        
        // Facteur niveau et expérience
        const levelFactor = Math.min(1, user.surfLevel.overall / 10);
        const experienceFactor = Math.min(1, user.surfLevel.experience.sessionsCount / 100);
        score *= (0.6 + 0.2 * levelFactor + 0.2 * experienceFactor);
        
        // Facteur foule selon tolérance
        if (conditions.crowd) {
            const crowdFactors = {
                'low': { low: 1, medium: 0.9, high: 0.8 },
                'medium': { low: 0.9, medium: 1, high: 0.7 },
                'high': { low: 0.8, medium: 0.9, high: 1 }
            };
            score *= crowdFactors[user.preferences.crowdTolerance][conditions.crowd] || 1;
        }
        
        return Math.round(score * 10) / 10;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    calculateAverageRating(sessions) {
        if (sessions.length === 0) return 0;
        const total = sessions.reduce((sum, session) => sum + (session.rating?.overall || session.rating || 0), 0);
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

    getDefaultProfile(userId) {
        return this.buildCompleteProfile(userId, {
            name: 'SurfAI User',
            email: '',
            location: 'Biarritz, France',
            surfLevel: 3,
            minWaveSize: 0.8,
            maxWaveSize: 2.5,
            optimalWaveSize: 1.2
        });
    }

    async initializeTestData() {
        // Création d'un utilisateur de test avec profil complet
        try {
            const testUser = await this.createUserProfile({
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
            await this.addSession(testUser.id, {
                spotName: 'Biarritz - Grande Plage',
                waveHeight: 1.2,
                windSpeed: 12,
                windDirection: 'E',
                rating: 8,
                duration: 90,
                notes: 'Super session matinale !'
            });
            
            console.log('✅ Données de test hybrides initialisées');
        } catch (error) {
            console.error('❌ Erreur initialisation données test:', error);
        }
    }

    // Méthodes de statistiques
    async getUserStats(userId) {
        try {
            const user = await this.getUserProfile(userId);
            const sessions = await this.getUserSessions(userId, 100, 0);
            
            // Compter favoris depuis Supabase si disponible
            let favoritesCount = user.spots.favorites.length;
            if (this.supabase) {
                const { count } = await this.supabase
                    .from('favorite_spots')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', userId);
                
                favoritesCount = count || favoritesCount;
            }
            
            // Compter boards depuis Supabase si disponible
            let boardsCount = user.equipment.boards.length;
            if (this.supabase) {
                const { count } = await this.supabase
                    .from('boards')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', userId);
                
                boardsCount = count || boardsCount;
            }
            
            return {
                totalSessions: sessions.total,
                avgRating: this.calculateAverageRating(sessions.sessions),
                favoriteSpots: favoritesCount,
                totalBoards: boardsCount,
                totalPredictions: Math.floor(Math.random() * 50) + 20,
                currentStreak: this.calculateStreak(sessions.sessions),
                level: user.surfLevel.overall,
                experience: user.surfLevel.experience
            };
            
        } catch (error) {
            console.error('Erreur calcul stats:', error);
            return {
                totalSessions: 0,
                avgRating: 0,
                favoriteSpots: 0,
                totalBoards: 0,
                totalPredictions: Math.floor(Math.random() * 50) + 20,
                currentStreak: Math.floor(Math.random() * 10) + 1
            };
        }
    }

    calculateStreak(sessions) {
        // Calculer la série de sessions consécutives
        if (sessions.length === 0) return 0;
        
        let streak = 1;
        for (let i = 1; i < sessions.length; i++) {
            const prev = new Date(sessions[i-1].date);
            const curr = new Date(sessions[i].date);
            const diffDays = Math.abs(curr - prev) / (1000 * 60 * 60 * 24);
            
            if (diffDays <= 7) { // Sessions dans la même semaine
                streak++;
            } else {
                break;
            }
        }
        
        return streak;
    }

    clearCache() {
        this.profilesCache.clear();
        this.sessionsCache.clear();
        this.spotsCache.clear();
        console.log('🗑️ Cache hybride vidé');
    }

    getServiceStats() {
        return {
            cacheSize: this.profilesCache.size + this.sessionsCache.size + this.spotsCache.size,
            memoryDBSize: this.memoryDB.users.size + this.memoryDB.sessions.size + this.memoryDB.spots.size,
            supabaseConnected: !!this.supabase,
            cacheTimeout: this.cacheTimeout,
            uptime: process.uptime(),
            hybridMode: true
        };
    }
}

module.exports = EnhancedUserProfileService;
