/**
 * Custom Error Classes for Configuration System
 *
 * F-003 T-002: Typed errors for config loading, parsing, and validation.
 */

// ---------------------------------------------------------------------------
// Base Config Error
// ---------------------------------------------------------------------------

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// File Not Found
// ---------------------------------------------------------------------------

export class ConfigNotFoundError extends ConfigError {
  constructor(configPath: string) {
    super(
      `Configuration file not found: ${configPath}`,
      'CONFIG_NOT_FOUND',
      { path: configPath },
    );
  }
}

// ---------------------------------------------------------------------------
// Parse Error (invalid JSON)
// ---------------------------------------------------------------------------

export class ConfigParseError extends ConfigError {
  constructor(configPath: string, parseError: Error) {
    super(
      `Failed to parse configuration file: ${configPath}: ${parseError.message}`,
      'CONFIG_PARSE_ERROR',
      { path: configPath, originalError: parseError.message },
    );
  }
}

// ---------------------------------------------------------------------------
// Validation Error (schema mismatch)
// ---------------------------------------------------------------------------

export class ConfigValidationError extends ConfigError {
  constructor(
    public readonly validationErrors: Array<{ path: string; message: string; value?: unknown }>,
  ) {
    super(
      `Configuration validation failed with ${validationErrors.length} error(s)`,
      'CONFIG_VALIDATION_ERROR',
      { errors: validationErrors },
    );
  }
}

// ---------------------------------------------------------------------------
// Permission Warning
// ---------------------------------------------------------------------------

export class ConfigPermissionWarning extends ConfigError {
  constructor(configPath: string, currentMode: number) {
    super(
      `Configuration file has insecure permissions: ${configPath} (mode: 0o${currentMode.toString(8).padStart(3, '0')}, expected: 0o600)`,
      'CONFIG_PERMISSION_WARNING',
      { path: configPath, currentMode },
    );
  }
}
