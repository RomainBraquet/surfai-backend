// 🏥 Health Check pour conteneur Docker SurfAI
// Vérifie que l'application fonctionne correctement

const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3001,
  path: '/health',
  method: 'GET',
  timeout: 3000
};

const healthCheck = http.request(options, (res) => {
  console.log(`Health check status: ${res.statusCode}`);
  
  if (res.statusCode === 200) {
    process.exit(0); // Succès
  } else {
    process.exit(1); // Échec
  }
});

healthCheck.on('error', (err) => {
  console.log('Health check failed:', err.message);
  process.exit(1); // Échec
});

healthCheck.on('timeout', () => {
  console.log('Health check timeout');
  healthCheck.destroy();
  process.exit(1); // Échec
});

healthCheck.end();