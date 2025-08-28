// Main export is now SqliteStorage (the generic storage class)
var SqliteStorage = require('./lib/sqlite-storage');
module.exports = SqliteStorage;

// Attach all exports to SqliteStorage
SqliteStorage.SqliteStorage = SqliteStorage;

// Adapters - Load conditionally based on environment
// Node.js environment: Load BetterSqliteAdapter
// React Native environment: Load ExpoSqliteAdapter

if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  // Node.js environment
  try {
    SqliteStorage.BetterSqliteAdapter = require('./lib/adapters/better-sqlite-adapter');
  } catch (e) {
    // BetterSqliteAdapter not available
    SqliteStorage.BetterSqliteAdapter = null;
  }
  
  // ExpoSqliteAdapter won't work in Node.js (no expo-sqlite)
  SqliteStorage.ExpoSqliteAdapter = null;
} else {
  // React Native environment (or browser)
  try {
    SqliteStorage.ExpoSqliteAdapter = require('./lib/adapters/expo-sqlite-adapter');
  } catch (e) {
    // ExpoSqliteAdapter not available
    SqliteStorage.ExpoSqliteAdapter = null;
  }
  
  // BetterSqliteAdapter won't work in React Native (no native bindings)
  SqliteStorage.BetterSqliteAdapter = null;
}

// Schema Strategies
SqliteStorage.DefaultSchemaStrategy = require('./lib/schema/default-schema-strategy');
SqliteStorage.CollectionPerTableStrategy = require('./lib/schema/collection-per-table-strategy');

