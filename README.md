# @shaxpir/sharedb-storage-expo-sqlite

React Native SQLite storage adapter for [ShareDB](https://github.com/share/sharedb) using expo-sqlite.

## Overview

This package provides a React Native implementation of ShareDB's DurableStorage interface using SQLite. It builds on the shared `@shaxpir/sharedb-storage-sqlite` library and adds React Native-specific adapters for expo-sqlite.

## Features

- ✅ **ShareDB DurableStorage** - Implements ShareDB's offline storage interface
- ✅ **Expo SQLite** - Native SQLite for React Native apps
- ✅ **Multiple Schema Strategies** - Choose how documents are organized in SQLite
- ✅ **Database Attachments** - Support for multi-database architectures
- ✅ **Projection Support** - Automatic materialization of arrays into relational tables
- ✅ **Field Encryption** - Encrypt specific document fields
- ✅ **Production Ready** - Used in production React Native apps

## Installation

```bash
npm install @shaxpir/sharedb-storage-expo-sqlite
```

**Peer Dependencies**:
- `@shaxpir/sharedb >= 6.0.0`
- `expo-sqlite >= 11.0.0`
- `react-native`

## Quick Start

### Basic Usage

```javascript
import SqliteStorage from '@shaxpir/sharedb-storage-expo-sqlite';
const { ExpoSqliteAdapter } = SqliteStorage;

// Create adapter for your SQLite database
const adapter = new ExpoSqliteAdapter('myapp.db', 'SQLite');

// Create storage with schema strategy
const storage = new SqliteStorage({
  adapter: adapter,
  schemaStrategy: new SqliteStorage.CollectionPerTableStrategy()
});

// Initialize and use with ShareDB
await storage.initialize();
```

### With ShareDB Connection

```javascript
import { Connection } from '@shaxpir/sharedb/lib/client';
import SqliteStorage from '@shaxpir/sharedb-storage-expo-sqlite';

// Create storage
const storage = new SqliteStorage({
  adapter: new SqliteStorage.ExpoSqliteAdapter('sharedb.db')
});

// Create ShareDB connection
const connection = new Connection(websocket);

// Enable offline-first DurableStore
connection.useDurableStore({ storage });
```

### Database Attachments

For multi-database architectures (e.g., bundled reference data + user data):

```javascript
const { AttachedExpoSqliteAdapter } = SqliteStorage;

const adapter = new AttachedExpoSqliteAdapter(
  'user-data.db',  // Primary database
  'SQLite',        // Directory
  {
    attachments: [
      {
        fileName: 'reference-data.db',
        dirPath: 'SQLite',
        alias: 'ref'
      }
    ]
  }
);

// Now you can query across both databases
// Tables in attached database are prefixed with alias (e.g., ref.products)
```

## Schema Strategies

### CollectionPerTableStrategy (Recommended)

Creates separate tables for each collection with optimized indexes:

```javascript
const strategy = new SqliteStorage.CollectionPerTableStrategy({
  collectionConfig: {
    products: {
      indexes: ['payload.name', 'payload.category'],
      encryptedFields: ['payload.price']
    }
  }
});
```

### DefaultSchemaStrategy

Simple strategy using two tables (docs and meta):

```javascript
const strategy = new SqliteStorage.DefaultSchemaStrategy();
```

### AttachedCollectionPerTableStrategy

For use with attached databases:

```javascript
const strategy = new SqliteStorage.AttachedCollectionPerTableStrategy({
  attachmentAlias: 'ref'
});
```

## API Reference

### ExpoSqliteAdapter

```javascript
const adapter = new ExpoSqliteAdapter(fileName, dirPath, options);
```

Parameters:
- `fileName` (string): Database file name
- `dirPath` (string): Directory path (default: 'SQLite')
- `options` (object): Optional configuration

### AttachedExpoSqliteAdapter

```javascript
const adapter = new AttachedExpoSqliteAdapter(
  primaryFileName,
  primaryDirPath,
  {
    attachments: [
      { fileName: 'other.db', dirPath: 'SQLite', alias: 'other' }
    ]
  }
);
```

## Platform-Specific Considerations

### iOS
- SQLite files are stored in the app's Documents directory
- Data persists across app updates
- Use iCloud backup exclusion for large databases

### Android
- SQLite files are stored in the app's internal storage
- Data persists across app updates
- Consider database size for low-storage devices

## Testing

This package is designed for React Native and cannot be tested directly with Node.js test runners. Test in your React Native app or use Expo Go for development testing.

## License

MIT

## See Also

- [@shaxpir/sharedb-storage-sqlite](https://www.npmjs.com/package/@shaxpir/sharedb-storage-sqlite) - Shared components
- [@shaxpir/sharedb-storage-node-sqlite](https://www.npmjs.com/package/@shaxpir/sharedb-storage-node-sqlite) - Node.js implementation
- [@shaxpir/sharedb](https://github.com/shaxpir/sharedb) - ShareDB with DurableStore support
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) - Expo SQLite documentation