# OS Integration Skill

osaI skill providing access to OS-level features.
Delegates to packages/os-integration (OsIntegration facade).

## Tools

### show_notification

Sends a desktop notification to the user.

- **Permission:** confirm (write)
- **Parameters:**
  - `title` (string, required): Notification title
  - `message` (string, optional): Notification body message

### list_processes

Lists running processes on the system.
Optionally filters by name or resource usage.

- **Permission:** auto (read)
- **Parameters:**
  - `filter` (string, optional): Filter by process name (substring match)

### get_system_info

Retrieves full system information (CPU, memory, disk).

- **Permission:** auto (read)
- **Parameters:** (none)
