/**
 * @osai/skills-core -- BrowserSkill (V1 Stub)
 *
 * Provides browser automation tool definitions.
 * V1 is a stub implementation that throws NotImplementedError.
 * Real CDP integration will be added in V2.
 */

import type { SkillDefinition, ToolExecutor, ToolResult } from '@osai/agent';

// ---------------------------------------------------------------------------
// Skill Definition
// ---------------------------------------------------------------------------

export function createBrowserSkillDefinition(): SkillDefinition {
  return {
    name: 'browser',
    version: '1.0.0',
    description:
      'Provides browser automation capabilities (navigation, clicking, form filling, screenshots). V1 stub -- real CDP integration planned for V2.',
    category: 'system',
    tools: [
      {
        name: 'navigate',
        description: 'Navigate the browser to the specified URL.',
        category: 'execute',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to navigate to.',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'click',
        description: 'Click on an element matching the given CSS selector.',
        category: 'execute',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of the element to click.',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'fill',
        description: 'Fill a form field matching the given CSS selector with a value.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of the form field.',
            },
            value: {
              type: 'string',
              description: 'The value to fill in.',
            },
          },
          required: ['selector', 'value'],
        },
      },
      {
        name: 'screenshot',
        description: 'Take a screenshot of the current page or a specific element.',
        category: 'read',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'Optional CSS selector. If provided, captures only the matching element.',
            },
          },
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Stub Executors
// ---------------------------------------------------------------------------

function createStubExecutors(): Record<string, ToolExecutor> {
  const stubError = (toolName: string): ToolResult => ({
    success: false,
    error: `Browser tool '${toolName}' is not yet implemented. Browser automation (CDP integration) is planned for V2.`,
  });

  return {
    navigate: async () => stubError('navigate'),
    click: async () => stubError('click'),
    fill: async () => stubError('fill'),
    screenshot: async () => stubError('screenshot'),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBrowserSkill(): {
  definition: SkillDefinition;
  executors: Record<string, ToolExecutor>;
} {
  return {
    definition: createBrowserSkillDefinition(),
    executors: createStubExecutors(),
  };
}
