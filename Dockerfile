# 🐳 Dockerfile pour SurfAI Backend
# Image optimisée pour production avec Node.js 18

# Utiliser l'image Node.js officielle (Alpine pour taille réduite)
FROM node:18-alpine

# Métadonnées de l'image
LABEL maintainer="SurfAI Team"
LABEL description="Backend intelligent pour prédictions de surf"
LABEL version="1.0.0"

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs
RUN adduser -S surfai -u 1001

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances de production uniquement
RUN npm ci --only=production && npm cache clean --force

# Copier le code source
COPY --chown=surfai:nodejs . .

# Exposer le port de l'application
EXPOSE 3001

# Définir les variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3001

# Vérifications de santé du conteneur
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Changer vers l'utilisateur non-root
USER surfai

# Commande de démarrage
CMD ["node", "server.js"]