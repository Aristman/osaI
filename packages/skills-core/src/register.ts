/**
 * @osai/skills-core -- registerBundledSkills
 *
 * Registers all bundled skills (filesystem, shell, http, browser)
 * with the provided SkillRegistry instance.
 */

import type { SkillRegistry } from '@osai/agent';
import type { SkillsCoreConfig } from './types.js';
import { createFilesystemSkill } from './skills/FilesystemSkill.js';
import { createShellSkill } from './skills/ShellSkill.js';
import { createHttpSkill } from './skills/HttpSkill.js';
import { createBrowserSkill } from './skills/BrowserSkill.js';

/**
 * Register all bundled skills with the given SkillRegistry.
 *
 * @param registry - The SkillRegistry instance to register skills with
 * @param config - Configuration for bundled skills
 */
export function registerBundledSkills(
  registry: SkillRegistry,
  config: SkillsCoreConfig = {},
): void {
  // Filesystem skill
  if (config.filesystem) {
    const { definition, executors } = createFilesystemSkill({
      allowedDirs: config.filesystem.allowedDirs,
      blockedPatterns: config.filesystem.blockedPatterns ?? [],
    });
    registry.register(definition, executors);
  }

  // Shell skill
  if (config.shell) {
    const { definition, executors } = createShellSkill({
      blockedCommands: config.shell.blockedCommands,
      timeout: config.shell.timeout,
    });
    registry.register(definition, executors);
  }

  // HTTP skill
  if (config.http) {
    const { definition, executors } = createHttpSkill({
      maxTimeout: config.http.maxTimeout,
      blockedHosts: config.http.blockedHosts,
    });
    registry.register(definition, executors);
  }

  // Browser skill (stub -- always available if enabled)
  if (config.browser?.enabled) {
    const { definition, executors } = createBrowserSkill();
    registry.register(definition, executors);
  }
}

/**
 * Register all bundled skills with default configuration.
 *
 * @param registry - The SkillRegistry instance to register skills with
 * @param defaultAllowedDir - Default allowed directory for filesystem operations
 */
export function registerBundledSkillsWithDefaults(
  registry: SkillRegistry,
  defaultAllowedDir: string,
): void {
  registerBundledSkills(registry, {
    filesystem: {
      allowedDirs: [defaultAllowedDir],
      blockedPatterns: [],
    },
    shell: {
      blockedCommands: [],
      timeout: 30_000,
    },
    http: {
      maxTimeout: 30_000,
    },
    browser: {
      enabled: true,
    },
  });
}
