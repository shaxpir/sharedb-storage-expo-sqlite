# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Testing
- `npm test` - Run the full test suite
- `npm run test-cover` - Run tests with code coverage

### Linting
- `npm run lint` - Check code style (must pass before committing)
- `npm run lint:fix` - Auto-fix linting issues

### Build & Package
- `npm run prepare` - Run lint and tests before publishing
- `npm run prepack` - Pre-packaging checks

## Architecture Overview

This package provides **React Native SQLite storage** for the **DurableStore** system in [@shaxpir/sharedb](https://github.com/shaxpir/sharedb). It was extracted from the core ShareDB package to eliminate bundling conflicts in browser/Node.js environments.

### Core Components

1. **ExpoSqliteStorage** (`lib/expo-sqlite-storage.js`) - Main storage adapter that:
   - Implements ShareDB storage interface for DurableStore integration
   - Provides SQLite-based document and operation persistence
   - Supports dual-database architectures (builtin + userdata)
   - Handles collection-to-table mapping with callback functions
   - Integrates with optional connection pooling

2. **StandardSQLiteConnectionPool** (`lib/standard-sqlite-connection-pool.js`) - Connection pool implementation that:
   - Uses `generic-pool` library for connection management
   - Supports dependency injection pattern
   - Provides configurable min/max connections, timeouts, and validation
   - Includes debug logging and statistics

### Key Features

**DurableStore Integration**:
- Purpose-built for ShareDB's offline-first DurableStore system
- Enables client-side document persistence and operation queuing
- Supports offline work with automatic sync on reconnection

**Dual-Database Support**:
- Pre-initialized database connections with schema prefixes
- Collection mapping via callback functions
- Cross-database queries for analytics and reporting
- Designed for apps with builtin (read-only) + userdata (writable) schemas

**Connection Pooling**:
- Optional connection pooling for performance optimization
- Dependency injection pattern for existing pool integration
- Configurable pool settings and connection lifecycle management

### Dependencies

**Peer Dependencies** (required):
- `@shaxpir/sharedb >= 5.4.0` - Shaxpir fork with DurableStore support
- `expo-sqlite >= 14.0.0` - React Native SQLite implementation

**Direct Dependencies**:
- `generic-pool ^3.9.0` - Connection pooling implementation

### Usage Patterns

**Basic File-Based Storage**:
```javascript
const storage = new ExpoSqliteStorage({
  namespace: 'myapp'  // Creates 'sharedb_myapp.db'
});
```

**Dual-Database with Pre-initialized Connection**:
```javascript
const storage = new ExpoSqliteStorage({
  database: await DatabaseServiceInit.init(),
  collectionMapping: (collection) => `userdata.${collection}`,
  connectionPool: existingPool
});
```

**Connection Pooling**:
```javascript
const pool = new StandardSQLiteConnectionPool({
  createConnection: () => DatabaseServiceInit.init(),
  maxConnections: 3,
  debug: true
});
```

### Key Development Notes

- **React Native Only**: This package is specifically for React Native/Expo environments
- **DurableStore Focus**: All functionality is designed around DurableStore integration
- **Peer Dependency**: Requires `@shaxpir/sharedb` (enhanced fork, not upstream ShareDB)
- **Testing**: Uses Mocha with Sinon for mocking SQLite operations
- **Linting**: Google style with modifications (matches core ShareDB)
- **ES3 Compatibility**: Maintains compatibility with ShareDB's ES3 syntax requirements

### Testing Strategy

- **Mock-based**: Uses Sinon to mock `expo-sqlite` operations
- **Comprehensive Coverage**: Tests all storage operations, dual-database features, and connection pooling
- **Error Handling**: Validates error scenarios and edge cases
- **Integration Patterns**: Tests common usage patterns and configurations

### Related Projects

- **[@shaxpir/sharedb](https://github.com/shaxpir/sharedb)** - Enhanced ShareDB fork with DurableStore (required peer dependency)
- **[Original ShareDB](https://github.com/share/sharedb)** - Upstream project (without DurableStore)
- **[DurableStore Guide](https://github.com/shaxpir/sharedb/blob/pluggable-store/DURABLE_STORE_GUIDE.md)** - Comprehensive offline-first documentation