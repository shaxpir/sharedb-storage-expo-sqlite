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
  this.schemaPrefix = options.schemaPrefix || '';
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

  // Open database using the adapter
  this.adapter.openDatabase(this.dbFileName, {}, this.dbFileDir, function(error, db) {
    if (error) {
      console.error('Error opening database:', error);
      throw error;
    }

    // Store reference to db (adapter should already have it set)
    storage.db = storage.adapter.db;

    // Create adapter wrapper that matches the schema strategy's expected interface
    const dbWrapper = storage._createDbWrapper();

    // Initialize schema using the strategy
    storage.schemaStrategy.initializeSchema(dbWrapper, function(err) {
      if (err) {
        console.error('Error initializing schema:', err);
        throw err;
      }

      const duration = Date.now() - start;
      storage.debug && logger.info('SqliteStorage: Initialized in ' + duration + ' millis');

      // Initialize inventory using the strategy
      storage.schemaStrategy.initializeInventory(dbWrapper, function(err2, inventory) {
        if (err2) {
          console.error('Error initializing inventory:', err2);
          throw err2;
        }

        storage.ready = true;
        onReadyCallback(inventory);
      });
    });
  });
};

/**
 * Create a wrapper that adapts our callback-based adapter to the
 * promise-based interface expected by schema strategies
 */
SqliteStorage.prototype._createDbWrapper = function() {
  const adapter = this.adapter;

  return {
    // Wrap run to return a promise-like object
    runAsync: function(sql, params) {
      return {
        promise: function() {
          return new Promise(function(resolve, reject) {
            adapter.run(sql, params || [], function(error, result) {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            });
          });
        },
        then: function(onSuccess, onError) {
          adapter.run(sql, params || [], function(error, result) {
            if (error) {
              onError && onError(error);
            } else {
              onSuccess && onSuccess(result);
            }
          });
        },
        catch: function(onError) {
          adapter.run(sql, params || [], function(error, result) {
            if (error) {
              onError && onError(error);
            }
          });
        },
      };
    },

    // Wrap get to return a promise-like object
    getFirstAsync: function(sql, params) {
      return {
        promise: function() {
          return new Promise(function(resolve, reject) {
            adapter.get(sql, params || [], function(error, row) {
              if (error) {
                reject(error);
              } else {
                resolve(row);
              }
            });
          });
        },
        then: function(onSuccess, onError) {
          return new Promise(function(resolve, reject) {
            adapter.get(sql, params || [], function(error, row) {
              if (error) {
                if (onError) {
                  try {
                    const errorResult = onError(error);
                    resolve(errorResult);
                  } catch (e) {
                    reject(e);
                  }
                } else {
                  reject(error);
                }
              } else {
                if (onSuccess) {
                  try {
                    const result = onSuccess(row);
                    // Handle chained promises
                    if (result && typeof result.then === 'function') {
                      result.then(resolve).catch(reject);
                    } else {
                      resolve(result);
                    }
                  } catch (e) {
                    reject(e);
                  }
                } else {
                  resolve(row);
                }
              }
            });
          });
        },
        catch: function(onError) {
          adapter.get(sql, params || [], function(error, row) {
            if (error) {
              onError && onError(error);
            }
          });
          return this;
        },
      };
    },

    // Wrap all to return a promise-like object
    getAllAsync: function(sql, params) {
      return {
        promise: function() {
          return new Promise(function(resolve, reject) {
            adapter.all(sql, params || [], function(error, rows) {
              if (error) {
                reject(error);
              } else {
                resolve(rows);
              }
            });
          });
        },
        then: function(onSuccess, onError) {
          return new Promise(function(resolve, reject) {
            adapter.all(sql, params || [], function(error, rows) {
              if (error) {
                if (onError) {
                  try {
                    const errorResult = onError(error);
                    resolve(errorResult);
                  } catch (e) {
                    reject(e);
                  }
                } else {
                  reject(error);
                }
              } else {
                if (onSuccess) {
                  try {
                    const result = onSuccess(rows);
                    // Handle chained promises
                    if (result && typeof result.then === 'function') {
                      result.then(resolve).catch(reject);
                    } else {
                      resolve(result);
                    }
                  } catch (e) {
                    reject(e);
                  }
                } else {
                  resolve(rows);
                }
              }
            });
          });
        },
        catch: function(onError) {
          adapter.all(sql, params || [], function(error, rows) {
            if (error) {
              onError && onError(error);
            }
          });
        },
      };
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
  this.schemaStrategy.readRecord(dbWrapper, type, collection, recordId, function(error, record) {
    if (error) {
      console.error('Error reading record:', error);
      callback(null);
      return;
    }

    // Return just the payload for backward compatibility
    callback(record ? record.payload : null);
  });
};

/**
 * Read all records from a store
 */
SqliteStorage.prototype.readAllRecords = function(storeName, callback) {
  this.ensureReady();

  // Determine type and collection from storeName
  const type = storeName === 'meta' ? 'meta' : 'docs';
  const collection = storeName === 'meta' ? null : storeName;

  const dbWrapper = this._createDbWrapper();
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
    // Fallback to individual reads
    const records = [];
    let remaining = recordIds.length;
    let hasError = false;

    for (let i = 0; i < recordIds.length; i++) {
      (function(recordId) {
        this.schemaStrategy.readRecord(dbWrapper, type, collection, recordId, function(error, record) {
          if (hasError) return;

          if (error) {
            hasError = true;
            return callback(error);
          }

          if (record) {
            records.push(record);
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
    this.adapter.closeDatabase(function(error) {
      storage.adapter = null; // Clear adapter reference
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
