/**
 * Unit tests for SQL Schema definitions (T-005)
 *
 * Verifies SQL statements are well-formed and contain
 * expected columns, constraints, and indexes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MIGRATION_001_CREATE_CORE_TABLES, CORE_TABLE_NAMES, } from './schema.js';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
const TEST_DB_DIR = path.join(os.tmpdir(), `osai-schema-test-${Date.now()}`);
describe('schema.ts', () => {
    let db;
    const dbPath = path.join(TEST_DB_DIR, 'osai.db');
    beforeEach(() => {
        fs.mkdirSync(TEST_DB_DIR, { recursive: true });
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    });
    afterEach(() => {
        db.close();
        if (fs.existsSync(TEST_DB_DIR)) {
            fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
        }
    });
    describe('MIGRATION_001_CREATE_CORE_TABLES', () => {
        it('should execute without errors', () => {
            expect(() => db.exec(MIGRATION_001_CREATE_CORE_TABLES)).not.toThrow();
        });
        it('should create all core tables', () => {
            db.exec(MIGRATION_001_CREATE_CORE_TABLES);
            for (const tableName of CORE_TABLE_NAMES) {
                const result = db
                    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
                    .get(tableName);
                expect(result).toBeDefined();
                expect(result['name']).toBe(tableName);
            }
        });
    });
    describe('chats table columns', () => {
        const expectedColumns = [
            'id',
            'name',
            'description',
            'tags',
            'icon',
            'color',
            'channel',
            'channel_metadata',
            'is_active',
            'created_at',
            'updated_at',
        ];
        it.each(expectedColumns)('should have column: %s', (column) => {
            db.exec(MIGRATION_001_CREATE_CORE_TABLES);
            const columns = db
                .prepare('PRAGMA table_info(chats)')
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain(column);
        });
    });
    describe('chat_messages table columns', () => {
        const expectedColumns = [
            'id',
            'chat_id',
            'role',
            'content',
            'tool_calls',
            'metadata',
            'created_at',
        ];
        it.each(expectedColumns)('should have column: %s', (column) => {
            db.exec(MIGRATION_001_CREATE_CORE_TABLES);
            const columns = db
                .prepare('PRAGMA table_info(chat_messages)')
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain(column);
        });
    });
    describe('sessions table columns', () => {
        const expectedColumns = [
            'id',
            'chat_id',
            'title',
            'status',
            'model_provider',
            'model_name',
            'created_at',
            'updated_at',
        ];
        it.each(expectedColumns)('should have column: %s', (column) => {
            db.exec(MIGRATION_001_CREATE_CORE_TABLES);
            const columns = db
                .prepare('PRAGMA table_info(sessions)')
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain(column);
        });
    });
    describe('osai_audit_log table columns', () => {
        const expectedColumns = [
            'id',
            'session_id',
            'chat_id',
            'timestamp',
            'trace_id',
            'action',
            'tool_name',
            'skill_name',
            'params',
            'result',
            'user_decision',
            'risk_level',
        ];
        it.each(expectedColumns)('should have column: %s', (column) => {
            db.exec(MIGRATION_001_CREATE_CORE_TABLES);
            const columns = db
                .prepare('PRAGMA table_info(osai_audit_log)')
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain(column);
        });
    });
    describe('Foreign key constraints', () => {
        it('chat_messages should have FK to chats', () => {
            db.exec(MIGRATION_001_CREATE_CORE_TABLES);
            const fks = db
                .prepare('PRAGMA foreign_key_list(chat_messages)')
                .all();
            expect(fks.some((fk) => fk.table === 'chats')).toBe(true);
        });
        it('sessions should have FK to chats', () => {
            db.exec(MIGRATION_001_CREATE_CORE_TABLES);
            const fks = db
                .prepare('PRAGMA foreign_key_list(sessions)')
                .all();
            expect(fks.some((fk) => fk.table === 'chats')).toBe(true);
        });
    });
    describe('CORE_TABLE_NAMES', () => {
        it('should contain all four core tables', () => {
            expect(CORE_TABLE_NAMES).toEqual(expect.arrayContaining(['chats', 'chat_messages', 'sessions', 'osai_audit_log']));
            expect(CORE_TABLE_NAMES).toHaveLength(4);
        });
    });
});
//# sourceMappingURL=schema.test.js.map