/**
 * @osai/knowledge-base -- KnowledgeChunk types
 *
 * Type definitions for knowledge base chunks.
 */

/** Metadata associated with a knowledge chunk */
export interface ChunkMetadata {
  /** Index of this chunk within the parent document (0-based) */
  chunkIndex: number;
  /** Number of tokens in the chunk */
  tokenCount: number;
  /** Character offset in the original document where this chunk starts */
  charOffset: number;
  /** Character length of the chunk content */
  charLength: number;
}

/** KnowledgeChunk as stored/retrieved from database */
export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  createdAt: number;
}

/** Options for inserting a knowledge chunk */
export interface InsertKnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
}
