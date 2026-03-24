/**
 * OpenAI provider implementation.
 *
 * This is a mock implementation for testing and development.
 * Replace the `complete` and `stream` bodies with real HTTP calls
 * when connecting to the OpenAI API.
 */

import type {
  ModelMessage,
  ModelOptions,
  ModelProvider,
  ModelResponse,
  StreamChunk,
} from '../../types.js';

export interface OpenAIProviderConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  /** If set, complete() will reject with this error (for testing failover). */
  _failWith?: Error;
}

export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly _failWith?: Error;

  constructor(config: OpenAIProviderConfig) {
    this.model = config.model;
    this._failWith = config._failWith;
  }

  async complete(messages: ModelMessage[], _options?: ModelOptions): Promise<ModelResponse> {
    if (this._failWith) {
      throw this._failWith;
    }

    return {
      content: `[openai] mock response to: ${messages[messages.length - 1]?.content ?? ''}`,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    };
  }

  async *stream(_messages: ModelMessage[], _options?: ModelOptions): AsyncIterable<StreamChunk> {
    if (this._failWith) {
      throw this._failWith;
    }

    yield { type: 'content', content: '[openai] ' };
    yield { type: 'content', content: 'streaming mock' };
    yield { type: 'done', usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 } };
  }
}
