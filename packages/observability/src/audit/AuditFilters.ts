/**
 * @osai/observability -- AuditFilters (T-007)
 *
 * Filter builder for audit log queries.
 * Provides a fluent API for constructing AuditQueryFilter objects
 * with type-safe field access and validation.
 *
 * Usage:
 * ```ts
 * const filter = new AuditFilters()
 *   .byTraceId("trace-123")
 *   .byAction(AuditEventType.TOOL_CALL)
 *   .byRiskLevel("high")
 *   .build();
 *
 * const records = auditService.query(filter);
 * ```
 */

import type { AuditQueryFilter } from "./types.js";

// ---------------------------------------------------------------------------
// AuditFilters
// ---------------------------------------------------------------------------

/**
 * Fluent filter builder for audit log queries.
 *
 * All filter methods are chainable. Call build() to produce
 * the final AuditQueryFilter object.
 */
export class AuditFilters {
  private readonly filter: AuditQueryFilter = {};

  /**
   * Filter by session_id.
   */
  bySessionId(sessionId: string): this {
    this.filter.session_id = sessionId;
    return this;
  }

  /**
   * Filter by chat_id.
   */
  byChatId(chatId: string): this {
    this.filter.chat_id = chatId;
    return this;
  }

  /**
   * Filter by trace_id.
   *
   * Returns all records sharing the same trace_id,
   * typically originating from a single request.
   */
  byTraceId(traceId: string): this {
    this.filter.trace_id = traceId;
    return this;
  }

  /**
   * Filter by action (event type).
   *
   * @param action - AuditEventType enum value or string
   */
  byAction(action: string): this {
    this.filter.action = action;
    return this;
  }

  /**
   * Filter by tool_name.
   */
  byToolName(toolName: string): this {
    this.filter.tool_name = toolName;
    return this;
  }

  /**
   * Filter by skill_name.
   */
  bySkillName(skillName: string): this {
    this.filter.skill_name = skillName;
    return this;
  }

  /**
   * Filter by risk_level.
   *
   * @param riskLevel - One of: low, medium, high, critical
   */
  byRiskLevel(riskLevel: string): this {
    this.filter.risk_level = riskLevel;
    return this;
  }

  /**
   * Filter by time range -- lower bound (inclusive).
   *
   * @param from - ISO 8601 timestamp
   */
  fromTime(from: string): this {
    this.filter.from = from;
    return this;
  }

  /**
   * Filter by time range -- upper bound (inclusive).
   *
   * @param to - ISO 8601 timestamp
   */
  toTime(to: string): this {
    this.filter.to = to;
    return this;
  }

  /**
   * Limit the number of returned records.
   *
   * @param limit - Maximum records to return
   */
  withLimit(limit: number): this {
    this.filter.limit = limit;
    return this;
  }

  /**
   * Build the final AuditQueryFilter object.
   *
   * Only fields that were explicitly set are included
   * (no undefined values in the output).
   */
  build(): AuditQueryFilter {
    const result: AuditQueryFilter = {};

    if (this.filter.session_id !== undefined) {
      result.session_id = this.filter.session_id;
    }
    if (this.filter.chat_id !== undefined) {
      result.chat_id = this.filter.chat_id;
    }
    if (this.filter.trace_id !== undefined) {
      result.trace_id = this.filter.trace_id;
    }
    if (this.filter.action !== undefined) {
      result.action = this.filter.action;
    }
    if (this.filter.tool_name !== undefined) {
      result.tool_name = this.filter.tool_name;
    }
    if (this.filter.skill_name !== undefined) {
      result.skill_name = this.filter.skill_name;
    }
    if (this.filter.risk_level !== undefined) {
      result.risk_level = this.filter.risk_level;
    }
    if (this.filter.from !== undefined) {
      result.from = this.filter.from;
    }
    if (this.filter.to !== undefined) {
      result.to = this.filter.to;
    }
    if (this.filter.limit !== undefined) {
      result.limit = this.filter.limit;
    }

    return result;
  }

  /**
   * Create a new AuditFilters from an existing AuditQueryFilter.
   * Useful for extending or modifying existing filters.
   */
  static from(filter: AuditQueryFilter): AuditFilters {
    const instance = new AuditFilters();

    if (filter.session_id !== undefined) {
      instance.filter.session_id = filter.session_id;
    }
    if (filter.chat_id !== undefined) {
      instance.filter.chat_id = filter.chat_id;
    }
    if (filter.trace_id !== undefined) {
      instance.filter.trace_id = filter.trace_id;
    }
    if (filter.action !== undefined) {
      instance.filter.action = filter.action;
    }
    if (filter.tool_name !== undefined) {
      instance.filter.tool_name = filter.tool_name;
    }
    if (filter.skill_name !== undefined) {
      instance.filter.skill_name = filter.skill_name;
    }
    if (filter.risk_level !== undefined) {
      instance.filter.risk_level = filter.risk_level;
    }
    if (filter.from !== undefined) {
      instance.filter.from = filter.from;
    }
    if (filter.to !== undefined) {
      instance.filter.to = filter.to;
    }
    if (filter.limit !== undefined) {
      instance.filter.limit = filter.limit;
    }

    return instance;
  }
}
