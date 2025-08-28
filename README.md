# ShareDB Expo SQLite Storage

A dedicated React Native storage adapter for [ShareDB's DurableStore](https://github.com/shaxpir/sharedb) using Expo SQLite, with support for dual-database architectures and connection pooling.

This package provides offline-first storage for the **DurableStore** system - a Shaxpir fork enhancement that enables client-side document persistence and offline operation queuing, not available in the original upstream ShareDB.

## Features

- ✅ **DurableStore Integration** - Purpose-built for ShareDB's offline-first DurableStore system
- ✅ **Expo SQLite Integration** - Native React Native SQLite storage for client-side persistence
- ✅ **Dual-Database Support** - Pre-initialized database connections with schema prefixes
- ✅ **Connection Pooling** - Optional connection pooling for improved performance
- ✅ **Cross-Database Queries** - JOIN operations between multiple databases
- ✅ **Collection Mapping** - Flexible collection-to-table mapping
- ✅ **Offline Operation Queuing** - Stores pending operations while offline for later sync
- ✅ **Zero Migration** - Works with existing table schemas
- ✅ **Production Ready** - Comprehensive error handling and monitoring

## Installation

```bash
npm install @shaxpir/sharedb-storage-expo-sqlite
```

**Peer Dependencies** (automatically installed in Expo/React Native projects):
- `@shaxpir/sharedb >= 5.4.0` (Shaxpir fork with DurableStore support)
- `expo-sqlite >= 14.0.0`

## Quick Start

### Basic Usage

```javascript
import { Connection } from '@shaxpir/sharedb/lib/client';
import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite';

// Create ShareDB connection
const connection = new Connection(websocket);

// Create storage for DurableStore
const storage = new ExpoSqliteStorage({
  namespace: 'myapp'  // Creates 'sharedb_myapp.db'
});

// Enable offline-first DurableStore with SQLite persistence
connection.useDurableStore({ storage });
```

### Dual-Database Architecture

Perfect for apps with both builtin read-only data and user-specific writable data:

```javascript
import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite';
import { DatabaseServiceInit } from './services/database/DatabaseServiceInit';
import { dbConnectionPool } from './services/database/DatabaseConnectionPool';

const storage = new ExpoSqliteStorage({
  // Pre-initialized database with attached userdata
  database: await DatabaseServiceInit.init(),
  
  // Route ShareDB collections to userdata schema
  collectionMapping: (collection) => `userdata.${collection}`,
  
  // Optional: Use existing connection pool
  connectionPool: dbConnectionPool,
  
  // Enable cross-database analytics queries
  enableCrossDbQueries: true
});
```

### Connection Pooling

Use the built-in StandardSQLiteConnectionPool or inject your existing pool:

```javascript
import { ExpoSqliteStorage, StandardSQLiteConnectionPool } from '@shaxpir/sharedb-storage-expo-sqlite';

// Option 1: Built-in connection pool
const connectionPool = new StandardSQLiteConnectionPool({
  createConnection: () => DatabaseServiceInit.init(),
  maxConnections: 3,
  minConnections: 1,
  debug: true
});

// Option 2: Use your existing pool (dependency injection)
const storage = new ExpoSqliteStorage({
  database: await DatabaseServiceInit.init(),
  connectionPool: yourExistingPool,  // Any pool with withConnection() method
  collectionMapping: (collection) => `userdata.${collection}`
});
```

## API Reference

### ExpoSqliteStorage

#### Constructor Options

```javascript
new ExpoSqliteStorage({
  // Database options
  database?: SQLiteDatabase,        // Pre-initialized database connection
  namespace?: string,               // Database namespace for file-based DBs
  dbFileName?: string,              // Custom database filename
  dbFileDir?: string,               // Custom database directory
  
  // Dual-database options
  schemaPrefix?: string,            // Schema prefix (e.g., 'userdata')
  collectionMapping?: (collection: string) => string,  // Collection mapping function
  enableCrossDbQueries?: boolean,   // Enable cross-DB queries (default: true)
  
  // Connection pooling
  connectionPool?: ConnectionPool,  // Injected connection pool
  
  // Storage options
  schemaStrategy?: SchemaStrategy,  // Custom schema strategy
  useEncryption?: boolean,          // Enable encryption
  encryptionCallback?: Function,    // Encryption function
  decryptionCallback?: Function,    // Decryption function
  debug?: boolean                   // Enable debug logging
})
```

#### Methods

```javascript
// Cross-database analytics queries
storage.executeCrossDbQuery(sql, params, callback);

// Connection pool operations
storage.withPooledConnection(operation, callback);

// Storage statistics
storage.getStats(callback);

// Standard ShareDB storage methods
storage.writeRecords(recordsByType, callback);
storage.readRecord(storeName, recordId, callback);
// ... (see ShareDB documentation for complete API)
```

### StandardSQLiteConnectionPool

```javascript
new StandardSQLiteConnectionPool({
  createConnection: () => Promise<SQLiteDatabase>,  // Required
  destroyConnection?: (conn) => Promise<void>,      // Optional
  validateConnection?: (conn) => Promise<boolean>,  // Optional
  
  maxConnections?: number,          // Default: 5
  minConnections?: number,          // Default: 2
  acquireTimeout?: number,          // Default: 5000ms
  idleTimeout?: number,            // Default: 30000ms
  debug?: boolean                  // Default: false
});
```

## Usage Patterns

### Pattern 1: Simple File-Based Storage

```javascript
const storage = new ExpoSqliteStorage({
  namespace: 'myapp',
  useEncryption: true,
  encryptionCallback: (data) => encrypt(data, encryptionKey)
});
```

### Pattern 2: Dual-Database with Builtin + Userdata

```javascript
// Your database initialization
const db = await DatabaseServiceInit.init();  // Sets up main + attached userdata DB

const storage = new ExpoSqliteStorage({
  database: db,                                 // Pre-initialized connection
  collectionMapping: (collection) => {
    // Map ShareDB collections to your existing tables
    if (collection === 'terms') return 'userdata.term';
    if (collection === 'notes') return 'userdata.note';
    return `userdata.${collection}`;
  },
  enableCrossDbQueries: true
});

// Now you can run analytics queries across both databases
storage.executeCrossDbQuery(`
  SELECT 
    u.data as user_term,
    p.translation,
    p.learn_rank
  FROM userdata.term u
  JOIN phrase p ON json_extract(u.data, '$.payload.text') = p.text
  WHERE p.learn_rank BETWEEN ? AND ?
`, [1, 1000], (error, results) => {
  console.log('Cross-database analytics:', results);
});
```

### Pattern 3: Connection Pooling for Performance

```javascript
// Reuse your existing connection pool
import { dbConnectionPool } from './DatabaseConnectionPool';

const storage = new ExpoSqliteStorage({
  database: await DatabaseServiceInit.init(),
  connectionPool: dbConnectionPool,  // Dependency injection!
  collectionMapping: (collection) => `userdata.${collection}`
});

// Heavy operations automatically use pooled connections
storage.executeCrossDbQuery(heavyAnalyticsQuery, params, callback);
```

## Migration from Core ShareDB

If you're currently using React Native storage from the core ShareDB package:

### Before
```javascript
import { Connection } from '@shaxpir/sharedb/lib/client';
import { ExpoSqliteStorage } from '@shaxpir/sharedb';  // ❌ No longer available
```

### After  
```javascript
import { Connection } from '@shaxpir/sharedb/lib/client';
import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite';  // ✅ Dedicated package
```

**That's it!** All your existing configuration and usage patterns remain exactly the same.

## Documentation

- [Dual-Database Integration Guide](docs/DUAL_DATABASE_GUIDE.md)
- [Connection Pooling Guide](docs/CONNECTION_POOLING_GUIDE.md)
- [Migration Guide](docs/MIGRATION_GUIDE.md)
- [API Reference](docs/API_REFERENCE.md)

## Examples

Check out the `/test` directory for comprehensive usage examples, including:
- Basic storage operations
- Dual-database integration patterns
- Connection pooling configurations
- Cross-database query examples
- Mock testing strategies

## Requirements

- React Native with Expo
- Node.js >= 14.0.0
- ShareDB >= 5.4.0
- Expo SQLite >= 14.0.0

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Lint code: `npm run lint`
5. Submit a pull request

## License

MIT © [Shaxpir Inc](https://shaxpir.com)

---

**Related Projects:**
- [@shaxpir/sharedb-storage-node-sqlite](https://github.com/shaxpir/sharedb-storage-node-sqlite) - Node.js/CLI companion package with better-sqlite3
- [Shaxpir ShareDB Fork](https://github.com/shaxpir/sharedb) - Enhanced ShareDB with DurableStore support (required peer dependency)
- [Original ShareDB](https://github.com/share/sharedb) - Upstream ShareDB project (without DurableStore)
- [DurableStore Documentation](https://github.com/shaxpir/sharedb/blob/pluggable-store/DURABLE_STORE_GUIDE.md) - Offline-first client persistence guide

**Package Relationship:**
This package provides React Native storage for the **DurableStore** system in `@shaxpir/sharedb`. The DurableStore enables offline-first document persistence and operation queuing - a key enhancement not available in the original upstream ShareDB. 

Originally, both React Native and Node.js adapters were in this package, but they have been separated:
- **This package** (`@shaxpir/sharedb-storage-expo-sqlite`) - React Native/Expo with expo-sqlite
- **Node.js package** (`@shaxpir/sharedb-storage-node-sqlite`) - Node.js/CLI with better-sqlite3

This separation avoids bundling conflicts and provides optimized support for each platform.