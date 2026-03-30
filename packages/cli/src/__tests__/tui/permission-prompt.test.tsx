/**
 * PermissionPrompt tests (T-006)
 *
 * TT-006-01: Permission request с risk=low -- auto-approve для read
 * TT-006-02: Permission request с risk=medium -- показ prompt
 * TT-006-03: User нажимает 'y' -- permission_response allow отправлен
 * TT-006-04: User нажимает 'n' -- permission_response deny отправлен
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { PermissionPrompt } from "../../tui/permission-prompt.js";
import type { PermissionRequestMessage } from "../../ws/protocol.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPermissionRequest(overrides: Partial<PermissionRequestMessage> = {}): PermissionRequestMessage {
  return {
    type: "permission_request",
    request_id: "test-req-001",
    session_id: "session-001",
    tool: "filesystem",
    action: "read",
    params: { path: "/tmp/test.txt" },
    risk_level: "low",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PermissionPrompt", () => {

  // -----------------------------------------------------------------------
  // TT-006-01: Auto-approve для risk=low
  // -----------------------------------------------------------------------
  describe("TT-006-01: auto-approve for risk=low", () => {
    it("should auto-approve permission request with risk=low and not show prompt", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "low" });

      render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      // Wait for useEffect to fire (ink render is async)
      await new Promise((r) => setTimeout(r, 100));

      // Auto-approve should have been called
      expect(onDecision).toHaveBeenCalledTimes(1);
      expect(onDecision).toHaveBeenCalledWith({
        requestId: "test-req-001",
        decision: "allow",
      });
    });

    it("should auto-approve different risk=low requests (read operations)", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({
        request_id: "req-read-002",
        tool: "filesystem",
        action: "read",
        params: { path: "/home/user/docs" },
        risk_level: "low",
      });

      render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 100));

      expect(onDecision).toHaveBeenCalledWith({
        requestId: "req-read-002",
        decision: "allow",
      });
    });

    it("should not auto-approve risk=medium", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "medium" });

      render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 100));

      // Should NOT have been called for medium risk
      expect(onDecision).not.toHaveBeenCalled();
    });

    it("should not auto-approve risk=high", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "high" });

      render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 100));

      // Should NOT have been called for high risk
      expect(onDecision).not.toHaveBeenCalled();
    });

    it("should return null for risk=low (no prompt rendered)", () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "low" });

      const { lastFrame } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      // Prompt should not be rendered for auto-approved
      const frame = lastFrame() ?? "";
      expect(frame).not.toContain("Permission Required");
    });
  });

  // -----------------------------------------------------------------------
  // TT-006-02: Показ prompt для risk=medium
  // -----------------------------------------------------------------------
  describe("TT-006-02: show prompt for risk=medium", () => {
    it("should display permission prompt with tool, action, params, risk level", () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({
        risk_level: "medium",
        tool: "filesystem",
        action: "write",
        params: { path: "/tmp/output.txt", content: "hello" },
      });

      const { lastFrame } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      const frame = lastFrame() ?? "";
      // Should show the prompt UI
      expect(frame).toContain("Permission Required");
      expect(frame).toContain("MEDIUM");
      expect(frame).toContain("filesystem");
      expect(frame).toContain("write");
      expect(frame).toContain("output.txt");
      // Should show y/n/a options
      expect(frame).toContain("Y");
      expect(frame).toContain("N");
      expect(frame).toContain("A");
    });

    it("should display HIGH risk level", () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({
        risk_level: "high",
        tool: "shell",
        action: "exec",
        params: { command: "rm -rf /tmp/test" },
      });

      const { lastFrame } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      const frame = lastFrame() ?? "";
      expect(frame).toContain("HIGH");
      expect(frame).toContain("shell");
      expect(frame).toContain("exec");
    });

    it("should display (none) for null params", () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({
        risk_level: "medium",
        params: null,
      });

      const { lastFrame } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      const frame = lastFrame() ?? "";
      expect(frame).toContain("(none)");
    });
  });

  // -----------------------------------------------------------------------
  // TT-006-03: 'y' -- allow
  // -----------------------------------------------------------------------
  describe("TT-006-03: user presses 'y' -> allow", () => {
    it("should call onDecision with allow=true when user presses 'y'", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "medium" });

      const { stdin } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      // Wait for component to mount
      await new Promise((r) => setTimeout(r, 50));

      // Simulate pressing 'y'
      stdin.write("y");
      await new Promise((r) => setTimeout(r, 50));

      expect(onDecision).toHaveBeenCalledTimes(1);
      expect(onDecision).toHaveBeenCalledWith({
        requestId: "test-req-001",
        decision: "allow",
      });
    });

    it("should call onDecision with allow=true when user presses 'Y' (uppercase)", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "medium" });

      const { stdin } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 50));

      stdin.write("Y");
      await new Promise((r) => setTimeout(r, 50));

      expect(onDecision).toHaveBeenCalledWith({
        requestId: "test-req-001",
        decision: "allow",
      });
    });

    it("should call onDecision with allow=true when user presses Enter", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "medium" });

      const { stdin } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 50));

      // Simulate pressing Enter (return key)
      stdin.write("\r");
      await new Promise((r) => setTimeout(r, 50));

      expect(onDecision).toHaveBeenCalledWith({
        requestId: "test-req-001",
        decision: "allow",
      });
    });
  });

  // -----------------------------------------------------------------------
  // TT-006-04: 'n' -- deny
  // -----------------------------------------------------------------------
  describe("TT-006-04: user presses 'n' -> deny", () => {
    it("should call onDecision with allow=false when user presses 'n'", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "high" });

      const { stdin } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 50));

      // Simulate pressing 'n'
      stdin.write("n");
      await new Promise((r) => setTimeout(r, 50));

      expect(onDecision).toHaveBeenCalledTimes(1);
      expect(onDecision).toHaveBeenCalledWith({
        requestId: "test-req-001",
        decision: "deny",
      });
    });

    it("should call onDecision with deny when user presses 'N' (uppercase)", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "high" });

      const { stdin } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 50));

      stdin.write("N");
      await new Promise((r) => setTimeout(r, 50));

      expect(onDecision).toHaveBeenCalledWith({
        requestId: "test-req-001",
        decision: "deny",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Additional: 'a' -- always_allow
  // -----------------------------------------------------------------------
  describe("additional: 'a' -> always_allow", () => {
    it("should call onDecision with always_allow when user presses 'a'", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "medium" });

      const { stdin } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 50));

      stdin.write("a");
      await new Promise((r) => setTimeout(r, 50));

      expect(onDecision).toHaveBeenCalledWith({
        requestId: "test-req-001",
        decision: "always_allow",
      });
    });

    it("should call onDecision only once (no double-fire)", async () => {
      const onDecision = vi.fn();
      const request = createPermissionRequest({ risk_level: "medium" });

      const { stdin } = render(
        React.createElement(PermissionPrompt, {
          request,
          onDecision,
          autoApproveRisk: "low",
        }),
      );

      await new Promise((r) => setTimeout(r, 50));

      // Press multiple keys
      stdin.write("y");
      stdin.write("n");
      stdin.write("a");
      await new Promise((r) => setTimeout(r, 100));

      expect(onDecision).toHaveBeenCalledTimes(1);
      expect(onDecision).toHaveBeenCalledWith({
        requestId: "test-req-001",
        decision: "allow",
      });
    });
  });
});
