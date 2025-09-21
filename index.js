// Export Expo-specific adapters
module.exports = {
  ExpoSqliteAdapter: require('./lib/adapters/expo-sqlite-adapter'),
  AttachedExpoSqliteAdapter: require('./lib/adapters/attached-expo-sqlite-adapter'),
  AttachedCollectionPerTableStrategy: require('./lib/schema/attached-collection-per-table-strategy')
};