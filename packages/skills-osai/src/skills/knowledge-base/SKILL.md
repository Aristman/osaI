# Knowledge Base Skill

osaI skill providing access to the Knowledge Base system.
Delegates to packages/knowledge-base (SourceManager, KBSearch).

## Tools

### ingest_document

Ingests a document into the Knowledge Base.
Parses, chunks, embeds, and stores the document for semantic search.

- **Permission:** confirm (write)
- **Parameters:**
  - `path` (string, required): File path to the document
  - `format` (string, optional): Document format (auto-detected if not provided)
  - `tags` (string[], optional): Tags for categorization

### query_knowledge

Performs a semantic search in the Knowledge Base.
Returns the most relevant document chunks.

- **Permission:** auto (read)
- **Parameters:**
  - `query` (string, required): Natural-language search query
  - `topK` (number, optional): Maximum number of results (default: 5)
  - `minSimilarity` (number, optional): Minimum cosine similarity threshold (default: 0.7)

### list_sources

Lists document sources in the Knowledge Base.
Optionally filters by tags.

- **Permission:** auto (read)
- **Parameters:**
  - `tag` (string, optional): Filter by tag (returns sources containing this tag)

### remove_source

Removes a document source and all associated data from the Knowledge Base.
Cascading deletion: document + chunks + vectors.

- **Permission:** confirm (write)
- **Parameters:**
  - `documentId` (string, required): The document ID to remove
