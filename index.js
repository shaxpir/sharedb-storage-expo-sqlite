// Re-export from upstream package
var upstream = require('@shaxpir/sharedb-storage-sqlite');

// Export everything properly as named exports
module.exports = {
  // Main SqliteStorage class
  SqliteStorage: upstream.SqliteStorage,

  // Expo-specific adapters
  ExpoSqliteAdapter: require('./lib/adapters/expo-sqlite-adapter'),
  AttachedExpoSqliteAdapter: require('./lib/adapters/attached-expo-sqlite-adapter'),

  // Schema strategies from upstream
  DefaultSchemaStrategy: upstream.DefaultSchemaStrategy,
  CollectionPerTableStrategy: upstream.CollectionPerTableStrategy,
  AttachedCollectionPerTableStrategy: upstream.AttachedCollectionPerTableStrategy,

  // Also export as default for backward compatibility
  default: upstream.SqliteStorage
};