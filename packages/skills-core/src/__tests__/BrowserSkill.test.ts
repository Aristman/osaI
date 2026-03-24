/**
 * BrowserSkill unit tests (V1 stub)
 */

import { describe, it, expect } from 'vitest';
import { createBrowserSkill, createBrowserSkillDefinition } from '../skills/BrowserSkill.js';

describe('BrowserSkill', () => {
  describe('definition', () => {
    it('should have correct skill name', () => {
      const { definition } = createBrowserSkill();
      expect(definition.name).toBe('browser');
    });

    it('should have correct version', () => {
      const { definition } = createBrowserSkill();
      expect(definition.version).toBe('1.0.0');
    });

    it('should have 4 tools', () => {
      const { definition } = createBrowserSkill();
      expect(definition.tools).toHaveLength(4);
    });

    it('should have all expected tool names', () => {
      const { definition } = createBrowserSkill();
      const toolNames = definition.tools.map((t) => t.name);
      expect(toolNames).toContain('navigate');
      expect(toolNames).toContain('click');
      expect(toolNames).toContain('fill');
      expect(toolNames).toContain('screenshot');
    });
  });

  describe('createBrowserSkillDefinition', () => {
    it('should return a valid skill definition', () => {
      const def = createBrowserSkillDefinition();
      expect(def.name).toBe('browser');
      expect(def.tools.length).toBe(4);
    });
  });

  describe('stub executors', () => {
    it('should return NotImplementedError for navigate', async () => {
      const { executors } = createBrowserSkill();
      const result = await executors['navigate']!(
        { url: 'https://example.com' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'navigate', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should return NotImplementedError for click', async () => {
      const { executors } = createBrowserSkill();
      const result = await executors['click']!(
        { selector: '#button' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'click', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should return NotImplementedError for fill', async () => {
      const { executors } = createBrowserSkill();
      const result = await executors['fill']!(
        { selector: '#input', value: 'hello' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'fill', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should return NotImplementedError for screenshot', async () => {
      const { executors } = createBrowserSkill();
      const result = await executors['screenshot']!(
        { selector: '#element' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'screenshot', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should mention V2 in error messages', async () => {
      const { executors } = createBrowserSkill();
      const result = await executors['navigate']!(
        { url: 'https://example.com' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'navigate', parameters: {} },
          config: {},
        },
      );

      expect(result.error).toContain('V2');
    });
  });
});
