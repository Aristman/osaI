import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../SkillRegistry.js';
import type {
  SkillDefinition,
  ToolDefinition,
  PermissionLevel,
} from '../../types.js';

// --- Test Factories ---

function createTool(
  name: string,
  handler: (params: Record<string, unknown>) => Promise<unknown>,
): ToolDefinition & { handler: (params: Record<string, unknown>) => Promise<unknown> } {
  return {
    name,
    description: `Tool ${name}`,
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input parameter' },
      },
      required: ['input'],
    },
    handler,
  };
}

function createSkill(
  name: string,
  tools: Array<ToolDefinition & { handler?: (params: Record<string, unknown>) => Promise<unknown> }>,
  overrides?: Partial<SkillDefinition>,
): SkillDefinition {
  return {
    name,
    version: '1.0.0',
    description: `Skill ${name}`,
    category: 'bundled',
    tools,
    enabled: true,
    permissions: {},
    ...overrides,
  };
}

// --- Tests ---

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  // TC-001-1: register() добавляет skill и getTools() возвращает его tools
  describe('TC-001-1: register() adds skill and getTools() returns its tools', () => {
    it('should register a skill and return its tools via getTools()', () => {
      const handler = async () => ({ result: 'ok' });
      const tool = createTool('test_tool', handler);
      const skill = createSkill('test-skill', [tool]);

      registry.register(skill);

      const tools = registry.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]!.name).toBe('test_tool');
      expect(tools[0]!.description).toBe('Tool test_tool');
      expect(tools[0]!.parameters).toEqual({
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input parameter' },
        },
        required: ['input'],
      });
    });
  });

  // TC-001-2: register() дубликат выбрасывает ошибку
  describe('TC-001-2: register() duplicate throws error', () => {
    it('should throw an error when registering a duplicate skill', () => {
      const skill = createSkill('dup-skill', []);
      registry.register(skill);

      expect(() => registry.register(skill)).toThrow(/dup-skill/);
    });
  });

  // TC-001-3: getTools() агрегирует все tools из нескольких skills
  describe('TC-001-3: getTools() aggregates tools from multiple skills', () => {
    it('should return tools from all registered skills', () => {
      const handler1 = async () => 'result1';
      const handler2 = async () => 'result2';
      const tool1 = createTool('tool_a', handler1);
      const tool2 = createTool('tool_b', handler2);
      const tool3 = createTool('tool_c', handler1);

      const skill1 = createSkill('skill-1', [tool1, tool2]);
      const skill2 = createSkill('skill-2', [tool3]);

      registry.register(skill1);
      registry.register(skill2);

      const tools = registry.getTools();
      expect(tools).toHaveLength(3);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('tool_a');
      expect(toolNames).toContain('tool_b');
      expect(toolNames).toContain('tool_c');
    });
  });

  // TC-001-4: execute() dispatch на handler с правильными params
  describe('TC-001-4: execute() dispatches to handler with correct params', () => {
    it('should call the handler with the provided parameters and return the result', async () => {
      const mockHandler = async (params: Record<string, unknown>) => ({
        received: params,
      });
      const tool = createTool('dispatch_tool', mockHandler);
      const skill = createSkill('dispatch-skill', [tool]);

      registry.register(skill);

      const result = await registry.execute('dispatch_tool', { input: 'hello' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ received: { input: 'hello' } });
    });

    it('should return tool result with correct structure on success', async () => {
      const mockHandler = async () => ({ output: 'data' });
      const tool = createTool('structured_tool', mockHandler);
      const skill = createSkill('structured-skill', [tool]);

      registry.register(skill);

      const result = await registry.execute('structured_tool', {});

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toEqual({ output: 'data' });
    });
  });

  // TC-001-5: execute() несуществующий tool выбрасывает ошибку
  describe('TC-001-5: execute() with non-existent tool throws error', () => {
    it('should throw an error when executing a non-existent tool', async () => {
      await expect(
        registry.execute('nonexistent_tool', {}),
      ).rejects.toThrow(/nonexistent_tool/);
    });
  });

  // TC-001-6: enable/disable переключает доступность skill
  describe('TC-001-6: enable/disable toggles skill availability', () => {
    it('should exclude disabled skill tools from getTools()', () => {
      const handler = async () => 'ok';
      const tool = createTool('toggle_tool', handler);
      const skill = createSkill('toggle-skill', [tool]);

      registry.register(skill);
      expect(registry.getTools()).toHaveLength(1);

      registry.disable('toggle-skill');
      expect(registry.getTools()).toHaveLength(0);
      expect(registry.isEnabled('toggle-skill')).toBe(false);
    });

    it('should include re-enabled skill tools in getTools()', () => {
      const handler = async () => 'ok';
      const tool = createTool('re_enable_tool', handler);
      const skill = createSkill('re-enable-skill', [tool]);

      registry.register(skill);
      registry.disable('re-enable-skill');
      expect(registry.getTools()).toHaveLength(0);

      registry.enable('re-enable-skill');
      expect(registry.getTools()).toHaveLength(1);
      expect(registry.isEnabled('re-enable-skill')).toBe(true);
    });

    it('should handle skill registered with enabled=false', () => {
      const handler = async () => 'ok';
      const tool = createTool('initially_disabled_tool', handler);
      const skill = createSkill('initially-disabled-skill', [tool], {
        enabled: false,
      });

      registry.register(skill);
      expect(registry.getTools()).toHaveLength(0);
      expect(registry.isEnabled('initially-disabled-skill')).toBe(false);

      registry.enable('initially-disabled-skill');
      expect(registry.getTools()).toHaveLength(1);
    });
  });

  // TC-001-7: unregister() удаляет skill
  describe('TC-001-7: unregister() removes skill', () => {
    it('should remove skill and its tools from registry', () => {
      const handler = async () => 'ok';
      const tool1 = createTool('remove_tool_1', handler);
      const tool2 = createTool('keep_tool', handler);

      const skillRemove = createSkill('remove-skill', [tool1]);
      const skillKeep = createSkill('keep-skill', [tool2]);

      registry.register(skillRemove);
      registry.register(skillKeep);
      expect(registry.getTools()).toHaveLength(2);

      registry.unregister('remove-skill');
      expect(registry.getTools()).toHaveLength(1);
      expect(registry.getTools()[0]!.name).toBe('keep_tool');
      expect(registry.getSkill('remove-skill')).toBeUndefined();
    });

    it('should silently ignore unregister of non-existent skill', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });
  });

  // --- Additional behavioral tests ---

  describe('getTool(name)', () => {
    it('should return the tool definition by name', () => {
      const handler = async () => 'ok';
      const tool = createTool('specific_tool', handler);
      const skill = createSkill('specific-skill', [tool]);

      registry.register(skill);

      const found = registry.getTool('specific_tool');
      expect(found).toBeDefined();
      expect(found!.name).toBe('specific_tool');
    });

    it('should return undefined for non-existent tool', () => {
      expect(registry.getTool('no_such_tool')).toBeUndefined();
    });
  });

  describe('getSkill(name)', () => {
    it('should return the skill definition by name', () => {
      const skill = createSkill('named-skill', []);
      registry.register(skill);

      const found = registry.getSkill('named-skill');
      expect(found).toBeDefined();
      expect(found!.name).toBe('named-skill');
      expect(found!.version).toBe('1.0.0');
    });

    it('should return undefined for non-existent skill', () => {
      expect(registry.getSkill('no_such_skill')).toBeUndefined();
    });
  });

  describe('listSkills()', () => {
    it('should return all registered skills', () => {
      const skill1 = createSkill('list-skill-1', []);
      const skill2 = createSkill('list-skill-2', []);

      registry.register(skill1);
      registry.register(skill2);

      const skills = registry.listSkills();
      expect(skills).toHaveLength(2);
      expect(skills.map((s) => s.name)).toContain('list-skill-1');
      expect(skills.map((s) => s.name)).toContain('list-skill-2');
    });
  });

  describe('execute() error handling', () => {
    it('should return failure result when handler throws', async () => {
      const failingHandler = async () => {
        throw new Error('handler failed');
      };
      const tool = createTool('failing_tool', failingHandler);
      const skill = createSkill('failing-skill', [tool]);

      registry.register(skill);

      const result = await registry.execute('failing_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('handler failed');
    });
  });

  describe('duplicate tool names across skills', () => {
    it('should include both tools even if they have the same name from different skills', () => {
      const handler = async () => 'ok';
      const tool1 = createTool('same_name', handler);
      const tool2 = createTool('same_name', handler);

      const skill1 = createSkill('skill-a', [tool1]);
      const skill2 = createSkill('skill-b', [tool2]);

      registry.register(skill1);
      registry.register(skill2);

      const tools = registry.getTools();
      expect(tools).toHaveLength(2);
    });

    it('should execute the first matching tool by name', async () => {
      const handler1 = async () => 'from-skill-a';
      const handler2 = async () => 'from-skill-b';
      const tool1 = createTool('same_exec_name', handler1);
      const tool2 = createTool('same_exec_name', handler2);

      const skill1 = createSkill('exec-skill-a', [tool1]);
      const skill2 = createSkill('exec-skill-b', [tool2]);

      registry.register(skill1);
      registry.register(skill2);

      const result = await registry.execute('same_exec_name', {});
      expect(result.success).toBe(true);
      expect(result.data).toBe('from-skill-a');
    });
  });
});
