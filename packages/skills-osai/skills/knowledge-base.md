# Skill: Knowledge Base

## Metadata
- **name:** knowledge-base
- **version:** 1.0.0
- **category:** system

## Description
Provides knowledge base capabilities: ingest documents for long-term storage, query stored knowledge, list document sources, and remove sources.

## Tools

### ingest_document
- **category:** write
- **description:** Ingest a document into the knowledge base. The content is chunked and stored for later retrieval. Requires user confirmation.
- **parameters:**
  - content (string, required): The document content to ingest.
  - source (string): Source identifier (e.g., file path, URL, description).
  - title (string): Optional document title.
  - tags (array of string): Optional tags for the document.

### query_knowledge
- **category:** system
- **description:** Query the knowledge base for relevant information using text search.
- **parameters:**
  - query (string, required): Search query for the knowledge base.
  - top_k (number): Maximum number of results. Default: 5.
  - category (string): Optional category filter for knowledge entries.
  - tags (array of string): Optional tag filter.

### list_sources
- **category:** system
- **description:** List all unique sources in the knowledge base.
- **parameters:**
  - category (string): Optional category filter.
  - tag (string): Optional tag filter.

### remove_source
- **category:** write
- **description:** Remove a document (fact) from the knowledge base by its ID. Requires user confirmation.
- **parameters:**
  - document_id (string, required): The document/fact ID to remove.

## Permissions
- query_knowledge, list_sources: `system` category, auto-approved.
- ingest_document, remove_source: `write` category, requires user confirmation.

## Examples
```
// Ingest a document
kb.ingest_document({ content: "Architecture specification...", source: "/docs/arch.md", tags: ["spec"] })

// Query knowledge base
kb.query_knowledge({ query: "authentication flow", top_k: 5 })

// List sources
kb.list_sources({ tag: "spec" })

// Remove a source
kb.remove_source({ document_id: "fact_12345_abc" })
```
