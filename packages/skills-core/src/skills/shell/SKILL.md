---
name: shell
version: 0.0.1
description: Execute shell commands and sandboxed operations. Provides direct command execution with timeout support and Docker sandbox (placeholder).
category: bundled
permissions:
  exec: confirm
  exec_sandbox: confirm
tools:
  - name: exec
    description: Execute a shell command directly on the host system. Returns stdout, stderr, and exit code. Supports configurable timeout (default 30000ms). Commands are executed via the system shell (cmd.exe on Windows, /bin/sh on Linux/macOS).
    parameters:
      type: object
      properties:
        command:
          type: string
          description: The shell command to execute.
        timeout:
          type: number
          description: Maximum execution time in milliseconds (default: 30000).
      required:
        - command
  - name: exec_sandbox
    description: Execute a command in an isolated Docker container. This tool provides sandboxing for untrusted commands. (Not yet implemented -- placeholder for F-012.)
    parameters:
      type: object
      properties:
        command:
          type: string
          description: The shell command to execute inside the Docker container.
        image:
          type: string
          description: Docker image to use for the sandbox container (default: ubuntu:latest).
      required:
        - command
---
