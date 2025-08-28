const logger = require('./logger');
const DefaultSchemaStrategy = require('./schema/default-schema-strategy');

/**
 * SQLite storage implementation that works with pluggable database adapters.
 * This allows the same storage code to work in React Native environments
 * and Node.js (better-sqlite3/sqlite3) environments for testing.
 *
 * @param options A map of options that can be used to configure the SqliteStorage
 *
 * options.adapter (required): Database adapter instance (ExpoSqliteAdapter or NodeSqliteAdapter)
 *
 * options.schemaStrategy (optional): Schema strategy instance that defines how data
 * is organized in the database. If not provided, uses DefaultSchemaStrategy.
 *
 * options.dbFileName (optional): Database file name. Defaults to 'sharedb.db'
 *
 * options.dbFileDir (optional): Directory for database file
 *
 * options.debug (optional): Determines whether logging messages should be emitted.
 */
module.exports = SqliteStorage;
function SqliteStorage(options) {
  if (!options || !options.adapter) {
    throw new Error('SqliteStorage requires a database adapter');
  }

  this.adapter = options.adapter;
  this.dbFileName = options.dbFileName || 'sharedb.db';
  this.dbFileDir = options.dbFileDir;
  this.debug = options.debug || false;
  this.ready = false;

  // Store dual-database options
  // schemaPrefix is optional - use empty string if not provided  
  this.schemaPrefix = options.schemaPrefix ? options.schemaPrefix : '';
  this.collectionMapping = options.collectionMapping;

  // Use provided schema strategy or create default one
  if (options.schemaStrategy) {
    this.schemaStrategy = options.schemaStrategy;
  } else {
    // Create DefaultSchemaStrategy with backward-compatible options
    this.schemaStrategy = new DefaultSchemaStrategy({
      useEncryption:      options.useEncryption || false,
      encryptionCallback: options.encryptionCallback,
      decryptionCallback: options.decryptionCallback,
      schemaPrefix:       this.schemaPrefix,
      collectionMapping:  this.collectionMapping,
      debug:              this.debug,
    });
  }
}

/**
 * Initialize the storage and its schema
 */
SqliteStorage.prototype.initialize = function(onReadyCallback) {
  const storage = this;
  const start = Date.now();

  // Initialize database

  // Connect to database using the new Promise-based adapter interface
  this.adapter.connect().then(function() {
    // Database connected, initialize schema

    // Store reference to db (adapter should already have it set)
    storage.db = storage.adapter.db;

    // Create adapter wrapper that matches the schema strategy's expected interface
    const dbWrapper = storage._createDbWrapper();

    // Initialize schema using the strategy
    storage.schemaStrategy.initializeSchema(dbWrapper, function(err) {
      if (err) {
        console.error('Error initializing schema:', err);
        return onReadyCallback(err);
      }

      // Schema initialized, now initialize inventory
      const duration = Date.now() - start;
      storage.debug && logger.info('SqliteStorage: Initialized in ' + duration + ' millis');

      // Initialize inventory using the strategy
      storage.schemaStrategy.initializeInventory(dbWrapper, function(err2, inventory) {
        if (err2) {
          console.error('Error initializing inventory:', err2);
          return onReadyCallback(err2);
        }

        // Storage initialization complete
        storage.ready = true;
        onReadyCallback(null, inventory);
      });
    });
  }).catch(function(error) {
    console.error('Error connecting to database:', error);
    return onReadyCallback(error);
  });
};

/**
 * Create a wrapper that exposes the adapter's Promise-based interface
 * to schema strategies (adapters already provide the correct interface)
 */
SqliteStorage.prototype._createDbWrapper = function() {
  const adapter = this.adapter;

  return {
    // New adapters return Promises directly, but schema strategies expect { promise: function() {...} }
    runAsync: function(sql, params) {
      return {
        promise: function() {
          return adapter.runAsync(sql, params);
        }
      };
    },

    // New adapters return Promises directly, schema strategies call .then() directly
    getFirstAsync: function(sql, params) {
      return adapter.getFirstAsync(sql, params);
    },

    // New adapters return Promises directly, schema strategies call .then() directly
    getAllAsync: function(sql, params) {
      return adapter.getAllAsync(sql, params);
    },

    // New adapters return Promises directly for transactions
    transaction: function(operations) {
      return adapter.transaction(operations);
    },
  };
};

/**
 * Ensure the storage is ready before operations
 */
SqliteStorage.prototype.ensureReady = function() {
  if (!this.ready || !this.adapter) {
    const message = 'SqliteStorage has not been initialized or has been closed';
    this.logError(message);
    throw new Error(message);
  }
};

/**
 * Check if ready
 */
SqliteStorage.prototype.isReady = function() {
  return this.ready;
};

/**
 * Write records using the schema strategy
 */
SqliteStorage.prototype.writeRecords = function(recordsByType, callback) {
  this.ensureReady();
  const dbWrapper = this._createDbWrapper();
  this.schemaStrategy.writeRecords(dbWrapper, recordsByType, callback);
};

/**
 * Read a record using the schema strategy
 */
SqliteStorage.prototype.readRecord = function(storeName, recordId, callback) {
  this.ensureReady();

  // Determine type and collection from storeName
  const type = storeName === 'meta' ? 'meta' : 'docs';
  const collection = storeName === 'meta' ? null : storeName;

  const dbWrapper = this._createDbWrapper();
  
  try {
    let callbackCalled = false;
    this.schemaStrategy.readRecord(dbWrapper, type, collection, recordId, function(error, record) {
      if (callbackCalled) {
        console.error('[SqliteStorage.readRecord] WARNING: Callback called multiple times for', recordId);
        return;
      }
      callbackCalled = true;
      
      if (error) {
        console.error('Error reading record:', error);
        // Return null payload for errors to maintain consistent callback signature
        callback(null);
        return;
      }

      // Return just the payload for backward compatibility
      const payload = record ? record.payload : null;
      callback(payload);
    });
  } catch (err) {
    console.error('Error reading record:', err);
    // Return null payload for errors to maintain consistent callback signature
    callback(null);
  }
};

/**
 * Read all records from a store
 */
SqliteStorage.prototype.readAllRecords = function(storeName, filter, callback) {
  // Handle case where filter is omitted (2-parameter call)
  if (typeof filter === 'function' && callback === undefined) {
    callback = filter;
    filter = null;
  }
  
  this.ensureReady();

  // Determine type and collection from storeName
  const type = storeName === 'meta' ? 'meta' : 'docs';
  const collection = storeName === 'meta' ? null : storeName;

  const dbWrapper = this._createDbWrapper();
  // Note: filter parameter not currently used by schema strategies, 
  // but kept for interface compatibility
  this.schemaStrategy.readAllRecords(dbWrapper, type, collection, callback);
};

/**
 * Read multiple records by ID from a store in a single operation
 */
SqliteStorage.prototype.readRecordsBulk = function(storeName, recordIds, callback) {
  this.ensureReady();

  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return callback(null, []);
  }

  // Determine type and collection from storeName
  const type = storeName === 'meta' ? 'meta' : 'docs';
  const collection = storeName === 'meta' ? null : storeName;

  const dbWrapper = this._createDbWrapper();

  // Check if schema strategy supports bulk operations
  if (this.schemaStrategy.readRecordsBulk) {
    this.schemaStrategy.readRecordsBulk(dbWrapper, type, collection, recordIds, callback);
  } else {
    // Fallback to individual reads using our readRecord method
    // This ensures proper callback handling and avoids duplicate calls
    const records = [];
    let remaining = recordIds.length;
    let hasError = false;

    for (let i = 0; i < recordIds.length; i++) {
      (function(recordId) {
        // Use this.readRecord instead of calling schemaStrategy directly
        // This prevents duplicate calls when DurableStore also has fallback logic
        this.readRecord(storeName, recordId, function(payload) {
          if (hasError) return;

          // readRecord only passes the payload (or null), not an error
          if (payload) {
            records.push({
              id: recordId,
              payload: payload
            });
          }

          remaining--;
          if (remaining === 0) {
            callback(null, records);
          }
        });
      }.bind(this))(recordIds[i]);
    }
  }
};

/**
 * Delete a record using the schema strategy
 */
SqliteStorage.prototype.deleteRecord = function(storeName, recordId, callback) {
  this.ensureReady();

  // Determine type and collection from storeName
  const type = storeName === 'meta' ? 'meta' : 'docs';
  const collection = storeName === 'meta' ? null : storeName;

  const dbWrapper = this._createDbWrapper();
  this.schemaStrategy.deleteRecord(dbWrapper, type, collection, recordId, callback);
};

/**
 * Update inventory using the schema strategy
 */
SqliteStorage.prototype.updateInventory = function(collection, docId, version, operation, callback) {
  this.ensureReady();
  const dbWrapper = this._createDbWrapper();
  this.schemaStrategy.updateInventoryItem(dbWrapper, collection, docId, version, operation, callback);
};

/**
 * Read inventory using the schema strategy
 */
SqliteStorage.prototype.readInventory = function(callback) {
  this.ensureReady();
  const dbWrapper = this._createDbWrapper();
  this.schemaStrategy.readInventory(dbWrapper, callback);
};

/**
 * Close the database
 */
SqliteStorage.prototype.close = function(callback) {
  const storage = this;
  if (this.adapter && this.ready) {
    this.ready = false; // Set not ready first to prevent new operations
    this.adapter.disconnect().then(function() {
      storage.adapter = null; // Clear adapter reference
      callback && callback();
    }).catch(function(error) {
      storage.adapter = null; // Clear adapter reference even on error
      callback && callback(error);
    });
  } else {
    callback && callback();
  }
};

/**
 * Delete all database tables
 */
SqliteStorage.prototype.deleteDatabase = function(callback) {
  this.ensureReady();

  // Delegate to schema strategy to delete all tables it created
  const dbWrapper = this._createDbWrapper();
  this.schemaStrategy.deleteAllTables(dbWrapper, function(err) {
    if (err) {
      callback && callback(err);
    } else {
      callback && callback();
    }
  });
};

SqliteStorage.prototype.log = function(message) {
  this.debug && logger.info('SqliteStorage: ' + message);
};

SqliteStorage.prototype.logError = function(message) {
  logger.error('SqliteStorage: ' + message);
};

/**
 * Get statistics about the storage
 */
SqliteStorage.prototype.getStats = function(callback) {
  const stats = {
    ready: this.ready,
    dbFileName: this.dbFileName,
    dbFileDir: this.dbFileDir,
    schemaStrategy: this.schemaStrategy ? this.schemaStrategy.constructor.name : 'unknown',
    adapter: this.adapter ? this.adapter.constructor.name : 'unknown'
  };
  
  callback(null, stats);
};

/**
 * Flush control methods for optimizing bulk write operations
 * These methods are typically used by DurableStore for batching writes
 */
SqliteStorage.prototype.setAutoBatchEnabled = function(enabled) {
  // SqliteStorage doesn't implement batching itself - this is a pass-through for compatibility
  // Real batching happens at the DurableStore level above this
  this._autoBatchEnabled = enabled;
};

SqliteStorage.prototype.isAutoBatchEnabled = function() {
  return this._autoBatchEnabled !== false; // Default to true
};

SqliteStorage.prototype.flush = function() {
  // SqliteStorage doesn't implement batching itself - this is a no-op for compatibility
  // Real flushing happens at the DurableStore level above this
};
