/**
 * @osai/providers -- Yandex Message Converter (DOMAIN-008)
 *
 * Bidirectional conversion between osaI ChatMessage / LLMRequest format
 * and Yandex Foundation Models API format.
 *
 * Key differences:
 * - Yandex uses `text` field instead of `content` for messages
 * - Yandex messages use `role` values: 'system', 'user', 'assistant'
 * - Yandex does not support tool_calls in the same way as OpenAI
 * - Yandex response has `alternatives` array with status codes
 * - Usage values are strings, not numbers
 * - catalogueId is required in the modelUri
 */

import type {
  ChatMessage,
  LLMRequest,
  LLMResponse,
  TokenUsage,
} from '../types.js';

// ---------------------------------------------------------------------------
// Yandex API Types
// ---------------------------------------------------------------------------

/** A single message in Yandex API format. */
export interface YandexMessage {
  role: 'system' | 'user' | 'assistant';
  text: string;
}

/** Completion options for Yandex API. */
export interface YandexCompletionOptions {
  stream: boolean;
  temperature?: number;
  maxTokens?: string;
}

/** A single alternative in Yandex response. */
export interface YandexAlternative {
  message: {
    role: 'assistant';
    text: string;
  };
  status: string;
}

/** Token usage in Yandex response (values are strings). */
export interface YandexUsage {
  inputTextTokens?: string;
  completionTextTokens?: string;
  totalTokens?: string;
}

/** The result object in Yandex response. */
export interface YandexResult {
  alternatives: YandexAlternative[];
  usage?: YandexUsage;
  modelVersion?: string;
}

/** Complete Yandex API response for non-streaming. */
export interface YandexResponse {
  result: YandexResult;
}

/** Parsed result from a single Yandex alternative. */
export interface ParsedAlternative {
  text: string;
  finishReason: string | undefined;
}

// ---------------------------------------------------------------------------
// Outbound: osaI -> Yandex
// ---------------------------------------------------------------------------

/**
 * Convert osaI ChatMessage[] to Yandex Message[] format.
 *
 * Tool messages are excluded because Yandex Foundation Models API
 * does not support the tool role. System messages are included
 * (unlike Anthropic where they are extracted separately).
 */
export function toYandexMessages(
  messages: readonly ChatMessage[],
): YandexMessage[] {
  const result: YandexMessage[] = [];

  for (const msg of messages) {
    // Skip tool messages -- Yandex API does not support tool role
    if (msg.role === 'tool') continue;

    result.push({
      role: msg.role as 'system' | 'user' | 'assistant',
      text: msg.content,
    });
  }

  return result;
}

/**
 * Build Yandex completion options from an LLMRequest.
 *
 * Yandex expects `maxTokens` as a string and `stream` as a boolean.
 * Default temperature: 0.6 (Yandex recommended), default maxTokens: 768.
 */
export function toYandexCompletionOptions(
  request: LLMRequest,
  stream: boolean = false,
): YandexCompletionOptions {
  return {
    stream,
    temperature: request.temperature ?? 0.6,
    maxTokens: String(request.maxTokens ?? 768),
  };
}

// ---------------------------------------------------------------------------
// Inbound: Yandex -> osaI
// ---------------------------------------------------------------------------

/**
 * Parse a Yandex alternative status into a finish reason.
 *
 * Yandex status codes:
 * - ALTERNATIVE_STATUS_FINAL -> 'stop'
 * - ALTERNATIVE_STATUS_TRUNCATED -> 'length'
 * - ALTERNATIVE_STATUS_CONTENT_FILTER -> 'content_filter'
 * - ALTERNATIVE_STATUS_PARTIAL -> undefined (streaming in progress)
 */
export function mapFinishReason(status: string): string | undefined {
  if (status === 'ALTERNATIVE_STATUS_FINAL') return 'stop';
  if (status === 'ALTERNATIVE_STATUS_TRUNCATED') return 'length';
  if (status === 'ALTERNATIVE_STATUS_CONTENT_FILTER') return 'content_filter';
  // ALTERNATIVE_STATUS_PARTIAL or unknown -> no finish reason yet
  return undefined;
}

/**
 * Parse token usage from Yandex response.
 *
 * Yandex returns usage values as strings; this converts them to numbers.
 */
export function parseYandexUsage(usage?: YandexUsage): TokenUsage {
  if (!usage) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const promptTokens = parseInt(usage.inputTextTokens ?? '0', 10) || 0;
  const completionTokens = parseInt(usage.completionTextTokens ?? '0', 10) || 0;
  const totalTokens = parseInt(usage.totalTokens ?? '0', 10) || 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens: totalTokens || promptTokens + completionTokens,
  };
}

/**
 * Extract text and finish reason from a single Yandex alternative.
 */
export function fromYandexAlternative(alternative: YandexAlternative): ParsedAlternative {
  return {
    text: alternative.message?.text ?? '',
    finishReason: mapFinishReason(alternative.status),
  };
}

/**
 * Convert a complete Yandex API response to osaI LLMResponse.
 *
 * Picks the first alternative from the response and maps
 * usage, content, and finish reason to the unified format.
 */
export function fromYandexResponse(
  response: YandexResponse,
  request: LLMRequest,
): LLMResponse {
  const result = response.result;
  const firstAlternative = result.alternatives[0];

  const content = firstAlternative?.message?.text ?? '';
  const finishReason = firstAlternative
    ? mapFinishReason(firstAlternative.status)
    : undefined;

  const usage = parseYandexUsage(result.usage);

  return {
    content,
    usage,
    model: request.model,
    provider: 'yandex',
    finishReason,
  };
}
