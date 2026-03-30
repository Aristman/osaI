/**
 * @osai/observability -- Observability (DOMAIN-010)
 *
 * pino structured logging, LoggerFactory, audit log,
 * OpenTelemetry traces + metrics (V1), Prometheus endpoint.
 */

export {
  LoggerFactory,
  getLogger,
  createModuleLogger,
  type LoggerConfig,
  type ChildLoggerOptions,
  type LogLevel,
} from "./logger.js";
