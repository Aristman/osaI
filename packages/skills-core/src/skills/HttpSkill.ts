/**
 * @osai/skills-core -- HttpSkill
 *
 * Provides HTTP operations (GET, POST, PUT, DELETE) using Node.js native fetch.
 */

import type { SkillDefinition, ToolExecutor, ToolResult } from '@osai/agent';

const DEFAULT_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Skill Definition
// ---------------------------------------------------------------------------

export function createHttpSkillDefinition(): SkillDefinition {
  return {
    name: 'http',
    version: '1.0.0',
    description:
      'Provides HTTP operations (GET, POST, PUT, DELETE) using native fetch.',
    category: 'system',
    tools: [
      {
        name: 'http_get',
        description: 'Perform an HTTP GET request to the specified URL.',
        category: 'read',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to send the GET request to.',
            },
            headers: {
              type: 'object',
              description: 'Optional request headers.',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'http_post',
        description: 'Perform an HTTP POST request to the specified URL.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to send the POST request to.',
            },
            body: {
              type: 'string',
              description: 'Optional request body.',
            },
            headers: {
              type: 'object',
              description: 'Optional request headers.',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'http_put',
        description: 'Perform an HTTP PUT request to the specified URL.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to send the PUT request to.',
            },
            body: {
              type: 'string',
              description: 'Optional request body.',
            },
            headers: {
              type: 'object',
              description: 'Optional request headers.',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'http_delete',
        description: 'Perform an HTTP DELETE request to the specified URL.',
        category: 'write',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to send the DELETE request to.',
            },
            headers: {
              type: 'object',
              description: 'Optional request headers.',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['url'],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHeaders(
  raw: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!raw) return {};
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      headers[key] = value;
    }
  }
  return headers;
}

async function executeFetch(
  method: string,
  url: string,
  body?: string,
  headers?: Record<string, unknown>,
  timeout?: number,
): Promise<ToolResult> {
  const fetchHeaders = parseHeaders(headers);

  // Set Content-Type for body requests if not already set
  if (body && !fetchHeaders['Content-Type']) {
    fetchHeaders['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: body ?? undefined,
      signal: AbortSignal.timeout(timeout ?? DEFAULT_TIMEOUT),
    });

    const responseBody = await response.text();

    return {
      success: response.ok,
      output: responseBody,
      metadata: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'HTTP request failed';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

function createExecutors(
  config?: { maxTimeout?: number; blockedHosts?: string[] },
): Record<string, ToolExecutor> {
  const maxTimeout = config?.maxTimeout ?? DEFAULT_TIMEOUT;

  function validateUrl(url: string): string | undefined {
    try {
      new URL(url);
    } catch {
      return `Invalid URL: ${url}`;
    }

    if (config?.blockedHosts) {
      try {
        const parsed = new URL(url);
        if (config.blockedHosts.includes(parsed.hostname)) {
          return `Host '${parsed.hostname}' is blocked`;
        }
      } catch {
        // Already caught above
      }
    }

    return undefined;
  }

  return {
    http_get: async (params): Promise<ToolResult> => {
      const url = String(params['url'] ?? '');
      const urlError = validateUrl(url);
      if (urlError) {
        return { success: false, error: urlError };
      }
      return executeFetch('GET', url, undefined, params['headers'] as Record<string, unknown> | undefined, maxTimeout);
    },

    http_post: async (params): Promise<ToolResult> => {
      const url = String(params['url'] ?? '');
      const urlError = validateUrl(url);
      if (urlError) {
        return { success: false, error: urlError };
      }
      const body = params['body'] as string | undefined;
      return executeFetch('POST', url, body, params['headers'] as Record<string, unknown> | undefined, maxTimeout);
    },

    http_put: async (params): Promise<ToolResult> => {
      const url = String(params['url'] ?? '');
      const urlError = validateUrl(url);
      if (urlError) {
        return { success: false, error: urlError };
      }
      const body = params['body'] as string | undefined;
      return executeFetch('PUT', url, body, params['headers'] as Record<string, unknown> | undefined, maxTimeout);
    },

    http_delete: async (params): Promise<ToolResult> => {
      const url = String(params['url'] ?? '');
      const urlError = validateUrl(url);
      if (urlError) {
        return { success: false, error: urlError };
      }
      return executeFetch('DELETE', url, undefined, params['headers'] as Record<string, unknown> | undefined, maxTimeout);
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHttpSkill(config?: {
  maxTimeout?: number;
  blockedHosts?: string[];
}): {
  definition: SkillDefinition;
  executors: Record<string, ToolExecutor>;
} {
  return {
    definition: createHttpSkillDefinition(),
    executors: createExecutors(config),
  };
}
