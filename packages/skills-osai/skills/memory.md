# Skill: Memory

## Metadata
- **name:** memory
- **version:** 1.0.0
- **category:** system

## Description
Provides memory management capabilities: store facts and preferences, recall relevant memories, forget specific entries, and summarize session context.

## Tools

### remember
- **category:** system
- **description:** Store a fact, preference, or information in long-term memory. Optionally categorize and tag it.
- **parameters:**
  - content (string, required): The content to remember.
  - category (string, enum: fact|preference|knowledge|error|pattern): Category for the memory entry.
  - tags (array of string): Optional tags for categorization.

### recall
- **category:** system
- **description:** Recall relevant memories matching a query. Uses RAG pipeline for semantic search.
- **parameters:**
  - query (string, required): Search query for relevant memories.
  - top_k (number): Maximum number of results. Default: 5.
  - category (string, enum: fact|preference|knowledge|error|pattern): Optional category filter.

### forget
- **category:** write
- **description:** Remove a specific memory entry by its ID. This action requires user confirmation.
- **parameters:**
  - memory_id (string, required): The ID of the memory entry to remove.

### summarize_session
- **category:** system
- **description:** Generate a summary of the current session context from short-term memory.
- **parameters:**
  - session_id (string): The session ID to summarize. Uses current session if not provided.

## Permissions
- remember, recall, summarize_session: `system` category, auto-approved.
- forget: `write` category, requires user confirmation.

## Examples
```
// Remember a preference
memory.remember({ content: "User prefers dark theme", category: "preference", tags: ["ui"] })

// Recall memories
memory.recall({ query: "theme preferences", top_k: 5 })

// Forget a memory
memory.forget({ memory_id: "fact_12345_abc" })

// Summarize session
memory.summarize_session({ session_id: "session_123" })
```
