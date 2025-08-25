# ShareDB Expo SQLite Storage - Project Plan

## Overview

This document outlines the plan for creating `@shaxpir/sharedb-storage-expo-sqlite`, a dedicated React Native package for ShareDB offline storage using Expo SQLite. This package will be extracted from the main ShareDB repository to eliminate dependency concerns and provide a cleaner architectural separation.

## Project Goals

### Primary Objectives
1. **Clean Separation**: Remove React Native specific code from core ShareDB
2. **Zero Dependencies**: Eliminate expo-sqlite bundling concerns for browser/Node.js apps
3. **Focused Package**: Create a dedicated, well-tested React Native storage solution
4. **Seamless Integration**: Maintain simple usage patterns for React Native developers
5. **Independent Evolution**: Allow React Native features to evolve independently

### Success Criteria
- ✅ Core ShareDB has zero React Native dependencies
- ✅ React Native package works seamlessly with existing DuiDuiDui app architecture
- ✅ All existing functionality preserved (dual-database, connection pooling)
- ✅ Comprehensive test coverage maintained
- ✅ Clear documentation and migration guide

## Package Architecture

### Package Name
`@shaxpir/sharedb-storage-expo-sqlite`

### Repository Structure
```
sharedb-storage-expo-sqlite/
├── lib/
│   ├── expo-sqlite-storage.js           # Main storage class
│   ├── adapters/
│   │   └── expo-sqlite-adapter.js       # Expo SQLite adapter
│   ├── connection-pool/
│   │   └── sqlite-connection-pool.js    # Connection pooling
│   └── schema/
│       └── default-schema-strategy.js   # Schema management
├── test/
│   ├── expo-sqlite-storage-test.js      # Storage tests
│   ├── dual-database-integration-test.js
│   ├── connection-pool-test.js
│   └── helpers/
│       └── mock-sqlite.js               # Test helpers
├── docs/
│   ├── DUAL_DATABASE_GUIDE.md           # Integration guides
│   ├── CONNECTION_POOLING_GUIDE.md
│   └── MIGRATION_GUIDE.md               # Migration from core repo
├── package.json
├── README.md
├── .gitignore
├── .eslintrc.js
└── PROJECT_PLAN.md (this file)
```

### Dependencies Strategy
- **Core Dependency**: `@shaxpir/sharedb` (peer dependency)
- **React Native Dependencies**: `expo-sqlite`, `generic-pool`
- **Dev Dependencies**: Testing framework, linting tools

## Implementation Phases

### Phase 1: Project Setup ⭐ (Current)
**Goal**: Create package foundation with proper configuration

**Tasks**:
1. ✅ Create comprehensive project plan (this document)
2. 🔄 Set up package.json with dependencies and scripts
3. 🔄 Create essential project files (.gitignore, .eslintrc.js)
4. 🔄 Initialize README.md with usage examples

**Deliverables**:
- Working package.json with proper dependencies
- Complete project configuration
- Initial documentation structure

### Phase 2: Code Migration
**Goal**: Move React Native specific code from core ShareDB

**Source Files to Move**:
```
FROM: sharedb/lib/client/storage/
├── expo-sqlite-storage.js                    → lib/expo-sqlite-storage.js
├── adapters/expo-sqlite-adapter.js           → lib/adapters/expo-sqlite-adapter.js  
├── connection-pool/sqlite-connection-pool.js → lib/connection-pool/sqlite-connection-pool.js
└── schema/default-schema-strategy.js         → lib/schema/default-schema-strategy.js

FROM: sharedb/test/client/storage/
├── dual-database-integration-test.js         → test/dual-database-integration-test.js
└── connection-pool-test.js                   → test/connection-pool-test.js

FROM: sharedb/
├── DUAL_DATABASE_INTEGRATION_GUIDE.md        → docs/DUAL_DATABASE_GUIDE.md
└── CONNECTION_POOLING_GUIDE.md               → docs/CONNECTION_POOLING_GUIDE.md
```

**Code Updates Required**:
- Update import paths to use `@shaxpir/sharedb` as external dependency
- Remove core ShareDB internal imports (logger, base classes)
- Update test mocks to work independently

### Phase 3: Integration & Testing
**Goal**: Ensure package works seamlessly with existing applications

**Tasks**:
1. Update imports to reference core ShareDB as external dependency
2. Adapt schema strategy to work with core ShareDB base classes
3. Update connection pooling to use generic-pool as direct dependency
4. Migrate and update all test cases
5. Create mock helpers for testing without expo-sqlite

**Testing Strategy**:
- Unit tests for all storage functionality
- Integration tests for dual-database scenarios  
- Connection pool tests with mock databases
- Compatibility tests with DuiDuiDui app patterns

### Phase 4: Core ShareDB Cleanup
**Goal**: Remove React Native code from core ShareDB repository

**Files to Remove from Core ShareDB**:
- `lib/client/storage/expo-sqlite-storage.js`
- `lib/client/storage/adapters/expo-sqlite-adapter.js`
- `lib/client/storage/connection-pool/sqlite-connection-pool.js`
- React Native specific parts of `default-schema-strategy.js`
- `test/client/storage/dual-database-integration-test.js`
- `test/client/storage/connection-pool-test.js`
- `DUAL_DATABASE_INTEGRATION_GUIDE.md`
- `CONNECTION_POOLING_GUIDE.md`

**Updates Required**:
- Remove `generic-pool` dependency from core ShareDB
- Update documentation to reference new package
- Clean up any React Native references

### Phase 5: Documentation & Migration
**Goal**: Provide comprehensive documentation and migration guide

**Documentation Deliverables**:
1. **README.md**: Clear usage examples and installation instructions
2. **MIGRATION_GUIDE.md**: Step-by-step migration from core ShareDB
3. **DUAL_DATABASE_GUIDE.md**: Dual-database integration patterns
4. **CONNECTION_POOLING_GUIDE.md**: Connection pooling best practices
5. **API_REFERENCE.md**: Complete API documentation

## Usage Patterns

### Target Usage (DuiDuiDui App)
```javascript
// Before: Everything from core ShareDB
import ShareDB from '@shaxpir/sharedb';
import { ExpoSqliteStorage } from '@shaxpir/sharedb'; // ❌ Bundling issues

// After: Clean separation
import ShareDB from '@shaxpir/sharedb';                           // Core functionality
import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite'; // RN storage

const connection = new ShareDB.Connection(websocket);
const storage = new ExpoSqliteStorage({
  database: await DatabaseServiceInit.init(),
  connectionPool: dbConnectionPool,
  collectionMapping: (collection) => `userdata.${collection}`,
  enableCrossDbQueries: true
});

connection.useDurableStore({ storage });
```

### Key Features Preserved
- ✅ **Dual-Database Support**: Pre-initialized database connections
- ✅ **Schema Prefix Routing**: `userdata.table` targeting  
- ✅ **Collection Mapping**: Callback functions for table mapping
- ✅ **Cross-Database Queries**: JOIN operations between databases
- ✅ **Connection Pooling**: Dependency injection with `generic-pool`
- ✅ **Complete Backward Compatibility**: All existing patterns work

## Migration Impact

### For DuiDuiDui App
**Required Changes**:
```bash
# Install new package
npm install @shaxpir/sharedb-storage-expo-sqlite

# Update import
- import { ExpoSqliteStorage } from '@shaxpir/sharedb';
+ import { ExpoSqliteStorage } from '@shaxpir/sharedb-storage-expo-sqlite';
```

**No Other Changes Required**:
- All usage patterns remain identical
- All configuration options preserved
- All functionality maintained

### For Other ShareDB Users
**No Impact**:
- Core ShareDB functionality unchanged
- Browser/Node.js apps unaffected
- No dependency or bundling changes

## Quality Assurance

### Testing Strategy
1. **Unit Tests**: All individual components (storage, adapter, pool)
2. **Integration Tests**: Dual-database scenarios with real SQLite
3. **Mock Tests**: Testing without expo-sqlite dependency
4. **Compatibility Tests**: Verify compatibility with DuiDuiDui patterns
5. **Performance Tests**: Connection pooling efficiency

### Code Quality
- **ESLint**: Same configuration as core ShareDB
- **Test Coverage**: Maintain >90% coverage
- **Documentation**: Comprehensive guides and examples
- **TypeScript**: Type definitions for better DX

## Timeline Estimation

### Phase 1: Project Setup (0.5 days)
- Package configuration and essential files

### Phase 2: Code Migration (1 day)  
- Move files and update imports

### Phase 3: Integration & Testing (1 day)
- Ensure everything works independently

### Phase 4: Core Cleanup (0.5 days)
- Remove React Native code from core ShareDB

### Phase 5: Documentation (0.5 days)
- Migration guide and updated documentation

**Total Estimated Time**: 3.5 days

## Success Metrics

### Technical Metrics
- ✅ Zero React Native dependencies in core ShareDB
- ✅ All tests passing in both packages
- ✅ DuiDuiDui app works with minimal changes
- ✅ Bundle size reduction for browser/Node.js apps

### User Experience Metrics  
- ✅ Simple migration path (1-2 line change)
- ✅ Clear documentation and examples
- ✅ No functionality regression
- ✅ Better error messages for environment mismatches

## Risk Mitigation

### Potential Risks
1. **Import Resolution**: Core ShareDB classes might not import correctly
2. **Test Dependencies**: Test mocks might need significant updates
3. **Version Compatibility**: Package versions could get out of sync

### Mitigation Strategies
1. **Peer Dependencies**: Use peer deps to ensure version compatibility
2. **Integration Testing**: Test with real DuiDuiDui app during development
3. **Gradual Migration**: Keep both versions working during transition
4. **Comprehensive Documentation**: Detailed migration guides and troubleshooting

## Future Roadmap

### Short Term (Next 3 months)
- Stable release of separated package
- Migration of DuiDuiDui app
- Community feedback integration

### Medium Term (6 months)
- TypeScript definitions
- Additional React Native optimizations
- Performance improvements

### Long Term (1 year+)  
- Support for other React Native SQLite libraries
- Advanced React Native specific features
- Integration with other React Native storage solutions

---

This plan provides a comprehensive roadmap for successfully separating the React Native storage functionality into a dedicated, well-architected package while maintaining all existing functionality and providing a smooth migration path.