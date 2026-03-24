/**
 * Configuration Schema Definition for osaI
 *
 * JSON Schema for runtime validation, default values, and type guards.
 * F-003 T-001: Configuration Schema Definition
 */

import type {
  GatewayConfig,
  ModelConfig,
  SessionConfig,
  SkillsConfig,
  SecurityConfig,
  MemoryConfig,
  ObservabilityConfig,
  OsaIConfig,
} from '@osai/types';

// Re-export types for convenience
export type {
  GatewayConfig,
  ModelConfig,
  SessionConfig,
  SkillsConfig,
  SkillsEntry,
  SecurityConfig,
  SecurityShellConfig,
  MemoryConfig,
  MemoryShortTermConfig,
  MemoryLongTermConfig,
  MemoryEmbeddingConfig,
  ObservabilityConfig,
  ObservabilityTracesConfig,
  ObservabilityMetricsConfig,
  ObservabilityLogsConfig,
  ObservabilityAuditConfig,
  OsaIConfig,
} from '@osai/types';

// ---------------------------------------------------------------------------
// JSON Schema Definition
// ---------------------------------------------------------------------------

export const configSchema = {
  type: 'object',
  required: ['gateway', 'model'],
  additionalProperties: false,
  properties: {
    version: { type: 'string', default: '1.0.0' },
    gateway: {
      type: 'object',
      required: ['host', 'port'],
      additionalProperties: false,
      properties: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'number', minimum: 1, maximum: 65535, default: 18789 },
        cors: { type: 'array', items: { type: 'string' }, default: [] },
        heartbeat: { type: 'number', minimum: 1000, default: 30000 },
      },
    },
    model: {
      type: 'object',
      required: ['provider', 'model'],
      additionalProperties: false,
      properties: {
        provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'ollama'],
          default: 'anthropic',
        },
        model: { type: 'string', default: 'claude-sonnet-4-20250514' },
        apiKey: { type: 'string', default: '' },
        maxTokens: { type: 'number', minimum: 1, default: 8192 },
        temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 },
        fallbacks: {
          type: 'array',
          items: { $ref: '#/properties/model' },
          default: [],
        },
      },
    },
    session: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxHistory: { type: 'number', minimum: 1, default: 100 },
        timeout: { type: 'number', minimum: 1000, default: 600000 },
        pruning: { type: 'number', minimum: 0, default: 80 },
        activationMode: {
          type: 'string',
          enum: ['always', 'mention', 'wake_word', 'passive'],
          default: 'mention',
        },
      },
    },
    skills: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: { type: 'array', items: { type: 'string' }, default: [] },
        disabled: { type: 'array', items: { type: 'string' }, default: [] },
        extraDirs: { type: 'array', items: { type: 'string' }, default: [] },
        watch: { type: 'boolean', default: true },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'path'],
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              enabled: { type: 'boolean', default: true },
            },
          },
          default: [],
        },
      },
    },
    security: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sandboxEnabled: { type: 'boolean', default: true },
        shell: {
          type: 'object',
          additionalProperties: false,
          properties: {
            blockedCommands: { type: 'array', items: { type: 'string' }, default: [] },
            timeout: { type: 'number', minimum: 1000, default: 120000 },
          },
        },
        fileSandbox: {
          type: 'object',
          properties: {
            allowedDirs: { type: 'array', items: { type: 'string' }, default: [] },
            blockedPatterns: { type: 'array', items: { type: 'string' }, default: [] },
          },
        },
        blockedCommands: { type: 'array', items: { type: 'string' }, default: [] },
        allowedDirectories: { type: 'array', items: { type: 'string' }, default: [] },
        blockedPatterns: { type: 'array', items: { type: 'string' }, default: [] },
      },
    },
    memory: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: { type: 'boolean', default: false },
        provider: { type: 'string', enum: ['sqlite', 'qdrant'], default: 'sqlite' },
        qdrantUrl: { type: 'string', default: 'http://localhost:6333' },
        embeddingModel: { type: 'string', default: 'all-MiniLM-L6-v2' },
        shortTerm: {
          type: 'object',
          additionalProperties: false,
          properties: {
            maxMessages: { type: 'number', minimum: 1, default: 100 },
            ttl: { type: 'number', minimum: 0, default: 86400000 },
          },
        },
        longTerm: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean', default: false },
            provider: { type: 'string', enum: ['qdrant', 'sqlite-vec'], default: 'sqlite-vec' },
            qdrantUrl: { type: 'string', default: 'http://localhost:6333' },
            collection: { type: 'string', default: 'osai_memories' },
          },
        },
        embedding: {
          type: 'object',
          additionalProperties: false,
          properties: {
            provider: { type: 'string', enum: ['openai', 'ollama', 'onnx'], default: 'onnx' },
            model: { type: 'string', default: 'all-MiniLM-L6-v2' },
          },
        },
      },
    },
    observability: {
      type: 'object',
      additionalProperties: false,
      properties: {
        traces: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean', default: false },
            exporter: {
              type: 'string',
              enum: ['console', 'jaeger', 'zipkin', 'otlp'],
              default: 'console',
            },
            endpoint: { type: 'string' },
          },
        },
        metrics: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean', default: false },
            port: { type: 'number', minimum: 1, maximum: 65535, default: 9090 },
          },
        },
        logs: {
          type: 'object',
          additionalProperties: false,
          properties: {
            level: {
              type: 'string',
              enum: ['trace', 'debug', 'info', 'warn', 'error'],
              default: 'info',
            },
            format: { type: 'string', enum: ['json', 'pretty'], default: 'json' },
            file: { type: 'string', default: '~/.osai/logs/osai.log' },
          },
        },
        audit: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean', default: true },
            retention: { type: 'number', minimum: 1, default: 30 },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG = Object.freeze({
  version: '1.0.0',
  gateway: {
    host: '127.0.0.1',
    port: 18789,
    cors: [] as string[],
    heartbeat: 30000,
  },
  model: {
    provider: 'anthropic' as const,
    model: 'claude-sonnet-4-20250514',
    apiKey: '',
    maxTokens: 8192,
    temperature: 0.7,
    fallbacks: [] as ModelConfig[],
  },
  session: {
    maxHistory: 100,
    timeout: 600000,
    pruning: 80,
    activationMode: 'mention' as const,
  },
  skills: {
    enabled: [] as string[],
    disabled: [] as string[],
    extraDirs: [] as string[],
    watch: true,
    entries: [] as Array<{ name: string; path: string; enabled?: boolean }>,
  },
  security: {
    sandboxEnabled: true,
    shell: {
      blockedCommands: [] as string[],
      timeout: 120000,
    },
    fileSandbox: {
      allowedDirs: [] as string[],
      blockedPatterns: [] as string[],
    },
    blockedCommands: [] as string[],
    allowedDirectories: [] as string[],
    blockedPatterns: [] as string[],
  },
  memory: {
    enabled: false,
    provider: 'sqlite' as const,
    qdrantUrl: 'http://localhost:6333',
    embeddingModel: 'all-MiniLM-L6-v2',
    shortTerm: {
      maxMessages: 100,
      ttl: 86400000,
    },
    longTerm: {
      enabled: false,
      provider: 'sqlite-vec' as const,
      qdrantUrl: 'http://localhost:6333',
      collection: 'osai_memories',
    },
    embedding: {
      provider: 'onnx' as const,
      model: 'all-MiniLM-L6-v2',
    },
  },
  observability: {
    traces: {
      enabled: false,
      exporter: 'console' as const,
    },
    metrics: {
      enabled: false,
      port: 9090,
    },
    logs: {
      level: 'info' as const,
      format: 'json' as const,
      file: '~/.osai/logs/osai.log',
    },
    audit: {
      enabled: true,
      retention: 30,
    },
  },
}) satisfies OsaIConfig;

// ---------------------------------------------------------------------------
// Validation Engine
// ---------------------------------------------------------------------------

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a config object against the schema.
 */
export function validateConfig(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (data === null || typeof data !== 'object') {
    return {
      valid: false,
      errors: [{ path: '', message: 'Config must be an object', value: data }],
    };
  }

  const obj = data as Record<string, unknown>;

  // Validate required fields
  for (const key of configSchema.required) {
    if (!(key in obj)) {
      errors.push({
        path: key,
        message: `Required field "${key}" is missing`,
      });
    }
  }

  // Check for additional properties
  for (const key of Object.keys(obj)) {
    if (!Object.keys(configSchema.properties).includes(key)) {
      errors.push({
        path: key,
        message: `Unexpected property "${key}"`,
      });
    }
  }

  // Validate gateway section
  if ('gateway' in obj) {
    validateSection(obj, 'gateway', configSchema.properties.gateway, errors);
  }

  // Validate model section
  if ('model' in obj) {
    validateSection(obj, 'model', configSchema.properties.model, errors);
  }

  // Validate optional sections
  const optionalSections = ['session', 'skills', 'security', 'memory', 'observability'] as const;
  for (const section of optionalSections) {
    if (section in obj && obj[section] !== undefined && obj[section] !== null) {
      const sectionSchema = configSchema.properties[section] as Record<string, unknown>;
      validateObject(obj[section] as Record<string, unknown>, section, sectionSchema, errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateSection(
  parent: Record<string, unknown>,
  key: string,
  schema: Record<string, unknown>,
  errors: ValidationError[],
): void {
  const value = parent[key];
  if (value === null || typeof value !== 'object') {
    errors.push({
      path: key,
      message: `"${key}" must be an object`,
      value,
    });
    return;
  }

  const sectionSchema = schema as Record<string, unknown>;
  validateObject(value as Record<string, unknown>, key, sectionSchema, errors);
}

function validateObject(
  obj: Record<string, unknown>,
  prefix: string,
  schema: Record<string, unknown>,
  errors: ValidationError[],
): void {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = schema.required as string[] | undefined;

  if (!props) return;

  // Check required fields
  if (required) {
    for (const field of required) {
      if (!(field in obj) || obj[field] === undefined) {
        errors.push({
          path: `${prefix}.${field}`,
          message: `Required field "${field}" is missing`,
        });
      }
    }
  }

  // Validate types
  for (const [field, fieldSchema] of Object.entries(props)) {
    if (!(field in obj) || obj[field] === undefined) continue;

    const value = obj[field];
    const expectedType = fieldSchema.type as string | undefined;
    const enumValues = fieldSchema.enum as unknown[] | undefined;

    if (expectedType && !checkType(value, expectedType)) {
      errors.push({
        path: `${prefix}.${field}`,
        message: `Expected type "${expectedType}" but got "${typeof value}"`,
        value,
      });
      continue;
    }

    if (enumValues && !enumValues.includes(value)) {
      errors.push({
        path: `${prefix}.${field}`,
        message: `Value "${String(value)}" is not one of: ${enumValues.map(String).join(', ')}`,
        value,
      });
    }

    // Recurse nested objects
    if (expectedType === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nestedProps = fieldSchema.properties as Record<string, Record<string, unknown>> | undefined;
      if (nestedProps) {
        validateObject(value as Record<string, unknown>, `${prefix}.${field}`, fieldSchema as Record<string, unknown>, errors);
      }
    }

    // Validate array items
    if (expectedType === 'array' && Array.isArray(value)) {
      const itemsSchema = fieldSchema.items as Record<string, unknown> | undefined;
      if (itemsSchema) {
        const itemType = itemsSchema.type as string | undefined;
        if (itemType) {
          for (let i = 0; i < value.length; i++) {
            if (!checkType(value[i], itemType)) {
              errors.push({
                path: `${prefix}.${field}[${i}]`,
                message: `Array item expected type "${itemType}" but got "${typeof value[i]}"`,
                value: value[i],
              });
            }
          }
        }
      }
    }

    // Validate number constraints
    if (expectedType === 'number' && typeof value === 'number') {
      if (typeof fieldSchema.minimum === 'number' && value < fieldSchema.minimum) {
        errors.push({
          path: `${prefix}.${field}`,
          message: `Value ${value} is less than minimum ${fieldSchema.minimum}`,
          value,
        });
      }
      if (typeof fieldSchema.maximum === 'number' && value > fieldSchema.maximum) {
        errors.push({
          path: `${prefix}.${field}`,
          message: `Value ${value} is greater than maximum ${fieldSchema.maximum}`,
          value,
        });
      }
    }
  }

  // Check additional properties
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(obj)) {
      if (!(key in props)) {
        errors.push({
          path: `${prefix}.${key}`,
          message: `Unexpected property "${key}"`,
        });
      }
    }
  }
}

function checkType(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function isGatewayConfig(value: unknown): value is GatewayConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).host === 'string' &&
    typeof (value as Record<string, unknown>).port === 'number'
  );
}

export function isModelConfig(value: unknown): value is ModelConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).provider === 'string' &&
    typeof (value as Record<string, unknown>).model === 'string'
  );
}

export function isSessionConfig(value: unknown): value is SessionConfig {
  return typeof value === 'object' && value !== null;
}

export function isSkillsConfig(value: unknown): value is SkillsConfig {
  return typeof value === 'object' && value !== null;
}

export function isSecurityConfig(value: unknown): value is SecurityConfig {
  return typeof value === 'object' && value !== null;
}

export function isMemoryConfig(value: unknown): value is MemoryConfig {
  return typeof value === 'object' && value !== null;
}

export function isObservabilityConfig(value: unknown): value is ObservabilityConfig {
  return typeof value === 'object' && value !== null;
}

export function isOsaIConfig(value: unknown): value is OsaIConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'gateway' in value &&
    'model' in value &&
    isGatewayConfig((value as Record<string, unknown>).gateway) &&
    isModelConfig((value as Record<string, unknown>).model)
  );
}

// ---------------------------------------------------------------------------
// Defaults Merging
// ---------------------------------------------------------------------------

/**
 * Deep merge defaults with user-provided config.
 */
export function applyDefaults(userConfig: Partial<OsaIConfig>): OsaIConfig {
  return deepMerge(
    structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
    userConfig as unknown as Record<string, unknown>,
  ) as unknown as OsaIConfig;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Config version
// ---------------------------------------------------------------------------

export const CONFIG_SCHEMA_VERSION = '1.0.0';
