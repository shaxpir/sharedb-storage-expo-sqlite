const SqliteAdapter = require('../interfaces/sqlite-adapter');

/**
 * ExpoSqliteAdapter Implementation
 * 
 * React Native implementation that wraps expo-sqlite with the new clean interface.
 * Manages exactly one database with no cross-database awareness.
 * Handles expo-sqlite's requirement for separate fileName and dirPath parameters.
 */
function ExpoSqliteAdapter(fileName, dirPath, debug = false) {
  if (!fileName) {
    throw new Error('fileName is required');
  }
  if (!dirPath) {
    throw new Error('dirPath is required - use ExpoSqliteAdapter.createWithDocumentDirectory() for convenience');
  }
  
  this.fileName = fileName;
  this.dirPath = dirPath;
  this.debug = debug || false;
  this.db = null;
  this.SQLite = null;
  
  // Try to load expo-sqlite
  try {
    this.SQLite = require('expo-sqlite');
    if (!this.SQLite) {
      throw new Error('expo-sqlite module not found');
    }
  } catch (e) {
    throw new Error('ExpoSqliteAdapter requires expo-sqlite: ' + e.message);
  }
  
  // Try to load expo-file-system (optional for helper methods)
  try {
    this.FileSystem = require('expo-file-system');
  } catch (e) {
    // FileSystem is optional - adapter will work without it
    this.FileSystem = null;
  }
}

// Inherit from SqliteAdapter interface
ExpoSqliteAdapter.prototype = Object.create(SqliteAdapter.prototype);
ExpoSqliteAdapter.prototype.constructor = ExpoSqliteAdapter;

/**
 * Connect to the database
 */
ExpoSqliteAdapter.prototype.connect = function() {
  const adapter = this;
  
  return new Promise(function(resolve, reject) {
    try {
      // Use separate fileName and dirPath (proper expo-sqlite usage)
      const cleanDirPath = adapter.resolveExpoDirPath(adapter.dirPath);
      const dbOptions = { useNewConnection: true };
      adapter.db = adapter.SQLite.openDatabaseSync(adapter.fileName, dbOptions, cleanDirPath);
      
      adapter.debug && console.log('[ExpoSqliteAdapter] Connected to database: ' + adapter.fileName + ' in ' + cleanDirPath);
      resolve();
    } catch (error) {
      adapter.debug && console.error('[ExpoSqliteAdapter] Connection error: ' + error.message);
      reject(error);
    }
  });
};

/**
 * Disconnect from the database
 */
ExpoSqliteAdapter.prototype.disconnect = function() {
  const adapter = this;
  
  return new Promise(function(resolve, reject) {
    try {
      if (adapter.db && adapter.db.closeAsync) {
        adapter.db.closeAsync().then(function() {
          adapter.db = null;
          adapter.debug && console.log('[ExpoSqliteAdapter] Disconnected from database');
          resolve();
        }).catch(function(error) {
          adapter.debug && console.error('[ExpoSqliteAdapter] Disconnect error: ' + error.message);
          reject(error);
        });
      } else {
        adapter.db = null;
        resolve();
      }
    } catch (error) {
      adapter.debug && console.error('[ExpoSqliteAdapter] Disconnect error: ' + error.message);
      reject(error);
    }
  });
};

/**
 * Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
 * Returns Promise directly (matching schema strategy expectations)
 */
ExpoSqliteAdapter.prototype.runAsync = function(sql, params) {
  const adapter = this;
  params = params || [];
  
  return new Promise(function(resolve, reject) {
    if (!adapter.db) {
      reject(new Error('Database not connected'));
      return;
    }
    
    adapter.db.runAsync(sql, params).then(function(result) {
      adapter.debug && console.log('[ExpoSqliteAdapter] Executed SQL: ' + sql.substring(0, 50));
      resolve({ 
        lastID: result.lastInsertRowId, 
        changes: result.changes 
      });
    }).catch(function(error) {
      adapter.debug && console.error('[ExpoSqliteAdapter] SQL error: ' + error.message);
      reject(error);
    });
  });
};

/**
 * Get the first row from a SELECT query
 * Returns promise directly (matching schema strategy expectations)
 */
ExpoSqliteAdapter.prototype.getFirstAsync = function(sql, params) {
  const adapter = this;
  params = params || [];
  
  return new Promise(function(resolve, reject) {
    if (!adapter.db) {
      reject(new Error('Database not connected'));
      return;
    }
    
    adapter.db.getFirstAsync(sql, params).then(function(row) {
      adapter.debug && console.log('[ExpoSqliteAdapter] Got row from: ' + sql.substring(0, 50));
      resolve(row);
    }).catch(function(error) {
      adapter.debug && console.error('[ExpoSqliteAdapter] Query error: ' + error.message);
      reject(error);
    });
  });
};

/**
 * Get all rows from a SELECT query
 * Returns promise directly (matching schema strategy expectations)
 */
ExpoSqliteAdapter.prototype.getAllAsync = function(sql, params) {
  const adapter = this;
  params = params || [];
  
  return new Promise(function(resolve, reject) {
    if (!adapter.db) {
      reject(new Error('Database not connected'));
      return;
    }
    
    adapter.db.getAllAsync(sql, params).then(function(rows) {
      adapter.debug && console.log('[ExpoSqliteAdapter] Got ' + rows.length + ' rows from: ' + sql.substring(0, 50));
      resolve(rows);
    }).catch(function(error) {
      adapter.debug && console.error('[ExpoSqliteAdapter] Query error: ' + error.message);
      reject(error);
    });
  });
};

/**
 * Execute multiple SQL statements in a transaction
 * Promise-based with clean interface
 */
ExpoSqliteAdapter.prototype.transaction = function(operations) {
  const adapter = this;
  
  return new Promise(function(resolve, reject) {
    if (!adapter.db) {
      reject(new Error('Database not connected'));
      return;
    }
    
    // expo-sqlite uses withTransactionAsync
    if (adapter.db.withTransactionAsync) {
      adapter.db.withTransactionAsync(function() {
        // Execute the user's operations within the transaction
        return operations();
      }).then(function(result) {
        adapter.debug && console.log('[ExpoSqliteAdapter] Transaction completed successfully');
        resolve(result);
      }).catch(function(error) {
        adapter.debug && console.error('[ExpoSqliteAdapter] Transaction error: ' + error.message);
        reject(error);
      });
    } else {
      // Fallback: execute without explicit transaction
      operations().then(resolve).catch(reject);
    }
  });
};

/**
 * Resolve expo-sqlite directory paths
 * Handles expo-sqlite's requirement to clean file:// prefixes from directory paths
 */
ExpoSqliteAdapter.prototype.resolveExpoDirPath = function(dirPath) {
  if (!dirPath) {
    return dirPath;
  }
  
  // Remove file:// prefix if present for SQLite compatibility
  return dirPath.replace('file://', '');
};

/**
 * Transaction adapter for expo-sqlite
 * Provides the same interface as the main adapter but within a transaction context
 */
function ExpoTransactionAdapter(db, debug) {
  this.db = db;
  this.debug = debug;
}

ExpoTransactionAdapter.prototype = Object.create(ExpoSqliteAdapter.prototype);
ExpoTransactionAdapter.prototype.constructor = ExpoTransactionAdapter;

// Override connect/disconnect to be no-ops for transaction adapters
ExpoTransactionAdapter.prototype.connect = function() {
  return Promise.resolve();
};

ExpoTransactionAdapter.prototype.disconnect = function() {
  return Promise.resolve();
};

/**
 * Static helper methods for working with expo-file-system
 */

/**
 * Create an ExpoSqliteAdapter using FileSystem.documentDirectory
 * @param {string} fileName - The database filename
 * @param {boolean} debug - Enable debug logging
 * @returns {ExpoSqliteAdapter} New adapter instance
 */
ExpoSqliteAdapter.createWithDocumentDirectory = function(fileName, debug = false) {
  try {
    const FileSystem = require('expo-file-system');
    return new ExpoSqliteAdapter(fileName, FileSystem.documentDirectory, debug);
  } catch (e) {
    throw new Error('ExpoSqliteAdapter.createWithDocumentDirectory requires expo-file-system: ' + e.message);
  }
};


/**
 * Check if a database file exists at the given path
 * @param {string} fileName - The database filename
 * @param {string} dirPath - The directory path (optional, defaults to documentDirectory)
 * @returns {Promise<boolean>} True if the file exists
 */
ExpoSqliteAdapter.checkDatabaseExists = async function(fileName, dirPath) {
  try {
    const FileSystem = require('expo-file-system');
    
    if (!dirPath) {
      dirPath = FileSystem.documentDirectory;
    }
    
    const fullPath = dirPath + fileName;
    const { exists } = await FileSystem.getInfoAsync(fullPath);
    return exists;
  } catch (e) {
    throw new Error('ExpoSqliteAdapter.checkDatabaseExists requires expo-file-system: ' + e.message);
  }
};

/**
 * Copy a database file from one location to another
 * @param {string} fromPath - Source path (can be asset URI)
 * @param {string} fileName - The database filename
 * @param {string} dirPath - Destination directory path (optional, defaults to documentDirectory)
 * @returns {Promise<void>}
 */
ExpoSqliteAdapter.copyDatabase = async function(fromPath, fileName, dirPath) {
  try {
    const FileSystem = require('expo-file-system');
    
    if (!dirPath) {
      dirPath = FileSystem.documentDirectory;
    }
    
    const toPath = dirPath + fileName;
    await FileSystem.copyAsync({
      from: fromPath,
      to: toPath,
    });
  } catch (e) {
    throw new Error('ExpoSqliteAdapter.copyDatabase requires expo-file-system: ' + e.message);
  }
};

module.exports = ExpoSqliteAdapter;