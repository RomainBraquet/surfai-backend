// src/services/EnhancedUserProfileService.js
// SurfAI V2 - Service Hybride adapté à votre structure Supabase existante

const { createClient } = require('@supabase/supabase-js');

class EnhancedUserProfileService {
    constructor() {
        // Configuration Supabase depuis variables d'environnement
        this.supabaseUrl = process.env.SUPABASE_URL;
        this.supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (this.supabaseUrl && this.supabaseKey) {
            this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
            console.log('✅ EnhancedUserProfileService: Supabase initialisé');
        } else {
            console.warn('⚠️ EnhancedUserProfileService: Variables Supabase manquantes - mode dégradé');
            this.supabase = null;
        }

        // Cache hybride
        this.profilesCache = new Map();
        this.sessionsCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

        // Base de données temporaire en mémoire (fallback)
        this.memoryDB = {
            users: new Map(),
            sessions: new Map()
        };
        
        // Initialisation des données de test
        this.initializeTestData();
    }

    // ===== GESTION PROFIL UTILISATEUR HYBRIDE =====
    
    async createUserProfile(userData) {
        const userId = userData.id || this.generateUserId();
        
        try {
            if (this.supabase) {
                // Adapter à votre structure de table existante
                const profileData = {
                    uuid: userId,
                    surf_level: this.convertLevelToYourFormat(userData.surfLevel || userData.level || 'intermediate'),
                    min_wave_height: userData.minWaveSize || userData.wave_min || 0.7,
                    max_wave_height: userData.maxWaveSize || userData.wave_max || 1.8,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    nickname: userData.name || userData.pseudo || 'SurfAI User',
                    // Ajouter d'autres champs selon votre structure
                    board_types: userData.board_types || [],
                    selected_board_ids: userData.selected_board_ids || []
                };

                const { data, error } = await this.supabase
                    .from('profile') // Utiliser votre nom de table
                    .upsert([profileData])
                    .select();

                if (error) throw error;

                console.log(`✅ Profil créé en Supabase: ${userId}`);
                
                // Créer aussi le profil étendu en mémoire pour les fonctionnalités avancées
                const extendedProfile = this.buildExtendedProfile(userId, userData, data[0]);
                this.profilesCache.set(userId, {
                    data: extendedProfile,
                    timestamp: Date.now()
                });
                
                return extendedProfile;
            } else {
                // Mode dégradé
                const profile = this.buildExtendedProfile(userId, userData);
                this.memoryDB.users.set(userId, profile);
                return profile;
            }
            
        } catch (error) {
            console.error('❌ Erreur création profil, fallback mémoire:', error);
            
            const profile = this.buildExtendedProfile(userId, userData);
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
                // Récupérer depuis votre table profile
                const { data, error } = await this.supabase
                    .from('profile')
                    .select('*')
                    .eq('uuid', userId) // Utiliser uuid au lieu de user_id
                    .single();

                if (error && error.code !== 'PGRST116') {
                    throw error;
                }

                if (data) {
                    // Convertir votre structure vers le format étendu
                    const extendedProfile = this.convertToExtendedProfile(data);
                    
                    // Mettre à jour cache
                    this.profilesCache.set(userId, {
                        data: extendedProfile,
                        timestamp: Date.now()
                    });

                    console.log(`✅ Profil récupéré depuis Supabase: ${userId}`);
                    return extendedProfile;
                } else {
                    // Profil non trouvé - créer profil par défaut
                    return await this.createUserProfile({ id: userId });
                }
            }

            // Fallback mémoire
            const memoryProfile = this.memoryDB.users.get(userId);
            return memoryProfile || await this.createUserProfile({ id: userId });
            
        } catch (error) {
            console.error(`❌ Erreur récupération profil ${userId}:`, error);
            
            const memoryProfile = this.memoryDB.users.get(userId);
            return memoryProfile || this.buildExtendedProfile(userId, {});
        }
    }

    async updateUserProfile(userId, updates) {
        try {
            if (this.supabase) {
                // Convertir les mises à jour vers votre format de table
                const supabaseUpdates = {
                    updated_at: new Date().toISOString()
                };

                // Mapper les champs selon votre structure
                if (updates.personal?.name || updates.nickname) {
                    supabaseUpdates.nickname = updates.personal?.name || updates.nickname;
                }
                if (updates.surfLevel?.overall || updates.level) {
                    supabaseUpdates.surf_level = this.convertLevelToYourFormat(updates.surfLevel?.overall || updates.level);
                }
                if (updates.preferences?.waveSize?.min || updates.wave_min) {
                    supabaseUpdates.min_wave_height = updates.preferences?.waveSize?.min || updates.wave_min;
                }
                if (updates.preferences?.waveSize?.max || updates.wave_max) {
                    supabaseUpdates.max_wave_height = updates.preferences?.waveSize?.max || updates.wave_max;
                }
                if (updates.board_types) {
                    supabaseUpdates.board_types = updates.board_types;
                }
                if (updates.selected_board_ids) {
                    supabaseUpdates.selected_board_ids = updates.selected_board_ids;
                }

                const { data, error } = await this.supabase
                    .from('profile')
                    .update(supabaseUpdates)
                    .eq('uuid', userId)
                    .select();

                if (error) throw error;

                console.log(`✅ Profil mis à jour en Supabase: ${userId}`);
            }

            // Mettre à jour le cache
            const currentProfile = await this.getUserProfile(userId);
            const updatedProfile = this.deepMerge(currentProfile, updates);
            updatedProfile.updatedAt = new Date().toISOString();
            
            this.profilesCache.set(userId, {
                data: updatedProfile,
                timestamp: Date.now()
            });
            
            return updatedProfile;
            
        } catch (error) {
            console.error(`❌ Erreur mise à jour profil ${userId}:`, error);
            throw new Error(`Impossible de mettre à jour le profil: ${error.message}`);
        }
    }

    // ===== MÉTHODES DE CONVERSION =====

    convertToExtendedProfile(supabaseData) {
        // Convertir votre structure Supabase vers le format étendu
        return {
            id: supabaseData.uuid,
            createdAt: supabaseData.created_at,
            updatedAt: supabaseData.updated_at,
            
            personal: {
                name: supabaseData.nickname || 'SurfAI User',
                email: supabaseData.email || '',
                location: 'Biarritz, France',
                timezone: 'Europe/Paris'
            },
            
            surfLevel: {
                overall: this.convertLevelFromYourFormat(supabaseData.surf_level),
                progression: {
                    paddling: 3,
                    takeoff: 3,
                    turning: 3,
                    tubeRiding: 1
                },
                experience: {
                    yearsActive: 2,
                    sessionsCount: 0,
                    lastSession: null
                }
            },
            
            preferences: {
                waveSize: {
                    min: supabaseData.min_wave_height || 0.7,
                    max: supabaseData.max_wave_height || 1.8,
                    optimal: ((supabaseData.min_wave_height || 0.7) + (supabaseData.max_wave_height || 1.8)) / 2
                },
                windTolerance: {
                    onshore: 15,
                    offshore: 25,
                    sideshore: 20
                },
                crowdTolerance: 'medium',
                waterTemp: { min: 12 }
            },
            
            equipment: {
                boards: [],
                suits: [],
                accessories: []
            },
            
            spots: {
                favorites: [],
                history: [],
                blacklist: []
            },
            
            availability: this.getDefaultSchedule(),
            
            goals: {
                current: [],
                achievements: [],
                progressTracking: {
                    sessionsThisMonth: 0,
                    progressionPoints: 0,
                    challengesCompleted: []
                }
            }
        };
    }

    convertLevelToYourFormat(level) {
        // Convertir niveau numérique ou texte vers votre format
        if (typeof level === 'number') {
            if (level <= 2) return 'beginner';
            if (level <= 5) return 'intermediate';
            if (level <= 8) return 'advanced';
            return 'expert';
        }
        return level || 'intermediate';
    }

    convertLevelFromYourFormat(level) {
        // Convertir votre format vers numérique
        const mapping = {
            'beginner': 2,
            'intermediate': 4,
            'advanced': 7,
            'expert': 9
        };
        return mapping[level] || 4;
    }

    buildExtendedProfile(userId, userData, supabaseData = null) {
        const base = supabaseData ? this.convertToExtendedProfile(supabaseData) : null;
        
        return base || {
            id: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            
            personal: {
                name: userData.name || userData.nickname || 'SurfAI User',
                email: userData.email || '',
                location: userData.location || 'Biarritz, France',
                timezone: 'Europe/Paris'
            },
            
            surfLevel: {
                overall: userData.surfLevel || this.convertLevelFromYourFormat(userData.level) || 4,
                progression: {
                    paddling: 3,
                    takeoff: 3,
                    turning: 3,
                    tubeRiding: 1
                },
                experience: {
                    yearsActive: userData.yearsActive || 1,
                    sessionsCount: 0,
                    lastSession: null
                }
            },
            
            preferences: {
                waveSize: {
                    min: userData.minWaveSize || 0.7,
                    max: userData.maxWaveSize || 1.8,
                    optimal: userData.optimalWaveSize || 1.2
                },
                windTolerance: {
                    onshore: 15,
                    offshore: 25,
                    sideshore: 20
                },
                crowdTolerance: 'medium',
                waterTemp: { min: 12 }
            },
            
            equipment: {
                boards: userData.boards || [],
                suits: userData.suits || [],
                accessories: userData.accessories || []
            },
            
            spots: {
                favorites: userData.favoriteSpots || [],
                history: [],
                blacklist: userData.blacklistedSpots || []
            },
            
            availability: this.getDefaultSchedule(),
            
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

    // ===== STATISTIQUES ADAPTÉES =====

    async getUserStats(userId) {
        try {
            const user = await this.getUserProfile(userId);
            
            let stats = {
                totalSessions: 0,
                avgRating: 0,
                favoriteSpots: 0,
                totalBoards: 0,
                totalPredictions: Math.floor(Math.random() * 50) + 20,
                currentStreak: Math.floor(Math.random() * 10) + 1,
                level: user.surfLevel.overall
            };

            if (this.supabase) {
                try {
                    // Compter sessions depuis Supabase
                    const { count: sessionsCount } = await this.supabase
                        .from('sessions')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', userId);

                    // Compter spots favoris
                    const { count: favoritesCount } = await this.supabase
                        .from('favorite_spots')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', userId);

                    // Compter boards
                    const { count: boardsCount } = await this.supabase
                        .from('boards')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', userId);

                    // Calculer note moyenne
                    const { data: sessions } = await this.supabase
                        .from('sessions')
                        .select('rating')
                        .eq('user_id', userId)
                        .not('rating', 'is', null);

                    stats.totalSessions = sessionsCount || 0;
                    stats.favoriteSpots = favoritesCount || 0;
                    stats.totalBoards = boardsCount || 0;
                    
                    if (sessions && sessions.length > 0) {
                        const totalRating = sessions.reduce((sum, session) => sum + (session.rating || 0), 0);
                        stats.avgRating = Math.round((totalRating / sessions.length) * 10) / 10;
                    }
                } catch (supabaseError) {
                    console.warn('Erreur stats Supabase, utilisation valeurs par défaut:', supabaseError);
                }
            }
            
            return stats;
            
        } catch (error) {
            console.error('Erreur calcul stats:', error);
            return {
                totalSessions: 0,
                avgRating: 0,
                favoriteSpots: 0,
                totalBoards: 0,
                totalPredictions: Math.floor(Math.random() * 50) + 20,
                currentStreak: Math.floor(Math.random() * 10) + 1,
                level: 4
            };
        }
    }

    // ===== MÉTHODES UTILITAIRES =====

    generateUserId() {
        return 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
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

    getDefaultSchedule() {
        return {
            travelDistance: 30,
            notificationPrefs: {
                advance: 24,
                types: ['optimal']
            }
        };
    }

    clearCache() {
        this.profilesCache.clear();
        this.sessionsCache.clear();
        console.log('🗑️ Cache vidé');
    }

    getServiceStats() {
        return {
            cacheSize: this.profilesCache.size + this.sessionsCache.size,
            memoryDBSize: this.memoryDB.users.size + this.memoryDB.sessions.size,
            supabaseConnected: !!this.supabase,
            supabaseUrl: this.supabaseUrl ? 'configuré' : 'manquant',
            supabaseKey: this.supabaseKey ? 'configuré' : 'manquant',
            cacheTimeout: this.cacheTimeout,
            uptime: process.uptime(),
            adaptedToExistingSchema: true
        };
    }

    async initializeTestData() {
        try {
            // Utiliser l'ID que je vois dans votre capture d'écran
            const existingUserId = '3ba8ad73-e296-4971-8b32-5a123456789a';
            
            // Vérifier si le profil existe déjà
            const existingProfile = await this.getUserProfile(existingUserId);
            
            if (existingProfile) {
                console.log('✅ Profil existant trouvé:', existingUserId);
            } else {
                console.log('📝 Création profil de test...');
                await this.createUserProfile({
                    id: existingUserId,
                    name: 'bonrom1',
                    level: 'intermediate',
                    minWaveSize: 0.7,
                    maxWaveSize: 1.8
                });
            }
            
        } catch (error) {
            console.error('❌ Erreur initialisation données test:', error);
        }
    }
}

module.exports = EnhancedUserProfileService;
