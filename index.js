// Re-export SqliteStorage and schema strategies from upstream package
var upstream = require('@shaxpir/sharedb-storage-sqlite');
var SqliteStorage = upstream.SqliteStorage;

// Main export is SqliteStorage (the generic storage class)
module.exports = SqliteStorage;

// Attach all exports to SqliteStorage
SqliteStorage.SqliteStorage = SqliteStorage;

// Expo-specific adapters
SqliteStorage.ExpoSqliteAdapter = require('./lib/adapters/expo-sqlite-adapter');
SqliteStorage.AttachedExpoSqliteAdapter = require('./lib/adapters/attached-expo-sqlite-adapter');

// Schema Strategies from upstream
SqliteStorage.DefaultSchemaStrategy = upstream.DefaultSchemaStrategy;
SqliteStorage.CollectionPerTableStrategy = upstream.CollectionPerTableStrategy;
SqliteStorage.AttachedCollectionPerTableStrategy = upstream.AttachedCollectionPerTableStrategy;