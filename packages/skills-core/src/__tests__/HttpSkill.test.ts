/**
 * HttpSkill unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpSkill, createHttpSkillDefinition } from '../skills/HttpSkill.js';

// Mock native fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HttpSkill', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('definition', () => {
    it('should have correct skill name', () => {
      const { definition } = createHttpSkill();
      expect(definition.name).toBe('http');
    });

    it('should have correct version', () => {
      const { definition } = createHttpSkill();
      expect(definition.version).toBe('1.0.0');
    });

    it('should have 4 tools', () => {
      const { definition } = createHttpSkill();
      expect(definition.tools).toHaveLength(4);
    });

    it('should have all expected tool names', () => {
      const { definition } = createHttpSkill();
      const toolNames = definition.tools.map((t) => t.name);
      expect(toolNames).toContain('http_get');
      expect(toolNames).toContain('http_post');
      expect(toolNames).toContain('http_put');
      expect(toolNames).toContain('http_delete');
    });
  });

  describe('createHttpSkillDefinition', () => {
    it('should return a valid skill definition', () => {
      const def = createHttpSkillDefinition();
      expect(def.name).toBe('http');
      expect(def.tools.length).toBe(4);
    });
  });

  describe('http_get', () => {
    it('should perform a GET request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"data": "test"}',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const { executors } = createHttpSkill();
      const result = await executors['http_get']!(
        { url: 'https://example.com/api' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_get', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('{"data": "test"}');
      expect(result.metadata?.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should pass custom headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => 'ok',
        headers: new Headers(),
      });

      const { executors } = createHttpSkill();
      await executors['http_get']!(
        {
          url: 'https://example.com',
          headers: { Authorization: 'Bearer token' },
        },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_get', parameters: {} },
          config: {},
        },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: { Authorization: 'Bearer token' },
        }),
      );
    });

    it('should reject invalid URLs', async () => {
      const { executors } = createHttpSkill();
      const result = await executors['http_get']!(
        { url: 'not-a-url' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_get', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should reject blocked hosts', async () => {
      const { executors } = createHttpSkill({
        blockedHosts: ['evil.com'],
      });
      const result = await executors['http_get']!(
        { url: 'https://evil.com/api' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_get', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
    });
  });

  describe('http_post', () => {
    it('should perform a POST request with body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        statusText: 'Created',
        text: async () => '{"id": 1}',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const { executors } = createHttpSkill();
      const result = await executors['http_post']!(
        {
          url: 'https://example.com/api',
          body: '{"name": "test"}',
        },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_post', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.status).toBe(201);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('http_put', () => {
    it('should perform a PUT request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"updated": true}',
        headers: new Headers(),
      });

      const { executors } = createHttpSkill();
      const result = await executors['http_put']!(
        {
          url: 'https://example.com/api/1',
          body: '{"name": "updated"}',
        },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_put', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/1',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  describe('http_delete', () => {
    it('should perform a DELETE request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        text: async () => '',
        headers: new Headers(),
      });

      const { executors } = createHttpSkill();
      const result = await executors['http_delete']!(
        { url: 'https://example.com/api/1' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_delete', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.status).toBe(204);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { executors } = createHttpSkill();
      const result = await executors['http_get']!(
        { url: 'https://example.com' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_get', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle non-ok responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '{"error": "not found"}',
        headers: new Headers(),
      });

      const { executors } = createHttpSkill();
      const result = await executors['http_get']!(
        { url: 'https://example.com/notfound' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'http_get', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.metadata?.status).toBe(404);
    });
  });
});
