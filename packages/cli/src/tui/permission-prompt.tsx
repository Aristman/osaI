/**
 * @osai/cli -- Permission Prompt UI (DOMAIN-011, T-006)
 *
 * Компонент TUI для обработки permission_request от Gateway.
 *
 * Логика:
 *   - risk=low (read operations)  -- auto-approve, prompt не показывается
 *   - risk=medium/high             -- показ prompt с y/n/a (allow/deny/always)
 *
 * TT-006-01: Permission request с risk=low -- auto-approve для read
 * TT-006-02: Permission request с risk=medium -- показ prompt
 * TT-006-03: User нажимает 'y' -- permission_response allow отправлен
 * TT-006-04: User нажимает 'n' -- permission_response deny отправлен
 */

import React, { useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";
import type { PermissionRequestMessage } from "../ws/protocol.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionDecision = "allow" | "deny" | "always_allow";

export interface PermissionPromptResult {
  /** request_id из permission_request */
  requestId: string;
  /** Решение пользователя */
  decision: PermissionDecision;
}

export interface PermissionPromptProps {
  /** Данные permission_request от Gateway */
  request: PermissionRequestMessage;
  /** Callback с решением пользователя */
  onDecision: (result: PermissionPromptResult) => void;
  /** Auto-approve для risk=low */
  autoApproveRisk?: "low";
}

export interface PermissionQueueItem {
  request: PermissionRequestMessage;
  onDecision: (result: PermissionPromptResult) => void;
}

// ---------------------------------------------------------------------------
// Risk level styling
// ---------------------------------------------------------------------------

function riskColor(risk: "low" | "medium" | "high"): "green" | "yellow" | "red" {
  switch (risk) {
    case "low":
      return "green";
    case "medium":
      return "yellow";
    case "high":
      return "red";
  }
}

function riskLabel(risk: "low" | "medium" | "high"): string {
  switch (risk) {
    case "low":
      return "LOW";
    case "medium":
      return "MEDIUM";
    case "high":
      return "HIGH";
  }
}

// ---------------------------------------------------------------------------
// PermissionPrompt
// ---------------------------------------------------------------------------

/**
 * Компонент prompt для разрешения выполнения операции.
 *
 * Отображает: tool, action, params, risk level.
 * Принимает: y (allow), n (deny), a (always allow).
 *
 * Для risk=low вызывается auto-approve без показа prompt.
 */
export function PermissionPrompt({
  request,
  onDecision,
  autoApproveRisk = "low",
}: PermissionPromptProps): React.ReactElement | null {
  const calledRef = useRef(false);

  // Auto-approve для risk=low -- вызывается синхронно через useMemo
  const shouldAutoApprove = request.risk_level === autoApproveRisk;

  useEffect(() => {
    if (shouldAutoApprove && !calledRef.current) {
      calledRef.current = true;
      onDecision({
        requestId: request.request_id,
        decision: "allow",
      });
    }
  });

  // Не рендерим prompt для auto-approved
  if (shouldAutoApprove) {
    return null;
  }

  return <PermissionPromptInteractive request={request} onDecision={onDecision} />;
}

// ---------------------------------------------------------------------------
// PermissionPromptInteractive (только для medium/high)
// ---------------------------------------------------------------------------

function PermissionPromptInteractive({
  request,
  onDecision,
}: {
  request: PermissionRequestMessage;
  onDecision: (result: PermissionPromptResult) => void;
}): React.ReactElement {
  const handledRef = useRef(false);

  const handleDecision = useCallback(
    (decision: PermissionDecision) => {
      if (handledRef.current) return;
      handledRef.current = true;
      onDecision({
        requestId: request.request_id,
        decision,
      });
    },
    [onDecision, request.request_id],
  );

  useInput((input, key) => {
    if (handledRef.current) return;

    if (input === "y" || input === "Y") {
      handleDecision("allow");
      return;
    }

    if (input === "n" || input === "N") {
      handleDecision("deny");
      return;
    }

    if (input === "a" || input === "A") {
      handleDecision("always_allow");
      return;
    }

    // Enter = allow (default action)
    if (key.return) {
      handleDecision("allow");
      return;
    }
  }, { isActive: true });

  const paramsStr =
    request.params !== null && request.params !== undefined
      ? JSON.stringify(request.params, null, 2)
      : "(none)";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={1}>
      <Box>
        <Text color="yellow" bold>Permission Required</Text>
        <Text color="gray"> | </Text>
        <Text color={riskColor(request.risk_level)} bold>
          [{riskLabel(request.risk_level)}]
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="cyan">Tool: </Text>
        <Text color="white">{request.tool}</Text>
      </Box>

      <Box>
        <Text color="cyan">Action: </Text>
        <Text color="white">{request.action}</Text>
      </Box>

      <Box>
        <Text color="cyan">Params: </Text>
        <Text color="gray" wrap="wrap">{paramsStr}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="green" bold>[Y]</Text>
        <Text color="white">es </Text>
        <Text color="red" bold>[N]</Text>
        <Text color="white">o </Text>
        <Text color="blue" bold>[A]</Text>
        <Text color="white">lways allow</Text>
      </Box>
    </Box>
  );
}
