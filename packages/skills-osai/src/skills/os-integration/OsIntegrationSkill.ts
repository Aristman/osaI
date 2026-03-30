/**
 * @osai/skills-osai -- OS Integration Skill (DOMAIN-003)
 *
 * osaI skill providing access to OS-level features.
 * 3 tools: show_notification, list_processes, get_system_info.
 *
 * All tools delegate to OsIntegration (injectable dependency).
 */

import type {
  SkillDefinition,
  ToolDefinitionWithHandler,
  ToolResult,
  PermissionPolicy,
  ToolParameters,
} from '@osai/skills-core';
import { LoggerFactory } from '@osai/observability';
import type { Logger as PinoLogger } from 'pino';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Interface for the OS Integration service that this skill delegates to.
 * Mirrors the OsIntegration facade from packages/os-integration.
 */
export interface OsIntegrationService {
  /**
   * Send a desktop notification.
   * Mirrors OsIntegration.notify().
   */
  notify(options: { title: string; message?: string }): Promise<{ ok: boolean; error?: string }>;

  /**
   * List running processes, optionally filtered.
   * Mirrors OsIntegration.listProcesses().
   */
  listProcesses(filter?: { name?: string }): Promise<Array<{
    pid: number;
    name: string;
    cpu: number;
    mem: number;
    status: string;
  }>>;

  /**
   * Get full system information.
   * Mirrors OsIntegration.getSystemInfo().
   */
  getSystemInfo(): Promise<{
    cpu: { model: string; physicalCores: number; logicalCores: number; speed: number; load: number };
    memory: { total: number; used: number; free: number; swapTotal: number; swapUsed: number };
    disk: Array<{ mount: string; fsType: string; totalGb: number; usedGb: number; freeGb: number; usedPercent: number }>;
  }>;
}

/** Options for creating an OsIntegrationSkill instance. */
export interface OsIntegrationSkillOptions {
  /** OsIntegration service instance for delegation. */
  osIntegrationService: OsIntegrationService;
}

// ---------------------------------------------------------------------------
// Tool parameter schemas (JSON Schema for LLM function calling)
// ---------------------------------------------------------------------------

const SHOW_NOTIFICATION_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Notification title',
    },
    message: {
      type: 'string',
      description: 'Notification body message',
    },
  },
  required: ['title'],
};

const LIST_PROCESSES_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    filter: {
      type: 'string',
      description: 'Filter by process name (substring match, case-insensitive)',
    },
  },
};

const GET_SYSTEM_INFO_PARAMS: ToolParameters = {
  type: 'object',
  properties: {},
};

// ---------------------------------------------------------------------------
// OsIntegrationSkill
// ---------------------------------------------------------------------------

/**
 * OsIntegrationSkill -- osaI skill for OS-level features.
 *
 * Creates a SkillDefinition programmatically with 3 tools that delegate
 * to OsIntegrationService.
 */
export class OsIntegrationSkill {
  private readonly osIntegrationService: OsIntegrationService;
  private readonly logger: PinoLogger;

  constructor(options: OsIntegrationSkillOptions) {
    this.osIntegrationService = options.osIntegrationService;
    this.logger = LoggerFactory.create('skills-osai', 'os-integration');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Build the SkillDefinition for registration in SkillRegistry.
   */
  getDefinition(): SkillDefinition {
    return {
      name: 'os-integration',
      version: '1.0.0',
      description: 'osaI OS Integration Skill -- notifications, process management, system info',
      category: 'osaI',
      enabled: true,
      tools: this.buildTools(),
      permissions: this.buildPermissions(),
    };
  }

  // -------------------------------------------------------------------------
  // Tool handlers
  // -------------------------------------------------------------------------

  /**
   * show_notification -- send a desktop notification.
   * Delegates to OsIntegrationService.notify().
   */
  private async handleShowNotification(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const title = params['title'] as string;
      const message = params['message'] as string | undefined;

      if (!title || typeof title !== 'string') {
        return { success: false, error: 'Parameter "title" is required and must be a string' };
      }

      const result = await this.osIntegrationService.notify({ title, message });

      this.logger.info(
        { action: 'show_notification', title, ok: result.ok },
        'Notification completed',
      );

      if (result.ok) {
        return { success: true, data: { notified: true, title } };
      }

      return { success: false, error: result.error ?? 'Notification failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'show_notification', error: message }, 'Failed to show notification');
      return { success: false, error: message };
    }
  }

  /**
   * list_processes -- list running processes.
   * Delegates to OsIntegrationService.listProcesses().
   */
  private async handleListProcesses(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const filter = params['filter'] as string | undefined;

      const filterOption = filter ? { name: filter } : undefined;
      const processes = await this.osIntegrationService.listProcesses(filterOption);

      this.logger.info(
        { action: 'list_processes', count: processes.length, filter: filter ?? null },
        'Process list completed',
      );

      return {
        success: true,
        data: processes.map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: p.cpu,
          mem: p.mem,
          status: p.status,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'list_processes', error: message }, 'Failed to list processes');
      return { success: false, error: message };
    }
  }

  /**
   * get_system_info -- retrieve full system information.
   * Delegates to OsIntegrationService.getSystemInfo().
   */
  private async handleGetSystemInfo(_params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const info = await this.osIntegrationService.getSystemInfo();

      this.logger.info(
        { action: 'get_system_info' },
        'System info retrieved',
      );

      return { success: true, data: info };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'get_system_info', error: message }, 'Failed to get system info');
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildTools(): ToolDefinitionWithHandler[] {
    return [
      {
        name: 'show_notification',
        description: 'Send a desktop notification to the user',
        parameters: SHOW_NOTIFICATION_PARAMS,
        handler: (params) => this.handleShowNotification(params),
      },
      {
        name: 'list_processes',
        description: 'List running processes on the system',
        parameters: LIST_PROCESSES_PARAMS,
        handler: (params) => this.handleListProcesses(params),
      },
      {
        name: 'get_system_info',
        description: 'Retrieve full system information (CPU, memory, disk)',
        parameters: GET_SYSTEM_INFO_PARAMS,
        handler: (params) => this.handleGetSystemInfo(params),
      },
    ];
  }

  private buildPermissions(): PermissionPolicy {
    return {
      show_notification: 'confirm',
      list_processes: 'auto',
      get_system_info: 'auto',
    };
  }
}
