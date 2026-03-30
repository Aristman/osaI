/**
 * @osai/agent -- Memory Types (T-007)
 *
 * Types for Fact Extraction in the Agent Runtime.
 * Fact, ExtractionResult, StoreFunction.
 */

// ---------------------------------------------------------------------------
// Fact
// ---------------------------------------------------------------------------

/**
 * A single extracted fact from an LLM response.
 *
 * Facts are short declarative statements that capture key information
 * from agent responses: names, dates, numbers, explicit preferences.
 */
export interface Fact {
  /** Unique identifier for this fact. */
  readonly id: string;
  /** The extracted fact text (e.g. "User prefers dark theme"). */
  readonly content: string;
  /** Category of the fact (name, date, number, preference, explicit). */
  readonly category: FactCategory;
  /** Source chat identifier. */
  readonly chatId: string;
  /** Source session identifier. */
  readonly sessionId: string;
  /** ISO-8601 timestamp when the fact was extracted. */
  readonly extractedAt: string;
  /** Confidence score (0-1). Higher means more confident. */
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// FactCategory
// ---------------------------------------------------------------------------

/**
 * Categories of facts that can be extracted.
 */
export type FactCategory =
  | 'name'
  | 'date'
  | 'number'
  | 'preference'
  | 'explicit'
  | 'unknown';

// ---------------------------------------------------------------------------
// ExtractionResult
// ---------------------------------------------------------------------------

/**
 * Result of a fact extraction pass.
 */
export interface ExtractionResult {
  /** Extracted facts. */
  readonly facts: readonly Fact[];
  /** Number of facts extracted. */
  readonly count: number;
  /** Whether extraction encountered any errors. */
  readonly hasErrors: boolean;
  /** Error messages (if any). */
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// StoreFunction
// ---------------------------------------------------------------------------

/**
 * Injectable function for storing facts in the Memory System.
 * Used for dependency inversion -- FactExtractor does not depend
 * directly on the Memory System implementation.
 */
export type StoreFactsFunction = (
  facts: readonly Fact[],
) => Promise<void>;
