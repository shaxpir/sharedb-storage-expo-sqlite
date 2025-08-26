const ExpoSqliteAdapter = require('./adapters/expo-sqlite-adapter');
const StandardSQLiteConnectionPool = require('./connection-pool/sqlite-connection-pool');

// Import base storage class from local implementation
const SqliteStorage = require('./sqlite-storage');

/**
 * ExpoSqliteStorage with dual-database support.
 * This class supports both traditional file-based databases and pre-initialized
 * dual-database architectures with schema prefixes and collection mapping.
 *
 * @param options A map of options that can be used to configure the ExpoSqliteStorage
 *
 * options.database (SQLiteDatabase, optional): Pre-initialized database connection.
 * If provided, skips database creation and uses the existing connection.
 *
 * options.schemaPrefix (string, optional): Schema prefix for attached databases (e.g., 'userdata').
 * Used to target tables in attached databases via "prefix.tablename" syntax.
 *
 * options.collectionMapping (function, optional): Function to map ShareDB collections to table names.
 * Example: function(collection) { return 'userdata.' + collection; }
 * If not provided, uses collection names directly (with optional schemaPrefix).
 *
 * options.enableCrossDbQueries (boolean, optional): Enable cross-database queries for analytics.
 * Allows JOINs between userdata and builtin tables. Default: true.
 *
 * options.connectionPool (ConnectionPool, optional): Injected connection pool dependency.
 * Can be any connection pool that implements withConnection(operation, callback) method.
 * Examples: StandardSQLiteConnectionPool, your custom DatabaseConnectionPool, etc.
 *
 * options.namespace (string, optional): Providing a namespace argument creates a separate
 * offline database, which can be useful for discriminating offline storage for different
 * users, or other similar cases where we don't want to mix offline data.
 *
 * options.schemaStrategy (SchemaStrategy instance, optional): A schema strategy instance that
 * defines how data is organized in the database. If not provided, uses DefaultSchemaStrategy.
 *
 * options.useEncryption (boolean, optional): If true, the records in the durable store will
 * have their contents encrypted. Only used if schemaStrategy is not provided.
 *
 * options.encryptionCallback (function returning string, optional): Callback used to encrypt
 * records. Only used if schemaStrategy is not provided.
 *
 * options.decryptionCallback (function returning string, optional): Callback used to decrypt
 * records. Only used if schemaStrategy is not provided.
 *
 * options.debug (boolean, optional): Determines whether logging messages should be emitted.
 */
module.exports = ExpoSqliteStorage;
function ExpoSqliteStorage(options) {
  options = options || {};

  // Store dual-database options
  this.database = options.database;
  // schemaPrefix is optional - use empty string if not provided
  this.schemaPrefix = options.schemaPrefix ? options.schemaPrefix : '';
  this.collectionMapping = options.collectionMapping; // Function or null
  this.enableCrossDbQueries = options.enableCrossDbQueries !== false;

  // Store injected connection pool
  this.connectionPool = options.connectionPool || null;

  // Create an ExpoSqliteAdapter
  const adapter = new ExpoSqliteAdapter({
    debug:    options.debug,
    database: options.database, // Pass pre-initialized database to adapter
  });

  // Set up database file name based on namespace (for backward compatibility)
  // Skip file-based setup if pre-initialized database is provided
  let dbFileName; let dbFileDir;
  if (!options.database) {
    if (!options.namespace) {
      throw new Error('ExpoSqliteStorage requires options.namespace to be specified');
    }
    const namespace = options.namespace;
    const dbName = 'sharedb_' + namespace;
    dbFileName = options.dbFileName || dbName + '.db';
    dbFileDir = options.dbFileDir;
  }

  // Create SqliteStorage with the adapter
  const storageOptions = {
    adapter:            adapter,
    dbFileName:         dbFileName,
    dbFileDir:          dbFileDir,
    schemaStrategy:     options.schemaStrategy,
    useEncryption:      options.useEncryption,
    encryptionCallback: options.encryptionCallback,
    decryptionCallback: options.decryptionCallback,
    debug:              options.debug,
    schemaPrefix:       this.schemaPrefix,
    collectionMapping:  this.collectionMapping,
  };

  // Create internal SqliteStorage instance
  this._storage = new SqliteStorage(storageOptions);

  // Copy properties for backward compatibility
  this.debug = options.debug || false;
  this.ready = false;

  // Store reference to maintain compatibility
  this.db = options.database || null;

  // Validate connection pool interface if provided
  if (this.connectionPool && !this._isValidConnectionPool(this.connectionPool)) {
    throw new Error('Connection pool must implement withConnection(operation, callback) method');
  }

  this.debug && this.connectionPool && console.log('ExpoSqliteStorage: Using injected connection pool');
}

/**
 * Validate that the injected connection pool implements the required interface
 */
ExpoSqliteStorage.prototype._isValidConnectionPool = function(pool) {
  return pool && typeof pool.withConnection === 'function';
};

/**
 * Delegate all methods to the internal SqliteStorage instance
 */

ExpoSqliteStorage.prototype.initialize = function(onReadyCallback) {
  const expoStorage = this;
  this._storage.initialize(function(inventory) {
    expoStorage.ready = true;
    expoStorage.db = expoStorage._storage.db;
    onReadyCallback(inventory);
  });
};

ExpoSqliteStorage.prototype.isReady = function() {
  return this._storage.isReady();
};

ExpoSqliteStorage.prototype.ensureReady = function() {
  return this._storage.ensureReady();
};

ExpoSqliteStorage.prototype.writeRecords = function(recordsByType, callback) {
  return this._storage.writeRecords(recordsByType, callback);
};

ExpoSqliteStorage.prototype.readRecord = function(storeName, recordId, callback) {
  return this._storage.readRecord(storeName, recordId, callback);
};

ExpoSqliteStorage.prototype.readAllRecords = function(storeName, callback) {
  return this._storage.readAllRecords(storeName, callback);
};

ExpoSqliteStorage.prototype.deleteRecord = function(storeName, recordId, callback) {
  return this._storage.deleteRecord(storeName, recordId, callback);
};

ExpoSqliteStorage.prototype.updateInventory = function(collection, docId, version, operation, callback) {
  return this._storage.updateInventory(collection, docId, version, operation, callback);
};

ExpoSqliteStorage.prototype.readInventory = function(callback) {
  return this._storage.readInventory(callback);
};

ExpoSqliteStorage.prototype.deleteDatabase = function(callback) {
  return this._storage.deleteDatabase(callback);
};

ExpoSqliteStorage.prototype.log = function(message) {
  return this._storage.log(message);
};

ExpoSqliteStorage.prototype.logError = function(message) {
  return this._storage.logError(message);
};

/**
 * Execute cross-database query (for analytics and reporting)
 * This enables JOINs between userdata and builtin tables
 */
ExpoSqliteStorage.prototype.executeCrossDbQuery = function(query, params, callback) {
  if (!this.enableCrossDbQueries) {
    return callback(new Error('Cross-database queries are disabled'));
  }

  const self = this;

  // Use connection pool for cross-database queries if available
  if (this.connectionPool) {
    this.connectionPool.withConnection(function(pooledDb) {
      return pooledDb.getAllAsync(query, params || []);
    }, callback);
  } else {
    if (!this.db) {
      return callback(new Error('Database not available'));
    }

    // Use the adapter's all method for query execution
    this._storage.adapter.all(query, params || [], callback);
  }
};

/**
 * Get table name for a collection, applying collection mapping callback or schema prefix
 */
ExpoSqliteStorage.prototype.getTableName = function(collection) {
  // Map special ShareDB internal collections
  let mappedCollection = collection;
  if (collection === '__meta__') {
    mappedCollection = 'meta';
  } else if (collection === 'docs' || !collection) {
    mappedCollection = 'docs';
  }

  // Use collection mapping callback if provided
  if (typeof this.collectionMapping === 'function') {
    return this.collectionMapping(mappedCollection);
  }

  // Use schema prefix if provided
  if (this.schemaPrefix) {
    return this.schemaPrefix + '.' + mappedCollection;
  }

  return mappedCollection;
};

/**
 * Get storage statistics including dual-database info
 */
ExpoSqliteStorage.prototype.getStats = function(callback) {
  const self = this;

  // Get base stats from internal storage, or create default stats
  if (this._storage.getStats) {
    this._storage.getStats(function(error, baseStats) {
      if (error) return callback(error);

      // Enhance with dual-database and connection pool info
      const enhancedStats = baseStats || {};
      enhancedStats.schemaPrefix = self.schemaPrefix;
      enhancedStats.collectionMapping = self.collectionMapping;
      enhancedStats.enableCrossDbQueries = self.enableCrossDbQueries;
      enhancedStats.isDualDatabase = !!self.database;
      enhancedStats.hasConnectionPool = !!self.connectionPool;

      // Add connection pool stats if available
      if (self.connectionPool && typeof self.connectionPool.getStats === 'function') {
        enhancedStats.connectionPool = self.connectionPool.getStats();
      }

      callback(null, enhancedStats);
    });
  } else {
    // Create basic stats if internal storage doesn't support getStats
    const basicStats = {
      schemaPrefix:         self.schemaPrefix,
      collectionMapping:    self.collectionMapping,
      enableCrossDbQueries: self.enableCrossDbQueries,
      isDualDatabase:       !!self.database,
      hasConnectionPool:    !!self.connectionPool,
      ready:                self.ready,
    };

    // Add connection pool stats if available
    if (self.connectionPool && typeof self.connectionPool.getStats === 'function') {
      basicStats.connectionPool = self.connectionPool.getStats();
    }

    callback(null, basicStats);
  }
};

/**
 * Execute an operation with connection pool if beneficial
 */
ExpoSqliteStorage.prototype.withPooledConnection = function(operation, callback) {
  if (this.connectionPool) {
    this.connectionPool.withConnection(operation, callback);
  } else {
    // Fallback to main database connection
    if (!this.db) {
      return callback(new Error('Database not available'));
    }

    try {
      const result = operation(this.db);
      if (result && typeof result.then === 'function') {
        result.then(function(res) {
          callback(null, res);
        }).catch(callback);
      } else {
        callback(null, result);
      }
    } catch (error) {
      callback(error);
    }
  }
};

/**
 * Determine if an operation should use the connection pool
 */
ExpoSqliteStorage.prototype._shouldUsePool = function(operationType, recordCount) {
  if (!this.connectionPool) {
    return false;
  }

  // Use pool for operations that benefit from connection isolation
  const poolBeneficialOperations = [
    'bulk_read',        // Multiple document reads
    'bulk_write',       // Multiple document writes
    'cross_db_query',   // JOIN operations
    'analytics',        // Reporting queries
    'migration',         // Schema changes
  ];

  // Use pool for large batch operations
  const isBulkOperation = recordCount && recordCount > 5;

  return poolBeneficialOperations.includes(operationType) || isBulkOperation;
};

/**
 * Close the storage (connection pool is managed externally as an injected dependency)
 */
ExpoSqliteStorage.prototype.close = function(callback) {
  // Only close internal storage - connection pool is managed by the injector
  if (this._storage && typeof this._storage.close === 'function') {
    this._storage.close(callback);
  } else {
    callback && callback();
  }
};

// Export StandardSQLiteConnectionPool for convenience
ExpoSqliteStorage.StandardSQLiteConnectionPool = StandardSQLiteConnectionPool;
