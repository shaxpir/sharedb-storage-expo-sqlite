// Type definitions for @shaxpir/sharedb-storage-expo-sqlite
// Project: https://github.com/shaxpir/sharedb-storage-expo-sqlite
// Definitions by: Claude Code <https://claude.ai/code>

/// <reference types="node" />

import { EventEmitter } from 'events';

declare namespace ShareDBSQLiteStorage {
  // ===============================
  // Core Types
  // ===============================

  type Callback<T = any> = (error: Error | null, result?: T) => void;

  interface StorageRecord {
    id: string;
    payload: any;
  }

  interface StorageRecords {
    docs?: StorageRecord | StorageRecord[];
    meta?: StorageRecord | StorageRecord[];
  }

  interface Storage {
    initialize(callback: Callback): void;
    readRecord(storeName: string, id: string, callback: Callback<any>): void;
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
    run(sql: string, params: any[], callback: Callback): void;
    get(sql: string, params: any[], callback: Callback): void;
    all(sql: string, params: any[], callback: Callback): void;
    getType(): string;
  }

  interface BaseSqliteAdapter extends SqliteAdapter {}

  interface BaseSqliteAdapterStatic {
    new (options?: any): BaseSqliteAdapter;
  }

  interface ExpoSqliteAdapterOptions {
    database: any; // Expo SQLite database instance
    debug?: boolean;
  }

  interface ExpoSqliteAdapter extends SqliteAdapter {
    readonly database: any;
  }

  interface ExpoSqliteAdapterStatic {
    new (options: ExpoSqliteAdapterOptions): ExpoSqliteAdapter;
  }

  interface NodeSqliteAdapterOptions {
    debug?: boolean;
  }

  interface NodeSqliteAdapter extends SqliteAdapter {
    readonly db: any; // better-sqlite3 or sqlite3 database instance
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
    initializeSchema(db: any, callback: Callback): void;
    validateSchema(db: any, callback: Callback): void;
    writeRecords(db: any, records: StorageRecords, callback: Callback): void;
    readRecord(db: any, type: string, id: string, collection?: string, callback?: Callback): void;
    readAllRecords(db: any, type: string, collection?: string, callback?: Callback): void;
    readRecordsBulk?(db: any, type: string, collection: string, ids: string[], callback: Callback<StorageRecord[]>): void;
    deleteRecord(db: any, type: string, id: string, collection?: string, callback?: Callback): void;
    clearStore(db: any, storeName: string, callback: Callback): void;
    clearAll(db: any, callback: Callback): void;
    updateInventoryItem(db: any, collection: string, docId: string, version: number, operation: string, callback: Callback): void;
    readInventory(db: any, callback: Callback): void;
    initializeInventory(db: any, callback: Callback): void;
    getInventoryType(): string;
    deleteAllTables(db: any, callback: Callback): void;
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
    ensureCollectionTable(db: any, collection: string, callback: Callback): void;
  }

  interface CollectionPerTableStrategyStatic {
    new (options: CollectionPerTableStrategyOptions): CollectionPerTableStrategy;
  }

  // ===============================
  // Connection Pooling
  // ===============================

  interface ConnectionPoolOptions {
    createConnection: () => Promise<any> | any;
    minConnections?: number;
    maxConnections?: number;
    acquireTimeoutMillis?: number;
    idleTimeoutMillis?: number;
    debug?: boolean;
  }

  interface ConnectionPool {
    acquire(): Promise<any>;
    release(connection: any): Promise<void>;
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
export type StorageCallback<T = any> = ShareDBSQLiteStorage.Callback<T>;

// Legacy namespace for backwards compatibility
export namespace Types {
  export type Storage = ShareDBSQLiteStorage.Storage;
  export type StorageRecord = ShareDBSQLiteStorage.StorageRecord;
  export type StorageRecords = ShareDBSQLiteStorage.StorageRecords;
  export type SqliteAdapter = ShareDBSQLiteStorage.SqliteAdapter;
  export type SchemaStrategy = ShareDBSQLiteStorage.SchemaStrategy;
  export type CollectionConfig = ShareDBSQLiteStorage.CollectionConfig;
  export type ConnectionPool = ShareDBSQLiteStorage.ConnectionPool;
  export type Callback<T = any> = ShareDBSQLiteStorage.Callback<T>;
}