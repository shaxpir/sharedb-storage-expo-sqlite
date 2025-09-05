const CollectionPerTableStrategy = require('./collection-per-table-strategy');

/**
 * AttachedCollectionPerTableStrategy - Schema strategy for attached databases
 * 
 * This strategy extends CollectionPerTableStrategy to work with attached databases.
 * It automatically prefixes all table names with the attachment alias, ensuring that
 * all ShareDB operations reference the correct attached database.
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.attachmentAlias - The alias used in ATTACH DATABASE statement (e.g., 'sharedb')
 * @param {boolean} options.useEncryption - Enable encryption support
 * @param {Function} options.encryptionCallback - Encryption function
 * @param {Function} options.decryptionCallback - Decryption function
 * @param {Object} options.collectionConfig - Collection-specific configuration
 * @param {boolean} options.debug - Enable debug logging
 */
function AttachedCollectionPerTableStrategy(options) {
  options = options || {};
  
  if (!options.attachmentAlias) {
    throw new Error('AttachedCollectionPerTableStrategy requires attachmentAlias option');
  }
  
  // Call parent constructor
  CollectionPerTableStrategy.call(this, options);
  
  // Store the attachment alias for prefixing
  this.attachmentAlias = options.attachmentAlias;
  this.debug = options.debug || false;
  this.createAdapterForPath = options.createAdapterForPath;
}

// Inherit from CollectionPerTableStrategy
AttachedCollectionPerTableStrategy.prototype = Object.create(CollectionPerTableStrategy.prototype);
AttachedCollectionPerTableStrategy.prototype.constructor = AttachedCollectionPerTableStrategy;

/**
 * Override getTableName to add attachment alias prefix
 * @param {string} collection - The collection name
 * @returns {string} The prefixed table name
 */
AttachedCollectionPerTableStrategy.prototype.getTableName = function(collection) {
  // Get base table name from parent
  const baseTableName = CollectionPerTableStrategy.prototype.getTableName.call(this, collection);
  
  // Only add attachment alias prefix if we have one
  if (this.attachmentAlias) {
    const prefixedTableName = this.attachmentAlias + '.' + baseTableName;
    this.debug && console.log('[AttachedCollectionPerTableStrategy] Table name for', collection, ':', prefixedTableName);
    return prefixedTableName;
  } else {
    // When attachmentAlias is null (during pre-initialization), use base name
    return baseTableName;
  }
};

/**
 * Override initializeSchema to work with attached database
 * Creates tables in the attached database instead of primary
 */
AttachedCollectionPerTableStrategy.prototype.initializeSchema = async function(db, callback) {
  const strategy = this;
  
  // Helper function to handle both promise styles
  const runAsyncWrapper = function(sql) {
    const result = db.runAsync(sql);
    // If it returns an object with promise() method, use it; otherwise it's already a promise
    return result && typeof result.promise === 'function' ? result.promise() : result;
  };
  
  try {
    // Create meta table with sharedb_ prefix in attached database
    // Note: We use the base table name without prefix for CREATE TABLE in attached database
    await runAsyncWrapper(
      'CREATE TABLE IF NOT EXISTS ' + strategy.attachmentAlias + '.sharedb_meta (' +
      'id TEXT PRIMARY KEY, ' +
      'data JSON' +
      ')'
    );
    
    // Create inventory table in attached database
    await runAsyncWrapper(
      'CREATE TABLE IF NOT EXISTS ' + strategy.attachmentAlias + '.sharedb_inventory (' +
      'collection TEXT NOT NULL, ' +
      'doc_id TEXT NOT NULL, ' +
      'version_num REAL, ' +
      'version_str TEXT, ' +
      'has_pending INTEGER NOT NULL DEFAULT 0, ' +
      'updated_at INTEGER, ' +
      'PRIMARY KEY (collection, doc_id)' +
      ')'
    );
    
    // Verify that indexes exist in the attached database
    // Indexes must be created directly in the ShareDB database before attachment
    // Use the sharedb-initializer utility to ensure proper initialization
    const indexCheck = await db.getAllAsync(
      'SELECT name FROM ' + strategy.attachmentAlias + '.sqlite_master ' +
      'WHERE type=\'index\' AND (name LIKE \'idx_inventory_%\' OR name LIKE \'%_idx\')'
    );
    
    const indexNames = indexCheck.map(i => i.name);
    const hasInventoryIndexes = indexNames.some(name => name.includes('inventory'));
    
    if (!hasInventoryIndexes) {
      console.warn(
        '[AttachedCollectionPerTableStrategy] WARNING: No indexes found in attached database.',
        'Indexes are critical for performance.',
        'Please initialize the ShareDB database with sharedb-initializer before attachment.'
      );
    } else {
      strategy.debug && console.log(
        '[AttachedCollectionPerTableStrategy] Found indexes in attached database:', 
        indexNames
      );
    }
    
    // Create tables for any pre-configured collections
    const collections = Object.keys(strategy.collectionConfig);
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      await strategy.createCollectionTable(db, collection);
    }
    
    strategy.debug && console.log('[AttachedCollectionPerTableStrategy] Schema initialized in attached database:', strategy.attachmentAlias);
    callback && callback();
  } catch (error) {
    console.error('[AttachedCollectionPerTableStrategy] Schema initialization error:', error);
    callback && callback(error);
  }
};

/**
 * Pre-initialize a database before attachment
 * This creates all tables and indexes directly in the database before it's attached
 * @param {string} databasePath - Path to the database to initialize
 * @param {Function} createAdapter - Function that creates an adapter for the database path
 * @returns {Promise} Resolves when initialization is complete
 */
AttachedCollectionPerTableStrategy.prototype.preInitializeDatabase = async function(databasePath, createAdapter) {
  const strategy = this;
  
  strategy.debug && console.log('[AttachedCollectionPerTableStrategy] Pre-initializing database:', databasePath);
  
  try {
    // Create a direct adapter to the database (not attached)
    const directAdapter = createAdapter(databasePath);
    
    // Connect to the database
    await directAdapter.connect();
    
    // Temporarily disable the attachment alias to work directly with the database
    const originalAlias = strategy.attachmentAlias;
    strategy.attachmentAlias = null;
    
    // Also temporarily replace createCollectionTable to use the base implementation
    const originalCreateCollectionTable = strategy.createCollectionTable;
    strategy.createCollectionTable = CollectionPerTableStrategy.prototype.createCollectionTable;
    
    try {
      // Create a wrapper that matches what the schema strategy expects
      // Some strategies expect runAsync to return {promise: () => Promise}
      const dbWrapper = {
        runAsync: function(sql, params) {
          const promise = directAdapter.runAsync(sql, params);
          // Return object with promise() method if the strategy expects it
          return {
            promise: function() {
              return promise;
            }
          };
        },
        getFirstAsync: function(sql, params) {
          return directAdapter.getFirstAsync(sql, params);
        },
        getAllAsync: function(sql, params) {
          return directAdapter.getAllAsync(sql, params);
        },
        transaction: function(operations) {
          return directAdapter.transaction(operations);
        }
      };
      
      // Initialize the schema directly (without prefix since we're connected directly)
      await new Promise((resolve, reject) => {
        // Call the parent class's initializeSchema, not our overridden version
        CollectionPerTableStrategy.prototype.initializeSchema.call(strategy, dbWrapper, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Verify indexes were created
      const indexes = await directAdapter.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type='index'"
      );
      
      strategy.debug && console.log(
        '[AttachedCollectionPerTableStrategy] Pre-initialization complete. Created indexes:', 
        indexes.map(i => i.name)
      );
      
      // Restore the attachment alias and method
      strategy.attachmentAlias = originalAlias;
      strategy.createCollectionTable = originalCreateCollectionTable;
      
      // Disconnect from the database
      await directAdapter.disconnect();
      
      return { success: true, indexes: indexes.map(i => i.name) };
    } catch (error) {
      // Make sure to restore the alias even if there's an error
      strategy.attachmentAlias = originalAlias;
      throw error;
    }
  } catch (error) {
    console.error('[AttachedCollectionPerTableStrategy] Pre-initialization error:', error);
    throw error;
  }
};

/**
 * Ensure the attached database has all necessary indexes
 * This verifies that indexes exist (they should have been created during pre-initialization)
 * @private
 */
AttachedCollectionPerTableStrategy.prototype.ensureAttachedDatabaseInitialized = async function(db) {
  const strategy = this;
  
  try {
    // Verify that indexes exist in the attached database
    const existingIndexes = await db.getAllAsync(
      'SELECT name FROM ' + strategy.attachmentAlias + '.sqlite_master WHERE type=\'index\''
    );
    const indexNames = new Set(existingIndexes.map(i => i.name));
    
    // Check for required inventory indexes
    const requiredIndexes = ['idx_inventory_collection', 'idx_inventory_updated'];
    const missingIndexes = requiredIndexes.filter(idx => !indexNames.has(idx));
    
    // Check for collection indexes
    for (const collection of Object.keys(strategy.collectionConfig)) {
      const config = strategy.collectionConfig[collection];
      const tableName = CollectionPerTableStrategy.prototype.getTableName.call(this, collection);
      
      if (config.indexes && config.indexes.length > 0) {
        for (const field of config.indexes) {
          const sanitizedField = field.replace(/\./g, '_');
          const indexName = tableName + '_' + sanitizedField + '_idx';
          
          if (!indexNames.has(indexName)) {
            missingIndexes.push(indexName);
          }
        }
      }
    }
    
    if (missingIndexes.length > 0) {
      // Indexes are missing - the database wasn't properly initialized
      strategy.debug && console.log(
        '[AttachedCollectionPerTableStrategy] Missing indexes detected:', 
        missingIndexes
      );
      
      console.warn(
        '[AttachedCollectionPerTableStrategy] Database needs initialization.',
        'Missing indexes:', missingIndexes.join(', ')
      );
    } else {
      strategy.debug && console.log(
        '[AttachedCollectionPerTableStrategy] All required indexes found:', 
        Array.from(indexNames)
      );
    }
  } catch (error) {
    console.error('[AttachedCollectionPerTableStrategy] Error checking indexes:', error);
    // Don't fail initialization, but log the issue
  }
};

/**
 * Override createCollectionTable to work with attached database
 */
AttachedCollectionPerTableStrategy.prototype.createCollectionTable = async function(db, collection) {
  const strategy = this;
  const tableName = this.getTableName(collection); // This will include the prefix
  const config = this.collectionConfig[collection] || {};
  
  // Helper function to handle both promise styles
  const runAsyncWrapper = function(sql) {
    const result = db.runAsync(sql);
    return result && typeof result.promise === 'function' ? result.promise() : result;
  };
  
  // Create the table in attached database
  // For collection tables, use the simple table name within the attached database
  const simpleTableName = CollectionPerTableStrategy.prototype.getTableName.call(this, collection);
  
  // Use the appropriate table name based on whether we're in attachment mode
  const fullTableName = strategy.attachmentAlias 
    ? strategy.attachmentAlias + '.' + simpleTableName 
    : simpleTableName;
  
  await runAsyncWrapper(
    'CREATE TABLE IF NOT EXISTS ' + fullTableName + ' (' +
    'id TEXT PRIMARY KEY, ' +
    'collection TEXT, ' +
    'data JSON' +
    ')'
  );
  
  // Verify that indexes exist for this collection
  // Indexes must be created in the ShareDB database before attachment
  if (config.indexes && config.indexes.length > 0) {
    const expectedIndexes = config.indexes.map(field => {
      const sanitizedField = field.replace(/\./g, '_');
      return simpleTableName + '_' + sanitizedField + '_idx';
    });
    
    strategy.debug && console.log(
      '[AttachedCollectionPerTableStrategy] Collection', collection,
      'expects indexes:', expectedIndexes,
      '- these should be created using sharedb-initializer before attachment'
    );
  }
  
  strategy.createdTables[collection] = true;
  strategy.debug && console.log('[AttachedCollectionPerTableStrategy] Created table in attached database:', tableName);
};

/**
 * Override validateSchema to check tables in attached database
 */
AttachedCollectionPerTableStrategy.prototype.validateSchema = function(db, callback) {
  const strategy = this;
  
  // Check meta table exists in attached database
  const sql = 'SELECT name FROM ' + strategy.attachmentAlias + 
              '.sqlite_master WHERE type=\'table\' AND name=\'sharedb_meta\'';
  
  db.getFirstAsync(sql).then(function(result) {
    callback && callback(null, !!result);
  }).catch(function(error) {
    callback && callback(error, false);
  });
};

/**
 * Override readInventory to read from attached database
 */
AttachedCollectionPerTableStrategy.prototype.readInventory = function(db, callback) {
  const strategy = this;
  
  db.getAllAsync(
    'SELECT collection, doc_id, version_num, version_str, has_pending FROM ' + 
    strategy.attachmentAlias + '.sharedb_inventory ORDER BY collection, doc_id'
  ).then(function(rows) {
    const inventory = {collections: {}};
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!inventory.collections[row.collection]) {
        inventory.collections[row.collection] = {};
      }
      // Use whichever version type is not null
      const version = row.version_str !== null ? row.version_str : row.version_num;
      const hasPending = row.has_pending === 1;
      
      inventory.collections[row.collection][row.doc_id] = {
        v: version,
        p: hasPending
      };
    }
    
    callback && callback(null, {
      id: 'inventory',
      payload: inventory
    });
  }).catch(function(error) {
    callback && callback(error, null);
  });
};

/**
 * Override deleteAllTables to work with attached database
 */
AttachedCollectionPerTableStrategy.prototype.deleteAllTables = function(db, callback) {
  const strategy = this;
  const promises = [];
  
  // Drop the standard meta and inventory tables in attached database
  promises.push(db.runAsync('DROP TABLE IF EXISTS ' + strategy.attachmentAlias + '.sharedb_meta'));
  promises.push(db.runAsync('DROP TABLE IF EXISTS ' + strategy.attachmentAlias + '.sharedb_inventory'));
  
  // Get all collection-specific table names in attached database and drop them
  db.getAllAsync(
    'SELECT name FROM ' + strategy.attachmentAlias + 
    '.sqlite_master WHERE type=\'table\' AND name NOT IN (\'sharedb_meta\', \'sharedb_inventory\')'
  ).then(function(tables) {
    // Drop each collection table
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].name;
      // Skip system tables
      if (tableName.startsWith('sqlite_')) continue;
      promises.push(db.runAsync('DROP TABLE IF EXISTS ' + strategy.attachmentAlias + '.' + tableName));
    }
    
    return Promise.all(promises);
  }).then(function() {
    strategy.debug && console.log('[AttachedCollectionPerTableStrategy] Deleted all tables in attached database:', strategy.attachmentAlias);
    callback && callback();
  }).catch(function(err) {
    callback && callback(err);
  });
};

module.exports = AttachedCollectionPerTableStrategy;