// Main export is now SqliteStorage (the generic storage class)
var SqliteStorage = require('./lib/sqlite-storage');
module.exports = SqliteStorage;

// Attach all exports to SqliteStorage
SqliteStorage.SqliteStorage = SqliteStorage;

// Adapters
SqliteStorage.ExpoSqliteAdapter = require('./lib/adapters/expo-sqlite-adapter');
SqliteStorage.BetterSqliteAdapter = require('./lib/adapters/better-sqlite-adapter');

// Schema Strategies
SqliteStorage.DefaultSchemaStrategy = require('./lib/schema/default-schema-strategy');
SqliteStorage.CollectionPerTableStrategy = require('./lib/schema/collection-per-table-strategy');

