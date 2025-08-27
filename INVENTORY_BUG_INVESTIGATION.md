# Inventory Bug Investigation & Fix

## Summary
Fixed a critical bug in CollectionPerTableStrategy where inventory records were not being written to the database, causing "Cannot read property 'collection' of null" errors in the duiduidui-app when searching for phrases.

## Root Cause
The CollectionPerTableStrategy's `writeRecords` method had a fundamental issue with how it handled database transactions. Inside transactions, it was trying to call `transactionDb.runAsync()` which doesn't exist - the transaction adapter only provides callback-based methods like `run()`, `get()`, and `all()`.

## The Bug Path
1. **Initial symptom**: In duiduidui-app, searching for phrases threw "Cannot read property 'collection' of null" errors
2. **First investigation**: Found duplicate callbacks in SqliteStorage.readRecord 
3. **Promise chain fix**: Fixed promise chaining in readRecord (line 411) to prevent callbacks after early returns
4. **Deeper issue**: Even after promise fix, inventory table was empty after writes
5. **Real problem**: `transactionDb.runAsync is not a function` error was silently failing

## Key Discoveries

### Architecture Differences
There are three different inventory management approaches:

1. **Original DurableStore (IndexedDB)**
   - Inventory is a single JSON document
   - DurableStore manages inventory in memory
   - Writes entire inventory as one meta record
   - Atomic updates

2. **DefaultSchemaStrategy** 
   - Also stores inventory as single JSON in meta table
   - Compatible with DurableStore approach
   - `updateInventory` reads, modifies, writes entire document

3. **CollectionPerTableStrategy**
   - Stores inventory as individual rows in `sharedb_inventory` table
   - Each document has its own row with (collection, doc_id, version, updated_at)
   - Automatically updates during `writeRecords`
   - Provides `readInventory` that reconstructs JSON from rows

### The Transaction Adapter Issue
- Inside transaction callbacks, the adapter is passed directly (not wrapped)
- The adapter only has callback-based methods: `run()`, `get()`, `all()`
- Code was trying to use `transactionDb.runAsync()` which doesn't exist
- This caused silent failures - no error thrown, just stopped execution

## The Fix

### 1. Published sharedb-storage-expo-sqlite v1.0.15
Created an async wrapper for the transaction adapter:

```javascript
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
  // ... rest of transaction code can now use transactionDb.runAsync()
```

This maintains consistency with the non-transaction code path which uses `db.runAsync()`.

### 2. Promise Chain Fix
Also fixed the promise chaining issue where callbacks were called multiple times:
- Changed from `return db.getFirstAsync().then()` (which chains)
- To nested promise: `db.getFirstAsync().then()` (without return)

## Test Results
After fix:
- ✅ Inventory table is properly populated with document records
- ✅ `readInventory()` correctly reconstructs JSON from table rows  
- ✅ Document reads work correctly using inventory lookups
- ✅ 52/54 tests passing (2 timeouts in bulk/delete tests need investigation)

## Important Architecture Note
The code MUST use adapter abstraction methods, not raw database APIs, to maintain compatibility across:
- `expo-sqlite` (React Native)
- `sqlite3` (Node.js async)
- `better-sqlite3` (Node.js sync)

The adapter layer handles these differences - business logic should only call adapter methods.

## Next Steps
1. Clean up debug logging added during investigation
2. Fix remaining test timeouts in bulk read and delete operations
3. Test the fix in the actual duiduidui-app
4. Consider if CollectionPerTableStrategy's dual approach (table + JSON interface) is the right design

## Files Modified
- `/Users/benji/dev/shaxpir/sharedb-storage-expo-sqlite/lib/schema/collection-per-table-strategy.js` - Added transaction wrapper
- `/Users/benji/dev/shaxpir/sharedb-storage-expo-sqlite/package.json` - Bumped to v1.0.15
- Published to npm as @shaxpir/sharedb-storage-expo-sqlite@1.0.15