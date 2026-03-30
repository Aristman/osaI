# Memory Skill

osAI skill providing access to the three-tier memory system.

## Tools

### remember

Stores a fact or piece of information in long-term memory.

- **Permission:** confirm (write)
- **Parameters:**
  - `content` (string, required): The content to remember
  - `tags` (string[], optional): Tags for categorization

### recall

Searches memory for facts matching a natural-language query.

- **Permission:** confirm (write)
- **Parameters:**
  - `query` (string, required): Natural-language search query
  - `topK` (number, optional): Maximum number of results (default: 5)

### forget

Deletes a specific memory entry by its ID.

- **Permission:** confirm (write)
- **Parameters:**
  - `memoryId` (string, required): The unique identifier of the memory to delete

### summarize_session

Creates a summary of the current session's context.

- **Permission:** confirm (write)
- **Parameters:**
  - `sessionId` (string, required): The session identifier to summarize
