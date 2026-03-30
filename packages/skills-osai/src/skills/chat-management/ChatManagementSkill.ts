/**
 * @osai/skills-osai -- Chat Management Skill (DOMAIN-003)
 *
 * osaI skill for managing chat sessions.
 * 5 tools: chat_list, chat_create, chat_switch, chat_archive, chat_delete.
 *
 * All tools delegate to ChatGateway (injectable dependency, mock in tests).
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
 * Interface for the Chat Gateway service that this skill delegates to.
 * Placeholder -- real Gateway Chat API may differ; mock in tests.
 */
export interface ChatGatewayService {
  /** List all chat sessions. */
  listChats(): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
  }>>;

  /** Create a new chat session. */
  createChat(options?: { name?: string; description?: string }): Promise<{
    id: string;
    name: string;
  }>;

  /** Switch the active chat session. */
  switchChat(chatId: string): Promise<{ activeChatId: string }>;

  /** Archive a chat session. */
  archiveChat(chatId: string): Promise<{ archived: boolean; chatId: string }>;

  /** Delete a chat session permanently. */
  deleteChat(chatId: string): Promise<{ deleted: boolean; chatId: string }>;
}

/** Options for creating a ChatManagementSkill instance. */
export interface ChatManagementSkillOptions {
  /** ChatGateway service instance for delegation. */
  chatGatewayService: ChatGatewayService;
}

// ---------------------------------------------------------------------------
// Tool parameter schemas (JSON Schema for LLM function calling)
// ---------------------------------------------------------------------------

const CHAT_LIST_PARAMS: ToolParameters = {
  type: 'object',
  properties: {},
};

const CHAT_CREATE_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Chat name',
    },
    description: {
      type: 'string',
      description: 'Chat description',
    },
  },
};

const CHAT_SWITCH_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    chatId: {
      type: 'string',
      description: 'The chat ID to switch to',
    },
  },
  required: ['chatId'],
};

const CHAT_ARCHIVE_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    chatId: {
      type: 'string',
      description: 'The chat ID to archive',
    },
  },
  required: ['chatId'],
};

const CHAT_DELETE_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    chatId: {
      type: 'string',
      description: 'The chat ID to delete',
    },
  },
  required: ['chatId'],
};

// ---------------------------------------------------------------------------
// ChatManagementSkill
// ---------------------------------------------------------------------------

/**
 * ChatManagementSkill -- osaI skill for managing chat sessions.
 *
 * Creates a SkillDefinition programmatically with 5 tools that delegate
 * to ChatGatewayService.
 */
export class ChatManagementSkill {
  private readonly chatGatewayService: ChatGatewayService;
  private readonly logger: PinoLogger;

  constructor(options: ChatManagementSkillOptions) {
    this.chatGatewayService = options.chatGatewayService;
    this.logger = LoggerFactory.create('skills-osai', 'chat-management');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Build the SkillDefinition for registration in SkillRegistry.
   */
  getDefinition(): SkillDefinition {
    return {
      name: 'chat-management',
      version: '1.0.0',
      description: 'osaI Chat Management Skill -- list, create, switch, archive, delete chat sessions',
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
   * chat_list -- list all chat sessions.
   * Delegates to ChatGatewayService.listChats().
   */
  private async handleChatList(_params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const chats = await this.chatGatewayService.listChats();

      this.logger.info(
        { action: 'chat_list', count: chats.length },
        'Chat list completed',
      );

      return { success: true, data: chats };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'chat_list', error: message }, 'Failed to list chats');
      return { success: false, error: message };
    }
  }

  /**
   * chat_create -- create a new chat session.
   * Delegates to ChatGatewayService.createChat().
   */
  private async handleChatCreate(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const name = params['name'] as string | undefined;
      const description = params['description'] as string | undefined;

      const chat = await this.chatGatewayService.createChat({ name, description });

      this.logger.info(
        { action: 'chat_create', chatId: chat.id },
        'Chat created successfully',
      );

      return { success: true, data: chat };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'chat_create', error: message }, 'Failed to create chat');
      return { success: false, error: message };
    }
  }

  /**
   * chat_switch -- switch active chat session.
   * Delegates to ChatGatewayService.switchChat().
   */
  private async handleChatSwitch(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const chatId = params['chatId'] as string;

      if (!chatId || typeof chatId !== 'string') {
        return { success: false, error: 'Parameter "chatId" is required and must be a string' };
      }

      const result = await this.chatGatewayService.switchChat(chatId);

      this.logger.info(
        { action: 'chat_switch', chatId },
        'Chat switched successfully',
      );

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'chat_switch', error: message }, 'Failed to switch chat');
      return { success: false, error: message };
    }
  }

  /**
   * chat_archive -- archive a chat session.
   * Delegates to ChatGatewayService.archiveChat().
   */
  private async handleChatArchive(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const chatId = params['chatId'] as string;

      if (!chatId || typeof chatId !== 'string') {
        return { success: false, error: 'Parameter "chatId" is required and must be a string' };
      }

      const result = await this.chatGatewayService.archiveChat(chatId);

      this.logger.info(
        { action: 'chat_archive', chatId },
        'Chat archived successfully',
      );

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'chat_archive', error: message }, 'Failed to archive chat');
      return { success: false, error: message };
    }
  }

  /**
   * chat_delete -- delete a chat session permanently.
   * Delegates to ChatGatewayService.deleteChat().
   */
  private async handleChatDelete(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const chatId = params['chatId'] as string;

      if (!chatId || typeof chatId !== 'string') {
        return { success: false, error: 'Parameter "chatId" is required and must be a string' };
      }

      const result = await this.chatGatewayService.deleteChat(chatId);

      this.logger.info(
        { action: 'chat_delete', chatId },
        'Chat deleted successfully',
      );

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ action: 'chat_delete', error: message }, 'Failed to delete chat');
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildTools(): ToolDefinitionWithHandler[] {
    return [
      {
        name: 'chat_list',
        description: 'List all chat sessions',
        parameters: CHAT_LIST_PARAMS,
        handler: (params) => this.handleChatList(params),
      },
      {
        name: 'chat_create',
        description: 'Create a new chat session',
        parameters: CHAT_CREATE_PARAMS,
        handler: (params) => this.handleChatCreate(params),
      },
      {
        name: 'chat_switch',
        description: 'Switch the active chat session',
        parameters: CHAT_SWITCH_PARAMS,
        handler: (params) => this.handleChatSwitch(params),
      },
      {
        name: 'chat_archive',
        description: 'Archive a chat session',
        parameters: CHAT_ARCHIVE_PARAMS,
        handler: (params) => this.handleChatArchive(params),
      },
      {
        name: 'chat_delete',
        description: 'Delete a chat session permanently',
        parameters: CHAT_DELETE_PARAMS,
        handler: (params) => this.handleChatDelete(params),
      },
    ];
  }

  private buildPermissions(): PermissionPolicy {
    return {
      chat_list: 'auto',
      chat_create: 'confirm',
      chat_switch: 'auto',
      chat_archive: 'confirm',
      chat_delete: 'confirm',
    };
  }
}
