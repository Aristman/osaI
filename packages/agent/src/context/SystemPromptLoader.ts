/**
 * SystemPromptLoader -- Loads and manages system prompt components
 *
 * Handles AGENTS.md and SOUL.md content, with support for
 * future file-based loading.
 *
 * @module context/SystemPromptLoader
 */

import { promises as fs } from 'node:fs';

const DEFAULT_AGENTS_MD = 'You are a helpful AI assistant.';
const DEFAULT_SOUL_MD = '';

export class SystemPromptLoader {
  private agentsMdContent: string | null = null;
  private soulMdContent: string | null = null;

  /**
   * Set AGENTS.md content programmatically.
   *
   * @param content - The AGENTS.md content
   */
  setAgentsMd(content: string): void {
    this.agentsMdContent = content;
  }

  /**
   * Set SOUL.md content programmatically.
   *
   * @param content - The SOUL.md content
   */
  setSoulMd(content: string): void {
    this.soulMdContent = content;
  }

  /**
   * Get AGENTS.md content. Returns default if not set.
   *
   * @returns AGENTS.md content string
   */
  getAgentsMd(): string {
    return this.agentsMdContent ?? DEFAULT_AGENTS_MD;
  }

  /**
   * Get SOUL.md content. Returns default (empty string) if not set.
   *
   * @returns SOUL.md content string
   */
  getSoulMd(): string {
    return this.soulMdContent ?? DEFAULT_SOUL_MD;
  }

  /**
   * Load content from a file path.
   *
   * @param filePath - Absolute or relative path to the file
   * @returns File content as string
   * @throws Error if file cannot be read
   */
  async loadFromFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim();
  }

  /**
   * Load AGENTS.md content from a file and set it.
   *
   * @param filePath - Path to AGENTS.md
   */
  async loadAgentsMdFromFile(filePath: string): Promise<void> {
    this.agentsMdContent = await this.loadFromFile(filePath);
  }

  /**
   * Load SOUL.md content from a file and set it.
   *
   * @param filePath - Path to SOUL.md
   */
  async loadSoulMdFromFile(filePath: string): Promise<void> {
    this.soulMdContent = await this.loadFromFile(filePath);
  }
}
