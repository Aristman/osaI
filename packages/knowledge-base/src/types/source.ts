/**
 * Source types for Knowledge Base (DOMAIN-005)
 */

/** A tag for categorizing and filtering sources */
export interface SourceTag {
  /** Tag name */
  readonly name: string;
  /** Tag color for UI display */
  readonly color?: string;
}

/** Information about a document source */
export interface SourceInfo {
  /** Document identifier */
  readonly documentId: string;
  /** Document title */
  readonly title: string;
  /** Filesystem path */
  readonly path: string;
  /** Document format */
  readonly format: string;
  /** Processing status */
  readonly status: string;
  /** Number of chunks */
  readonly chunksCount: number;
  /** File size in bytes */
  readonly totalSize: number;
  /** Assigned tags */
  readonly tags: readonly SourceTag[];
  /** Timestamp of creation (ISO 8601) */
  readonly createdAt: string;
  /** Timestamp of last update (ISO 8601) */
  readonly updatedAt: string;
}
