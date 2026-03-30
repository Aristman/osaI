/**
 * @osai/knowledge-base -- KnowledgeDocument types
 *
 * Type definitions for knowledge base documents.
 */

/** Supported document formats (MVP) */
export const DocumentFormat = {
  Txt: 'txt',
  Md: 'md',
  Pdf: 'pdf',
} as const;

export type DocumentFormat = (typeof DocumentFormat)[keyof typeof DocumentFormat];

/** Document processing status */
export const DocumentStatus = {
  Pending: 'pending',
  Processing: 'processing',
  Completed: 'completed',
  Error: 'error',
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/** KnowledgeDocument as stored/retrieved from database */
export interface KnowledgeDocument {
  id: string;
  title: string;
  path: string;
  format: DocumentFormat;
  status: DocumentStatus;
  chunksCount: number;
  totalSize: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  checksum?: string;
}

/** Options for inserting a knowledge document */
export interface InsertKnowledgeDocument {
  id: string;
  title: string;
  path: string;
  format: DocumentFormat;
  status?: DocumentStatus;
  chunksCount?: number;
  totalSize?: number;
  tags?: string[];
  checksum?: string;
}

/** Fields that can be updated on a knowledge document */
export type UpdateKnowledgeDocument = Partial<{
  title: string;
  status: DocumentStatus;
  chunksCount: number;
  totalSize: number;
  tags: string[];
  checksum: string;
}>;

/** Filter options for listing documents */
export interface ListDocumentsFilter {
  format?: DocumentFormat;
  status?: DocumentStatus;
  tag?: string;
}
