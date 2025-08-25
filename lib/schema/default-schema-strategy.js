const BaseSchemaStrategy = require('./base-schema-strategy');
const logger = require('../logger');

/**
 * Default schema strategy that implements the original ShareDB storage pattern:
 * - Single 'docs' table for all document collections
 * - Single 'meta' table for inventory and metadata
 * - All-or-nothing encryption (entire payload encrypted)
 */
module.exports = DefaultSchemaStrategy;
function DefaultSchemaStrategy(options) {
  BaseSchemaStrategy.call(this, options);
  this.useEncryption = options.useEncryption || false;
  this.encryptionCallback = options.encryptionCallback;
  this.decryptionCallback = options.decryptionCallback;
}

// Inherit from BaseSchemaStrategy
DefaultSchemaStrategy.prototype = Object.create(BaseSchemaStrategy.prototype);
DefaultSchemaStrategy.prototype.constructor = DefaultSchemaStrategy;

/**
 * Initialize the default schema with 'docs' and 'meta' tables
 */
DefaultSchemaStrategy.prototype.initializeSchema = function(db, callback) {
  const strategy = this;
  const promises = [];

  // Create docs table
  promises.push(db.runAsync(
      'CREATE TABLE IF NOT EXISTS docs (' +
      'id TEXT PRIMARY KEY, ' +
      'data JSON' +
    ')',
  ).promise());

  // Create meta table
  promises.push(db.runAsync(
      'CREATE TABLE IF NOT EXISTS meta (' +
      'id TEXT PRIMARY KEY, ' +
      'data JSON' +
    ')',
  ).promise());

  Promise.all(promises).then(function() {
    strategy.debug && logger.info('DefaultSchemaStrategy: Schema initialized');
    callback && callback();
  }).catch(function(error) {
    callback && callback(error);
  });
};

/**
 * Validate that the schema exists
 */
DefaultSchemaStrategy.prototype.validateSchema = function(db, callback) {
  const promises = [];

  // Check if tables exist
  promises.push(db.getFirstAsync(
      'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'docs\'',
  ).promise());

  promises.push(db.getFirstAsync(
      'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'meta\'',
  ).promise());

  Promise.all(promises).then(function(results) {
    const isValid = results[0] && results[1];
    callback && callback(null, isValid);
  }).catch(function(error) {
    callback && callback(error, false);
  });
};

/**
 * Get table name - always 'docs' for documents, 'meta' for metadata
 */
DefaultSchemaStrategy.prototype.getTableName = function(collection) {
  // In default strategy, all docs go in 'docs' table regardless of collection
  return collection === '__meta__' ? 'meta' : 'docs';
};

/**
 * Validate and sanitize table name to prevent SQL injection
 */
DefaultSchemaStrategy.prototype.validateTableName = function(tableName) {
  if (tableName !== 'docs' && tableName !== 'meta') {
    throw new Error('Invalid table name: ' + tableName + '. Must be "docs" or "meta"');
  }
  return tableName;
};

/**
 * Write records using the default schema
 */
DefaultSchemaStrategy.prototype.writeRecords = function(db, recordsByType, callback) {
  const strategy = this;
  const promises = [];
  let totalCount = 0;

  // Process docs records
  if (recordsByType.docs) {
    const docsRecords = Array.isArray(recordsByType.docs) ? recordsByType.docs : [recordsByType.docs];
    for (let i = 0; i < docsRecords.length; i++) {
      let record = docsRecords[i];
      record = strategy.maybeEncryptRecord(record);
      promises.push(db.runAsync(
          'INSERT OR REPLACE INTO docs (id, data) VALUES (?, ?)',
          [record.id, JSON.stringify(record)],
      ).promise());
      totalCount++;
    }
  }

  // Process meta records
  if (recordsByType.meta) {
    const metaRecords = Array.isArray(recordsByType.meta) ? recordsByType.meta : [recordsByType.meta];
    for (let j = 0; j < metaRecords.length; j++) {
      const metaRecord = metaRecords[j];
      // Meta records are not encrypted in the default strategy
      promises.push(db.runAsync(
          'INSERT OR REPLACE INTO meta (id, data) VALUES (?, ?)',
          [metaRecord.id, JSON.stringify(metaRecord.payload)],
      ).promise());
      totalCount++;
    }
  }

  Promise.all(promises).then(function() {
    strategy.debug && logger.info('DefaultSchemaStrategy: Wrote ' + totalCount + ' records');
    callback && callback();
  }).catch(function(error) {
    callback && callback(error);
  });
};

/**
 * Read a single record
 */
DefaultSchemaStrategy.prototype.readRecord = function(db, type, collection, id, callback) {
  const strategy = this;
  const tableName = type === 'meta' ? 'meta' : 'docs';

  db.getFirstAsync(
      'SELECT data FROM ' + tableName + ' WHERE id = ?',
      [id],
  ).then(function(row) {
    if (!row) {
      callback && callback(null, null);
      return;
    }

    let record = JSON.parse(row.data);

    // Decrypt if needed (only for docs, not meta)
    if (type === 'docs' && strategy.useEncryption && record.encrypted_payload) {
      record = strategy.maybeDecryptRecord(record);
    }

    callback && callback(null, record);
  }).catch(function(error) {
    callback && callback(error, null);
  });
};

/**
 * Read all records of a type
 */
DefaultSchemaStrategy.prototype.readAllRecords = function(db, type, collection, callback) {
  const strategy = this;
  const tableName = type === 'meta' ? 'meta' : 'docs';

  db.getAllAsync(
      'SELECT id, data FROM ' + tableName,
  ).then(function(rows) {
    const records = [];
    for (let i = 0; i < rows.length; i++) {
      let record = JSON.parse(rows[i].data);

      // Decrypt if needed (only for docs, not meta)
      if (type === 'docs' && strategy.useEncryption && record.encrypted_payload) {
        record = strategy.maybeDecryptRecord(record);
      }

      records.push({
        id:      rows[i].id,
        payload: record.payload || record,
      });
    }

    callback && callback(null, records);
  }).catch(function(error) {
    callback && callback(error, null);
  });
};

/**
 * Read multiple records by ID in a single SQL query (bulk operation)
 */
DefaultSchemaStrategy.prototype.readRecordsBulk = function(db, type, collection, ids, callback) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return callback && callback(null, []);
  }

  const strategy = this;
  const tableName = type === 'meta' ? 'meta' : 'docs';

  // Create placeholders for the IN clause (?, ?, ?, ...)
  const placeholders = ids.map(function() {
    return '?';
  }).join(', ');
  const sql = 'SELECT id, data FROM ' + tableName + ' WHERE id IN (' + placeholders + ')';

  db.getAllAsync(sql, ids).then(function(rows) {
    const records = [];

    for (let i = 0; i < rows.length; i++) {
      let record = JSON.parse(rows[i].data);

      // Decrypt if needed (only for docs, not meta)
      if (type === 'docs' && strategy.useEncryption && record.encrypted_payload) {
        record = strategy.maybeDecryptRecord(record);
      }

      records.push({
        id:      rows[i].id,
        payload: record.payload || record,
      });
    }

    strategy.debug && logger.info('DefaultSchemaStrategy: Bulk read ' + records.length + '/' + ids.length + ' records from ' + tableName);
    callback && callback(null, records);
  }).catch(function(error) {
    strategy.debug && logger.error('DefaultSchemaStrategy: Error in bulk read from ' + tableName + ': ' + error);
    callback && callback(error, null);
  });
};

/**
 * Delete a record
 */
DefaultSchemaStrategy.prototype.deleteRecord = function(db, type, collection, id, callback) {
  const strategy = this;
  const tableName = type === 'meta' ? 'meta' : 'docs';

  db.runAsync(
      'DELETE FROM ' + tableName + ' WHERE id = ?',
      [id],
  ).then(function() {
    strategy.debug && logger.info('DefaultSchemaStrategy: Deleted record ' + id + ' from ' + tableName);
    callback && callback();
  }).catch(function(error) {
    callback && callback(error);
  });
};

/**
 * Helper to encrypt a record if encryption is enabled
 */
DefaultSchemaStrategy.prototype.maybeEncryptRecord = function(record) {
  if (!this.useEncryption || !this.encryptionCallback) {
    return record;
  }

  return {
    id:                record.id,
    encrypted_payload: this.encryptionCallback(JSON.stringify(record.payload)),
  };
};

/**
 * Helper to decrypt a record if it's encrypted
 */
DefaultSchemaStrategy.prototype.maybeDecryptRecord = function(record) {
  if (!this.useEncryption || !this.decryptionCallback || !record.encrypted_payload) {
    return record;
  }

  return {
    id:      record.id,
    payload: JSON.parse(this.decryptionCallback(record.encrypted_payload)),
  };
};

/**
 * Get inventory type - JSON for default strategy
 */
DefaultSchemaStrategy.prototype.getInventoryType = function() {
  return 'json';
};

/**
 * Initialize inventory as a single JSON document in meta table
 */
DefaultSchemaStrategy.prototype.initializeInventory = function(db, callback) {
  const strategy = this;
  const inventory = {
    id:      'inventory',
    payload: {
      collections: {},
    },
  };

  // Check if inventory already exists
  db.getFirstAsync(
      'SELECT data FROM meta WHERE id = ?',
      ['inventory'],
  ).then(function(row) {
    if (row) {
      // Inventory exists, return it
      const existing = JSON.parse(row.data);
      callback && callback(null, {
        id:      'inventory',
        payload: existing,
      });
    } else {
      // Create new inventory
      return db.runAsync(
          'INSERT INTO meta (id, data) VALUES (?, ?)',
          ['inventory', JSON.stringify(inventory.payload)],
      ).then(function() {
        callback && callback(null, inventory);
      });
    }
  }).catch(function(error) {
    callback && callback(error, null);
  });
};

/**
 * Read the entire inventory from the JSON document
 */
DefaultSchemaStrategy.prototype.readInventory = function(db, callback) {
  db.getFirstAsync(
      'SELECT data FROM meta WHERE id = ?',
      ['inventory'],
  ).then(function(row) {
    if (!row) {
      callback && callback(null, {
        id:      'inventory',
        payload: {collections: {}},
      });
      return;
    }

    const inventory = JSON.parse(row.data);
    callback && callback(null, {
      id:      'inventory',
      payload: inventory,
    });
  }).catch(function(error) {
    callback && callback(error, null);
  });
};

/**
 * Update inventory by modifying the JSON document
 */
DefaultSchemaStrategy.prototype.updateInventoryItem = function(db, collection, docId, version, operation, callback) {
  const strategy = this;

  // Read current inventory
  this.readInventory(db, function(error, inventory) {
    if (error) {
      callback && callback(error);
      return;
    }

    const payload = inventory.payload || {collections: {}};

    // Ensure collection exists
    if (!payload.collections[collection]) {
      payload.collections[collection] = {};
    }

    // Update based on operation
    if (operation === 'add' || operation === 'update') {
      payload.collections[collection][docId] = version;
    } else if (operation === 'remove') {
      delete payload.collections[collection][docId];

      // Clean up empty collections
      if (Object.keys(payload.collections[collection]).length === 0) {
        delete payload.collections[collection];
      }
    }

    // Write updated inventory back
    db.runAsync(
        'UPDATE meta SET data = ? WHERE id = ?',
        [JSON.stringify(payload), 'inventory'],
    ).then(function() {
      strategy.debug && logger.info('DefaultSchemaStrategy: Updated inventory for ' + collection + '/' + docId);
      callback && callback();
    }).catch(function(err) {
      callback && callback(err);
    });
  });
};

/**
 * Delete all tables created by this schema strategy
 */
DefaultSchemaStrategy.prototype.deleteAllTables = function(db, callback) {
  const strategy = this;
  const promises = [];

  // Drop the standard tables used by DefaultSchemaStrategy
  promises.push(db.runAsync('DROP TABLE IF EXISTS meta'));
  promises.push(db.runAsync('DROP TABLE IF EXISTS docs'));
  promises.push(db.runAsync('DROP TABLE IF EXISTS inventory'));

  Promise.all(promises.map(function(p) {
    return p.promise();
  }))
      .then(function() {
        strategy.debug && logger.info('DefaultSchemaStrategy: Deleted all tables');
        callback && callback();
      })
      .catch(function(err) {
        callback && callback(err);
      });
};
