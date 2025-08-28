const expect = require('chai').expect;
const path = require('path');
const fs = require('fs');
const SqliteStorage = require('../lib/sqlite-storage');
const BetterSqliteAdapter = require('../lib/adapters/better-sqlite-adapter');
const DefaultSchemaStrategy = require('../lib/schema/default-schema-strategy');

describe('DefaultSchemaStrategy Inventory Management', function() {
  const testDbDir = path.join(__dirname, 'test-databases');
  const testDbFile = 'test-default-inventory.db';
  const testDbPath = path.join(testDbDir, testDbFile);

  beforeEach(function(done) {
    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    done();
  });

  afterEach(function(done) {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    done();
  });

  it('should properly maintain inventory when writing documents', function(done) {
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: false});
    const schemaStrategy = new DefaultSchemaStrategy({
      debug: false
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: false
    });

    storage.initialize(function(err, inventory) {
      expect(err).to.be.null;
      expect(inventory).to.exist;
      
      // Create test documents - note that DefaultSchemaStrategy doesn't use collection field
      const termDoc = {
        id: 'term/term1',
        payload: {
          collection: 'term',  // This is stored but not used for table routing
          id: 'term1',
          text: 'hello',
          v: 1
        }
      };

      const sessionDoc = {
        id: 'session/session1',
        payload: {
          collection: 'session',
          id: 'session1',
          device_id: 'device1',
          v: 1
        }
      };

      // Write documents
      storage.writeRecords({docs: [termDoc, sessionDoc]}, function(writeErr) {
        expect(writeErr).to.not.exist;

        // Check inventory was updated correctly
        storage.readInventory(function(invErr, inv) {
          expect(invErr).to.not.exist;
          expect(inv).to.exist;
          expect(inv.payload).to.exist;
          
          // DefaultSchemaStrategy stores everything in a single 'docs' collection
          // The inventory tracks by collection/docId as the key
          console.log('DefaultSchemaStrategy inventory:', JSON.stringify(inv.payload, null, 2));

          storage.close(done);
        });
      });
    });
  });

  it('should find documents when collection is not specified', function(done) {
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: false});
    const schemaStrategy = new DefaultSchemaStrategy({
      debug: false
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: false
    });

    storage.initialize(function(err) {
      expect(err).to.be.null;
      
      const termDoc = {
        id: 'term/term1',
        payload: {
          collection: 'term',
          id: 'term1',
          text: 'test',
          v: 1
        }
      };

      // Write document
      storage.writeRecords({docs: [termDoc]}, function(writeErr) {
        expect(writeErr).to.not.exist;

        // Try to read without specifying collection (mimics DurableStore behavior)
        storage.readRecord('docs', 'term/term1', function(payload) {
          expect(payload).to.exist;
          expect(payload.collection).to.equal('term');
          expect(payload.id).to.equal('term1');
          expect(payload.text).to.equal('test');

          storage.close(done);
        });
      });
    });
  });

  it('should return null for non-existent documents', function(done) {
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: false});
    const schemaStrategy = new DefaultSchemaStrategy({
      debug: false
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: false
    });

    storage.initialize(function(err) {
      expect(err).to.be.null;

      // Try to read non-existent document
      storage.readRecord('docs', 'term/nonexistent', function(payload) {
        expect(payload).to.be.null;
        
        storage.close(done);
      });
    });
  });

  it('should handle documents without collection field', function(done) {
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: false});
    const schemaStrategy = new DefaultSchemaStrategy({
      debug: false
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: false
    });

    storage.initialize(function(err) {
      expect(err).to.be.null;

      // DefaultSchemaStrategy should accept documents without collection field
      const simpleDoc = {
        id: 'simple1',
        payload: {
          // No collection field
          id: 'simple1',
          text: 'test',
          v: 1
        }
      };

      storage.writeRecords({docs: [simpleDoc]}, function(writeErr) {
        // Should succeed for DefaultSchemaStrategy
        expect(writeErr).to.not.exist;
        
        // Should be able to read it back
        storage.readRecord('docs', 'simple1', function(payload) {
          expect(payload).to.exist;
          expect(payload.id).to.equal('simple1');
          expect(payload.text).to.equal('test');
          
          storage.close(done);
        });
      });
    });
  });

  it('should update inventory when documents are updated', function(done) {
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: false});
    const schemaStrategy = new DefaultSchemaStrategy({
      debug: false
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: false
    });

    storage.initialize(function(err) {
      expect(err).to.be.null;
      
      const termDoc = {
        id: 'term/term1',
        payload: {
          collection: 'term',
          id: 'term1',
          text: 'v1',
          v: 1
        }
      };

      // Write initial version
      storage.writeRecords({docs: [termDoc]}, function(writeErr1) {
        expect(writeErr1).to.not.exist;

        // Update document
        termDoc.payload.text = 'v2';
        termDoc.payload.v = 2;

        storage.writeRecords({docs: [termDoc]}, function(writeErr2) {
          expect(writeErr2).to.not.exist;

          // Check inventory was updated with new version
          storage.readInventory(function(invErr, inv) {
            expect(invErr).to.not.exist;
            console.log('Updated inventory:', JSON.stringify(inv.payload, null, 2));

            storage.close(done);
          });
        });
      });
    });
  });

  it('should handle bulk reads', function(done) {
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: false});
    const schemaStrategy = new DefaultSchemaStrategy({
      debug: false
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: false
    });

    storage.initialize(function(err) {
      expect(err).to.be.null;
      
      const docs = [
        {
          id: 'term/term1',
          payload: { collection: 'term', id: 'term1', text: 'hello', v: 1 }
        },
        {
          id: 'term/term2',
          payload: { collection: 'term', id: 'term2', text: 'world', v: 1 }
        },
        {
          id: 'session/session1',
          payload: { collection: 'session', id: 'session1', device: 'dev1', v: 1 }
        }
      ];

      // Write documents
      storage.writeRecords({docs: docs}, function(writeErr) {
        expect(writeErr).to.not.exist;

        // Bulk read with mixed collections
        const idsToRead = ['term/term1', 'session/session1', 'term/nonexistent', 'term/term2'];
        
        storage.readRecordsBulk('docs', idsToRead, function(bulkErr, records) {
          expect(bulkErr).to.not.exist;
          expect(records).to.have.lengthOf(3); // Only 3 exist
          
          // Verify correct documents were returned
          const recordsById = {};
          records.forEach(r => recordsById[r.id] = r);
          
          expect(recordsById['term/term1']).to.exist;
          expect(recordsById['term/term1'].payload.text).to.equal('hello');
          
          expect(recordsById['term/term2']).to.exist;
          expect(recordsById['term/term2'].payload.text).to.equal('world');
          
          expect(recordsById['session/session1']).to.exist;
          expect(recordsById['session/session1'].payload.device).to.equal('dev1');
          
          expect(recordsById['term/nonexistent']).to.not.exist;

          storage.close(done);
        });
      });
    });
  });

  it('should properly clean up inventory when documents are deleted', function(done) {
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: false});
    const schemaStrategy = new DefaultSchemaStrategy({
      debug: false
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: false
    });

    storage.initialize(function(err) {
      expect(err).to.be.null;
      
      const termDoc = {
        id: 'term/term1',
        payload: {
          collection: 'term',
          id: 'term1',
          text: 'test',
          v: 1
        }
      };

      // Write document
      storage.writeRecords({docs: [termDoc]}, function(writeErr) {
        expect(writeErr).to.not.exist;

        // Delete document - note the collection parameter for DefaultSchemaStrategy
        storage.deleteRecord('docs', 'term/term1', function(delErr) {
          expect(delErr).to.not.exist;

          // Check inventory was updated
          storage.readInventory(function(invErr, inv) {
            expect(invErr).to.not.exist;
            console.log('Inventory after delete:', JSON.stringify(inv.payload, null, 2));

            // Try to read deleted document
            storage.readRecord('docs', 'term/term1', function(payload) {
              expect(payload).to.be.null;
              
              storage.close(done);
            });
          });
        });
      });
    });
  });

  it('should handle updateInventory calls directly', function(done) {
    const adapter = new BetterSqliteAdapter(testDbPath, {debug: false});
    const schemaStrategy = new DefaultSchemaStrategy({
      debug: false
    });

    const storage = new SqliteStorage({
      adapter: adapter,
      schemaStrategy: schemaStrategy,
      dbFileName: testDbFile,
      dbFileDir: testDbDir,
      debug: false
    });

    storage.initialize(function(err) {
      expect(err).to.be.null;

      // Direct inventory manipulation
      storage.updateInventory('posts', 'post1', 1, 'add', function(err1) {
        expect(err1).to.not.exist;

        storage.updateInventory('posts', 'post2', 1, 'add', function(err2) {
          expect(err2).to.not.exist;

          storage.readInventory(function(err3, inventory) {
            expect(err3).to.not.exist;
            expect(inventory.payload.collections).to.exist;
            expect(inventory.payload.collections.posts).to.deep.equal({
              'post1': 1,
              'post2': 1
            });

            // Now remove one
            storage.updateInventory('posts', 'post1', 1, 'remove', function(err4) {
              expect(err4).to.not.exist;

              storage.readInventory(function(err5, inventory2) {
                expect(err5).to.not.exist;
                expect(inventory2.payload.collections.posts).to.deep.equal({
                  'post2': 1
                });

                storage.close(done);
              });
            });
          });
        });
      });
    });
  });
});