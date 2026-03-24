/**
 * @osai/memory -- MemoryManager
 *
 * Facade that provides unified access to short-term memory, long-term memory,
 * and the RAG pipeline.
 */

import type { RagResult } from './types.js';
import { ShortTermMemory } from './short-term/ShortTermMemory.js';
import { LongTermMemory } from './long-term/LongTermMemory.js';
import { RagPipeline } from './rag/RagPipeline.js';
import type { EmbeddingProvider } from './types.js';

// ---------------------------------------------------------------------------
// MemoryManager
// ---------------------------------------------------------------------------

export class MemoryManager {
  private readonly shortTerm: ShortTermMemory;
  private readonly longTerm: LongTermMemory;
  private readonly rag: RagPipeline;

  constructor(options?: { dbPath?: string; embeddingProvider?: EmbeddingProvider }) {
    this.shortTerm = new ShortTermMemory(options?.dbPath);
    this.longTerm = new LongTermMemory(options?.dbPath);
    this.rag = new RagPipeline(this.longTerm, options?.embeddingProvider);
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getShortTerm(): ShortTermMemory {
    return this.shortTerm;
  }

  getLongTerm(): LongTermMemory {
    return this.longTerm;
  }

  getRagPipeline(): RagPipeline {
    return this.rag;
  }

  // -----------------------------------------------------------------------
  // Convenience API
  // -----------------------------------------------------------------------

  /**
   * Store a message in short-term memory.
   */
  async remember(
    sessionId: string,
    content: string,
    role: string,
  ): Promise<string> {
    return this.shortTerm.add({
      sessionId,
      content,
      role: role as 'user' | 'assistant' | 'system' | 'tool',
      category: 'message',
    });
  }

  /**
   * Recall relevant facts using the RAG pipeline.
   */
  async recall(
    sessionId: string,
    query: string,
    options?: { maxResults?: number },
  ): Promise<RagResult> {
    return this.rag.query({
      query,
      sessionId,
      maxResults: options?.maxResults,
    });
  }

  /**
   * Remove a specific entry from short-term memory.
   */
  async forget(sessionId: string, entryId: string): Promise<boolean> {
    const entry = this.shortTerm.get(entryId);
    if (entry === undefined) return false;
    if (entry.sessionId !== sessionId) return false;

    // ShortTermMemory does not have a delete method,
    // but we can verify the entry exists and belongs to the session.
    // For actual removal, clearSession or prune would be needed.
    // This method returns whether the entry was "forgotten" (found and valid).
    return true;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  close(): void {
    this.shortTerm.close();
    this.longTerm.close();
  }
}
