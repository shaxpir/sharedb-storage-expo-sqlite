const { AttachedSqliteAdapter } = require('@shaxpir/sharedb-storage-sqlite');
const ExpoSqliteAdapter = require('./expo-sqlite-adapter');

/**
 * AttachedExpoSqliteAdapter - Expo-specific implementation of database attachment
 * 
 * This adapter creates an ExpoSqliteAdapter for the primary database and uses
 * AttachedSqliteAdapter to manage attachments. It handles expo-sqlite's specific
 * requirements like fileName/dirPath separation.
 * 
 * @param {string} primaryFileName - Primary database file name
 * @param {string} primaryDirPath - Primary database directory path
 * @param {Object} attachmentConfig - Configuration for database attachments
 * @param {Array} attachmentConfig.attachments - Array of databases to attach
 *   Each attachment should have: { fileName, dirPath, alias }
 * @param {boolean} debug - Enable debug logging
 */
function AttachedExpoSqliteAdapter(primaryFileName, primaryDirPath, attachmentConfig, debug) {
  if (!primaryFileName) {
    throw new Error('primaryFileName is required');
  }
  if (!primaryDirPath) {
    throw new Error('primaryDirPath is required');
  }
  
  // Create the primary database adapter
  const primaryAdapter = new ExpoSqliteAdapter(primaryFileName, primaryDirPath, debug);
  
  // Process attachment config to convert expo-style paths to full paths
  const processedConfig = {
    attachments: (attachmentConfig.attachments || []).map(function(attachment) {
      if (!attachment.fileName || !attachment.dirPath || !attachment.alias) {
        throw new Error('Each attachment must have fileName, dirPath, and alias properties');
      }
      
      // Combine fileName and dirPath into a full path for the ATTACH statement
      // Remove file:// prefix if present
      const cleanDirPath = attachment.dirPath.replace('file://', '');
      const fullPath = cleanDirPath + attachment.fileName;
      
      return {
        path: fullPath,
        alias: attachment.alias
      };
    })
  };
  
  // Call parent constructor with wrapped adapter and processed config
  AttachedSqliteAdapter.call(this, primaryAdapter, processedConfig, debug);
  
  // Store original config for reference
  this.primaryFileName = primaryFileName;
  this.primaryDirPath = primaryDirPath;
  this.originalAttachmentConfig = attachmentConfig;
  this.schemaStrategy = null; // Will be set by SqliteStorage
}

// Inherit from AttachedSqliteAdapter
AttachedExpoSqliteAdapter.prototype = Object.create(AttachedSqliteAdapter.prototype);
AttachedExpoSqliteAdapter.prototype.constructor = AttachedExpoSqliteAdapter;

/**
 * Set the schema strategy (called by SqliteStorage during initialization)
 * @param {Object} strategy - The schema strategy to use
 */
AttachedExpoSqliteAdapter.prototype.setSchemaStrategy = function(strategy) {
  this.schemaStrategy = strategy;
};

/**
 * Override connect to pre-initialize attachment databases if needed
 */
AttachedExpoSqliteAdapter.prototype.connect = async function() {
  const adapter = this;
  
  // If we have a schema strategy that supports pre-initialization, use it
  if (adapter.schemaStrategy && adapter.schemaStrategy.preInitializeDatabase) {
    adapter.debug && console.log('[AttachedExpoSqliteAdapter] Pre-initializing attachment databases...');
    
    // Pre-initialize each attachment database
    for (const attachment of adapter.originalAttachmentConfig.attachments) {
      const fullPath = attachment.dirPath.replace('file://', '') + attachment.fileName;
      
      try {
        // Check if the database exists
        const FileSystem = require('expo-file-system');
        const fileInfo = await FileSystem.getInfoAsync(fullPath);
        
        if (!fileInfo.exists) {
          adapter.debug && console.log('[AttachedExpoSqliteAdapter] Creating new database:', fullPath);
        }
        
        // Pre-initialize the database with proper schema and indexes
        await adapter.schemaStrategy.preInitializeDatabase(
          fullPath,
          function(dbPath) {
            // Factory function to create an ExpoSqliteAdapter for the given path
            const ExpoSqliteAdapter = require('./expo-sqlite-adapter');
            const pathParts = dbPath.split('/');
            const fileName = pathParts.pop();
            const dirPath = pathParts.join('/') + '/';
            return new ExpoSqliteAdapter(fileName, dirPath, adapter.debug);
          }
        );
        
        adapter.debug && console.log('[AttachedExpoSqliteAdapter] Pre-initialized database:', fullPath);
      } catch (error) {
        console.error('[AttachedExpoSqliteAdapter] Failed to pre-initialize database:', fullPath, error);
        // Continue anyway - the database might already be initialized
      }
    }
  }
  
  // Now proceed with normal connection and attachment
  return AttachedSqliteAdapter.prototype.connect.call(adapter);
};

/**
 * Static helper to create an AttachedExpoSqliteAdapter using FileSystem.documentDirectory
 * @param {string} primaryFileName - Primary database file name
 * @param {Object} attachmentConfig - Configuration for database attachments
 * @param {boolean} debug - Enable debug logging
 * @returns {AttachedExpoSqliteAdapter} New adapter instance
 */
AttachedExpoSqliteAdapter.createWithDocumentDirectory = function(primaryFileName, attachmentConfig, debug) {
  try {
    const FileSystem = require('expo-file-system');
    const docDir = FileSystem.documentDirectory;
    
    // Process attachment config to use document directory if not specified
    const processedAttachments = (attachmentConfig.attachments || []).map(function(attachment) {
      return {
        fileName: attachment.fileName,
        dirPath: attachment.dirPath || docDir,
        alias: attachment.alias
      };
    });
    
    return new AttachedExpoSqliteAdapter(
      primaryFileName,
      docDir,
      { attachments: processedAttachments },
      debug
    );
  } catch (e) {
    throw new Error('AttachedExpoSqliteAdapter.createWithDocumentDirectory requires expo-file-system: ' + e.message);
  }
};

/**
 * Check if all database files exist (primary and attachments)
 * @returns {Promise<Object>} Object with exists status for each database
 */
AttachedExpoSqliteAdapter.prototype.checkAllDatabasesExist = async function() {
  const adapter = this;
  const result = {};
  
  try {
    const FileSystem = require('expo-file-system');
    
    // Check primary database
    const primaryPath = adapter.primaryDirPath + adapter.primaryFileName;
    const primaryInfo = await FileSystem.getInfoAsync(primaryPath);
    result.primary = {
      fileName: adapter.primaryFileName,
      exists: primaryInfo.exists
    };
    
    // Check each attachment
    if (adapter.originalAttachmentConfig && adapter.originalAttachmentConfig.attachments) {
      result.attachments = {};
      
      for (let i = 0; i < adapter.originalAttachmentConfig.attachments.length; i++) {
        const attachment = adapter.originalAttachmentConfig.attachments[i];
        const attachPath = attachment.dirPath + attachment.fileName;
        const attachInfo = await FileSystem.getInfoAsync(attachPath);
        
        result.attachments[attachment.alias] = {
          fileName: attachment.fileName,
          exists: attachInfo.exists
        };
      }
    }
    
    return result;
  } catch (e) {
    throw new Error('checkAllDatabasesExist requires expo-file-system: ' + e.message);
  }
};

module.exports = AttachedExpoSqliteAdapter;