// Type definitions for @shaxpir/sharedb-storage-expo-sqlite
// Project: https://github.com/shaxpir/sharedb-storage-expo-sqlite
// Definitions by: Claude Code <https://claude.ai/code>

/// <reference types="node" />

import { EventEmitter } from 'events';

declare namespace ShareDBSQLiteStorage {
  // ===============================
  // Core Types
  // ===============================

  type Callback<T = void> = (error: Error | null, result?: T) => void;

  // Database connection types
  type SqlParameters = (string | number | boolean | null | Buffer)[];
  
  interface DatabaseConnection {
    runAsync(sql: string, params?: SqlParameters): Promise<any>;
    getFirstAsync(sql: string, params?: SqlParameters): Promise<any>;
    getAllAsync(sql: string, params?: SqlParameters): Promise<any[]>;
  }

  interface StorageRecord {
    id: string;        // Compound key in format "collection/docId" as used by ShareDB DurableStore
    payload: {
      collection: string;    // Collection name (inside payload per ShareDB DurableStore)
      id: string;           // Document ID (inside payload per ShareDB DurableStore)
      [key: string]: any;   // Additional document data
    };
  }

  interface StorageRecords {
    docs?: StorageRecord | StorageRecord[];
    meta?: StorageRecord | StorageRecord[];
  }

  interface Storage {
    initialize(callback: Callback): void;
    readRecord(storeName: string, id: string, callback: Callback<any>): void; // Returns document payload (any structure)
    readAllRecords(storeName: string, callback: Callback<StorageRecord[]>): void;
    readRecordsBulk?(storeName: string, ids: string[], callback: Callback<StorageRecord[]>): void;
    writeRecords(records: StorageRecords, callback: Callback): void;
    deleteRecord(storeName: string, id: string, callback: Callback): void;
    clearStore(storeName: string, callback: Callback): void;
    clearAll(callback: Callback): void;
    close?(callback: Callback): void;
    isReady?(): boolean;
  }

  // ===============================
  // SQLite Storage System
  // ===============================

  interface SqliteStorageOptions {
    adapter: SqliteAdapter;
    schemaStrategy?: SchemaStrategy;
    debug?: boolean;
  }

  interface SqliteStorage extends Storage {
    readonly adapter: SqliteAdapter;
    readonly schemaStrategy: SchemaStrategy;
    readonly ready: boolean;

    updateInventory(collection: string, docId: string, version: number, operation: string, callback: Callback): void;
    readInventory(callback: Callback): void;
    deleteDatabase(callback: Callback): void;
  }

  interface SqliteStorageStatic {
    new (options: SqliteStorageOptions): SqliteStorage;
  }

  // ===============================
  // SQLite Adapters
  // ===============================

  interface SqliteAdapter {
    readonly isReady: boolean;

    openDatabase(callback: Callback): void;
    closeDatabase(callback: Callback): void;
    run(sql: string, params: SqlParameters, callback: Callback): void;
    get(sql: string, params: SqlParameters, callback: Callback<any>): void;
    all(sql: string, params: SqlParameters, callback: Callback<any[]>): void;
    getType(): string;
  }

  interface BaseSqliteAdapter extends SqliteAdapter {}

  // Expo SQLite database interface (from expo-sqlite)
  interface ExpoSQLiteDatabase {
    runAsync(sql: string, params?: SqlParameters): Promise<{ lastInsertRowId: number; changes: number }>;
    getFirstAsync(sql: string, params?: SqlParameters): Promise<any>;
    getAllAsync(sql: string, params?: SqlParameters): Promise<any[]>;
    withTransactionAsync<T>(task: () => Promise<T>): Promise<T>;
    closeAsync(): Promise<void>;
  }

  // Node SQLite database interface (better-sqlite3 or sqlite3)
  interface NodeSQLiteDatabase {
    prepare?(statement: string): any;
    exec?(sql: string): void;
    close?(): void;
    [key: string]: any; // For compatibility with different SQLite libraries
  }

  interface BaseSqliteAdapterStatic {
    new (options?: Record<string, any>): BaseSqliteAdapter;
  }

  interface ExpoSqliteAdapterOptions {
    database: ExpoSQLiteDatabase;
    debug?: boolean;
  }

  interface ExpoSqliteAdapter extends SqliteAdapter {
    readonly database: ExpoSQLiteDatabase;
  }

  interface ExpoSqliteAdapterStatic {
    new (options: ExpoSqliteAdapterOptions): ExpoSqliteAdapter;
  }

  interface NodeSqliteAdapterOptions {
    debug?: boolean;
  }

  interface NodeSqliteAdapter extends SqliteAdapter {
    readonly db: NodeSQLiteDatabase;
  }

  interface NodeSqliteAdapterStatic {
    new (options?: NodeSqliteAdapterOptions): NodeSqliteAdapter;
  }

  // ===============================
  // Schema Strategies
  // ===============================

  interface CollectionConfig {
    indexes: string[];
    encryptedFields: string[];
  }

  interface SchemaStrategyOptions {
    useEncryption?: boolean;
    encryptionCallback?: (text: string) => string;
    decryptionCallback?: (encrypted: string) => string;
    debug?: boolean;
  }

  interface SchemaStrategy {
    initializeSchema(db: DatabaseConnection, callback: Callback): void;
    validateSchema(db: DatabaseConnection, callback: Callback<boolean>): void;
    writeRecords(db: DatabaseConnection, records: StorageRecords, callback: Callback): void;
    readRecord(db: DatabaseConnection, type: string, id: string, collection?: string, callback?: Callback<StorageRecord | null>): void;
    readAllRecords(db: DatabaseConnection, type: string, collection?: string, callback?: Callback<StorageRecord[]>): void;
    readRecordsBulk?(db: DatabaseConnection, type: string, collection: string, ids: string[], callback: Callback<StorageRecord[]>): void;
    deleteRecord(db: DatabaseConnection, type: string, id: string, collection?: string, callback?: Callback): void;
    clearStore(db: DatabaseConnection, storeName: string, callback: Callback): void;
    clearAll(db: DatabaseConnection, callback: Callback): void;
    updateInventoryItem(db: DatabaseConnection, collection: string, docId: string, version: number | string, operation: string, callback: Callback): void;
    readInventory(db: DatabaseConnection, callback: Callback<StorageRecord>): void;
    initializeInventory(db: DatabaseConnection, callback: Callback<StorageRecord>): void;
    getInventoryType(): string;
    deleteAllTables(db: DatabaseConnection, callback: Callback): void;
  }

  interface BaseSchemaStrategy extends SchemaStrategy {}

  interface BaseSchemaStrategyStatic {
    new (options?: SchemaStrategyOptions): BaseSchemaStrategy;
  }

  interface DefaultSchemaStrategyOptions extends SchemaStrategyOptions {}

  interface DefaultSchemaStrategy extends SchemaStrategy {}

  interface DefaultSchemaStrategyStatic {
    new (options?: DefaultSchemaStrategyOptions): DefaultSchemaStrategy;
  }

  interface CollectionPerTableStrategyOptions extends SchemaStrategyOptions {
    collectionConfig: { [collection: string]: CollectionConfig };
  }

  interface CollectionPerTableStrategy extends SchemaStrategy {
    readonly collectionConfig: { [collection: string]: CollectionConfig };
    
    getTableName(collection: string): string;
    ensureCollectionTable(db: DatabaseConnection, collection: string, callback: Callback): void;
  }

  interface CollectionPerTableStrategyStatic {
    new (options: CollectionPerTableStrategyOptions): CollectionPerTableStrategy;
  }

  // ===============================
  // Connection Pooling
  // ===============================

  interface ConnectionPoolOptions {
    createConnection: () => Promise<DatabaseConnection> | DatabaseConnection;
    minConnections?: number;
    maxConnections?: number;
    acquireTimeoutMillis?: number;
    idleTimeoutMillis?: number;
    debug?: boolean;
  }

  interface ConnectionPool {
    acquire(): Promise<DatabaseConnection>;
    release(connection: DatabaseConnection): Promise<void>;
    drain(): Promise<void>;
    clear(): Promise<void>;
    size: number;
    available: number;
    borrowed: number;
    pending: number;
    spareResourceCapacity: number;
  }

  interface ConnectionPoolStatic {
    new (options: ConnectionPoolOptions): ConnectionPool;
  }
}

// ===============================
// Named Exports
// ===============================

export const SqliteStorage: ShareDBSQLiteStorage.SqliteStorageStatic;
export const BaseSqliteAdapter: ShareDBSQLiteStorage.BaseSqliteAdapterStatic;
export const ExpoSqliteAdapter: ShareDBSQLiteStorage.ExpoSqliteAdapterStatic;
export const NodeSqliteAdapter: ShareDBSQLiteStorage.NodeSqliteAdapterStatic;
export const BaseSchemaStrategy: ShareDBSQLiteStorage.BaseSchemaStrategyStatic;
export const DefaultSchemaStrategy: ShareDBSQLiteStorage.DefaultSchemaStrategyStatic;
export const CollectionPerTableStrategy: ShareDBSQLiteStorage.CollectionPerTableStrategyStatic;
export const StandardSQLiteConnectionPool: ShareDBSQLiteStorage.ConnectionPoolStatic;

// Direct type exports for better ergonomics
export type ShareDBStorage = ShareDBSQLiteStorage.Storage;
export type StorageRecord = ShareDBSQLiteStorage.StorageRecord;
export type StorageRecords = ShareDBSQLiteStorage.StorageRecords;
export type SqliteAdapter = ShareDBSQLiteStorage.SqliteAdapter;
export type SqliteSchemaStrategy = ShareDBSQLiteStorage.SchemaStrategy;
export type CollectionConfig = ShareDBSQLiteStorage.CollectionConfig;
export type SqliteConnectionPool = ShareDBSQLiteStorage.ConnectionPool;
export type StorageCallback<T = void> = ShareDBSQLiteStorage.Callback<T>;

// Legacy namespace for backwards compatibility
export namespace Types {
  export type Storage = ShareDBSQLiteStorage.Storage;
  export type StorageRecord = ShareDBSQLiteStorage.StorageRecord;
  export type StorageRecords = ShareDBSQLiteStorage.StorageRecords;
  export type SqliteAdapter = ShareDBSQLiteStorage.SqliteAdapter;
  export type SchemaStrategy = ShareDBSQLiteStorage.SchemaStrategy;
  export type CollectionConfig = ShareDBSQLiteStorage.CollectionConfig;
  export type ConnectionPool = ShareDBSQLiteStorage.ConnectionPool;
  export type Callback<T = void> = ShareDBSQLiteStorage.Callback<T>;
}