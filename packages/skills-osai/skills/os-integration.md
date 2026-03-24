# Skill: OS Integration

## Metadata
- **name:** os-integration
- **version:** 1.0.0
- **category:** system

## Description
Provides OS integration capabilities: desktop notifications, file system watching, process listing, application launching, and system information retrieval.

## Tools

### show_notification
- **category:** system
- **description:** Show a desktop notification with a title and body. Supports urgency levels (low, normal, critical).
- **parameters:**
  - title (string, required): Notification title.
  - body (string, required): Notification body text.
  - urgency (string, enum: low|normal|critical): Notification urgency level.

### watch_directory
- **category:** system
- **description:** Watch a directory for file system events (create, modify, delete). Returns a watcher handle ID.
- **parameters:**
  - path (string, required): Directory path to watch.
  - events (array of string, enum: create|modify|delete): File events to watch for.

### list_processes
- **category:** system
- **description:** List running processes on the system. Optionally filter by process name.
- **parameters:**
  - filter (string): Optional process name filter (substring match).

### open_application
- **category:** system
- **description:** Launch an application by name with optional arguments.
- **parameters:**
  - app_name (string, required): Name of the application to launch.
  - args (array of string): Optional arguments to pass to the application.

### get_system_info
- **category:** system
- **description:** Get system information including CPU, memory, disk, and OS details.
- **parameters:** (none)

## Permissions
All tools in this skill have `system` category and are auto-approved without user confirmation.

## Examples
```
// Show a notification
os.show_notification({ title: "Build Complete", body: "Project compiled successfully.", urgency: "normal" })

// Watch a directory
os.watch_directory({ path: "/home/user/projects", events: ["create", "modify"] })

// List processes
os.list_processes({ filter: "node" })

// Get system info
os.get_system_info({})
```
