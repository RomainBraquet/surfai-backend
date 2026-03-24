// Vercel serverless entry point
try {
  const app = require('../server');
  module.exports = app;
} catch (err) {
  // Fallback: return error details
  const express = require('express');
  const fallback = express();
  fallback.use((req, res) => {
    res.status(500).json({
      error: 'Server initialization failed',
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 5)
    });
  });
  module.exports = fallback;
}
