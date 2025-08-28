// Main export is SqliteStorage (the generic storage class)
var SqliteStorage = require('./lib/sqlite-storage');
module.exports = SqliteStorage;

// Attach all exports to SqliteStorage
SqliteStorage.SqliteStorage = SqliteStorage;

// React Native adapter - no conditional loading needed since this is React Native only
SqliteStorage.ExpoSqliteAdapter = require('./lib/adapters/expo-sqlite-adapter');

// Schema Strategies
SqliteStorage.DefaultSchemaStrategy = require('./lib/schema/default-schema-strategy');
SqliteStorage.CollectionPerTableStrategy = require('./lib/schema/collection-per-table-strategy');