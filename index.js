// Main exports for @shaxpir/sharedb-storage-expo-sqlite
const ExpoSqliteStorage = require('./lib/expo-sqlite-storage');
const StandardSQLiteConnectionPool = require('./lib/connection-pool/sqlite-connection-pool');
const ExpoSqliteAdapter = require('./lib/adapters/expo-sqlite-adapter');
const DefaultSchemaStrategy = require('./lib/schema/default-schema-strategy');
const CollectionPerTableStrategy = require('./lib/schema/collection-per-table-strategy');
const SqliteStorage = require('./lib/sqlite-storage');

module.exports = {
  ExpoSqliteStorage:            ExpoSqliteStorage,
  StandardSQLiteConnectionPool: StandardSQLiteConnectionPool,
  ExpoSqliteAdapter:            ExpoSqliteAdapter,
  DefaultSchemaStrategy:        DefaultSchemaStrategy,
  CollectionPerTableStrategy:   CollectionPerTableStrategy,
  SqliteStorage:                SqliteStorage,
};

// Default export is the main storage class
module.exports.default = ExpoSqliteStorage;
