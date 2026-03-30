---
name: shell
version: 1.0.0
description: Shell command execution skill
category: bundled
permissions:
  exec: confirm
  exec_sandbox: confirm
---

## Tool: exec

Execute a shell command directly.

### Parameters

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "Shell command to execute"
    },
    "timeout": {
      "type": "number",
      "description": "Timeout in milliseconds"
    }
  },
  "required": ["command"]
}
```

## Tool: exec_sandbox

Execute a shell command in a sandboxed environment.

### Parameters

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "Shell command to execute in sandbox"
    },
    "image": {
      "type": "string",
      "description": "Docker image to use"
    }
  },
  "required": ["command"]
}
```
