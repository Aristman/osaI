/**
 * @osai/agent -- SkillLoader
 *
 * Parses SKILL.md frontmatter format into SkillDefinition objects.
 */

import type { SkillDefinition, HookPoint } from '../types.js';
import { SkillParseError } from './errors.js';

/**
 * Extracts YAML frontmatter block from markdown content.
 * Returns the frontmatter string (without delimiters) and the remaining body.
 */
function extractFrontmatter(
  content: string,
): { frontmatter: string; body: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  return {
    frontmatter: match[1]!.trim(),
    body: content.slice(match[0]!.length).trim(),
  };
}

/**
 * Minimal YAML parser sufficient for the SKILL.md frontmatter format.
 * Handles: strings, numbers, booleans, arrays (flow and block), objects.
 *
 * NOT a general-purpose YAML parser -- covers only the subset used by SKILL.md.
 */
function parseYaml(raw: string): Record<string, unknown> {
  const lines = raw.split('\n');
  return parseYamlBlock(lines, 0, 0).value;
}

interface ParseResult {
  value: Record<string, unknown>;
  nextIndex: number;
}

function parseYamlBlock(
  lines: string[],
  startIndex: number,
  baseIndent: number,
): ParseResult {
  const result: Record<string, unknown> = {};
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Calculate indentation of current line
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();

    // If we've dedented past base, we're done with this block
    if (indent < baseIndent) break;

    // Array item at this level: "- value"
    if (trimmed.startsWith('- ')) {
      break; // handled by parseYamlArray
    }

    // Key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const rest = trimmed.slice(colonIndex + 1).trim();

    if (rest === '' || rest === '|' || rest === '>') {
      // Value is on next lines (indented block)
      const nextNonEmpty = findNextNonEmpty(lines, i + 1);
      if (nextNonEmpty === -1 || nextNonEmpty >= lines.length) {
        result[key] = '';
        i++;
        continue;
      }
      const nextLine = lines[nextNonEmpty]!;
      const nextIndent = nextLine.length - nextLine.trimStart().length;

      if (nextLine.trimStart().startsWith('- ')) {
        const arrResult = parseYamlArray(lines, nextNonEmpty, nextIndent);
        result[key] = arrResult.value;
        i = arrResult.nextIndex;
      } else {
        const objResult = parseYamlBlock(lines, nextNonEmpty, nextIndent);
        result[key] = objResult.value;
        i = objResult.nextIndex;
      }
    } else {
      // Inline value
      result[key] = parseScalar(rest);
      i++;
    }
  }

  return { value: result, nextIndex: i };
}

interface ArrayParseResult {
  value: unknown[];
  nextIndex: number;
}

function parseYamlArray(
  lines: string[],
  startIndex: number,
  baseIndent: number,
): ArrayParseResult {
  const result: unknown[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      i++;
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();

    if (indent < baseIndent || !trimmed.startsWith('- ')) {
      break;
    }

    const itemContent = trimmed.slice(2).trim();

    if (itemContent === '' || itemContent.includes(':')) {
      // Could be an object block or inline object
      if (itemContent.includes(':')) {
        // Inline key-value or object
        const colonIdx = itemContent.indexOf(':');
        const itemKey = itemContent.slice(0, colonIdx).trim();
        const itemRest = itemContent.slice(colonIdx + 1).trim();

        if (itemRest === '') {
          // Object continues on next lines
          const nextNonEmpty = findNextNonEmpty(lines, i + 1);
          if (
            nextNonEmpty !== -1 &&
            nextNonEmpty < lines.length
          ) {
            const nextLine = lines[nextNonEmpty]!;
            const nextIndent =
              nextLine.length - nextLine.trimStart().length;

            if (nextLine.trimStart().startsWith('- ')) {
              // Array of arrays
              const arrResult = parseYamlArray(
                lines,
                nextNonEmpty,
                nextIndent,
              );
              result.push({ [itemKey]: arrResult.value });
              i = arrResult.nextIndex;
            } else {
              const objResult = parseYamlBlock(
                lines,
                nextNonEmpty,
                nextIndent,
              );
              result.push({ [itemKey]: objResult.value });
              i = objResult.nextIndex;
            }
          } else {
            result.push({ [itemKey]: '' });
            i++;
          }
        } else {
          // Inline: key: value
          const obj: Record<string, unknown> = { [itemKey]: parseScalar(itemRest) };

          // Check for additional inline key: value pairs
          // e.g., "point: on_file_access\n    priority: 10"
          const nextIdx = i + 1;
          if (nextIdx < lines.length) {
            const nextLine = lines[nextIdx]!;
            const nextIndent =
              nextLine.length - nextLine.trimStart().length;
            const nextTrimmed = nextLine.trimStart();

            if (
              nextIndent === indent &&
              nextTrimmed.startsWith('- ') &&
              nextTrimmed.slice(2).trim().includes(':')
            ) {
              // This starts a new array item with a key, not continuation
              result.push(obj);
              i++;
              continue;
            }

            if (nextIndent > indent && !nextTrimmed.startsWith('- ')) {
              const subResult = parseYamlBlock(
                lines,
                nextIdx,
                nextIndent,
              );
              result.push({ ...obj, ...subResult.value });
              i = subResult.nextIndex;
            } else {
              result.push(obj);
              i++;
            }
          } else {
            result.push(obj);
            i++;
          }
        }
      } else {
        // Empty item, check next lines for object
        const nextNonEmpty = findNextNonEmpty(lines, i + 1);
        if (
          nextNonEmpty !== -1 &&
          nextNonEmpty < lines.length
        ) {
          const nextLine = lines[nextNonEmpty]!;
          const nextIndent =
            nextLine.length - nextLine.trimStart().length;

          if (nextIndent > indent) {
            const objResult = parseYamlBlock(
              lines,
              nextNonEmpty,
              nextIndent,
            );
            result.push(objResult.value);
            i = objResult.nextIndex;
          } else {
            result.push(null);
            i++;
          }
        } else {
          result.push(null);
          i++;
        }
      }
    } else {
      // Simple scalar value in array
      result.push(parseScalar(itemContent));
      i++;
    }
  }

  return { value: result, nextIndex: i };
}

function findNextNonEmpty(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    if (lines[i]!.trim() !== '') return i;
  }
  return -1;
}

function parseScalar(value: string): unknown {
  // Remove surrounding quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  const num = Number(value);
  if (value !== '' && !isNaN(num)) return num;

  // Flow array: [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => parseScalar(item.trim()));
  }

  // Flow object: { key: value }
  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return {};
    const obj: Record<string, unknown> = {};
    for (const pair of inner.split(',')) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx !== -1) {
        const k = pair.slice(0, colonIdx).trim();
        const v = pair.slice(colonIdx + 1).trim();
        obj[k] = parseScalar(v);
      }
    }
    return obj;
  }

  return value;
}

/**
 * Validates that raw parsed data conforms to the SkillDefinition shape.
 */
function validateAndNormalize(
  data: Record<string, unknown>,
): SkillDefinition {
  if (typeof data['name'] !== 'string' || data['name'] === '') {
    throw new SkillParseError("Skill definition must have a non-empty 'name' field");
  }

  if (typeof data['description'] !== 'string') {
    throw new SkillParseError(
      "Skill definition must have a string 'description' field",
    );
  }

  if (typeof data['category'] !== 'string') {
    throw new SkillParseError("Skill definition must have a string 'category' field");
  }

  const tools = data['tools'];
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new SkillParseError(
      'Skill definition must have a non-empty "tools" array',
    );
  }

  const normalizedTools = tools.map((tool: unknown, index: number) => {
    if (typeof tool !== 'object' || tool === null) {
      throw new SkillParseError(
        `Tool at index ${index} must be an object`,
      );
    }
    const t = tool as Record<string, unknown>;

    if (typeof t['name'] !== 'string' || t['name'] === '') {
      throw new SkillParseError(
        `Tool at index ${index} must have a non-empty 'name' field`,
      );
    }

    if (typeof t['description'] !== 'string') {
      throw new SkillParseError(
        `Tool '${String(t['name'])}' must have a 'description' field`,
      );
    }

    const category = t['category'] as string | undefined;
    if (
      category !== 'read' &&
      category !== 'write' &&
      category !== 'execute' &&
      category !== 'system'
    ) {
      throw new SkillParseError(
        `Tool '${String(t['name'])}' must have a valid 'category' (read|write|execute|system)`,
      );
    }

    const parameters = (t['parameters'] as Record<string, unknown>) ?? {
      type: 'object',
      properties: {},
    };

    return {
      name: t['name'] as string,
      description: t['description'] as string,
      category: category as 'read' | 'write' | 'execute' | 'system',
      parameters,
    };
  });

  const version = typeof data['version'] === 'string' ? data['version'] : '0.0.0';

  let hooks: SkillDefinition['hooks'] = undefined;
  const rawHooks = data['hooks'];
  if (Array.isArray(rawHooks) && rawHooks.length > 0) {
    hooks = rawHooks.map((hook: unknown, index: number) => {
      if (typeof hook !== 'object' || hook === null) {
        throw new SkillParseError(`Hook at index ${index} must be an object`);
      }
      const h = hook as Record<string, unknown>;

      if (typeof h['point'] !== 'string') {
        throw new SkillParseError(
          `Hook at index ${index} must have a 'point' field`,
        );
      }

      return {
        point: h['point'] as HookPoint,
        priority: typeof h['priority'] === 'number' ? h['priority'] : 0,
      };
    });
  }

  let permissions: string[] | undefined = undefined;
  const rawPermissions = data['permissions'];
  if (Array.isArray(rawPermissions) && rawPermissions.length > 0) {
    permissions = rawPermissions.filter(
      (p: unknown) => typeof p === 'string',
    ) as string[];
    if (permissions.length === 0) permissions = undefined;
  }

  return {
    name: data['name'] as string,
    version,
    description: data['description'] as string,
    category: data['category'] as string,
    tools: normalizedTools,
    hooks,
    permissions,
  };
}

export class SkillLoader {
  /**
   * Parse a SKILL.md formatted string into a SkillDefinition.
   *
   * @param content - The full SKILL.md file content including YAML frontmatter
   * @returns A validated SkillDefinition
   * @throws {SkillParseError} If the content cannot be parsed or is invalid
   */
  parseSkillMd(content: string): SkillDefinition {
    const extracted = extractFrontmatter(content);
    if (!extracted) {
      throw new SkillParseError(
        'Invalid SKILL.md: missing YAML frontmatter block (--- delimited)',
      );
    }

    let data: Record<string, unknown>;
    try {
      data = parseYaml(extracted.frontmatter);
    } catch {
      throw new SkillParseError(
        'Invalid SKILL.md: failed to parse YAML frontmatter',
      );
    }

    return validateAndNormalize(data);
  }

  /**
   * Load a SkillDefinition from a directory containing SKILL.md.
   *
   * Planned for future versions. Currently throws NotImplementedError.
   *
   * @param _dirPath - Path to the skill directory
   * @throws {Error} NotImplementedError
   */
  async loadSkillFromDirectory(_dirPath: string): Promise<SkillDefinition> {
    throw new Error('loadSkillFromDirectory is not yet implemented');
  }
}
