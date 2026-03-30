/**
 * @osai/providers -- Yandex Message Converter Tests (DOMAIN-008)
 *
 * Tests for bidirectional conversion between osaI ChatMessage format
 * and Yandex Foundation Models API format.
 */

import { describe, it, expect } from 'vitest';
import {
  toYandexMessages,
  toYandexCompletionOptions,
  fromYandexResponse,
  fromYandexAlternative,
} from '../message-converter.js';
import type { ChatMessage, LLMRequest } from '../../types.js';
import type { YandexResponse, YandexAlternative } from '../message-converter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeYandexResponse(overrides: {
  text: string;
  status: string;
  usage?: { inputTextTokens: string; completionTextTokens: string; totalTokens: string };
}): YandexResponse {
  return {
    result: {
      alternatives: [
        {
          message: {
            role: 'assistant' as const,
            text: overrides.text,
          },
          status: overrides.status,
        },
      ],
      usage: overrides.usage,
      modelVersion: 'yandexgpt-32k-latest',
    },
  };
}

function makeYandexAlternative(text: string, status: string): YandexAlternative {
  return {
    message: {
      role: 'assistant',
      text,
    },
    status,
  };
}

// ---------------------------------------------------------------------------
// toYandexMessages
// ---------------------------------------------------------------------------

describe('toYandexMessages', () => {
  it('should convert user message to Yandex format', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello!' },
    ];

    const result = toYandexMessages(messages);
    expect(result).toEqual([
      { role: 'user', text: 'Hello!' },
    ]);
  });

  it('should convert assistant message to Yandex format', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello there!' },
    ];

    const result = toYandexMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ role: 'assistant', text: 'Hello there!' });
  });

  it('should convert system message to Yandex format', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hi' },
    ];

    const result = toYandexMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'system', text: 'Be helpful.' });
  });

  it('should convert multiple system messages to Yandex format', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'system', content: 'Respond in Russian.' },
      { role: 'user', content: 'Hello' },
    ];

    const result = toYandexMessages(messages);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: 'system', text: 'Be helpful.' });
    expect(result[1]).toEqual({ role: 'system', text: 'Respond in Russian.' });
  });

  it('should handle empty messages array', () => {
    const result = toYandexMessages([]);
    expect(result).toEqual([]);
  });

  it('should exclude tool messages from Yandex messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'What time is it?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'get_time', arguments: '{}' }],
      },
      { role: 'tool', content: '12:00', toolCallId: 'call_1' },
    ];

    // Yandex does not support tool role, so tool messages are excluded
    const result = toYandexMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', text: 'What time is it?' });
    expect(result[1]).toEqual({ role: 'assistant', text: '' });
  });
});

// ---------------------------------------------------------------------------
// toYandexCompletionOptions
// ---------------------------------------------------------------------------

describe('toYandexCompletionOptions', () => {
  it('should build completion options from LLMRequest', () => {
    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0.7,
      maxTokens: 1024,
    };

    const result = toYandexCompletionOptions(request);
    expect(result).toEqual({
      stream: false,
      temperature: 0.7,
      maxTokens: '1024',
    });
  });

  it('should default temperature and maxTokens when not specified', () => {
    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result = toYandexCompletionOptions(request);
    expect(result).toEqual({
      stream: false,
      temperature: 0.6,
      maxTokens: '768',
    });
  });

  it('should handle zero temperature', () => {
    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0,
    };

    const result = toYandexCompletionOptions(request);
    expect(result.temperature).toBe(0);
  });

  it('should return string maxTokens', () => {
    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 2048,
    };

    const result = toYandexCompletionOptions(request);
    expect(result.maxTokens).toBe('2048');
  });
});

// ---------------------------------------------------------------------------
// fromYandexResponse (non-streaming)
// ---------------------------------------------------------------------------

describe('fromYandexResponse', () => {
  it('should convert Yandex response to LLMResponse format (TT-002-42)', () => {
    const yandexResponse = makeYandexResponse({
      text: 'Hello! How can I help you?',
      status: 'ALTERNATIVE_STATUS_FINAL',
      usage: {
        inputTextTokens: '10',
        completionTextTokens: '7',
        totalTokens: '17',
      },
    });

    const request: LLMRequest = {
      model: 'yandexgpt-32k-latest',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result = fromYandexResponse(yandexResponse, request);
    expect(result.content).toBe('Hello! How can I help you?');
    expect(result.model).toBe('yandexgpt-32k-latest');
    expect(result.provider).toBe('yandex');
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 7,
      totalTokens: 17,
    });
    expect(result.finishReason).toBe('stop');
  });

  it('should handle empty text content', () => {
    const yandexResponse = makeYandexResponse({
      text: '',
      status: 'ALTERNATIVE_STATUS_FINAL',
      usage: {
        inputTextTokens: '5',
        completionTextTokens: '0',
        totalTokens: '5',
      },
    });

    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result = fromYandexResponse(yandexResponse, request);
    expect(result.content).toBe('');
    expect(result.usage.totalTokens).toBe(5);
  });

  it('should handle missing usage gracefully', () => {
    const yandexResponse = makeYandexResponse({
      text: 'Hi',
      status: 'ALTERNATIVE_STATUS_FINAL',
    });

    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result = fromYandexResponse(yandexResponse, request);
    expect(result.content).toBe('Hi');
    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it('should pick the first alternative', () => {
    const yandexResponse: YandexResponse = {
      result: {
        alternatives: [
          {
            message: { role: 'assistant', text: 'First response' },
            status: 'ALTERNATIVE_STATUS_FINAL',
          },
          {
            message: { role: 'assistant', text: 'Second response' },
            status: 'ALTERNATIVE_STATUS_FINAL',
          },
        ],
        usage: {
          inputTextTokens: '5',
          completionTextTokens: '2',
          totalTokens: '7',
        },
        modelVersion: 'yandexgpt-lite',
      },
    };

    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result = fromYandexResponse(yandexResponse, request);
    expect(result.content).toBe('First response');
  });

  it('should handle CONTENT_FILTER finish reason', () => {
    const yandexResponse = makeYandexResponse({
      text: 'Filtered content',
      status: 'ALTERNATIVE_STATUS_CONTENT_FILTER',
      usage: {
        inputTextTokens: '5',
        completionTextTokens: '2',
        totalTokens: '7',
      },
    });

    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result = fromYandexResponse(yandexResponse, request);
    expect(result.finishReason).toBe('content_filter');
  });

  it('should handle TRUNCATED finish reason', () => {
    const yandexResponse = makeYandexResponse({
      text: 'Truncated...',
      status: 'ALTERNATIVE_STATUS_TRUNCATED',
      usage: {
        inputTextTokens: '5',
        completionTextTokens: '100',
        totalTokens: '105',
      },
    });

    const request: LLMRequest = {
      model: 'yandexgpt-lite',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result = fromYandexResponse(yandexResponse, request);
    expect(result.finishReason).toBe('length');
  });
});

// ---------------------------------------------------------------------------
// fromYandexAlternative (streaming chunk helper)
// ---------------------------------------------------------------------------

describe('fromYandexAlternative', () => {
  it('should extract text and status from a single alternative', () => {
    const alternative = makeYandexAlternative('Hello chunk', 'ALTERNATIVE_STATUS_FINAL');
    const result = fromYandexAlternative(alternative);
    expect(result.text).toBe('Hello chunk');
    expect(result.finishReason).toBe('stop');
  });

  it('should handle TRUNCATED status', () => {
    const alternative = makeYandexAlternative('partial', 'ALTERNATIVE_STATUS_TRUNCATED');
    const result = fromYandexAlternative(alternative);
    expect(result.finishReason).toBe('length');
  });

  it('should handle CONTENT_FILTER status', () => {
    const alternative = makeYandexAlternative('', 'ALTERNATIVE_STATUS_CONTENT_FILTER');
    const result = fromYandexAlternative(alternative);
    expect(result.finishReason).toBe('content_filter');
  });

  it('should handle empty status as undefined finishReason', () => {
    const alternative = makeYandexAlternative('in progress', 'ALTERNATIVE_STATUS_PARTIAL');
    const result = fromYandexAlternative(alternative);
    expect(result.finishReason).toBeUndefined();
  });
});
