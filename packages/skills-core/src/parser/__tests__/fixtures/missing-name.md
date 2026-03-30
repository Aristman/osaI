---
version: 1.0.0
description: A skill without a name
category: bundled
permissions:
  some_tool: auto
---

## Tool: some_tool

A tool in a skill without a name.

### Parameters

```json
{
  "type": "object",
  "properties": {
    "input": {
      "type": "string",
      "description": "Input value"
    }
  },
  "required": ["input"]
}
```
