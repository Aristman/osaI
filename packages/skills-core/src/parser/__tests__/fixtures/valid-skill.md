---
name: filesystem
version: 1.0.0
description: Filesystem operations skill
category: bundled
permissions:
  read_file: auto
  write_file: confirm
---

## Tool: read_file

Reads the content of a text file from the filesystem.

### Parameters

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Absolute path to the file to read"
    }
  },
  "required": ["path"]
}
```
