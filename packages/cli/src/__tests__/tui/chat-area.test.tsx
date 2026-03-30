/**
 * ChatArea tests (T-003)
 *
 * TT-003-03: block (text) ответ отображается в chat area
 * TT-003-04: block (code) ответ отображается с подсветкой
 * TT-003-05: tool_stream обновляет progress
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { ChatArea } from "../../tui/chat-area.js";
import type { ChatMessage, ToolProgress } from "../../tui/types.js";

describe("ChatArea", () => {
  it("TT-003-03: should display text block response in chat area", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "Hello from assistant",
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages,
        currentToolProgress: null,
        isStreaming: false,
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Hello from assistant");
  });

  it("TT-003-03: should display user message with prefix", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "user",
        content: "Hello there",
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages,
        currentToolProgress: null,
        isStreaming: false,
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Hello there");
  });

  it("TT-003-04: should display code block with language label", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "",
        codeBlocks: [
          {
            language: "typescript",
            code: "const x = 42;",
          },
        ],
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages,
        currentToolProgress: null,
        isStreaming: false,
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("typescript");
    expect(frame).toContain("const x = 42;");
  });

  it("TT-003-04: should display multiple code blocks with different languages", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "Here are some examples:",
        codeBlocks: [
          { language: "python", code: "print('hello')" },
          { language: "javascript", code: "console.log('hello')" },
        ],
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages,
        currentToolProgress: null,
        isStreaming: false,
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("python");
    expect(frame).toContain("javascript");
    expect(frame).toContain("print('hello')");
    expect(frame).toContain("console.log('hello')");
  });

  it("TT-003-05: should display tool stream progress", () => {
    const messages: ChatMessage[] = [];
    const toolProgress: ToolProgress = {
      tool: "filesystem",
      action: "read_file",
      progress: 0.5,
      timestamp: Date.now(),
    };

    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages,
        currentToolProgress: toolProgress,
        isStreaming: false,
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("filesystem");
    expect(frame).toContain("read_file");
    expect(frame).toContain("50%");
  });

  it("TT-003-05: should display tool progress without percentage when not provided", () => {
    const messages: ChatMessage[] = [];
    const toolProgress: ToolProgress = {
      tool: "shell",
      action: "exec",
      timestamp: Date.now(),
    };

    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages,
        currentToolProgress: toolProgress,
        isStreaming: false,
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("shell");
    expect(frame).toContain("exec");
    expect(frame).toContain("...");
  });

  it("should display streaming cursor when isStreaming is true", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "streaming",
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages,
        currentToolProgress: null,
        isStreaming: true,
      }),
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("|");
  });

  it("should not display streaming cursor when isStreaming is false", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "done",
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages,
        currentToolProgress: null,
        isStreaming: false,
      }),
    );

    const frame = lastFrame() ?? "";
    // When streaming is false and it's not the last message, no cursor
    expect(frame).not.toContain("|");
  });

  it("should display empty chat area when no messages", () => {
    const { lastFrame } = render(
      React.createElement(ChatArea, {
        messages: [],
        currentToolProgress: null,
        isStreaming: false,
      }),
    );

    // Should render without crashing
    const frame = lastFrame() ?? "";
    expect(frame).toBeDefined();
  });
});
