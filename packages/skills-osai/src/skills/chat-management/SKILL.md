# Chat Management Skill

osaI skill for managing chat sessions.
Delegates to Gateway Chat API.

## Tools

### chat_list

Lists all chat sessions.

- **Permission:** auto (read)
- **Parameters:** (none)

### chat_create

Creates a new chat session.

- **Permission:** confirm (write)
- **Parameters:**
  - `name` (string, optional): Chat name
  - `description` (string, optional): Chat description

### chat_switch

Switches the active chat session.

- **Permission:** auto (read)
- **Parameters:**
  - `chatId` (string, required): The chat ID to switch to

### chat_archive

Archives a chat session.

- **Permission:** confirm (write)
- **Parameters:**
  - `chatId` (string, required): The chat ID to archive

### chat_delete

Deletes a chat session permanently.

- **Permission:** confirm (write)
- **Parameters:**
  - `chatId` (string, required): The chat ID to delete
