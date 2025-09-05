# SQLite Database Attachment Mode

This document explains how to use SQLite's ATTACH DATABASE feature with ShareDB Storage for React Native/Expo applications.

## Overview

Database attachment allows you to connect multiple SQLite database files and query them together using a single connection. This is particularly useful when you want to:

1. Keep your application's primary data separate from ShareDB's operational data
2. Enable cross-database queries between your app's data and ShareDB documents
3. Maintain different backup/sync strategies for different databases

## Automatic Index Creation

The attachment system automatically handles index creation for optimal performance. When a database is attached for the first time, the adapter coordinates with the schema strategy to:

1. Detect if the database needs initialization
2. Create all required tables and indexes directly in the database
3. Attach the fully-initialized database

This automatic process ensures indexes are properly created before attachment, as SQLite doesn't support `database.table` notation in CREATE INDEX statements.

## Components

### AttachedSqliteAdapter

Base class that wraps any existing adapter and adds attachment functionality:

```javascript
const AttachedSqliteAdapter = require('@shaxpir/sharedb-storage-expo-sqlite/lib/adapters/attached-sqlite-adapter');
```

### AttachedExpoSqliteAdapter

React Native/Expo-specific implementation that handles attachment with expo-sqlite:

```javascript
const AttachedExpoSqliteAdapter = require('@shaxpir/sharedb-storage-expo-sqlite/lib/adapters/attached-expo-sqlite-adapter');

// Create with explicit paths
const adapter = new AttachedExpoSqliteAdapter(
  'primary.db',           // Primary database file name
  '/path/to/db/dir/',     // Primary database directory
  {
    attachments: [
      {
        fileName: 'sharedb.db',
        dirPath: '/path/to/sharedb/',
        alias: 'sharedb'
      }
    ]
  },
  true // debug
);

// Or use the helper for document directory
const adapter = AttachedExpoSqliteAdapter.createWithDocumentDirectory(
  'primary.db',
  {
    attachments: [
      { fileName: 'sharedb.db', alias: 'sharedb' }
    ]
  },
  true // debug
);
```

### AttachedCollectionPerTableStrategy

Schema strategy that works with attached databases by prefixing all table operations:

```javascript
const AttachedCollectionPerTableStrategy = require('@shaxpir/sharedb-storage-expo-sqlite/lib/schema/attached-collection-per-table-strategy');

const strategy = new AttachedCollectionPerTableStrategy({
  attachmentAlias: 'sharedb', // Must match the alias used in adapter
  collectionConfig: {
    'users': {
      indexes: ['email', 'username']
    },
    'posts': {
      indexes: ['authorId', 'createdAt']
    }
  }
});
```

## Complete Example for React Native

```javascript
const SqliteStorage = require('@shaxpir/sharedb-storage-expo-sqlite');
const AttachedExpoSqliteAdapter = require('@shaxpir/sharedb-storage-expo-sqlite/lib/adapters/attached-expo-sqlite-adapter');
const AttachedCollectionPerTableStrategy = require('@shaxpir/sharedb-storage-expo-sqlite/lib/schema/attached-collection-per-table-strategy');
const FileSystem = require('expo-file-system');

// Create adapter with attachment
const adapter = new AttachedExpoSqliteAdapter(
  'myapp.db',                            // Primary database
  FileSystem.documentDirectory,          // Primary database directory
  {
    attachments: [
      {
        fileName: 'sharedb.db',           // ShareDB database
        dirPath: FileSystem.documentDirectory,
        alias: 'sharedb'                  // Alias for queries
      }
    ]
  },
  true // debug
);

// Create schema strategy for attached database
const strategy = new AttachedCollectionPerTableStrategy({
  attachmentAlias: 'sharedb',            // Must match adapter alias
  collectionConfig: {
    'users': { 
      indexes: ['email', 'createdAt'] 
    },
    'documents': { 
      indexes: ['authorId', 'status'] 
    }
  }
});

// Initialize storage
const storage = new SqliteStorage({
  adapter: adapter,
  schemaStrategy: strategy
});

// Initialize and use
storage.initialize(function(err, inventory) {
  if (err) {
    console.error('Failed to initialize:', err);
    return;
  }
  
  console.log('Storage initialized with attached databases');
  
  // You can now perform cross-database queries
  // ShareDB tables are prefixed with 'sharedb.'
});
```

## Cross-Database Queries

Once databases are attached, you can query across them:

```javascript
// Query from attached ShareDB database
const sharedbData = await adapter.getAllAsync(
  'SELECT * FROM sharedb.users WHERE email = ?',
  ['user@example.com']
);

// Join between primary and attached databases
const joinedData = await adapter.getAllAsync(
  `SELECT 
     p.*, 
     s.data 
   FROM primary_table p 
   JOIN sharedb.documents s ON p.doc_id = s.id
   WHERE p.status = ?`,
  ['active']
);
```

## Helper Methods

### Check Database Existence

The AttachedExpoSqliteAdapter provides a helper to check if all databases exist:

```javascript
const status = await adapter.checkAllDatabasesExist();
console.log(status);
// Output:
// {
//   primary: { fileName: 'myapp.db', exists: true },
//   attachments: {
//     sharedb: { fileName: 'sharedb.db', exists: true }
//   }
// }
```

## Best Practices

1. **Use Consistent Aliases**: The alias in your adapter configuration must match the `attachmentAlias` in your schema strategy
2. **Initialize Once**: Database attachment and initialization happens during adapter connection
3. **Handle Missing Databases**: Use `checkAllDatabasesExist()` to verify databases before connecting
4. **Debug Mode**: Enable debug mode during development to see attachment operations

## Troubleshooting

### "No such table" Errors

If you get "no such table" errors, verify:
- The attachment alias is correctly configured in both adapter and strategy
- The database file exists at the specified path
- The tables have been created in the attached database

### Performance Issues

The system automatically creates indexes during initialization. If you experience performance issues:
- Check that debug mode shows indexes being created
- Verify your `collectionConfig` includes the fields you're querying
- Use EXPLAIN QUERY PLAN to analyze your queries

### File Path Issues

React Native/Expo has specific requirements for file paths:
- Use `FileSystem.documentDirectory` for persistent storage
- Remove `file://` prefix if present in paths
- Ensure proper permissions for file access

## Migration from Single Database

If you're migrating from a single database setup:

1. Create separate database files for primary and ShareDB data
2. Configure the AttachedExpoSqliteAdapter with both databases
3. Update your schema strategy to AttachedCollectionPerTableStrategy
4. The system will automatically initialize the ShareDB database with proper schema

## See Also

- [Migration Guide](./MIGRATION_GUIDE.md) - Migrating from version 1.x
- [Dual Database Guide](./DUAL_DATABASE_GUIDE.md) - Managing multiple databases