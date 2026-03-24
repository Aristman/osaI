import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileWatcher } from './file-watcher.js';

// Mock chokidar
const mockWatchers: Map<string, {
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  unwatch: ReturnType<typeof vi.fn>;
  getWatched: ReturnType<typeof vi.fn>;
}> = new Map();

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn((_watchPath: string, _options?: Record<string, unknown>) => {
      const watcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockReturnThis(),
        unwatch: vi.fn().mockReturnThis(),
        getWatched: vi.fn().mockReturnValue({}),
      };
      mockWatchers.set(_watchPath, watcher);
      return watcher;
    }),
  },
  watch: vi.fn((_watchPath: string, _options?: Record<string, unknown>) => {
    const watcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockReturnThis(),
      unwatch: vi.fn().mockReturnThis(),
      getWatched: vi.fn().mockReturnValue({}),
    };
    mockWatchers.set(_watchPath, watcher);
    return watcher;
  }),
}));

describe('FileWatcher', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'osai-test-'));
    mockWatchers.clear();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    mockWatchers.clear();
  });

  describe('UT-005-01: instantiation', () => {
    it('creates instance with default config', () => {
      const watcher = new FileWatcher();
      expect(watcher).toBeInstanceOf(FileWatcher);
      expect(watcher.getWatcherCount()).toBe(0);
    });
  });

  describe('UT-005-02: watchDirectory returns handle', () => {
    it('returns valid WatcherHandle for existing directory', async () => {
      const watcher = new FileWatcher();
      const handle = await watcher.watchDirectory(tmpDir);

      expect(handle).not.toBeNull();
      expect(handle!.id).toMatch(/^watcher-/);
      expect(handle!.path).toBe(tmpDir);
      expect(typeof handle!.close).toBe('function');

      await watcher.close();
    });
  });

  describe('UT-005-08: error on non-existent path', () => {
    it('returns null for non-existent path', async () => {
      const watcher = new FileWatcher();
      const handle = await watcher.watchDirectory('/non/existent/path/12345');

      expect(handle).toBeNull();
    });
  });

  describe('UT-005-06: unwatch stops watching', () => {
    it('removes watcher from active list', async () => {
      const watcher = new FileWatcher();
      const handle = await watcher.watchDirectory(tmpDir);
      expect(handle).not.toBeNull();
      expect(watcher.getWatcherCount()).toBe(1);

      await watcher.unwatch(handle!.id);
      expect(watcher.getWatcherCount()).toBe(0);
    });
  });

  describe('UT-005-07: unwatchAll clears all', () => {
    it('removes all watchers', async () => {
      const watcher = new FileWatcher();
      const dir1 = path.join(tmpDir, 'dir1');
      const dir2 = path.join(tmpDir, 'dir2');
      await fs.promises.mkdir(dir1);
      await fs.promises.mkdir(dir2);

      await watcher.watchDirectory(dir1);
      await watcher.watchDirectory(dir2);
      expect(watcher.getWatcherCount()).toBe(2);

      await watcher.unwatchAll();
      expect(watcher.getWatcherCount()).toBe(0);
    });
  });

  describe('listWatchers', () => {
    it('returns list of watcher info', async () => {
      const watcher = new FileWatcher();
      await watcher.watchDirectory(tmpDir);

      const list = watcher.listWatchers();
      expect(list).toHaveLength(1);
      expect(list[0]!.path).toBe(tmpDir);
      expect(list[0]!.id).toMatch(/^watcher-/);

      await watcher.close();
    });
  });

  describe('close', () => {
    it('prevents new watchers after close', async () => {
      const watcher = new FileWatcher();
      await watcher.close();

      const handle = await watcher.watchDirectory(tmpDir);
      expect(handle).toBeNull();
    });
  });

  describe('event mapping', () => {
    it('registers create event handler for add', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();
      await watcher.watchDirectory(tmpDir, ['create'], callback);

      // Find the mock watcher and trigger 'add' event
      const mockWatcher = mockWatchers.get(tmpDir);
      expect(mockWatcher).toBeDefined();
      const onCalls = mockWatcher!.on.mock.calls;
      const addCall = onCalls.find((call: unknown[]) => call[0] === 'add');
      expect(addCall).toBeDefined();

      // Simulate file creation event
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'test');
      addCall![1](testFile);

      expect(callback).toHaveBeenCalled();
      const callArg = callback.mock.calls[0]![0];
      expect(callArg.event).toBe('create');
      expect(callArg.path).toBe(testFile);

      await watcher.close();
    });

    it('registers modify event handler for change', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();
      await watcher.watchDirectory(tmpDir, ['modify'], callback);

      const mockWatcher = mockWatchers.get(tmpDir);
      const onCalls = mockWatcher!.on.mock.calls;
      const changeCall = onCalls.find((call: unknown[]) => call[0] === 'change');

      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'test');
      changeCall![1](testFile);

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0]![0].event).toBe('modify');

      await watcher.close();
    });

    it('registers delete event handler for unlink', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();
      await watcher.watchDirectory(tmpDir, ['delete'], callback);

      const mockWatcher = mockWatchers.get(tmpDir);
      const onCalls = mockWatcher!.on.mock.calls;
      const unlinkCall = onCalls.find((call: unknown[]) => call[0] === 'unlink');

      unlinkCall![1]('/tmp/deleted-file.txt');

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0]![0].event).toBe('delete');
      expect(callback.mock.calls[0]![0].stats).toBeUndefined();

      await watcher.close();
    });
  });

  describe('config options', () => {
    it('uses custom debounce config', async () => {
      const watcher = new FileWatcher({ debounceMs: 500, maxFiles: 10 });
      const handle = await watcher.watchDirectory(tmpDir);
      expect(handle).not.toBeNull();
      await watcher.close();
    });
  });
});
