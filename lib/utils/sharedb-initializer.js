/**
 * ShareDBInitializer - Helper class to initialize a ShareDB database with proper schema and indexes
 * 
 * This class ensures that a ShareDB database has all necessary tables and indexes created
 * before it's used in attachment mode. This is important because SQLite doesn't support
 * creating indexes with database.table notation, so indexes must be created directly in
 * the database before attachment.
 */

/**
 * Initialize a ShareDB database with schema and indexes
 * @param {Object} adapter - A standard SQLite adapter connected to the ShareDB database
 * @param {Object} options - Configuration options
 * @param {Object} options.collectionConfig - Collection-specific configuration with indexes
 * @param {boolean} options.debug - Enable debug logging
 */
async function initializeShareDBDatabase(adapter, options) {
  options = options || {};
  const debug = options.debug || false;
  const collectionConfig = options.collectionConfig || {};
  
  try {
    // Connect to the database
    await adapter.connect();
    
    debug && console.log('[ShareDBInitializer] Initializing ShareDB database schema');
    
    // Create meta table
    await adapter.runAsync(
      'CREATE TABLE IF NOT EXISTS sharedb_meta (' +
      'id TEXT PRIMARY KEY, ' +
      'data JSON' +
      ')'
    );
    
    // Create inventory table with support for both numeric and string versions
    await adapter.runAsync(
      'CREATE TABLE IF NOT EXISTS sharedb_inventory (' +
      'collection TEXT NOT NULL, ' +
      'doc_id TEXT NOT NULL, ' +
      'version_num REAL, ' +
      'version_str TEXT, ' +
      'has_pending INTEGER NOT NULL DEFAULT 0, ' +
      'updated_at INTEGER, ' +
      'PRIMARY KEY (collection, doc_id)' +
      ')'
    );
    
    // Create indexes for inventory table - these work because we're in the database context
    await adapter.runAsync(
      'CREATE INDEX IF NOT EXISTS idx_inventory_collection ON sharedb_inventory (collection)'
    );
    
    await adapter.runAsync(
      'CREATE INDEX IF NOT EXISTS idx_inventory_updated ON sharedb_inventory (updated_at)'
    );
    
    debug && console.log('[ShareDBInitializer] Created inventory table with indexes');
    
    // Create tables for pre-configured collections
    for (const collection of Object.keys(collectionConfig)) {
      const config = collectionConfig[collection];
      const tableName = collection.replace(/[^a-zA-Z0-9_]/g, '_');
      
      // Create collection table
      await adapter.runAsync(
        'CREATE TABLE IF NOT EXISTS ' + tableName + ' (' +
        'id TEXT PRIMARY KEY, ' +
        'collection TEXT, ' +
        'data JSON' +
        ')'
      );
      
      // Create indexes for the collection if configured
      if (config.indexes && config.indexes.length > 0) {
        for (const field of config.indexes) {
          const sanitizedField = field.replace(/\./g, '_');
          const indexName = tableName + '_' + sanitizedField + '_idx';
          
          await adapter.runAsync(
            'CREATE INDEX IF NOT EXISTS ' + indexName + ' ON ' + tableName +
            ' (json_extract(data, \'$.' + field + '\'))'
          );
          
          debug && console.log('[ShareDBInitializer] Created index', indexName, 'for collection', collection);
        }
      }
      
      debug && console.log('[ShareDBInitializer] Created table and indexes for collection:', collection);
    }
    
    // Verify the schema was created correctly
    const tables = await adapter.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    
    const indexes = await adapter.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
    );
    
    debug && console.log('[ShareDBInitializer] Database initialized with tables:', tables.map(t => t.name));
    debug && console.log('[ShareDBInitializer] Database initialized with indexes:', indexes.map(i => i.name));
    
    // Disconnect from the database
    await adapter.disconnect();
    
    return {
      success: true,
      tables: tables.map(t => t.name),
      indexes: indexes.map(i => i.name)
    };
  } catch (error) {
    console.error('[ShareDBInitializer] Failed to initialize database:', error);
    
    // Try to disconnect even if initialization failed
    try {
      await adapter.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    
    throw error;
  }
}

/**
 * Verify that a ShareDB database has the expected schema and indexes
 * @param {Object} adapter - A standard SQLite adapter connected to the ShareDB database
 * @param {Object} options - Configuration options
 * @param {Object} options.collectionConfig - Expected collection configuration
 * @param {boolean} options.debug - Enable debug logging
 * @returns {Object} Verification result with missing tables and indexes
 */
async function verifyShareDBDatabase(adapter, options) {
  options = options || {};
  const debug = options.debug || false;
  const collectionConfig = options.collectionConfig || {};
  
  try {
    await adapter.connect();
    
    // Get existing tables and indexes
    const tables = await adapter.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tableNames = new Set(tables.map(t => t.name));
    
    const indexes = await adapter.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
    );
    const indexNames = new Set(indexes.map(i => i.name));
    
    // Check required tables
    const missingTables = [];
    const expectedTables = ['sharedb_meta', 'sharedb_inventory'];
    
    // Add collection tables
    for (const collection of Object.keys(collectionConfig)) {
      const tableName = collection.replace(/[^a-zA-Z0-9_]/g, '_');
      expectedTables.push(tableName);
    }
    
    for (const table of expectedTables) {
      if (!tableNames.has(table)) {
        missingTables.push(table);
      }
    }
    
    // Check required indexes
    const missingIndexes = [];
    const expectedIndexes = ['idx_inventory_collection', 'idx_inventory_updated'];
    
    // Add collection indexes
    for (const collection of Object.keys(collectionConfig)) {
      const config = collectionConfig[collection];
      const tableName = collection.replace(/[^a-zA-Z0-9_]/g, '_');
      
      if (config.indexes && config.indexes.length > 0) {
        for (const field of config.indexes) {
          const sanitizedField = field.replace(/\./g, '_');
          const indexName = tableName + '_' + sanitizedField + '_idx';
          expectedIndexes.push(indexName);
        }
      }
    }
    
    for (const index of expectedIndexes) {
      if (!indexNames.has(index)) {
        missingIndexes.push(index);
      }
    }
    
    await adapter.disconnect();
    
    const isValid = missingTables.length === 0 && missingIndexes.length === 0;
    
    if (debug) {
      if (isValid) {
        console.log('[ShareDBInitializer] Database schema is valid');
      } else {
        console.log('[ShareDBInitializer] Database schema is incomplete');
        if (missingTables.length > 0) {
          console.log('[ShareDBInitializer] Missing tables:', missingTables);
        }
        if (missingIndexes.length > 0) {
          console.log('[ShareDBInitializer] Missing indexes:', missingIndexes);
        }
      }
    }
    
    return {
      isValid,
      missingTables,
      missingIndexes,
      existingTables: Array.from(tableNames),
      existingIndexes: Array.from(indexNames)
    };
  } catch (error) {
    // Try to disconnect on error
    try {
      await adapter.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    
    throw error;
  }
}

module.exports = {
  initializeShareDBDatabase,
  verifyShareDBDatabase
};