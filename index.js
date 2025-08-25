// Main exports for @shaxpir/sharedb-storage-expo-sqlite
const ExpoSqliteStorage = require('./lib/expo-sqlite-storage');
const StandardSQLiteConnectionPool = require('./lib/connection-pool/sqlite-connection-pool');
const ExpoSqliteAdapter = require('./lib/adapters/expo-sqlite-adapter');

module.exports = {
  ExpoSqliteStorage:            ExpoSqliteStorage,
  StandardSQLiteConnectionPool: StandardSQLiteConnectionPool,
  ExpoSqliteAdapter:            ExpoSqliteAdapter,
};

// Default export is the main storage class
module.exports.default = ExpoSqliteStorage;
