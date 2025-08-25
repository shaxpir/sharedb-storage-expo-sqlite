# Migration Guide: From Core ShareDB to @shaxpir/sharedb-storage-expo-sqlite

This guide helps you migrate from using React Native SQLite storage in the core ShareDB package to the dedicated `@shaxpir/sharedb-storage-expo-sqlite` package.

## Why Migrate?

The React Native storage functionality has been extracted into a dedicated package to:

- ✅ **Eliminate Bundling Issues**: No React Native dependencies in browser/Node.js apps
- ✅ **Cleaner Architecture**: Focused, single-responsibility packages
- ✅ **Independent Evolution**: React Native features can evolve separately
- ✅ **Better Developer Experience**: Clear separation between environments

## Migration Steps

### Step 1: Install New Package

```bash
npm install @shaxpir/sharedb-storage-expo-sqlite
```

**Note**: The core `@shaxpir/sharedb` package remains unchanged and is still required.

### Step 2: Update Import Statement

**Before:**
```typescript
import ShareDB from '@shaxpir/sharedb';
import { ExpoSqliteStorage } from '@shaxpir/sharedb';  // ❌ This will cause bundling issues
```

**After:**
```typescript
import ShareDB from '@shaxpir/sharedb';                           // Core ShareDB functionality
import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite'; // React Native storage
```

### Step 3: Verify Dependencies

**Required Dependencies:**
- `@shaxpir/sharedb` (peer dependency)
- `expo-sqlite` (peer dependency - already in your React Native project)

**New Direct Dependency:**
- `generic-pool` (automatically installed with the new package)

## Code Changes Required

### For DuiDuiDui App

**Before:**
```typescript
// DatabaseService.ts or wherever you initialize ShareDB storage
import { ExpoSqliteStorage } from '@shaxpir/sharedb';
```

**After:**
```typescript
// DatabaseService.ts or wherever you initialize ShareDB storage  
import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite';
```

**That's it!** All your configuration and usage patterns remain exactly the same.

### Connection Pooling Changes

**Before:**
```typescript
import { StandardSQLiteConnectionPool } from '@shaxpir/sharedb';
```

**After:**
```typescript
import { ExpoSqliteStorage, StandardSQLiteConnectionPool } from '@shaxpir/sharedb-storage-expo-sqlite';
```

## No Functionality Changes

✅ **All existing functionality preserved:**
- Pre-initialized database support
- Dual-database architecture support
- Schema prefix routing
- Collection mapping with callbacks
- Cross-database queries
- Connection pooling with dependency injection
- Statistics and health monitoring

✅ **All configuration options identical:**
- Same constructor options
- Same method signatures
- Same event handling
- Same error messages

## Example Migration

### Complete Before/After Example

**Before (core ShareDB):**
```typescript
import ShareDB from '@shaxpir/sharedb';
import { ExpoSqliteStorage } from '@shaxpir/sharedb';  // Bundling issues!
import { DatabaseServiceInit } from './DatabaseServiceInit';
import { dbConnectionPool } from './DatabaseConnectionPool';

const connection = new ShareDB.Connection(websocket);

const storage = new ExpoSqliteStorage({
  database: await DatabaseServiceInit.init(),
  connectionPool: dbConnectionPool,
  collectionMapping: (collection) => `userdata.${collection}`,
  enableCrossDbQueries: true
});

connection.useDurableStore({ storage });
```

**After (dedicated package):**
```typescript
import ShareDB from '@shaxpir/sharedb';                           // Core unchanged
import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite'; // Dedicated package
import { DatabaseServiceInit } from './DatabaseServiceInit';
import { dbConnectionPool } from './DatabaseConnectionPool';

const connection = new ShareDB.Connection(websocket);

const storage = new ExpoSqliteStorage({
  database: await DatabaseServiceInit.init(),
  connectionPool: dbConnectionPool,
  collectionMapping: (collection) => `userdata.${collection}`,
  enableCrossDbQueries: true
});

connection.useDurableStore({ storage });
```

## Benefits After Migration

### For Your DuiDuiDui App
- ✅ Same exact functionality and performance
- ✅ No code changes beyond the import statement
- ✅ Future React Native optimizations without core ShareDB updates

### For Your Other Projects (Browser/Node.js)
- ✅ Smaller bundle sizes (no React Native dependencies)
- ✅ Faster build times
- ✅ No more environment detection hacks needed

## Rollback Strategy

If you encounter any issues, you can temporarily rollback:

1. **Uninstall new package**: `npm uninstall @shaxpir/sharedb-storage-expo-sqlite`
2. **Revert import**: Change back to `import { ExpoSqliteStorage } from '@shaxpir/sharedb'`
3. **File an issue**: Report the problem at [GitHub Issues](https://github.com/shaxpir/sharedb-storage-expo-sqlite/issues)

## Validation Checklist

After migration, verify:

- ✅ App builds successfully
- ✅ ShareDB storage initializes without errors
- ✅ Document sync continues to work
- ✅ Offline operations work correctly
- ✅ Cross-database queries function (if used)
- ✅ Connection pooling statistics available (if used)

## Troubleshooting

### "Cannot resolve module" Error

**Error**: `Unable to resolve module '@shaxpir/sharedb-storage-expo-sqlite'`

**Solution**: Ensure package is installed:
```bash
npm install @shaxpir/sharedb-storage-expo-sqlite
# or
yarn add @shaxpir/sharedb-storage-expo-sqlite
```

### Peer Dependency Warnings

**Warning**: `peer dep missing @shaxpir/sharedb`

**Solution**: Ensure you have the core ShareDB package:
```bash
npm install @shaxpir/sharedb
```

### TypeScript Errors

**Error**: Type definitions missing

**Solution**: TypeScript definitions are included in the package. If you have issues:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Import/Export Errors

**Error**: `ExpoSqliteStorage is not a constructor`

**Solution**: Check import syntax:
```typescript
// ✅ Correct
import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite';

// ❌ Incorrect  
import ExpoSqliteStorage from '@shaxpir/sharedb-storage-expo-sqlite';
```

## Support

If you encounter any issues during migration:

1. **Check this guide** for common solutions
2. **Review example code** in the test files
3. **File an issue** at [GitHub Issues](https://github.com/shaxpir/sharedb-storage-expo-sqlite/issues)
4. **Include details**: Error messages, code snippets, environment info

The migration should be seamless - if it's not, we want to know!

---

**Migration Time Estimate**: 2-5 minutes for most projects