/**
 * @osai/skills-core -- SkillMdParser (DOMAIN-003, T-002)
 *
 * Parses SKILL.md declarative format:
 * - YAML frontmatter (name, version, description, category, permissions)
 * - Markdown body with tool definitions (## Tool: name, ### Parameters, ```json)
 *
 * NO external YAML library -- MVP hand-rolled parser.
 */

import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { SkillMdValidator } from './SkillMdValidator.js';
import type { SkillDefinition } from '../types.js';
import type { ParsedSkillMd } from './SkillMdValidator.js';

/**
 * SkillMdParser reads SKILL.md files and produces SkillDefinition objects.
 *
 * SKILL.md format:
 * ```
 * ---
 * name: skill-name
 * version: 1.0.0
 * description: Skill description
 * category: bundled
 * permissions:
 *   tool_name: auto
 * ---
 *
 * ## Tool: tool_name
 *
 * Tool description here.
 *
 * ### Parameters
 *
 * ```json
 * { ... JSON Schema ... }
 * ```
 * ```
 */
export class SkillMdParser {
  private readonly validator: SkillMdValidator;

  constructor(validator?: SkillMdValidator) {
    this.validator = validator ?? new SkillMdValidator();
  }

  /**
   * Parse a SKILL.md content string into a SkillDefinition.
   * @throws Error if content is malformed or fails validation
   */
  parse(content: string, source?: string): SkillDefinition {
    const parsed = this.extractFrontmatter(content, source);
    const body = this.extractBody(content, source);
    parsed.tools = this.extractTools(body, source);
    return this.validator.validate(parsed, source);
  }

  /**
   * Parse a SKILL.md file at the given path.
   * @throws Error if the file cannot be read, parsed, or validated
   */
  async parseFile(filePath: string): Promise<SkillDefinition> {
    const content = await readFile(filePath, 'utf-8');
    return this.parse(content, filePath);
  }

  /**
   * Scan a directory for SKILL.md files in subdirectories.
   * Looks for SKILL.md in each immediate subdirectory.
   * Returns an array of SkillDefinition for all valid skills found.
   *
   * Invalid SKILL.md files are logged but do not abort scanning.
   */
  async scanDirectory(dirPath: string): Promise<SkillDefinition[]> {
    const results: SkillDefinition[] = [];

    let entries: Dirent[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true }) as Dirent[];
    } catch {
      // Directory does not exist or is not readable -- return empty
      return results;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillMdPath = join(dirPath, entry.name, 'SKILL.md');

      try {
        const skillDef = await this.parseFile(skillMdPath);
        results.push(skillDef);
      } catch {
        // Skip invalid SKILL.md files -- could log warning in production
        // For MVP, silently continue scanning
      }
    }

    return results;
  }

  // --- Frontmatter Parsing ---

  /**
   * Extract YAML frontmatter from SKILL.md content.
   * Frontmatter is delimited by `---` at the start and end.
   */
  private extractFrontmatter(content: string, source?: string): ParsedSkillMd {
    const trimmed = content.trimStart();

    if (!trimmed.startsWith('---')) {
      throw new Error(
        `Missing YAML frontmatter (expected '---' at start of file)${source ? ` in ${source}` : ''}`,
      );
    }

    // Find closing ---
    const firstDelimiterEnd = trimmed.indexOf('\n');
    if (firstDelimiterEnd === -1) {
      throw new Error(
        `Invalid frontmatter format${source ? ` in ${source}` : ''}`,
      );
    }

    const afterFirstDelimiter = trimmed.substring(firstDelimiterEnd + 1);
    const secondDelimiterPos = afterFirstDelimiter.indexOf('\n---');

    if (secondDelimiterPos === -1) {
      throw new Error(
        `Unclosed frontmatter (missing closing '---')${source ? ` in ${source}` : ''}`,
      );
    }

    const frontmatterBlock = afterFirstDelimiter.substring(0, secondDelimiterPos);
    return this.parseFrontmatterLines(frontmatterBlock);
  }

  /**
   * Parse frontmatter lines into a ParsedSkillMd.
   * Simple key: value parser -- no nested YAML structures beyond permissions.
   */
  private parseFrontmatterLines(block: string): ParsedSkillMd {
    const result: ParsedSkillMd = {
      tools: [],
    };

    const lines = block.split('\n');
    let currentPermissionsKey: string | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) continue;

      // Handle indented permission lines only when we are in permissions context
      // and the line is genuinely indented (not just whitespace before a known key)
      if (currentPermissionsKey === 'permissions' && (line.startsWith('  ') || line.startsWith('\t'))) {
        const colonPos = trimmedLine.indexOf(':');
        if (colonPos !== -1) {
          const key = trimmedLine.substring(0, colonPos).trim();
          const value = trimmedLine.substring(colonPos + 1).trim();
          if (!result.permissions) result.permissions = {};
          result.permissions[key] = value;
        }
        continue;
      }

      // Reset permissions context for non-indented lines
      currentPermissionsKey = null;

      const colonPos = trimmedLine.indexOf(':');
      if (colonPos === -1) continue;

      const key = trimmedLine.substring(0, colonPos).trim();
      const value = trimmedLine.substring(colonPos + 1).trim();

      // Strip surrounding quotes from value
      const cleanValue = stripQuotes(value);

      switch (key) {
        case 'name':
          result.name = cleanValue;
          break;
        case 'version':
          result.version = cleanValue;
          break;
        case 'description':
          result.description = cleanValue;
          break;
        case 'category':
          result.category = cleanValue;
          break;
        case 'permissions':
          // If inline value like "permissions: { tool: auto }" -- skip (not supported in MVP)
          // Otherwise, expect indented lines below
          currentPermissionsKey = 'permissions';
          result.permissions = {};
          break;
      }
    }

    return result;
  }

  // --- Body Extraction ---

  /**
   * Extract Markdown body (after frontmatter).
   */
  private extractBody(content: string, source?: string): string {
    const trimmed = content.trimStart();

    if (!trimmed.startsWith('---')) {
      throw new Error(
        `Missing frontmatter${source ? ` in ${source}` : ''}`,
      );
    }

    // Find second ---
    const firstNewline = trimmed.indexOf('\n');
    const afterFirst = trimmed.substring(firstNewline + 1);
    const secondDelimiter = afterFirst.indexOf('\n---');

    if (secondDelimiter === -1) {
      return '';
    }

    return afterFirst.substring(secondDelimiter + 4).trim();
  }

  // --- Tool Extraction ---

  /**
   * Extract tool definitions from Markdown body.
   * Format: ## Tool: name \n Description \n ### Parameters \n ```json ... ```
   */
  private extractTools(body: string, source?: string): ParsedSkillMd['tools'] {
    const tools: ParsedSkillMd['tools'] = [];

    // Find all "## Tool: <name>" headings
    const toolHeadingRegex = /^##\s+Tool:\s*(.+)$/gm;
    let match: RegExpExecArray | null;

    while ((match = toolHeadingRegex.exec(body)) !== null) {
      const toolName = match[1]!.trim();
      const toolStart = match.index + match[0]!.length;

      // Find the end of this tool section (next ## Tool: or end of body)
      const nextToolMatch = /^##\s+Tool:\s*/gm;
      nextToolMatch.lastIndex = toolStart;
      const nextMatch = nextToolMatch.exec(body);

      const toolEnd = nextMatch ? nextMatch.index : body.length;
      const toolSection = body.substring(toolStart, toolEnd);

      // Extract description (text before ### Parameters or ### Parameters)
      const descEnd = toolSection.indexOf('### Parameters');
      const description = (descEnd !== -1
        ? toolSection.substring(0, descEnd)
        : toolSection
      )
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join(' ');

      // Extract JSON Schema from ```json ... ``` block
      const parameters = this.extractJsonSchema(toolSection, toolName, source);

      tools.push({
        name: toolName,
        description,
        parameters,
      });
    }

    return tools;
  }

  /**
   * Extract JSON Schema from a ```json ... ``` code block.
   */
  private extractJsonSchema(
    toolSection: string,
    toolName: string,
    source?: string,
  ): unknown {
    // Find ```json ... ``` block
    const jsonBlockRegex = /```json\s*\n([\s\S]*?)```/;
    const jsonMatch = jsonBlockRegex.exec(toolSection);

    if (!jsonMatch) {
      // No parameters block found -- tool has no parameters definition
      throw new Error(
        `Tool '${toolName}' is missing JSON parameters block (expected '### Parameters' followed by code fence json)` +
          (source ? ` in ${source}` : ''),
      );
    }

    const jsonStr = jsonMatch[1]!.trim();

    try {
      return JSON.parse(jsonStr);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Invalid JSON in parameters for tool '${toolName}': ${message}${source ? ` in ${source}` : ''}`,
      );
    }
  }
}

/**
 * Strip surrounding single or double quotes from a string.
 */
function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.substring(1, value.length - 1);
  }
  return value;
}
