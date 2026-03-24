/**
 * @osai/memory -- RagPipeline
 *
 * Retrieval-Augmented Generation pipeline that queries long-term memory
 * for relevant facts and formats them as context for LLM prompts.
 */

import type { Fact, RagQuery, RagResult, EmbeddingProvider } from '../types.js';
import { LongTermMemory } from '../long-term/LongTermMemory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Rough token estimation: ~4 characters per token for English text.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// RagPipeline
// ---------------------------------------------------------------------------

export class RagPipeline {
  constructor(
    private longTermMemory: LongTermMemory,
    private embeddingProvider?: EmbeddingProvider,
  ) {
    // embeddingProvider is stored for future semantic search integration
    void this.embeddingProvider;
  }

  /**
   * Query long-term memory for facts relevant to the given query.
   */
  async query(ragQuery: RagQuery): Promise<RagResult> {
    const maxResults = ragQuery.maxResults ?? 10;
    const minConfidence = ragQuery.minConfidence ?? 0;

    // Use text-based search from long-term memory
    let facts = this.longTermMemory.search(ragQuery.query, {
      limit: maxResults * 2, // fetch more to allow filtering
    });

    // Filter by minimum confidence
    if (minConfidence > 0) {
      facts = facts.filter((f) => f.confidence >= minConfidence);
    }

    // If sessionId is specified, prioritize facts from that session
    if (ragQuery.sessionId !== undefined) {
      const sessionFacts = facts.filter((f) => f.sessionId === ragQuery.sessionId);
      const otherFacts = facts.filter((f) => f.sessionId !== ragQuery.sessionId);
      facts = [...sessionFacts, ...otherFacts];
    }

    // Limit results
    facts = facts.slice(0, maxResults);

    const context = this.formatContext(facts, ragQuery.query);
    const queryTokens = estimateTokens(ragQuery.query);

    return {
      facts,
      context,
      totalFacts: facts.length,
      queryTokens,
    };
  }

  /**
   * Format retrieved facts into a structured context string for LLM prompts.
   */
  formatContext(facts: Fact[], _query: string): string {
    if (facts.length === 0) {
      return 'No relevant context found.';
    }

    const sections: string[] = [
      '## Retrieved Context',
      '',
    ];

    // Group by category
    const byCategory = new Map<string, Fact[]>();
    for (const fact of facts) {
      const list = byCategory.get(fact.category) ?? [];
      list.push(fact);
      byCategory.set(fact.category, list);
    }

    for (const [category, categoryFacts] of byCategory) {
      sections.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}s`);
      sections.push('');

      for (let i = 0; i < categoryFacts.length; i++) {
        const fact = categoryFacts[i]!;
        const tagsStr = fact.tags?.length
          ? ` [${fact.tags.join(', ')}]`
          : '';
        sections.push(`${i + 1}. ${fact.content}${tagsStr}`);
        sections.push(`   Confidence: ${(fact.confidence * 100).toFixed(0)}% | Source: ${fact.source}`);
      }

      sections.push('');
    }

    sections.push('---');

    return sections.join('\n');
  }

  /**
   * Extract facts from an agent response (stub).
   * In future versions this will use LLM-based extraction.
   */
  async extractFacts(
    response: string,
    sessionId: string,
  ): Promise<string[]> {
    // Stub: extract basic facts from the response
    // In production, this would use an LLM to extract structured facts
    const facts: string[] = [];

    // Simple heuristic: extract sentences that look like facts
    const sentences = response
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.length < 500);

    for (const sentence of sentences.slice(0, 3)) {
      const id = this.longTermMemory.addFact({
        content: sentence,
        category: 'fact',
        source: 'agent_response',
        confidence: 0.3, // low confidence for auto-extracted facts
        sessionId,
      });
      facts.push(id);
    }

    return facts;
  }
}
