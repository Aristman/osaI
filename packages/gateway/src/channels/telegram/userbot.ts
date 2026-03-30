// ---------------------------------------------------------------------------
// UserbotBridge (T-003)
//
// Node.js side of the Telethon userbot bridge.
// Manages a Python child process via JSON-over-stdio protocol.
//
// Protocol: line-delimited JSON over stdin/stdout.
//   - Node.js -> Python: BridgeRequest (type, id, params)
//   - Python -> Node.js: BridgeResponse (type, id, data)
//
// Lifecycle: start -> running -> stop (with auto-restart on crash).
// ---------------------------------------------------------------------------

import { spawn, type ChildProcess } from "node:child_process";
import pino from "pino";
import type {
  BridgeRequest,
  BridgeResponse,
  BridgeRequestType,
  TelegramUserbotConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the UserbotBridge. */
export interface UserbotBridgeConfig
  extends Pick<TelegramUserbotConfig, "apiId" | "apiHash" | "phone"> {
  /** Path to the Python interpreter (e.g. "python3", "/usr/bin/python3.11"). */
  readonly pythonPath: string;
  /** Path to the Telethon userbot Python script. */
  readonly scriptPath: string;
  /** Timeout in ms for health check responses. Default: 5000. */
  readonly healthCheckTimeoutMs?: number;
  /** Maximum number of auto-restart attempts. Default: 3. */
  readonly maxRestartAttempts?: number;
  /** Custom pino logger. If omitted, a default child logger is created. */
  readonly logger?: pino.Logger;
  /** Callback invoked for unsolicited messages from Python (type: "message"). */
  readonly onMessage?: (message: BridgeResponse) => void;
}

/** Pending request entry stored while waiting for Python response. */
interface PendingRequest {
  /** Resolve function for the associated Promise. */
  resolve: (data: unknown) => void;
  /** Reject function for the associated Promise. */
  reject: (error: Error) => void;
  /** Timer ID for request timeout. */
  timeoutTimer: ReturnType<typeof setTimeout> | undefined;
}

// ---------------------------------------------------------------------------
// UserbotBridgeError
// ---------------------------------------------------------------------------

/**
 * Error thrown by UserbotBridge for lifecycle and protocol issues.
 */
export class UserbotBridgeError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "UserbotBridgeError";
  }
}

// ---------------------------------------------------------------------------
// UserbotBridge
// ---------------------------------------------------------------------------

/**
 * Node.js parent process manager for the Telethon Python microservice.
 *
 * Responsibilities:
 * - Spawn and manage Python child process lifecycle
 * - JSON-over-stdio protocol: line-delimited JSON, request/response correlation by id
 * - Methods: start, stop, sendMessage, getChats, healthCheck
 * - Auto-restart on Python process crash (with configurable limit)
 * - Health check with timeout
 * - Graceful handling of invalid JSON from Python (log, no crash)
 *
 * Protocol:
 *   Node.js -> Python (stdin):  {"type":"send_message","id":"abc","params":{...}}\n
 *   Python -> Node.js (stdout): {"type":"send_result","id":"abc","data":{...}}\n
 */
export class UserbotBridge {
  private readonly logger: pino.Logger;
  private readonly config: Required<
    Omit<UserbotBridgeConfig, "logger" | "onMessage">
  > & { logger: pino.Logger; onMessage: ((message: BridgeResponse) => void) | undefined };

  private process: ChildProcess | null = null;
  private running = false;
  private restartCount = 0;

  /** Map of pending request id -> resolve/reject handlers. */
  private readonly pendingRequests = new Map<string, PendingRequest>();

  /** Buffer for partial line reads from Python stdout. */
  private stdoutBuffer = "";

  /** Auto-incrementing request ID counter. */
  private requestIdCounter = 0;

  constructor(bridgeConfig: UserbotBridgeConfig) {
    this.config = {
      pythonPath: bridgeConfig.pythonPath,
      scriptPath: bridgeConfig.scriptPath,
      apiId: bridgeConfig.apiId,
      apiHash: bridgeConfig.apiHash,
      phone: bridgeConfig.phone,
      healthCheckTimeoutMs: bridgeConfig.healthCheckTimeoutMs ?? 5000,
      maxRestartAttempts: bridgeConfig.maxRestartAttempts ?? 3,
      logger:
        bridgeConfig.logger ??
        pino({ name: "userbot-bridge" }).child({ component: "userbot-bridge" }),
      onMessage: bridgeConfig.onMessage,
    };

    this.logger = this.config.logger;

    this.logger.info(
      {
        pythonPath: this.config.pythonPath,
        scriptPath: this.config.scriptPath,
        maxRestartAttempts: this.config.maxRestartAttempts,
        healthCheckTimeoutMs: this.config.healthCheckTimeoutMs,
      },
      "UserbotBridge created",
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle: start
  // -----------------------------------------------------------------------

  /**
   * Start the Python Telethon child process.
   *
   * Spawns the process, attaches stdio handlers, and sets up
   * crash detection for auto-restart.
   *
   * @throws {UserbotBridgeError} if already running
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new UserbotBridgeError("UserbotBridge is already running");
    }

    this.logger.info("Starting Telethon userbot process");

    this.spawnProcess();

    // Wait a tick for the process to be set up
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    this.running = true;
    this.logger.info({ pid: this.process?.pid }, "Telethon userbot process started");
  }

  // -----------------------------------------------------------------------
  // Lifecycle: stop
  // -----------------------------------------------------------------------

  /**
   * Stop the Python Telethon child process.
   *
   * Kills the process, rejects all pending requests, and cleans up
   * stdio handlers.
   *
   * @throws {UserbotBridgeError} if not running
   */
  async stop(): Promise<void> {
    if (!this.running) {
      throw new UserbotBridgeError("UserbotBridge is not running");
    }

    this.logger.info("Stopping Telethon userbot process");

    this.running = false;

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      if (pending.timeoutTimer !== undefined) {
        clearTimeout(pending.timeoutTimer);
      }
      pending.reject(new UserbotBridgeError("Bridge stopped while request was pending"));
    }
    this.pendingRequests.clear();

    // Kill the Python process
    if (this.process) {
      try {
        this.process.kill("SIGTERM");
      } catch {
        // Process may already be dead
      }
      this.process = null;
    }

    this.stdoutBuffer = "";

    this.logger.info("Telethon userbot process stopped");
  }

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  /**
   * Send a message to a Telegram chat via the userbot.
   *
   * @param chatId - Target chat ID
   * @param text - Message text
   * @returns Response data from Python
   */
  async sendMessage(chatId: string, text: string): Promise<unknown> {
    return this.sendRequest("send_message", { chatId, text });
  }

  /**
   * Get the list of available chats from the userbot.
   *
   * @returns Chat list data from Python
   */
  async getChats(): Promise<unknown> {
    return this.sendRequest("get_chats", {});
  }

  /**
   * Perform a health check on the Python process.
   *
   * Sends a health request with a timeout. If no response is received
   * within the configured timeout, the promise is rejected.
   *
   * @returns Health status data from Python
   * @throws {UserbotBridgeError} if health check times out
   */
  async healthCheck(): Promise<unknown> {
    return this.sendRequest("health", {}, this.config.healthCheckTimeoutMs);
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Check if the bridge is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Get the bridge configuration. */
  getConfig(): UserbotBridgeConfig {
    return this.config as UserbotBridgeConfig;
  }

  // -----------------------------------------------------------------------
  // Private: process spawning
  // -----------------------------------------------------------------------

  /**
   * Spawn the Python child process and attach stdio handlers.
   */
  private spawnProcess(): void {
    const env = {
      ...process.env,
      TELETHON_API_ID: String(this.config.apiId),
      TELETHON_API_HASH: this.config.apiHash,
      TELETHON_PHONE: this.config.phone,
    };

    this.logger.debug(
      {
        pythonPath: this.config.pythonPath,
        scriptPath: this.config.scriptPath,
      },
      "Spawning Python process",
    );

    const childProcess = spawn(this.config.pythonPath, [this.config.scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    this.process = childProcess;

    // Attach stdout handler (read JSON lines from Python)
    childProcess.stdout?.on("data", (chunk: Buffer) => {
      this.handleStdoutData(chunk);
    });

    // Attach stderr handler (log Python stderr)
    childProcess.stderr?.on("data", (chunk: Buffer) => {
      this.logger.debug(
        { stderr: chunk.toString("utf-8") },
        "Python stderr output",
      );
    });

    // Attach close handler (crash detection + auto-restart)
    childProcess.on("close", (code, signal) => {
      this.logger.info(
        { code, signal },
        "Python process closed",
      );

      if (this.running) {
        this.handleProcessCrash(code, signal);
      }
    });

    // Attach error handler
    childProcess.on("error", (err) => {
      this.logger.error(
        { error: err.message },
        "Python process error",
      );

      if (this.running) {
        this.handleProcessCrash(null, "error");
      }
    });
  }

  // -----------------------------------------------------------------------
  // Private: stdout data handling
  // -----------------------------------------------------------------------

  /**
   * Handle incoming data from Python stdout.
   *
   * Accumulates partial lines in a buffer. When a complete line is received,
   * attempts to parse as JSON and route to the appropriate handler.
   *
   * Invalid JSON is logged and discarded without crashing.
   */
  private handleStdoutData(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString("utf-8");

    // Process complete lines (newline-delimited)
    let newlineIndex: number;
    while ((newlineIndex = this.stdoutBuffer.indexOf("\n")) !== -1) {
      const line = this.stdoutBuffer.substring(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.substring(newlineIndex + 1);

      if (line.length === 0) {
        // Skip empty lines
        continue;
      }

      this.processLine(line);
    }
  }

  /**
   * Process a single line from Python stdout.
   *
   * Attempts JSON parse. On failure, logs warning and continues.
   * On success, routes to either the pending request handler or
   * the message callback.
   */
  private processLine(line: string): void {
    let response: BridgeResponse;

    try {
      response = JSON.parse(line) as BridgeResponse;
    } catch {
      // Invalid JSON from Python -- log and continue (no crash)
      this.logger.warn(
        { rawLine: line },
        "Received invalid JSON from Python process, ignoring",
      );
      return;
    }

    // Check if this response matches a pending request
    const pending = this.pendingRequests.get(response.id);

    if (pending) {
      // Correlated response -- resolve/reject the pending request
      this.pendingRequests.delete(response.id);

      if (pending.timeoutTimer !== undefined) {
        clearTimeout(pending.timeoutTimer);
      }

      if (response.type === "error") {
        const errorMessage =
          (response.data as Record<string, unknown>)?.message ?? "Unknown Python error";
        pending.reject(new UserbotBridgeError(String(errorMessage)));
      } else {
        // Reset restart counter on successful communication
        this.restartCount = 0;
        pending.resolve(response.data);
      }
    } else {
      // Unmatched response -- route to message callback if configured
      if (response.type === "message" && this.config.onMessage) {
        this.config.onMessage(response);
      } else if (response.type !== "message") {
        // Log unmatched non-message responses (could be stale)
        this.logger.debug(
          { id: response.id, type: response.type },
          "Received response with no matching pending request",
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private: request/response protocol
  // -----------------------------------------------------------------------

  /**
   * Generate a unique request ID.
   */
  private generateRequestId(): string {
    this.requestIdCounter += 1;
    return `req-${Date.now()}-${this.requestIdCounter}`;
  }

  /**
   * Send a request to the Python process and wait for the response.
   *
   * @param type - Request type
   * @param params - Request parameters
   * @param timeoutMs - Optional timeout in ms (default: no timeout)
   * @returns Response data from Python
   * @throws {UserbotBridgeError} if not running, write fails, or timeout
   */
  private sendRequest(
    type: BridgeRequestType,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      if (!this.running || !this.process?.stdin) {
        reject(new UserbotBridgeError("UserbotBridge is not running"));
        return;
      }

      const id = this.generateRequestId();
      const request: BridgeRequest = { type, id, params };

      // Create timeout timer if specified
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs !== undefined) {
        timeoutTimer = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new UserbotBridgeError("Health check timed out"));
        }, timeoutMs);
      }

      // Register pending request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeoutTimer,
      });

      // Write JSON line to Python stdin
      const jsonLine = JSON.stringify(request) + "\n";

      try {
        this.process.stdin!.write(jsonLine, (err) => {
          if (err) {
            this.pendingRequests.delete(id);
            if (timeoutTimer !== undefined) {
              clearTimeout(timeoutTimer);
            }
            reject(
              new UserbotBridgeError(
                `Failed to write to Python stdin: ${err.message}`,
                err,
              ),
            );
          }
        });
      } catch (err) {
        this.pendingRequests.delete(id);
        if (timeoutTimer !== undefined) {
          clearTimeout(timeoutTimer);
        }
        reject(
          new UserbotBridgeError(
            `Failed to write to Python stdin: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err : undefined,
          ),
        );
      }

      this.logger.debug(
        { type, id, params },
        "Sent request to Python process",
      );
    });
  }

  // -----------------------------------------------------------------------
  // Private: crash handling and auto-restart
  // -----------------------------------------------------------------------

  /**
   * Handle Python process crash.
   *
   * Rejects all pending requests and attempts auto-restart if
   * the restart counter has not exceeded the limit.
   */
  private handleProcessCrash(code: number | null, signal: string | null): void {
    this.logger.warn(
      { code, signal, restartCount: this.restartCount },
      "Python process crashed",
    );

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      if (pending.timeoutTimer !== undefined) {
        clearTimeout(pending.timeoutTimer);
      }
      pending.reject(
        new UserbotBridgeError(
          `Python process crashed (code=${code}, signal=${signal})`,
        ),
      );
    }
    this.pendingRequests.clear();

    // Attempt auto-restart
    if (this.restartCount < this.config.maxRestartAttempts) {
      this.restartCount += 1;

      this.logger.info(
        {
          attempt: this.restartCount,
          maxAttempts: this.config.maxRestartAttempts,
        },
        "Attempting auto-restart of Python process",
      );

      try {
        this.spawnProcess();
      } catch (err) {
        this.logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Failed to restart Python process",
        );
        this.running = false;
      }
    } else {
      this.logger.error(
        {
          restartCount: this.restartCount,
          maxAttempts: this.config.maxRestartAttempts,
        },
        "Maximum restart attempts exceeded, stopping bridge",
      );

      this.running = false;
      this.process = null;
    }
  }
}
