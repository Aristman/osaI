/**
 * StatusBar tests (T-003)
 *
 * TT-003-06: Статус-бар показывает: chat name, model, connected/disconnected
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { StatusBar } from "../../tui/status-bar.js";

describe("StatusBar", () => {
  it("TT-003-06: should display chat name, model name, and connected status", () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        chatName: "Test Chat",
        modelName: "glm-5",
        connectionStatus: "connected",
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Test Chat");
    expect(frame).toContain("glm-5");
    expect(frame).toContain("connected");
  });

  it("TT-003-06: should display disconnected status", () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        chatName: "My Chat",
        modelName: "gpt-4",
        connectionStatus: "disconnected",
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("My Chat");
    expect(frame).toContain("gpt-4");
    expect(frame).toContain("disconnected");
  });

  it("TT-003-06: should display reconnecting status", () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        chatName: "Work Chat",
        modelName: "glm-5",
        connectionStatus: "reconnecting",
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("reconnecting");
  });

  it("TT-003-06: should display failed status", () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        chatName: "Test",
        modelName: "glm-5",
        connectionStatus: "failed",
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("failed");
  });
});
