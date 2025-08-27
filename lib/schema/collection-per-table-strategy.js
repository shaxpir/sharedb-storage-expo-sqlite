const BaseSchemaStrategy = require('./base-schema-strategy');
const logger = require('../logger');

/**
 * Schema strategy that creates a separate table for each collection.
 * This allows for:
 * - Collection-specific indexes
 * - Field-level encryption configuration per collection
 * - Optimized queries per collection
 * - Better performance for large collections
 */
module.exports = CollectionPerTableStrategy;
function CollectionPerTableStrategy(options) {
  BaseSchemaStrategy.call(this, options);
  this.useEncryption = options.useEncryption || false;
  this.encryptionCallback = options.encryptionCallback;
  this.decryptionCallback = options.decryptionCallback;

  // Collection-specific configuration
  // Example: {
  //   'users': {
  //     indexes: ['email', 'username'],
  //     encryptedFields: ['password', 'ssn']
  //   },
  //   'posts': {
  //     indexes: ['authorId', 'createdAt'],
  //     encryptedFields: []
  //   }
  // }
  this.collectionConfig = options.collectionConfig || {};

  // Track which tables have been created
  this.createdTables = {};
}

// Inherit from BaseSchemaStrategy
CollectionPerTableStrategy.prototype = Object.create(BaseSchemaStrategy.prototype);
CollectionPerTableStrategy.prototype.constructor = CollectionPerTableStrategy;

/**
 * Initialize the schema - creates meta table, inventory table, and any pre-configured collection tables
 */
CollectionPerTableStrategy.prototype.initializeSchema = async function(db, callback) {
  const strategy = this;

  try {
    // Create meta table with sharedb_ prefix
    await db.runAsync(
      'CREATE TABLE IF NOT EXISTS sharedb_meta (' +
      'id TEXT PRIMARY KEY, ' +
      'data JSON' +
      ')',
    ).promise();

    // Create inventory table with support for both numeric and string versions
    await db.runAsync(
      'CREATE TABLE IF NOT EXISTS sharedb_inventory (' +
      'collection TEXT NOT NULL, ' +
      'doc_id TEXT NOT NULL, ' +
      'version_num REAL, ' +  // For numeric versions
      'version_str TEXT, ' +   // For string versions (timestamps)
      'has_pending INTEGER NOT NULL DEFAULT 0, ' +
      'updated_at INTEGER, ' +
      'PRIMARY KEY (collection, doc_id)' +
      ')',
    ).promise();

    // Create indexes for inventory table
    await db.runAsync(
      'CREATE INDEX IF NOT EXISTS idx_inventory_collection ON sharedb_inventory (collection)',
    ).promise();
    
    await db.runAsync(
      'CREATE INDEX IF NOT EXISTS idx_inventory_updated ON sharedb_inventory (updated_at)',
    ).promise();

    // Create tables for any pre-configured collections
    const collections = Object.keys(this.collectionConfig);
    // Create tables for pre-configured collections
    
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      // Creating table for collection
      await this.createCollectionTable(db, collection);
    }

    // Schema initialization complete
    strategy.debug && logger.info('CollectionPerTableStrategy: Schema initialized');
    callback && callback();
  } catch (error) {
    console.error('Schema initialization error:', error);
    callback && callback(error);
  }
};

/**
 * Create a table for a specific collection with its indexes
 */
CollectionPerTableStrategy.prototype.createCollectionTable = async function(db, collection) {
  const strategy = this;
  const tableName = this.getTableName(collection);
  const config = this.collectionConfig[collection] || {};

  // Create the table first
  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS ' + tableName + ' (' +
    'id TEXT PRIMARY KEY, ' +
    'collection TEXT, ' +
    'data JSON' +
    ')',
  ).promise();
  
  // Create indexes sequentially after table is created
  if (config.indexes && config.indexes.length > 0) {
    for (let i = 0; i < config.indexes.length; i++) {
      const field = config.indexes[i];
      // Sanitize field name for index name (replace dots with underscores)
      const sanitizedField = field.replace(/\./g, '_');
      const indexName = tableName + '_' + sanitizedField + '_idx';
      // Use single quotes for JSON path in SQLite
      await db.runAsync(
        'CREATE INDEX IF NOT EXISTS ' + indexName + ' ON ' + tableName +
        ' (json_extract(data, \'$.' + field + '\'))',
      ).promise();
    }
  }
  
  strategy.createdTables[collection] = true;
  // Table created successfully
  strategy.debug && logger.info('CollectionPerTableStrategy: Created table for collection: ' + collection);
};

/**
 * Validate that required tables exist
 */
CollectionPerTableStrategy.prototype.validateSchema = function(db, callback) {
  const strategy = this;

  // Check meta table exists
  db.getFirstAsync(
      'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'sharedb_meta\'',
  ).then(function(result) {
    callback && callback(null, !!result);
  }).catch(function(error) {
    callback && callback(error, false);
  });
};

/**
 * Get table name for a collection
 */
CollectionPerTableStrategy.prototype.getTableName = function(collection) {
  if (collection === '__meta__') {
    return 'sharedb_meta';  // Use sharedb_ prefix for system tables to avoid collisions
  }
  if (collection === '__inventory__') {
    return 'sharedb_inventory';  // Use sharedb_ prefix for system tables to avoid collisions
  }
  // Sanitize collection name for use as table name (no prefix for user collections)
  return collection.replace(/[^a-zA-Z0-9_]/g, '_');
};

/**
 * Get sanitized column name for index fields (replace dots with underscores)
 */
CollectionPerTableStrategy.prototype.getColumnName = function(field) {
  return field.replace(/\./g, '_');
};

/**
 * Ensure a collection table exists before writing to it
 */
CollectionPerTableStrategy.prototype.ensureCollectionTable = function(db, collection, callback) {
  const strategy = this;

  if (this.createdTables[collection]) {
    callback && callback();
    return;
  }

  this.createCollectionTable(db, collection).then(function() {
    callback && callback();
  }).catch(function(error) {
    callback && callback(error);
  });
};

/**
 * Write records to collection-specific tables
 */
CollectionPerTableStrategy.prototype.writeRecords = function(db, recordsByType, callback) {
  const strategy = this;

  // Check if transactions are disabled (e.g., for testing)
  if (strategy.disableTransactions) {
    return strategy._writeRecordsWithoutTransaction(db, recordsByType, callback);
  }

  // Wrap all write operations in a transaction for performance
  strategy.debug && logger.info('CollectionPerTableStrategy: Starting transaction, recordsByType:', Object.keys(recordsByType));
  db.transaction(function(transactionAdapter, transactionCallback) {
    // Create async wrapper for the transaction adapter
    const transactionDb = {
      runAsync: function(sql, params) {
        return {
          promise: function() {
            return new Promise(function(resolve, reject) {
              transactionAdapter.run(sql, params || [], function(error, result) {
                if (error) reject(error);
                else resolve(result);
              });
            });
          }
        };
      }
    };
    
    const promises = [];
    let totalCount = 0;

    // Process docs records
    if (recordsByType.docs) {
      const docsRecords = Array.isArray(recordsByType.docs) ? recordsByType.docs : [recordsByType.docs];

      // Group records by collection
      const recordsByCollection = {};
      for (let i = 0; i < docsRecords.length; i++) {
        const record = docsRecords[i];
        if (!record.payload || !record.payload.collection) {
          throw new Error('CollectionPerTableStrategy: Record missing required collection field in payload: ' + JSON.stringify(record));
        }
        const collection = record.payload.collection;
        if (!recordsByCollection[collection]) {
          recordsByCollection[collection] = [];
        }
        recordsByCollection[collection].push(record);
      }

      // Write to each collection's table
      const collections = Object.keys(recordsByCollection);
      for (let j = 0; j < collections.length; j++) {
        var col = collections[j];
        var records = recordsByCollection[col];

        // Ensure table exists
        promises.push(
            new Promise(function(resolve, reject) {
              strategy.ensureCollectionTable(transactionDb, col, function(error) {
                if (error) {
                  reject(error);
                  return;
                }

                const tableName = strategy.getTableName(col);
                const writePromises = [];

                for (let k = 0; k < records.length; k++) {
                  let rec = records[k];
                  rec = strategy.encryptRecordForCollection(rec, col);
                  writePromises.push(transactionDb.runAsync(
                      'INSERT OR REPLACE INTO ' + tableName + ' (id, collection, data) VALUES (?, ?, ?)',
                      [rec.id, col, JSON.stringify(rec)],
                  ).promise());
                  
                  // Also update inventory for document tracking
                  const version = rec.payload && rec.payload.v || 1;
                  const hasPending = (rec.payload && (rec.payload.pendingOps || rec.payload.inflightOp)) ? 1 : 0;
                  
                  // Determine version type and use appropriate column
                  // Note: Version validation should be done before transaction starts
                  if (typeof version === 'string') {
                    writePromises.push(transactionDb.runAsync(
                        'INSERT OR REPLACE INTO sharedb_inventory (collection, doc_id, version_num, version_str, has_pending, updated_at) VALUES (?, ?, NULL, ?, ?, ?)',
                        [col, rec.id, version, hasPending, Date.now()],
                    ).promise());
                  } else {
                    writePromises.push(transactionDb.runAsync(
                        'INSERT OR REPLACE INTO sharedb_inventory (collection, doc_id, version_num, version_str, has_pending, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
                        [col, rec.id, version, hasPending, Date.now()],
                    ).promise());
                  }
                  
                  totalCount++;
                }

                Promise.all(writePromises).then(resolve).catch(reject);
              });
            }),
        );
      }
    }

    // Process meta records (always go to sharedb_meta table)
    if (recordsByType.meta) {
      const metaRecords = Array.isArray(recordsByType.meta) ? recordsByType.meta : [recordsByType.meta];
      for (let m = 0; m < metaRecords.length; m++) {
        const metaRecord = metaRecords[m];
        promises.push(transactionDb.runAsync(
            'INSERT OR REPLACE INTO sharedb_meta (id, data) VALUES (?, ?)',
            [metaRecord.id, JSON.stringify(metaRecord.payload)],
        ).promise());
        totalCount++;
      }
    }

    Promise.all(promises).then(function() {
      strategy.debug && logger.info('CollectionPerTableStrategy: Wrote ' + totalCount + ' records in transaction');
      transactionCallback && transactionCallback(null, totalCount);
    }).catch(function(error) {
      transactionCallback && transactionCallback(error);
    });
  }, function(error, result) {
    // This callback is called AFTER the transaction commits/rollsback
    if (callback) {
      callback(error, result);
    }
  });
};

/**
 * Write records without transaction wrapper (for testing or when transactions are disabled)
 */
CollectionPerTableStrategy.prototype._writeRecordsWithoutTransaction = function(db, recordsByType, callback) {
  const strategy = this;
  const promises = [];
  let totalCount = 0;

  // Process docs records
  if (recordsByType.docs) {
    const docsRecords = Array.isArray(recordsByType.docs) ? recordsByType.docs : [recordsByType.docs];

    // Group records by collection
    const recordsByCollection = {};
    for (let i = 0; i < docsRecords.length; i++) {
      const record = docsRecords[i];
      if (!record.payload || !record.payload.collection) {
        throw new Error('CollectionPerTableStrategy: Record missing required collection field in payload: ' + JSON.stringify(record));
      }
      const collection = record.payload.collection;
      if (!recordsByCollection[collection]) {
        recordsByCollection[collection] = [];
      }
      recordsByCollection[collection].push(record);
    }

    // Write to each collection's table
    const collections = Object.keys(recordsByCollection);
    for (let j = 0; j < collections.length; j++) {
      var col = collections[j];
      var records = recordsByCollection[col];

      // Ensure table exists
      promises.push(
          new Promise(function(resolve, reject) {
            strategy.ensureCollectionTable(db, col, function(error) {
              if (error) {
                reject(error);
                return;
              }

              const tableName = strategy.getTableName(col);
              const writePromises = [];

              for (let k = 0; k < records.length; k++) {
                let rec = records[k];
                rec = strategy.encryptRecordForCollection(rec, col);
                writePromises.push(db.runAsync(
                    'INSERT OR REPLACE INTO ' + tableName + ' (id, collection, data) VALUES (?, ?, ?)',
                    [rec.id, col, JSON.stringify(rec)],
                ).promise());
                
                // Also update inventory for document tracking
                const version = rec.payload && rec.payload.v || 1;
                const hasPending = (rec.payload && (rec.payload.pendingOps || rec.payload.inflightOp)) ? 1 : 0;
                
                // Determine version type and use appropriate column
                if (typeof version === 'string') {
                  writePromises.push(db.runAsync(
                      'INSERT OR REPLACE INTO sharedb_inventory (collection, doc_id, version_num, version_str, has_pending, updated_at) VALUES (?, ?, NULL, ?, ?, ?)',
                      [col, rec.id, version, hasPending, Date.now()],
                  ).promise());
                } else {
                  writePromises.push(db.runAsync(
                      'INSERT OR REPLACE INTO sharedb_inventory (collection, doc_id, version_num, version_str, has_pending, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
                      [col, rec.id, version, hasPending, Date.now()],
                  ).promise());
                }
                
                totalCount++;
              }

              Promise.all(writePromises).then(resolve).catch(reject);
            });
          }),
      );
    }
  }

  // Process meta records (always go to sharedb_meta table)
  if (recordsByType.meta) {
    const metaRecords = Array.isArray(recordsByType.meta) ? recordsByType.meta : [recordsByType.meta];
    for (let m = 0; m < metaRecords.length; m++) {
      const metaRecord = metaRecords[m];
      promises.push(db.runAsync(
          'INSERT OR REPLACE INTO sharedb_meta (id, data) VALUES (?, ?)',
          [metaRecord.id, JSON.stringify(metaRecord.payload)],
      ).promise());
      totalCount++;
    }
  }

  Promise.all(promises).then(function() {
    strategy.debug && logger.info('CollectionPerTableStrategy: Wrote ' + totalCount + ' records (no transaction)');
    callback && callback();
  }).catch(function(error) {
    callback && callback(error);
  });
};

/**
 * Read a single record from a collection-specific table
 */
CollectionPerTableStrategy.prototype.readRecord = function(db, type, collection, id, callback) {
  const strategy = this;

  if (type === 'meta') {
    db.getFirstAsync(
        'SELECT data FROM sharedb_meta WHERE id = ?',
        [id],
    ).then(function(row) {
      if (!row) {
        callback && callback(null, null);
        return;
      }
      const record = JSON.parse(row.data);
      callback && callback(null, record);
    }).catch(function(error) {
      callback && callback(error, null);
    });
  } else {
    // For docs, if collection is not specified or is 'docs', we need to find which table contains this document
    if (!collection || collection === 'docs') {
      // Look up the document's collection from the inventory
      strategy.debug && logger.info('CollectionPerTableStrategy: Looking up collection for doc ' + id);
      db.getFirstAsync(
          'SELECT collection FROM sharedb_inventory WHERE doc_id = ?',
          [id],
      ).then(function(inventoryRow) {
        if (!inventoryRow) {
          // Document not in inventory, it doesn't exist
          callback && callback(null, null);
          return;
        }
        
        // Now read from the correct collection table
        const actualCollection = inventoryRow.collection;
        const tableName = strategy.getTableName(actualCollection);
        
        // Nest the second query instead of chaining it
        db.getFirstAsync(
            'SELECT data FROM ' + tableName + ' WHERE id = ?',
            [id],
        ).then(function(row) {
          if (!row) {
            callback && callback(null, null);
            return;
          }

          let record = JSON.parse(row.data);
          record = strategy.decryptRecordForCollection(record, actualCollection);
          callback && callback(null, record);
        }).catch(function(error) {
          callback && callback(error, null);
        });
      }).catch(function(error) {
        callback && callback(error, null);
      });
    } else {
      // Collection is specified, read directly from that collection's table
      const tableName = this.getTableName(collection);

      // Check if table exists
      db.getFirstAsync(
          'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
          [tableName],
      ).then(function(tableExists) {
        if (!tableExists) {
          callback && callback(null, null);
          return;
        }

        return db.getFirstAsync(
            'SELECT data FROM ' + tableName + ' WHERE id = ?',
            [id],
        );
      }).then(function(row) {
        if (!row) {
          callback && callback(null, null);
          return;
        }

        let record = JSON.parse(row.data);
        record = strategy.decryptRecordForCollection(record, collection);
        callback && callback(null, record);
      }).catch(function(error) {
        callback && callback(error, null);
      });
    }
  }
};

/**
 * Read multiple records by ID in a single SQL query (bulk operation)
 * This leverages collection-specific tables and their indexes for optimal performance
 */
CollectionPerTableStrategy.prototype.readRecordsBulk = function(db, type, collection, ids, callback) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return callback && callback(null, []);
  }

  const strategy = this;

  if (type === 'meta') {
    // For meta records, use the meta table
    const placeholders = ids.map(function() {
      return '?';
    }).join(', ');
    const sql = 'SELECT id, data FROM sharedb_meta WHERE id IN (' + placeholders + ')';

    db.getAllAsync(sql, ids).then(function(rows) {
      const records = [];
      for (let i = 0; i < rows.length; i++) {
        const record = JSON.parse(rows[i].data);
        records.push({
          id:      rows[i].id,
          payload: record,
        });
      }

      strategy.debug && logger.info('CollectionPerTableStrategy: Bulk read ' + records.length + '/' + ids.length + ' meta records');
      callback && callback(null, records);
    }).catch(function(error) {
      callback && callback(error, null);
    });
  } else {
    // For docs, if collection is 'docs' we need to look up each document's actual collection
    if (collection === 'docs') {
      // Need to look up each document's collection from inventory
      const placeholders = ids.map(function() {
        return '?';
      }).join(', ');
      
      // First, get all documents' collections from inventory
      db.getAllAsync(
        'SELECT doc_id, collection FROM sharedb_inventory WHERE doc_id IN (' + placeholders + ')',
        ids
      ).then(function(inventoryRows) {
        if (!inventoryRows || inventoryRows.length === 0) {
          callback && callback(null, []);
          return;
        }
        
        // Group documents by collection for efficient querying
        const docsByCollection = {};
        for (let i = 0; i < inventoryRows.length; i++) {
          const row = inventoryRows[i];
          if (!docsByCollection[row.collection]) {
            docsByCollection[row.collection] = [];
          }
          docsByCollection[row.collection].push(row.doc_id);
        }
        
        // Query each collection's table
        const promises = [];
        const allRecords = [];
        
        Object.keys(docsByCollection).forEach(function(collectionName) {
          const collectionIds = docsByCollection[collectionName];
          const tableName = strategy.getTableName(collectionName);
          const placeholders = collectionIds.map(function() {
            return '?';
          }).join(', ');
          
          promises.push(
            db.getAllAsync(
              'SELECT id, data FROM ' + tableName + ' WHERE id IN (' + placeholders + ')',
              collectionIds
            ).then(function(rows) {
              for (let i = 0; i < rows.length; i++) {
                let record = JSON.parse(rows[i].data);
                // The parsed data likely has the structure: { id: ..., payload: ... }
                // We need to extract the actual payload
                const actualPayload = record.payload || record;
                const decryptedPayload = strategy.decryptRecordForCollection(actualPayload, collectionName);
                allRecords.push({
                  id: rows[i].id,
                  payload: decryptedPayload
                });
              }
            })
          );
        });
        
        Promise.all(promises).then(function() {
          strategy.debug && logger.info('CollectionPerTableStrategy: Bulk read ' + allRecords.length + '/' + ids.length + ' records from multiple collections');
          callback && callback(null, allRecords);
        }).catch(function(error) {
          strategy.debug && logger.error('CollectionPerTableStrategy: Error in bulk read from multiple collections: ' + error);
          callback && callback(error, null);
        });
      }).catch(function(error) {
        strategy.debug && logger.error('CollectionPerTableStrategy: Error reading inventory for bulk read: ' + error);
        callback && callback(error, null);
      });
      return;
    }
    
    // Collection is specified, use the collection-specific table with optimized queries
    const tableName = this.getTableName(collection);

    // Check if table exists first
    db.getFirstAsync(
        'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
        [tableName],
    ).then(function(tableExists) {
      if (!tableExists) {
        callback && callback(null, []);
        return;
      }

      // Use collection-specific table for optimized bulk read
      const placeholders = ids.map(function() {
        return '?';
      }).join(', ');

      // Check if we have indexed columns for this collection
      const config = strategy.collectionConfig[collection];
      const hasIndexes = config && config.indexes && config.indexes.length > 0;

      let sql;
      if (hasIndexes) {
        // Build optimized query that can leverage indexes
        // Select both indexed columns and data for maximum efficiency
        const indexColumns = config.indexes.map(function(index) {
          return strategy.getColumnName(index);
        }).join(', ');

        sql = 'SELECT id, ' + indexColumns + ', data FROM ' + tableName + ' WHERE id IN (' + placeholders + ')';
      } else {
        // Simple query without indexed columns
        sql = 'SELECT id, data FROM ' + tableName + ' WHERE id IN (' + placeholders + ')';
      }

      db.getAllAsync(sql, ids).then(function(rows) {
      if (!rows) {
        callback && callback(null, []);
        return;
      }

      const records = [];
      for (let i = 0; i < rows.length; i++) {
        let record = JSON.parse(rows[i].data);
        record = strategy.decryptRecordForCollection(record, collection);
        records.push({
          id:      rows[i].id,
          payload: record,
        });
      }

      strategy.debug && logger.info('CollectionPerTableStrategy: Bulk read ' + records.length + '/' + ids.length + ' records from ' + tableName);
      callback && callback(null, records);
    }).catch(function(error) {
      strategy.debug && logger.error('CollectionPerTableStrategy: Error in bulk read from ' + collection + ': ' + error);
      callback && callback(error, null);
    });
    }).catch(function(error) {
      strategy.debug && logger.error('CollectionPerTableStrategy: Error in bulk read from ' + collection + ': ' + error);
      callback && callback(error, null);
    });
  }
};

/**
 * Delete a record from a collection-specific table
 */
CollectionPerTableStrategy.prototype.deleteRecord = function(db, type, collection, id, callback) {
  const strategy = this;

  if (type === 'meta') {
    db.runAsync('DELETE FROM sharedb_meta WHERE id = ?', [id]).then(function() {
      strategy.debug && logger.info('CollectionPerTableStrategy: Deleted meta record ' + id);
      callback && callback();
    }).catch(function(error) {
      callback && callback(error);
    });
  } else {
    // For docs, if collection is 'docs' we need to look up the document's actual collection
    if (collection === 'docs') {
      // Look up the document's collection from the inventory
      db.getFirstAsync(
        'SELECT collection FROM sharedb_inventory WHERE doc_id = ?',
        [id]
      ).then(function(inventoryRow) {
        if (!inventoryRow) {
          // Document not in inventory, nothing to delete
          callback && callback();
          return;
        }
        
        // Delete from the correct collection table
        const actualCollection = inventoryRow.collection;
        const tableName = strategy.getTableName(actualCollection);
        
        db.runAsync('DELETE FROM ' + tableName + ' WHERE id = ?', [id]).then(function() {
          // Also delete from inventory
          return db.runAsync('DELETE FROM sharedb_inventory WHERE doc_id = ?', [id]);
        }).then(function() {
          strategy.debug && logger.info('CollectionPerTableStrategy: Deleted record ' + id + ' from ' + tableName + ' and inventory');
          callback && callback();
        }).catch(function(error) {
          callback && callback(error);
        });
      }).catch(function(error) {
        callback && callback(error);
      });
      return;
    }
    
    // Collection is specified
    const tableName = this.getTableName(collection);

    // Check if table exists before trying to delete
    db.getFirstAsync(
        'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
        [tableName],
    ).then(function(tableExists) {
      if (!tableExists) {
        callback && callback();
        return;
      }

      db.runAsync('DELETE FROM ' + tableName + ' WHERE id = ?', [id]).then(function() {
        // Also delete from inventory
        return db.runAsync('DELETE FROM sharedb_inventory WHERE doc_id = ?', [id]);
      }).then(function() {
        strategy.debug && logger.info('CollectionPerTableStrategy: Deleted record ' + id + ' from ' + tableName + ' and inventory');
        callback && callback();
      }).catch(function(error) {
        callback && callback(error);
      });
    }).catch(function(error) {
      callback && callback(error);
    });
  }
};

/**
 * Encrypt specific fields for a collection based on configuration
 */
CollectionPerTableStrategy.prototype.encryptRecordForCollection = function(record, collection) {
  if (!this.useEncryption || !this.encryptionCallback) {
    return record;
  }

  const config = this.collectionConfig[collection] || {};
  const encryptedFields = config.encryptedFields || [];

  if (encryptedFields.length === 0) {
    // No field-level encryption, encrypt entire payload
    return {
      id:                record.id,
      collection:        collection,
      encrypted_payload: this.encryptionCallback(JSON.stringify(record.payload)),
    };
  }

  // Field-level encryption
  const payload = Object.assign({}, record.payload);
  const encryptedData = {};

  for (let i = 0; i < encryptedFields.length; i++) {
    const field = encryptedFields[i];
    if (payload[field] !== undefined) {
      encryptedData[field] = this.encryptionCallback(JSON.stringify(payload[field]));
      delete payload[field];
    }
  }

  return {
    id:               record.id,
    collection:       collection,
    payload:          payload,
    encrypted_fields: encryptedData,
  };
};

/**
 * Decrypt specific fields for a collection based on configuration
 */
CollectionPerTableStrategy.prototype.decryptRecordForCollection = function(record, collection) {
  if (!this.useEncryption || !this.decryptionCallback) {
    return record;
  }

  // Handle full payload encryption
  if (record.encrypted_payload) {
    return {
      id:         record.id,
      collection: collection,
      payload:    JSON.parse(this.decryptionCallback(record.encrypted_payload)),
    };
  }

  // Handle field-level encryption
  if (record.encrypted_fields) {
    const payload = Object.assign({}, record.payload);
    const encryptedFields = Object.keys(record.encrypted_fields);

    for (let i = 0; i < encryptedFields.length; i++) {
      const field = encryptedFields[i];
      payload[field] = JSON.parse(this.decryptionCallback(record.encrypted_fields[field]));
    }

    return {
      id:         record.id,
      collection: collection,
      payload:    payload,
    };
  }

  return record;
};

/**
 * Get inventory type - table-based for better performance
 */
CollectionPerTableStrategy.prototype.getInventoryType = function() {
  return 'table';
};

/**
 * Initialize inventory table (already created in initializeSchema)
 */
CollectionPerTableStrategy.prototype.initializeInventory = function(db, callback) {
  // Inventory table is created in initializeSchema
  // Return an empty inventory structure for compatibility
  callback && callback(null, {
    id:      'inventory',
    payload: {collections: {}},
  });
};

/**
 * Read the entire inventory from the table
 */
CollectionPerTableStrategy.prototype.readInventory = function(db, callback) {
  db.getAllAsync(
      'SELECT collection, doc_id, version_num, version_str, has_pending FROM sharedb_inventory ORDER BY collection, doc_id',
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
      id:      'inventory',
      payload: inventory,
    });
  }).catch(function(error) {
    callback && callback(error, null);
  });
};

/**
 * Update inventory using efficient table operations
 */
CollectionPerTableStrategy.prototype.updateInventoryItem = function(db, collection, docId, version, operation, callback) {
  const strategy = this;
  const now = Date.now();

  if (operation === 'add' || operation === 'update') {
    // First check if document exists and validate version consistency
    db.getFirstAsync(
      'SELECT version_num, version_str FROM sharedb_inventory WHERE collection = ? AND doc_id = ?',
      [collection, docId]
    ).then(function(existing) {
      // Check for version type consistency
      if (existing) {
        const existingIsString = (existing.version_str !== null);
        const newIsString = (typeof version === 'string');
        
        if (existingIsString !== newIsString) {
          const error = new Error(
            'Version type mismatch: Cannot store ' + collection + '/' + docId + 
            ' with ' + typeof version + ' version ' + version + 
            ' when existing version is ' + (existingIsString ? 'string' : 'number') + 
            ' (version type must remain consistent)'
          );
          callback && callback(error);
          return;
        }
        
        // Check for version regression
        const existingVersion = existingIsString ? existing.version_str : existing.version_num;
        if (existingIsString) {
          // String comparison (lexicographic)
          if (version < existingVersion) {
            const error = new Error(
              'Version regression detected: Cannot store ' + collection + '/' + docId + 
              ' with version ' + version + ' when version ' + existingVersion + 
              ' already exists (versions must increase or remain the same)'
            );
            callback && callback(error);
            return;
          }
        } else {
          // Numeric comparison
          if (version < existingVersion) {
            const error = new Error(
              'Version regression detected: Cannot store ' + collection + '/' + docId + 
              ' with version ' + version + ' when version ' + existingVersion + 
              ' already exists (versions must increase or remain the same)'
            );
            callback && callback(error);
            return;
          }
        }
      }
      
      // Insert or update with appropriate version column
      let sql, params;
      if (typeof version === 'string') {
        sql = 'INSERT OR REPLACE INTO sharedb_inventory (collection, doc_id, version_num, version_str, has_pending, updated_at) VALUES (?, ?, NULL, ?, 0, ?)';
        params = [collection, docId, version, now];
      } else {
        sql = 'INSERT OR REPLACE INTO sharedb_inventory (collection, doc_id, version_num, version_str, has_pending, updated_at) VALUES (?, ?, ?, NULL, 0, ?)';
        params = [collection, docId, version, now];
      }
      
      return db.runAsync(sql, params);
    }).then(function() {
      strategy.debug && logger.info('CollectionPerTableStrategy: Updated inventory for ' + collection + '/' + docId);
      callback && callback();
    }).catch(function(error) {
      callback && callback(error);
    });
  } else if (operation === 'remove') {
    // Delete inventory item
    db.runAsync(
        'DELETE FROM sharedb_inventory WHERE collection = ? AND doc_id = ?',
        [collection, docId],
    ).then(function() {
      strategy.debug && logger.info('CollectionPerTableStrategy: Removed inventory for ' + collection + '/' + docId);
      callback && callback();
    }).catch(function(error) {
      callback && callback(error);
    });
  } else {
    callback && callback(new Error('Invalid inventory operation: ' + operation));
  }
};

/**
 * Get inventory stats for a collection (bonus method for table-based approach)
 */
CollectionPerTableStrategy.prototype.getCollectionStats = function(db, collection, callback) {
  db.getFirstAsync(
      'SELECT COUNT(*) as count, MAX(version) as maxVersion FROM inventory WHERE collection = ?',
      [collection],
  ).then(function(row) {
    callback && callback(null, {
      documentCount: row.count || 0,
      maxVersion:    row.maxVersion || 0,
    });
  }).catch(function(error) {
    callback && callback(error, null);
  });
};

/**
 * Delete all tables created by this schema strategy
 */
CollectionPerTableStrategy.prototype.deleteAllTables = function(db, callback) {
  const strategy = this;
  const promises = [];

  // Drop the standard meta and inventory tables
  promises.push(db.runAsync('DROP TABLE IF EXISTS sharedb_meta'));
  promises.push(db.runAsync('DROP TABLE IF EXISTS sharedb_inventory'));

  // Get all collection-specific table names and drop them
  db.getAllAsync(
      'SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT IN (\'sharedb_meta\', \'sharedb_inventory\'))',
  ).then(function(tables) {
    // Drop each collection table
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].name;
      // Skip system tables
      if (tableName.startsWith('sqlite_')) continue;
      promises.push(db.runAsync('DROP TABLE IF EXISTS ' + tableName));
    }

    return Promise.all(promises.map(function(p) {
      return p.promise();
    }));
  }).then(function() {
    strategy.debug && logger.info('CollectionPerTableStrategy: Deleted all tables');
    callback && callback();
  }).catch(function(err) {
    callback && callback(err);
  });
};
