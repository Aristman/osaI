// ---------------------------------------------------------------------------
// AuthFlow (T-005)
//
// Interactive authentication flow for Telegram userbot via CLI.
//
// Flow:
//   1. Start UserbotBridge
//   2. Check for existing session -> reuse if valid
//   3. If no session: prompt phone -> send to Telegram -> prompt code -> verify
//   4. If 2FA enabled: prompt password
//   5. Save session to ~/.osai/channels/telegram/session/
//   6. Write credentials to osai.json
//   7. Stop UserbotBridge
//
// Dependencies: pino for structured logging.
// ---------------------------------------------------------------------------

import pino from "pino";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Prompt function type for interactive user input. */
export type PromptFunction = (
  message: string,
  options?: { password?: boolean },
) => Promise<string>;

/** Auth request function type (bridges to UserbotBridge). */
export type SendAuthRequestFunction = (
  params: Record<string, unknown>,
) => Promise<unknown>;

/** Result of the authentication flow. */
export interface AuthFlowResult {
  /** Whether authentication was successful. */
  readonly success: boolean;
  /** Telegram user ID (if successful). */
  readonly userId?: number;
  /** User first name. */
  readonly firstName?: string;
  /** User last name. */
  readonly lastName?: string;
  /** Username. */
  readonly username?: string;
  /** Phone number used for authentication. */
  readonly phone: string;
  /** Whether an existing session was reused. */
  readonly reusedSession: boolean;
  /** Path to the session directory. */
  readonly sessionDir: string;
}

/** Configuration for the AuthFlow. */
export interface AuthFlowConfig {
  /** UserbotBridge instance (or mock for testing). */
  readonly bridge: unknown;
  /** Directory where Telegram session files are stored. */
  readonly sessionDir: string;
  /** Path to the osai.json configuration file. */
  readonly configFilePath: string;
  /** Custom pino logger. */
  readonly logger?: pino.Logger;
  /** Telegram API ID (from my.telegram.org). */
  readonly apiId: number;
  /** Telegram API Hash (from my.telegram.org). */
  readonly apiHash: string;
  /** Prompt function for phone number input. */
  readonly phonePrompt?: PromptFunction;
  /** Prompt function for verification code input. */
  readonly codePrompt?: PromptFunction;
  /** Prompt function for 2FA password input. */
  readonly passwordPrompt?: PromptFunction;
  /** Maximum number of code verification retries. Default: 3. */
  readonly maxCodeRetries?: number;
  /** Function to send auth requests to the bridge. */
  readonly sendAuthRequest?: SendAuthRequestFunction;
  /** Custom function to start the bridge (for testing). */
  readonly startBridge?: () => Promise<void>;
  /** Custom function to stop the bridge (for testing). */
  readonly stopBridge?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Auth response type from Python
// ---------------------------------------------------------------------------

interface AuthResponse {
  success: boolean;
  status: string;
  message?: string;
  userId?: number;
  firstName?: string;
  lastName?: string;
  username?: string;
}

// ---------------------------------------------------------------------------
// AuthFlowError
// ---------------------------------------------------------------------------

/**
 * Error thrown by AuthFlow for authentication failures.
 * Carries structured context for logging and debugging.
 */
export class AuthFlowError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "AuthFlowError";
  }
}

// ---------------------------------------------------------------------------
// AuthFlow
// ---------------------------------------------------------------------------

/**
 * Interactive authentication flow for Telegram userbot.
 *
 * Responsibilities:
 * - Start/stop UserbotBridge lifecycle
 * - Check for existing session and reuse if valid
 * - Interactive phone -> code -> (password) flow
 * - Persist session to disk
 * - Write credentials to osai.json
 *
 * Designed for CLI integration but fully testable with mock prompt functions.
 */
export class AuthFlow {
  private readonly logger: pino.Logger;
  private readonly config: Required<
    Omit<
      AuthFlowConfig,
      "logger" | "phonePrompt" | "codePrompt" | "passwordPrompt" | "sendAuthRequest" | "startBridge" | "stopBridge" | "bridge"
    >
  > & {
    logger: pino.Logger;
    phonePrompt: PromptFunction;
    codePrompt: PromptFunction;
    passwordPrompt: PromptFunction;
    sendAuthRequest: SendAuthRequestFunction;
    startBridge: () => Promise<void>;
    stopBridge: () => Promise<void>;
    bridge: unknown;
  };

  constructor(flowConfig: AuthFlowConfig) {
    this.config = {
      bridge: flowConfig.bridge,
      sessionDir: flowConfig.sessionDir,
      configFilePath: flowConfig.configFilePath,
      apiId: flowConfig.apiId,
      apiHash: flowConfig.apiHash,
      maxCodeRetries: flowConfig.maxCodeRetries ?? 3,
      logger:
        flowConfig.logger ??
        pino({ name: "auth-flow" }).child({ component: "auth-flow" }),
      phonePrompt:
        flowConfig.phonePrompt ??
        (async (msg: string) => {
          // Fallback: would use readline in real CLI
          throw new AuthFlowError(
            `No phone prompt configured. Message: ${msg}`,
          );
        }),
      codePrompt:
        flowConfig.codePrompt ??
        (async (msg: string) => {
          throw new AuthFlowError(
            `No code prompt configured. Message: ${msg}`,
          );
        }),
      passwordPrompt:
        flowConfig.passwordPrompt ??
        (async (msg: string) => {
          throw new AuthFlowError(
            `No password prompt configured. Message: ${msg}`,
          );
        }),
      sendAuthRequest:
        flowConfig.sendAuthRequest ??
        (async (_params: Record<string, unknown>) => {
          throw new AuthFlowError("No sendAuthRequest configured");
        }),
      startBridge:
        flowConfig.startBridge ??
        (async () => {
          // Default: try to start the bridge via duck-typing
          const bridge = flowConfig.bridge as { start?: () => Promise<void> };
          if (bridge?.start) {
            await bridge.start();
          }
        }),
      stopBridge:
        flowConfig.stopBridge ??
        (async () => {
          const bridge = flowConfig.bridge as { stop?: () => Promise<void> };
          if (bridge?.stop) {
            await bridge.stop();
          }
        }),
    };

    this.logger = this.config.logger;

    this.logger.info(
      {
        sessionDir: this.config.sessionDir,
        apiId: this.config.apiId,
      },
      "AuthFlow created",
    );
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute the full authentication flow.
   *
   * @returns AuthFlowResult with success status and user information
   * @throws {AuthFlowError} if authentication fails
   */
  async authenticate(): Promise<AuthFlowResult> {
    let phone = "";

    try {
      // Step 1: Start bridge
      this.logger.info("Starting userbot bridge for authentication");
      await this.config.startBridge();

      // Step 2: Ensure session directory exists
      this.ensureSessionDir();

      // Step 3: Check for existing session
      const existingSession = this.findSessionFile();

      if (existingSession) {
        this.logger.info(
          { sessionFile: existingSession },
          "Found existing session, checking validity",
        );

        const checkResult = await this.config.sendAuthRequest({
          action: "check_session",
          sessionPath: existingSession,
        });

        const checkResponse = checkResult as AuthResponse;

        if (checkResponse.success && checkResponse.status === "authorized") {
          this.logger.info(
            {
              userId: checkResponse.userId,
              firstName: checkResponse.firstName,
            },
            "Session is valid, reusing",
          );

          phone = this.getPhoneFromConfig();

          // Stop bridge
          await this.config.stopBridge();

          return {
            success: true,
            userId: checkResponse.userId,
            firstName: checkResponse.firstName,
            lastName: checkResponse.lastName,
            username: checkResponse.username,
            phone,
            reusedSession: true,
            sessionDir: this.config.sessionDir,
          };
        }

        this.logger.info(
          { status: checkResponse.status },
          "Session is invalid, proceeding with full auth",
        );
      }

      // Step 4: Full auth flow
      // Prompt for phone number
      phone = await this.config.phonePrompt("Enter phone number (with country code, e.g. +79991234567): ");
      this.validatePhone(phone);

      // Send phone to Telegram
      const phoneResult = await this.config.sendAuthRequest({
        action: "send_phone",
        phone,
        apiId: this.config.apiId,
        apiHash: this.config.apiHash,
      });

      const phoneResponse = phoneResult as AuthResponse;

      if (!phoneResponse.success) {
        throw new AuthFlowError(
          phoneResponse.message ?? "Failed to send phone number",
        );
      }

      this.logger.info("Phone accepted, waiting for code");

      // Step 5: Code verification loop
      const authResult = await this.codeVerificationLoop(phone);

      // Step 6: Save credentials to osai.json
      this.saveCredentials(phone);

      // Stop bridge
      await this.config.stopBridge();

      return {
        success: true,
        userId: authResult.userId,
        firstName: authResult.firstName,
        lastName: authResult.lastName,
        username: authResult.username,
        phone,
        reusedSession: false,
        sessionDir: this.config.sessionDir,
      };
    } catch (err) {
      // Ensure bridge is stopped on error
      try {
        await this.config.stopBridge();
      } catch {
        // Ignore stop errors during cleanup
      }

      if (err instanceof AuthFlowError) {
        throw err;
      }

      throw new AuthFlowError(
        err instanceof Error ? err.message : "Unknown authentication error",
        err instanceof Error ? err : undefined,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Get the AuthFlow configuration (without sensitive prompt functions). */
  getConfig(): Pick<AuthFlowConfig, "sessionDir" | "apiId" | "apiHash" | "maxCodeRetries"> {
    return {
      sessionDir: this.config.sessionDir,
      apiId: this.config.apiId,
      apiHash: this.config.apiHash,
      maxCodeRetries: this.config.maxCodeRetries,
    };
  }

  // -----------------------------------------------------------------------
  // Private: code verification loop
  // -----------------------------------------------------------------------

  /**
   * Loop for code verification with retries.
   *
   * Prompts for code, sends to bridge, handles:
   * - code_required -> authorized (success)
   * - password_required -> prompt password
   * - error -> retry (up to maxCodeRetries)
   */
  private async codeVerificationLoop(
    phone: string,
  ): Promise<AuthResponse> {
    let codeAttempts = 0;
    const maxRetries = this.config.maxCodeRetries;

    while (codeAttempts < maxRetries) {
      const code = await this.config.codePrompt("Enter verification code: ");

      const codeResult = await this.config.sendAuthRequest({
        action: "send_code",
        phone,
        code,
        apiId: this.config.apiId,
        apiHash: this.config.apiHash,
      });

      const codeResponse = codeResult as AuthResponse;

      // Check if authorization succeeded
      if (codeResponse.success && codeResponse.status === "authorized") {
        this.logger.info(
          { userId: codeResponse.userId, firstName: codeResponse.firstName },
          "Authorization successful",
        );
        return codeResponse;
      }

      // Check if 2FA password is required
      if (codeResponse.success && codeResponse.status === "password_required") {
        this.logger.info("2FA password required");
        const password = await this.config.passwordPrompt(
          "Enter 2FA password: ",
          { password: true },
        );

        const passwordResult = await this.config.sendAuthRequest({
          action: "send_password",
          phone,
          password,
        });

        const passwordResponse = passwordResult as AuthResponse;

        if (passwordResponse.success && passwordResponse.status === "authorized") {
          this.logger.info(
            { userId: passwordResponse.userId },
            "Authorization with 2FA successful",
          );
          return passwordResponse;
        }

        throw new AuthFlowError(
          `2FA authentication failed: ${passwordResponse.message ?? "unknown error"}`,
        );
      }

      // Error case -- retry or fail
      codeAttempts += 1;

      if (codeAttempts < maxRetries) {
        this.logger.warn(
          {
            attempt: codeAttempts,
            maxRetries,
            error: codeResponse.message,
          },
          "Code verification failed, retrying",
        );
      } else {
        // Last attempt failed
        const errorMsg =
          (codeResponse as AuthResponse).message ??
          "Code verification failed";
        throw new AuthFlowError(
          `Maximum code verification attempts exceeded: ${errorMsg}`,
        );
      }
    }

    // Should never reach here (loop exits via return or throw)
    throw new AuthFlowError("Maximum code verification attempts exceeded");
  }

  // -----------------------------------------------------------------------
  // Private: session management
  // -----------------------------------------------------------------------

  /** Ensure session directory exists. */
  private ensureSessionDir(): void {
    if (!fs.existsSync(this.config.sessionDir)) {
      fs.mkdirSync(this.config.sessionDir, { recursive: true });
      this.logger.debug(
        { dir: this.config.sessionDir },
        "Created session directory",
      );
    }
  }

  /** Find an existing session file in the session directory. */
  private findSessionFile(): string | null {
    if (!fs.existsSync(this.config.sessionDir)) {
      return null;
    }

    const files = fs.readdirSync(this.config.sessionDir);
    const sessionFile = files.find((f) =>
      f.endsWith(".session"),
    );

    if (sessionFile === undefined) {
      return null;
    }

    return path.join(this.config.sessionDir, sessionFile);
  }

  // -----------------------------------------------------------------------
  // Private: phone validation
  // -----------------------------------------------------------------------

  /**
   * Validate phone number format.
   *
   * Accepts international format: +<country_code><number>
   * Minimum length: 10 digits (excluding + prefix)
   */
  private validatePhone(phone: string): void {
    const trimmed = phone.trim();

    if (trimmed.length === 0) {
      throw new AuthFlowError("Phone number cannot be empty");
    }

    if (!trimmed.startsWith("+")) {
      throw new AuthFlowError(
        "Invalid phone number: must start with '+' followed by country code",
      );
    }

    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 10) {
      throw new AuthFlowError(
        "Invalid phone number: too short (minimum 10 digits)",
      );
    }

    if (digits.length > 15) {
      throw new AuthFlowError(
        "Invalid phone number: too long (maximum 15 digits)",
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private: config file management
  // -----------------------------------------------------------------------

  /** Get phone from existing osai.json config. */
  private getPhoneFromConfig(): string {
    try {
      const content = fs.readFileSync(this.config.configFilePath, "utf-8");
      const config = JSON.parse(content) as Record<string, unknown>;
      const telegram = config.channels as Record<string, unknown> | undefined;
      const userbot = telegram?.userbot as Record<string, unknown> | undefined;
      const phone = userbot?.phone as string | undefined;
      return phone ?? "";
    } catch {
      return "";
    }
  }

  /**
   * Save userbot credentials to osai.json.
   *
   * Reads existing config, updates the channels.telegram.userbot section,
   * and writes back preserving formatting.
   */
  private saveCredentials(phone: string): void {
    this.logger.info("Saving credentials to osai.json");

    let config: Record<string, unknown>;

    try {
      const content = fs.readFileSync(this.config.configFilePath, "utf-8");
      config = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // Config file doesn't exist or is invalid -- create minimal structure
      config = { channels: {} };
    }

    // Ensure nested structure exists
    if (!config.channels) {
      config.channels = {};
    }

    const channels = config.channels as Record<string, unknown>;
    if (!channels.telegram) {
      channels.telegram = {};
    }

    const telegram = channels.telegram as Record<string, unknown>;
    if (!telegram.userbot) {
      telegram.userbot = {};
    }

    const userbot = telegram.userbot as Record<string, unknown>;

    // Update credentials
    userbot.enabled = true;
    userbot.apiId = this.config.apiId;
    userbot.apiHash = this.config.apiHash;
    userbot.phone = phone;

    // Write back to file
    fs.writeFileSync(
      this.config.configFilePath,
      JSON.stringify(config, null, 2),
      "utf-8",
    );

    this.logger.info(
      { configFilePath: this.config.configFilePath },
      "Credentials saved to osai.json",
    );
  }
}
