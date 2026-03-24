/**
 * @osai/agent -- Skills Loader + Executor Tests
 *
 * Tests for SkillLoader, SkillRegistry, and skill-related errors.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillLoader } from '../skills/SkillLoader.js';
import { SkillRegistry } from '../skills/SkillRegistry.js';
import { SkillParseError, SkillNotFoundError, ToolNotFoundError } from '../skills/errors.js';
import type { SkillDefinition, ToolExecutor } from '../types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const VALID_SKILL_MD = `---
name: filesystem
version: "1.0.0"
description: "File system operations"
category: "skills-core"
tools:
  - name: read_file
    description: "Read file contents"
    category: read
    parameters:
      type: object
      properties:
        path:
          type: string
          description: "File path"
      required: [path]
hooks:
  - point: on_file_access
    priority: 10
permissions:
  - filesystem.read
---

# Filesystem Skill

Read, write, and manage files on the local filesystem.
`;

const MULTIPLE_TOOLS_SKILL_MD = `---
name: web
version: "1.1.0"
description: "Web browsing and HTTP operations"
category: "skills-web"
tools:
  - name: fetch_url
    description: "Fetch a URL and return content"
    category: read
    parameters:
      type: object
      properties:
        url:
          type: string
          description: "The URL to fetch"
      required: [url]
  - name: post_data
    description: "POST data to a URL"
    category: write
    parameters:
      type: object
      properties:
        url:
          type: string
        body:
          type: object
      required: [url, body]
---

# Web Skill

Browse and interact with web resources.
`;

const HOOKS_SKILL_MD = `---
name: notification
version: "0.2.0"
description: "Desktop notification handler"
category: "skills-os"
tools:
  - name: send_notification
    description: "Send a desktop notification"
    category: system
    parameters:
      type: object
      properties:
        title:
          type: string
        message:
          type: string
      required: [title, message]
hooks:
  - point: on_desktop_notification
    priority: 5
  - point: before_agent_start
    priority: 1
---

# Notification Skill

Handle desktop notifications.
`;

const MINIMAL_SKILL_MD = `---
name: minimal
description: "Minimal skill"
category: "test"
tools:
  - name: do_thing
    description: "Do a thing"
    category: execute
    parameters:
      type: object
      properties: {}
---

# Minimal Skill

No optional fields.
`;

const INVALID_NO_FRONTMATTER = `# No frontmatter here

Just some markdown without YAML frontmatter.
`;

const INVALID_NO_NAME = `---
version: "1.0.0"
description: "Missing name"
category: "test"
tools: []
---
`;

const INVALID_NO_TOOLS = `---
name: orphan
description: "Has no tools"
category: "test"
---
`;

// ---------------------------------------------------------------------------
// SkillLoader tests
// ---------------------------------------------------------------------------

describe('SkillLoader', () => {
  let loader: SkillLoader;

  beforeEach(() => {
    loader = new SkillLoader();
  });

  describe('parseSkillMd', () => {
    it('should parse valid SKILL.md into SkillDefinition', () => {
      const definition = loader.parseSkillMd(VALID_SKILL_MD);

      expect(definition.name).toBe('filesystem');
      expect(definition.version).toBe('1.0.0');
      expect(definition.description).toBe('File system operations');
      expect(definition.category).toBe('skills-core');
      expect(definition.tools).toHaveLength(1);
      expect(definition.tools[0]!.name).toBe('read_file');
      expect(definition.tools[0]!.category).toBe('read');
      expect(definition.permissions).toEqual(['filesystem.read']);
      expect(definition.hooks).toBeDefined();
      expect(definition.hooks).toHaveLength(1);
      expect(definition.hooks![0]!.point).toBe('on_file_access');
      expect(definition.hooks![0]!.priority).toBe(10);
    });

    it('should parse SKILL.md with multiple tools', () => {
      const definition = loader.parseSkillMd(MULTIPLE_TOOLS_SKILL_MD);

      expect(definition.name).toBe('web');
      expect(definition.tools).toHaveLength(2);
      expect(definition.tools[0]!.name).toBe('fetch_url');
      expect(definition.tools[0]!.category).toBe('read');
      expect(definition.tools[1]!.name).toBe('post_data');
      expect(definition.tools[1]!.category).toBe('write');
    });

    it('should parse SKILL.md with multiple hooks', () => {
      const definition = loader.parseSkillMd(HOOKS_SKILL_MD);

      expect(definition.hooks).toHaveLength(2);
      expect(definition.hooks![0]!.point).toBe('on_desktop_notification');
      expect(definition.hooks![1]!.point).toBe('before_agent_start');
    });

    it('should parse SKILL.md without optional fields (version, hooks, permissions)', () => {
      const definition = loader.parseSkillMd(MINIMAL_SKILL_MD);

      expect(definition.name).toBe('minimal');
      expect(definition.description).toBe('Minimal skill');
      expect(definition.category).toBe('test');
      expect(definition.tools).toHaveLength(1);
      expect(definition.version).toBe('0.0.0');
      expect(definition.hooks).toBeUndefined();
      expect(definition.permissions).toBeUndefined();
    });

    it('should throw SkillParseError for missing frontmatter', () => {
      expect(() => loader.parseSkillMd(INVALID_NO_FRONTMATTER)).toThrow(SkillParseError);
    });

    it('should throw SkillParseError for missing name', () => {
      expect(() => loader.parseSkillMd(INVALID_NO_NAME)).toThrow(SkillParseError);
    });

    it('should throw SkillParseError for missing tools', () => {
      expect(() => loader.parseSkillMd(INVALID_NO_TOOLS)).toThrow(SkillParseError);
    });
  });

  describe('loadSkillFromDirectory', () => {
    it('should throw NotImplementedError (not yet implemented)', async () => {
      await expect(loader.loadSkillFromDirectory('/some/path')).rejects.toThrow(
        'loadSkillFromDirectory is not yet implemented',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// SkillRegistry tests
// ---------------------------------------------------------------------------

describe('SkillRegistry', () => {
  let registry: SkillRegistry;
  let filesystemSkill: SkillDefinition;
  let webSkill: SkillDefinition;
  let mockExecutor: Record<string, ToolExecutor>;

  beforeEach(() => {
    registry = new SkillRegistry();

    const loader = new SkillLoader();
    filesystemSkill = loader.parseSkillMd(VALID_SKILL_MD);
    webSkill = loader.parseSkillMd(MULTIPLE_TOOLS_SKILL_MD);

    mockExecutor = {
      read_file: async () => ({
        success: true,
        output: 'file contents',
      }),
    };
  });

  it('should register a skill and make it available via getSkill()', () => {
    registry.register(filesystemSkill);

    const result = registry.getSkill('filesystem');
    expect(result).toBeDefined();
    expect(result!.name).toBe('filesystem');
  });

  it('should unregister a skill and return true', () => {
    registry.register(filesystemSkill);
    const removed = registry.unregister('filesystem');

    expect(removed).toBe(true);
    expect(registry.getSkill('filesystem')).toBeUndefined();
  });

  it('should return false when unregistering a non-existent skill', () => {
    const removed = registry.unregister('nonexistent');
    expect(removed).toBe(false);
  });

  it('should return all tool schemas from all registered skills', () => {
    registry.register(filesystemSkill);
    registry.register(webSkill);

    const schemas = registry.getToolSchemas();
    expect(schemas).toHaveLength(3);

    const names = schemas.map((s) => s.name);
    expect(names).toContain('filesystem.read_file');
    expect(names).toContain('web.fetch_url');
    expect(names).toContain('web.post_data');
  });

  it('should include category in tool schemas', () => {
    registry.register(filesystemSkill);

    const schemas = registry.getToolSchemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0]!.category).toBe('read');
  });

  it('should return ToolExecutor for a namespaced tool name', () => {
    registry.register(filesystemSkill, mockExecutor);

    const executor = registry.getToolExecutor('filesystem.read_file');
    expect(executor).toBeDefined();
  });

  it('should return undefined for unregistered tool executor', () => {
    registry.register(filesystemSkill);

    const executor = registry.getToolExecutor('filesystem.read_file');
    expect(executor).toBeUndefined();
  });

  it('should return undefined for non-existent tool', () => {
    const executor = registry.getToolExecutor('nonexistent.tool');
    expect(executor).toBeUndefined();
  });

  it('should list all registered skills', () => {
    registry.register(filesystemSkill);
    registry.register(webSkill);

    const skills = registry.listSkills();
    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name);
    expect(names).toContain('filesystem');
    expect(names).toContain('web');
  });

  it('should namespace tool names with skill name (skill_name.tool_name)', () => {
    registry.register(filesystemSkill);

    const schemas = registry.getToolSchemas();
    expect(schemas[0]!.name).toBe('filesystem.read_file');
  });

  it('should allow registering skill with executor and retrieve it', () => {
    registry.register(filesystemSkill, mockExecutor);

    const executor = registry.getToolExecutor('filesystem.read_file');
    expect(executor).toBe(mockExecutor['read_file']);
  });
});

// ---------------------------------------------------------------------------
// Error class tests
// ---------------------------------------------------------------------------

describe('Skill errors', () => {
  it('SkillParseError should have correct name and message', () => {
    const error = new SkillParseError('Invalid YAML', 15);
    expect(error.name).toBe('SkillParseError');
    expect(error.message).toBe('Invalid YAML');
    expect(error.line).toBe(15);
    expect(error).toBeInstanceOf(Error);
  });

  it('SkillNotFoundError should have correct name and message', () => {
    const error = new SkillNotFoundError('missing');
    expect(error.name).toBe('SkillNotFoundError');
    expect(error.message).toBe("Skill 'missing' not found");
    expect(error).toBeInstanceOf(Error);
  });

  it('ToolNotFoundError should have correct name and message', () => {
    const error = new ToolNotFoundError('unknown_tool');
    expect(error.name).toBe('ToolNotFoundError');
    expect(error.message).toBe("Tool 'unknown_tool' not found in any registered skill");
    expect(error).toBeInstanceOf(Error);
  });
});
