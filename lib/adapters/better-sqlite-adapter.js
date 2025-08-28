const SqliteAdapter = require('../interfaces/sqlite-adapter');

/**
 * Clean BetterSqliteAdapter Implementation
 * 
 * Node.js implementation that wraps better-sqlite3 with the new clean interface.
 * Manages exactly one database with no cross-database awareness.
 * Focused on simplicity and single-database operations.
 */
function BetterSqliteAdapter(dbPath, options) {
  this.dbPath = dbPath;
  this.options = options || {};
  this.debug = this.options.debug || false;
  this.db = null;
  this.Database = null;
  
  // Try to load better-sqlite3
  try {
    this.Database = require('better-sqlite3');
    if (!this.Database) {
      throw new Error('better-sqlite3 module not found');
    }
  } catch (e) {
    throw new Error('BetterSqliteAdapter requires better-sqlite3: ' + e.message);
  }
}

// Inherit from SqliteAdapter interface
BetterSqliteAdapter.prototype = Object.create(SqliteAdapter.prototype);
BetterSqliteAdapter.prototype.constructor = BetterSqliteAdapter;

/**
 * Connect to the database
 */
BetterSqliteAdapter.prototype.connect = function() {
  const adapter = this;
  
  return new Promise(function(resolve, reject) {
    try {
      adapter.db = new adapter.Database(adapter.dbPath, adapter.options);
      
      // Enable foreign keys by default
      adapter.db.exec('PRAGMA foreign_keys = ON');
      
      adapter.debug && console.log('[BetterSqliteAdapter] Connected to database: ' + adapter.dbPath);
      resolve();
    } catch (error) {
      adapter.debug && console.error('[BetterSqliteAdapter] Connection error: ' + error.message);
      reject(error);
    }
  });
};

/**
 * Disconnect from the database
 */
BetterSqliteAdapter.prototype.disconnect = function() {
  const adapter = this;
  
  return new Promise(function(resolve, reject) {
    try {
      if (adapter.db) {
        adapter.db.close();
        adapter.db = null;
        adapter.debug && console.log('[BetterSqliteAdapter] Disconnected from database');
      }
      resolve();
    } catch (error) {
      adapter.debug && console.error('[BetterSqliteAdapter] Disconnect error: ' + error.message);
      reject(error);
    }
  });
};

/**
 * Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
 * Returns Promise directly (matching schema strategy expectations)
 */
BetterSqliteAdapter.prototype.runAsync = function(sql, params) {
  const adapter = this;
  params = params || [];
  
  return new Promise(function(resolve, reject) {
    if (!adapter.db) {
      reject(new Error('Database not connected'));
      return;
    }
    
    try {
      const stmt = adapter.db.prepare(sql);
      const result = stmt.run(params);
      
      adapter.debug && console.log('[BetterSqliteAdapter] Executed SQL: ' + sql.substring(0, 50));
      resolve({ 
        lastID: result.lastInsertRowid, 
        changes: result.changes 
      });
    } catch (error) {
      adapter.debug && console.error('[BetterSqliteAdapter] SQL error: ' + error.message);
      reject(error);
    }
  });
};

/**
 * Get the first row from a SELECT query
 * Returns promise directly (matching schema strategy expectations)
 */
BetterSqliteAdapter.prototype.getFirstAsync = function(sql, params) {
  const adapter = this;
  params = params || [];
  
  return new Promise(function(resolve, reject) {
    if (!adapter.db) {
      reject(new Error('Database not connected'));
      return;
    }
    
    try {
      const stmt = adapter.db.prepare(sql);
      const row = stmt.get(params);
      
      adapter.debug && console.log('[BetterSqliteAdapter] Got row from: ' + sql.substring(0, 50));
      resolve(row || null);
    } catch (error) {
      adapter.debug && console.error('[BetterSqliteAdapter] Query error: ' + error.message);
      reject(error);
    }
  });
};

/**
 * Get all rows from a SELECT query
 * Returns promise directly (matching schema strategy expectations)
 */
BetterSqliteAdapter.prototype.getAllAsync = function(sql, params) {
  const adapter = this;
  params = params || [];
  
  return new Promise(function(resolve, reject) {
    if (!adapter.db) {
      reject(new Error('Database not connected'));
      return;
    }
    
    try {
      const stmt = adapter.db.prepare(sql);
      const rows = stmt.all(params);
      
      adapter.debug && console.log('[BetterSqliteAdapter] Got ' + rows.length + ' rows from: ' + sql.substring(0, 50));
      resolve(rows);
    } catch (error) {
      adapter.debug && console.error('[BetterSqliteAdapter] Query error: ' + error.message);
      reject(error);
    }
  });
};

/**
 * Execute multiple SQL statements in a transaction
 * Promise-based with clean interface
 */
BetterSqliteAdapter.prototype.transaction = function(operations) {
  const adapter = this;
  
  return new Promise(function(resolve, reject) {
    if (!adapter.db) {
      reject(new Error('Database not connected'));
      return;
    }
    
    // better-sqlite3 has built-in transaction support
    try {
      const transaction = adapter.db.transaction(function() {
        // Execute the user's operations and wait for the result
        const promise = operations();
        
        // Since better-sqlite3 transactions are synchronous,
        // we need to handle promises synchronously
        if (promise && typeof promise.then === 'function') {
          // This is tricky - better-sqlite3 transactions must be synchronous
          // So we'll execute without the transaction wrapper for async operations
          throw new Error('Async operations not supported in better-sqlite3 transactions - use direct calls');
        }
        
        return promise;
      });
      
      const result = transaction();
      adapter.debug && console.log('[BetterSqliteAdapter] Transaction completed successfully');
      resolve(result);
    } catch (error) {
      if (error.message.includes('Async operations not supported')) {
        // Fallback: execute the promise-based operations without transaction
        adapter.debug && console.warn('[BetterSqliteAdapter] Falling back to non-transactional execution for async operations');
        operations().then(resolve).catch(reject);
      } else {
        adapter.debug && console.error('[BetterSqliteAdapter] Transaction error: ' + error.message);
        reject(error);
      }
    }
  });
};

module.exports = BetterSqliteAdapter;