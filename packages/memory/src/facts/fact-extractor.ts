/**
 * @osai/memory -- FactExtractor (T-008)
 *
 * Extracts structured facts from LLM responses using an LLM provider.
 * Returns MemoryEntry[] with category=Fact for each extracted fact.
 *
 * Graceful degradation: when the LLM call fails, returns an empty array
 * instead of throwing, ensuring the memory system never blocks the agent.
 */

import type { LLMProvider, LLMRequest } from '@osai/providers';
import type { MemoryEntry } from '../types/memory.js';
import { MemoryCategory, MemoryTier } from '../types/memory.js';
import { LoggerFactory } from '@osai/observability';
import type { Logger as PinoLogger } from 'pino';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single fact extracted by the LLM. */
interface ExtractedFact {
  /** The fact content text. */
  content: string;
  /** Optional tags for the fact. */
  tags?: string[];
  /** Optional category override (defaults to 'fact'). */
  category?: string;
}

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

/**
 * System prompt for fact extraction.
 *
 * Instructs the LLM to return a JSON array of facts from the given text.
 */
const FACT_EXTRACTION_SYSTEM_PROMPT = `You are a fact extraction assistant. Your task is to extract factual information from the given text.

For each fact you identify, provide:
- "content": the fact as a concise statement
- "tags": an array of relevant keywords (1-5 tags per fact)
- "category": one of "fact", "preference", "event", "skill", "context", "general"

Rules:
1. Extract only objectively verifiable facts or clearly stated preferences
2. Do not include opinions, questions, or speculative statements
3. Keep fact content concise (1-2 sentences)
4. Only extract meaningful, non-trivial facts
5. If no meaningful facts are found, return an empty array

Respond ONLY with a JSON array of objects. No explanation, no markdown, just JSON.`;

/**
 * User prompt template for fact extraction.
 */
function buildUserPrompt(response: string): string {
  return `Extract facts from the following text:\n\n---\n${response}\n---`;
}

// ---------------------------------------------------------------------------
// FactExtractor
// ---------------------------------------------------------------------------

/**
 * FactExtractor extracts structured facts from LLM responses.
 *
 * Uses an injected LLMProvider to analyze response text and return
 * MemoryEntry objects with category=Fact.
 *
 * On LLM failure, returns an empty array (graceful degradation).
 */
export class FactExtractor {
  private readonly llm: LLMProvider;
  private readonly logger: PinoLogger;

  /**
   * @param llm  LLM provider for fact extraction (injectable).
   */
  constructor(llm: LLMProvider) {
    this.llm = llm;
    this.logger = LoggerFactory.create('memory', 'fact-extractor');
  }

  /**
   * Extract facts from an LLM response text.
   *
   * Sends the response text to the LLM with a fact extraction prompt,
   * parses the returned JSON array of facts, and converts each fact
   * into a MemoryEntry with tier=long-term.
   *
   * @param response  The LLM response text to extract facts from.
   * @param chatId    Optional chat ID to associate with extracted facts.
   * @returns Array of MemoryEntry objects. Empty on LLM error or no facts.
   */
  async extract(response: string, chatId?: string): Promise<MemoryEntry[]> {
    this.logger.info(
      { action: 'extract_facts', chatId, responseLength: response.length },
      'Starting fact extraction',
    );

    try {
      const facts = await this.callLLM(response);

      if (facts.length === 0) {
        this.logger.debug(
          { action: 'extract_facts_empty', chatId },
          'No facts extracted from response',
        );
        return [];
      }

      const entries = facts.map((fact) => this.factToEntry(fact, chatId));

      this.logger.info(
        {
          action: 'extract_facts_complete',
          chatId,
          factCount: entries.length,
          trace_id: undefined,
        },
        'Fact extraction completed',
      );

      return entries;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { action: 'extract_facts_error', chatId, err: message },
        'Fact extraction failed, returning empty array (graceful degradation)',
      );
      return [];
    }
  }

  /**
   * Call the LLM provider to extract facts.
   *
   * @throws {Error} When LLM call fails.
   */
  private async callLLM(response: string): Promise<ExtractedFact[]> {
    const request: LLMRequest = {
      model: 'fact-extraction',
      messages: [
        { role: 'system', content: FACT_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(response) },
      ],
      temperature: 0,
      maxTokens: 2048,
    };

    const llmResponse = await this.llm.complete(request);

    return this.parseFacts(llmResponse.content);
  }

  /**
   * Parse the LLM response content into ExtractedFact[].
   *
   * Handles common edge cases:
   * - Empty response
   * - Response wrapped in markdown code blocks
   * - Invalid JSON
   *
   * @throws {Error} When parsing fails.
   */
  private parseFacts(content: string): ExtractedFact[] {
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      return [];
    }

    // Strip markdown code blocks if present
    let jsonStr = trimmed;
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    if (jsonStr.length === 0) {
      return [];
    }

    const parsed = JSON.parse(jsonStr) as unknown;

    if (!Array.isArray(parsed)) {
      // Single object: wrap in array
      if (parsed !== null && typeof parsed === 'object') {
        return [this.validateFact(parsed)];
      }
      throw new Error(`Expected JSON array, got ${typeof parsed}`);
    }

    return parsed.map((item) => this.validateFact(item));
  }

  /**
   * Validate and normalize a parsed fact object.
   */
  private validateFact(raw: unknown): ExtractedFact {
    if (raw === null || typeof raw !== 'object') {
      throw new Error('Fact must be an object');
    }

    const obj = raw as Record<string, unknown>;

    if (typeof obj.content !== 'string' || obj.content.trim().length === 0) {
      throw new Error('Fact must have a non-empty "content" string field');
    }

    return {
      content: obj.content.trim(),
      tags: Array.isArray(obj.tags)
        ? (obj.tags as unknown[]).map((t) => String(t))
        : [],
      category: typeof obj.category === 'string' ? obj.category : 'fact',
    };
  }

  /**
   * Convert an ExtractedFact into a MemoryEntry.
   */
  private factToEntry(fact: ExtractedFact, chatId?: string): MemoryEntry {
    const now = new Date().toISOString();
    const id = `fact_${crypto.randomUUID()}`;

    const category = this.mapCategory(fact.category);

    return {
      id,
      content: fact.content,
      category,
      tier: MemoryTier.LongTerm,
      chatId,
      tags: fact.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Map a string category to MemoryCategory enum.
   */
  private mapCategory(category?: string): MemoryCategory {
    switch (category) {
      case 'fact':
        return MemoryCategory.Fact;
      case 'preference':
        return MemoryCategory.Preference;
      case 'context':
        return MemoryCategory.Context;
      case 'skill':
        return MemoryCategory.Skill;
      case 'event':
        return MemoryCategory.Event;
      default:
        return MemoryCategory.Fact;
    }
  }
}
