/**
 * Simple logger implementation for SQLite storage
 * Matches the interface expected by ShareDB components
 */

const logger = {
  info: function(message) {
    console.log('[INFO] ' + message);
  },

  warn: function(message) {
    console.warn('[WARN] ' + message);
  },

  error: function(message) {
    console.error('[ERROR] ' + message);
  },
};

module.exports = logger;
