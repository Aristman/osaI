/**
 * @osai/agent -- Fact Extractor (T-007)
 *
 * Extracts facts from LLM responses using simple heuristic patterns (MVP).
 *
 * Pipeline:
 *   1. BEFORE_FACT_EXTRACTION hook
 *   2. Extract facts from response text (pattern-based)
 *   3. AFTER_MEMORY_QUERY hook (for memory-related context)
 *   4. Store extracted facts via injectable StoreFactsFunction
 *   5. Return extracted facts
 *
 * Dependencies (HookRegistry, StoreFactsFunction, optional LLMProvider)
 * are injected via constructor (DI).
 */

import crypto from 'node:crypto';
import { HookPoint } from '../hooks/types.js';
import type { HookContext, HookRegistry } from '../hooks/index.js';
import type {
  Fact,
  FactCategory,
  ExtractionResult,
  StoreFactsFunction,
} from './types.js';

// ---------------------------------------------------------------------------
// Extraction Patterns
// ---------------------------------------------------------------------------

/** A pattern for extracting a specific type of fact. */
interface ExtractionPattern {
  /** Regex pattern to match. */
  readonly pattern: RegExp;
  /** Category to assign. */
  readonly category: FactCategory;
  /** Default confidence for this pattern. */
  readonly confidence: number;
}

/** Predefined extraction patterns for heuristic MVP. */
const EXTRACTION_PATTERNS: readonly ExtractionPattern[] = [
  // Dates: ISO format, relative dates, common date formats
  {
    pattern: /\b\d{4}-\d{2}-\d{2}\b/g,
    category: 'date',
    confidence: 0.9,
  },
  {
    pattern: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\b/gi,
    category: 'date',
    confidence: 0.85,
  },
  // Names: capitalized words preceded by common indicators
  {
    pattern: /\b(?:my name is|I am|I'm|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    category: 'name',
    confidence: 0.8,
  },
  // Numbers with units
  {
    pattern: /\b\d+(?:\.\d+)?\s*(?:years? old|kg|km|miles?|dollars?|USD|EUR|RUB|hours?|minutes?|seconds?|percent|%|GB|MB|KB)\b/gi,
    category: 'number',
    confidence: 0.85,
  },
  // Explicit preferences
  {
    pattern: /\b(?:I prefer|I like|I dislike|I hate|I love|I always|I never|my favorite|I usually)\b[^.!?]*[.!?]/gi,
    category: 'preference',
    confidence: 0.9,
  },
  // Explicit facts ("remember that...", "note that...", "important:")
  {
    pattern: /\b(?:remember that|note that|important:|please note|keep in mind)\b[^.!?]*[.!?]/gi,
    category: 'explicit',
    confidence: 0.95,
  },
];

// ---------------------------------------------------------------------------
// FactExtractor
// ---------------------------------------------------------------------------

/**
 * Extracts facts from LLM response text using pattern-based heuristics.
 *
 * This is an MVP implementation. Future versions may use LLM-based
 * extraction for better accuracy and nuance understanding.
 */
export class FactExtractor {
  private readonly _hooks: HookRegistry;
  private readonly _storeFacts: StoreFactsFunction | undefined;

  /**
   * @param hooks      - Hook registry for lifecycle hooks.
   * @param storeFacts - Optional function for storing facts in Memory System.
   *                     When not provided, facts are extracted but not persisted.
   */
  constructor(
    hooks: HookRegistry,
    storeFacts?: StoreFactsFunction,
  ) {
    this._hooks = hooks;
    this._storeFacts = storeFacts;
  }

  // -----------------------------------------------------------------------
  // extract
  // -----------------------------------------------------------------------

  /**
   * Extract facts from an LLM response.
   *
   * Pipeline:
   *   1. Fire BEFORE_FACT_EXTRACTION hook
   *   2. Run pattern-based extraction
   *   3. Fire AFTER_MEMORY_QUERY hook
   *   4. Return ExtractionResult
   *
   * @param response - The LLM response text to extract facts from.
   * @param chatId   - The chat identifier.
   * @param sessionId - The session identifier.
   * @returns ExtractionResult with extracted facts.
   */
  async extract(
    response: string,
    chatId: string,
    sessionId: string,
  ): Promise<Fact[]> {
    // Step 1: BEFORE_FACT_EXTRACTION hook
    const hookContext = await this._executeBeforeHook(
      response,
      chatId,
      sessionId,
    );

    // Step 2: Extract facts using patterns
    const facts = this._extractFactsFromText(
      response,
      chatId,
      sessionId,
    );

    // Step 3: AFTER_MEMORY_QUERY hook (for memory system awareness)
    await this._executeAfterMemoryQueryHook(
      facts,
      chatId,
      sessionId,
      hookContext.traceId,
    );

    return facts;
  }

  // -----------------------------------------------------------------------
  // storeFacts
  // -----------------------------------------------------------------------

  /**
   * Store extracted facts in the Memory System.
   *
   * Delegates to the injectable store function. On error, logs and
   * does not throw (graceful degradation).
   *
   * @param facts - The facts to store.
   */
  async storeFacts(facts: readonly Fact[]): Promise<void> {
    if (this._storeFacts === undefined) {
      return;
    }

    if (facts.length === 0) {
      return;
    }

    try {
      await this._storeFacts(facts);
    } catch (error: unknown) {
      // Graceful degradation: fact storage failure should not break the pipeline
      console.error(
        '[FactExtractor] Failed to store facts:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // -----------------------------------------------------------------------
  // extractAndStore
  // -----------------------------------------------------------------------

  /**
   * Convenience method: extract facts and store them.
   *
   * @param response  - The LLM response text.
   * @param chatId    - The chat identifier.
   * @param sessionId - The session identifier.
   * @returns ExtractionResult with extracted facts.
   */
  async extractAndStore(
    response: string,
    chatId: string,
    sessionId: string,
  ): Promise<ExtractionResult> {
    let hasErrors = false;
    const errors: string[] = [];

    let facts: Fact[];
    try {
      facts = await this.extract(response, chatId, sessionId);
    } catch (error: unknown) {
      hasErrors = true;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      console.error(
        '[FactExtractor] Extraction failed:',
        message,
      );
      facts = [];
    }

    // Store facts (graceful degradation on error)
    try {
      await this.storeFacts(facts);
    } catch (error: unknown) {
      hasErrors = true;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
    }

    return {
      facts,
      count: facts.length,
      hasErrors,
      errors,
    };
  }

  // -----------------------------------------------------------------------
  // Internal: Pattern extraction
  // -----------------------------------------------------------------------

  /**
   * Run all extraction patterns against the response text.
   * Deduplicates facts by content.
   */
  private _extractFactsFromText(
    text: string,
    chatId: string,
    sessionId: string,
  ): Fact[] {
    const factMap = new Map<string, Fact>();

    for (const ep of EXTRACTION_PATTERNS) {
      const matches = text.matchAll(ep.pattern);

      for (const match of matches) {
        const matchedText = match[0]!.trim();

        // Skip very short matches (likely noise)
        if (matchedText.length < 3) {
          continue;
        }

        // Deduplicate by content
        const key = `${ep.category}:${matchedText.toLowerCase()}`;
        if (factMap.has(key)) {
          continue;
        }

        const fact: Fact = {
          id: crypto.randomUUID(),
          content: matchedText,
          category: ep.category,
          chatId,
          sessionId,
          extractedAt: new Date().toISOString(),
          confidence: ep.confidence,
        };

        factMap.set(key, fact);
      }
    }

    return Array.from(factMap.values());
  }

  // -----------------------------------------------------------------------
  // Internal: Hook execution
  // -----------------------------------------------------------------------

  /**
   * Execute BEFORE_FACT_EXTRACTION hook.
   */
  private async _executeBeforeHook(
    response: string,
    chatId: string,
    sessionId: string,
  ): Promise<HookContext> {
    const context: HookContext = {
      hookPoint: HookPoint.BEFORE_FACT_EXTRACTION,
      sessionId,
      chatId,
      traceId: '',
      timestamp: new Date().toISOString(),
      data: {
        response,
        responseLength: response.length,
      },
    };

    return this._hooks.execute(HookPoint.BEFORE_FACT_EXTRACTION, context);
  }

  /**
   * Execute AFTER_MEMORY_QUERY hook.
   */
  private async _executeAfterMemoryQueryHook(
    facts: readonly Fact[],
    chatId: string,
    sessionId: string,
    traceId: string,
  ): Promise<void> {
    const context: HookContext = {
      hookPoint: HookPoint.AFTER_MEMORY_QUERY,
      sessionId,
      chatId,
      traceId,
      timestamp: new Date().toISOString(),
      data: {
        extractedFactCount: facts.length,
        factCategories: facts.map((f) => f.category),
        facts: facts.map((f) => f.content),
      },
    };

    await this._hooks.execute(HookPoint.AFTER_MEMORY_QUERY, context);
  }
}
