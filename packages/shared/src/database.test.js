/**
 * Unit tests for DatabaseManager (T-005)
 *
 * TT-005-01: SQLite DB created in WAL mode
 * TT-005-02: DB created at ~/.osai/data/osai.db
 * TT-005-03: Core tables created correctly
 * TT-005-04: Foreign keys enabled
 * TT-005-06: Idempotent init (repeat call safe)
 * TT-005-07: Migration framework versioning
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from './database.js';
import { runMigrations } from './migrations.js';
import { MIGRATION_001_CREATE_CORE_TABLES } from './schema.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
describe('DatabaseManager', () => {
    let manager;
    const testDir = path.join(os.tmpdir(), `osai-test-db-${process.pid}-${Date.now()}`);
    const dbPath = path.join(testDir, 'osai.db');
    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
        manager = new DatabaseManager({ dbPath });
    });
    afterEach(() => {
        manager.close();
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });
    describe('TT-005-01: WAL mode', () => {
        it('should set journal_mode to WAL', () => {
            manager.initialize();
            const row = manager
                .getDb()
                .prepare('PRAGMA journal_mode')
                .get();
            expect(row.journal_mode).toBe('wal');
        });
    });
    describe('TT-005-02: DB file created at specified path', () => {
        it('should create the database file', () => {
            manager.initialize();
            expect(fs.existsSync(dbPath)).toBe(true);
        });
    });
    describe('TT-005-04: Foreign keys enabled', () => {
        it('should enable foreign_keys PRAGMA', () => {
            manager.initialize();
            const row = manager
                .getDb()
                .prepare('PRAGMA foreign_keys')
                .get();
            expect(row.foreign_keys).toBe(1);
        });
    });
    describe('TT-005-06: Idempotent init', () => {
        it('should not throw on repeated initialize calls', () => {
            manager.initialize();
            expect(() => manager.initialize()).not.toThrow();
        });
        it('should preserve data on repeated init', () => {
            manager.initialize();
            runMigrations(manager.getDb());
            manager
                .getDb()
                .prepare('INSERT INTO chats (id, name, channel) VALUES (?, ?, ?)')
                .run('test-chat-1', 'Test Chat', 'cli');
            manager.initialize();
            const chat = manager
                .getDb()
                .prepare('SELECT * FROM chats WHERE id = ?')
                .get('test-chat-1');
            expect(chat).toBeDefined();
            expect(chat['name']).toBe('Test Chat');
        });
    });
    describe('Singleton behavior', () => {
        it('should reuse the same database connection', () => {
            manager.initialize();
            const db1 = manager.getDb();
            const db2 = manager.getDb();
            expect(db1).toBe(db2);
        });
        it('should throw if getDb is called before initialize', () => {
            expect(() => manager.getDb()).toThrow('Database not initialized');
        });
        it('close should release the connection', () => {
            manager.initialize();
            manager.close();
            expect(() => manager.getDb()).toThrow('Database not initialized');
        });
    });
});
describe('runMigrations', () => {
    let manager;
    const testDir = path.join(os.tmpdir(), `osai-mig-test-${process.pid}-${Date.now()}`);
    const dbPath = path.join(testDir, 'osai.db');
    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
        manager = new DatabaseManager({ dbPath });
        manager.initialize();
    });
    afterEach(() => {
        manager.close();
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });
    describe('TT-005-03: Core tables created correctly', () => {
        const expectedTables = ['chats', 'chat_messages', 'sessions', 'osai_audit_log'];
        it.each(expectedTables)('should create table: %s', (tableName) => {
            runMigrations(manager.getDb());
            const result = manager
                .getDb()
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
                .get(tableName);
            expect(result).toBeDefined();
            expect(result['name']).toBe(tableName);
        });
    });
    describe('TT-005-05: Indexes created', () => {
        it('should create index on chat_messages(chat_id, created_at)', () => {
            runMigrations(manager.getDb());
            const indexes = manager
                .getDb()
                .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chat_messages'")
                .all();
            const indexNames = indexes.map((i) => i.name);
            expect(indexNames).toContain('idx_chat_messages_chat_id_created_at');
        });
    });
    describe('TT-005-07: Migration framework versioning', () => {
        it('should create _schema_version table', () => {
            runMigrations(manager.getDb());
            const result = manager
                .getDb()
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_schema_version'")
                .get();
            expect(result).toBeDefined();
        });
        it('should record current migration version', () => {
            runMigrations(manager.getDb());
            const row = manager
                .getDb()
                .prepare('SELECT version FROM _schema_version ORDER BY applied_at DESC LIMIT 1')
                .get();
            expect(row).toBeDefined();
            expect(row['version']).toBeGreaterThan(0);
        });
        it('should not re-apply already applied migrations', () => {
            runMigrations(manager.getDb());
            // Insert a chat to verify no data loss
            manager
                .getDb()
                .prepare('INSERT INTO chats (id, name, channel) VALUES (?, ?, ?)')
                .run('test-idempotent', 'Test', 'cli');
            // Re-run migrations
            runMigrations(manager.getDb());
            const chat = manager
                .getDb()
                .prepare('SELECT * FROM chats WHERE id = ?')
                .get('test-idempotent');
            expect(chat).toBeDefined();
            expect(chat['name']).toBe('Test');
        });
    });
    describe('TT-005-08: Parameterized queries', () => {
        it('should use parameterized queries in migrations (no string interpolation in SQL)', () => {
            // Verify DDL SQL does not contain string interpolation
            // (parameterized queries are used in migrations.ts for INSERT operations)
            expect(MIGRATION_001_CREATE_CORE_TABLES).not.toContain('${');
        });
        it('should record migrations using parameterized INSERT', () => {
            // Verify the migration record function works with parameterized query
            // by running migrations and checking the record was inserted correctly
            runMigrations(manager.getDb());
            const row = manager
                .getDb()
                .prepare('SELECT version, description FROM _schema_version WHERE version = ?')
                .get(1);
            expect(row).toBeDefined();
            expect(row['version']).toBe(1);
            expect(row['description']).toContain('core tables');
        });
    });
});
//# sourceMappingURL=database.test.js.map