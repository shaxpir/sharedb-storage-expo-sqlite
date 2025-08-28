const expect = require('chai').expect;
const path = require('path');
const fs = require('fs');
const SqliteStorage = require('../lib/sqlite-storage');
const BetterSqliteAdapter = require('../lib/adapters/better-sqlite-adapter');
const CollectionPerTableStrategy = require('../lib/schema/collection-per-table-strategy');

describe('Simple Write Test', function() {
  this.timeout(10000);
  
  it('CollectionPerTableStrategy should write without errors', function(done) {
    const testDbDir = path.join(__dirname, 'test-databases');
    const testDbFile = 'simple-write.db';
    const testDbPath = path.join(testDbDir, testDbFile);
    
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: true}); // Enable debug
    const schemaStrategy = new CollectionPerTableStrategy({
      collectionConfig: {
        'term': {
          indexes: [],
          encryptedFields: []
        }
      },
      debug: true // Enable debug
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: true // Enable debug
    });

    console.log('=== Starting initialization ===');
    storage.initialize(function(err, inventory) {
      console.log('=== Initialize callback, err:', err, 'inventory:', inventory);
      
      if (err) {
        done(err);
        return;
      }
      
      const termDoc = {
        id: 'term/term1',
        payload: {
          collection: 'term',
          id: 'term1',
          text: 'hello',
          v: 1
        }
      };

      console.log('=== Starting write ===');
      storage.writeRecords({docs: [termDoc]}, function(writeErr) {
        console.log('=== Write callback, err:', writeErr);
        
        if (writeErr) {
          done(writeErr);
          return;
        }
        
        console.log('=== Write succeeded, closing storage ===');
        storage.close(function() {
          console.log('=== Storage closed ===');
          done();
        });
      });
    });
  });
});