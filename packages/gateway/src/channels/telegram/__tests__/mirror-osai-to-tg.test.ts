// ---------------------------------------------------------------------------
// MirrorEngine Tests -- osai-to-Telegram direction (T-006)
//
// Test cases from roadmap (section T-006):
//   - Sending messages to Telegram (via bot/userbot sender)
//   - Markdown -> Telegram HTML conversion
//   - on_mirror_message hook invocation
//   - Error handling: logging, retry (1 attempt)
//   - Lifecycle: start/stop
//   - Direction filtering: only "osai-to-tg" and "both" mirrors are active
//   - Edge cases: no matching mirror, engine not started
//
// All tests mock Telegram API (no real calls).
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MirrorEngine,
  MirrorEngineError,
  markdownToTelegramHtml,
  type MirrorEngineConfig,
  type MirrorMessageEvent,
  type TelegramSender,
} from "../mirror.js";
import type {
  MirrorConfig,
} from "../types.js";
import pino from "pino";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a silent pino logger for tests. */
function createTestLogger(): pino.Logger {
  return pino({ level: "silent" });
}

/** Create a mock TelegramSender. */
function createMockSender(shouldFail = false, failOnRetry = false): TelegramSender & { callHistory: Array<{ chatId: number; text: string }> } {
  let callCount = 0;
  const callHistory: Array<{ chatId: number; text: string }> = [];

  const sender: TelegramSender & { callHistory: Array<{ chatId: number; text: string }> } = {
    callHistory,
    sendMessage: vi.fn(async (chatId: number, text: string): Promise<unknown> => {
      callHistory.push({ chatId, text });
      callCount++;

      if (shouldFail && (!failOnRetry || callCount === 1)) {
        throw new Error("Telegram API error: chat not found");
      }

      return { ok: true, message_id: 100 + callCount };
    }),
  };

  return sender;
}

/** Create a default mirror configuration. */
function createMirrorConfig(overrides: Partial<MirrorConfig> = {}): MirrorConfig {
  return {
    chatId: "osai-chat-1",
    telegramChatId: -1001234567890,
    direction: "osai-to-tg",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// markdownToTelegramHtml
// ---------------------------------------------------------------------------

describe("markdownToTelegramHtml", () => {
  it("should preserve plain text without formatting", () => {
    expect(markdownToTelegramHtml("Hello world")).toBe("Hello world");
  });

  it("should convert bold (**text**) to <b>text</b>", () => {
    expect(markdownToTelegramHtml("**bold text**")).toBe("<b>bold text</b>");
  });

  it("should convert italic (*text*) to <i>text</i>", () => {
    expect(markdownToTelegramHtml("*italic text*")).toBe("<i>italic text</i>");
  });

  it("should convert underline (__text__) to <u>text</u>", () => {
    expect(markdownToTelegramHtml("__underlined text__")).toBe("<u>underlined text</u>");
  });

  it("should convert strikethrough (~~text~~) to <s>text</s>", () => {
    expect(markdownToTelegramHtml("~~struck through~~")).toBe("<s>struck through</s>");
  });

  it("should convert inline code (`text`) to <code>text</code>", () => {
    expect(markdownToTelegramHtml("`inline code`")).toBe("<code>inline code</code>");
  });

  it("should convert code blocks (```...```) to <pre>...</pre>", () => {
    const input = "```javascript\nconst x = 1;\n```";
    const result = markdownToTelegramHtml(input);
    expect(result).toContain("<pre>");
    expect(result).toContain("<code class=\"language-javascript\">");
    expect(result).toContain("const x = 1;");
  });

  it("should convert code blocks without language to <pre>...</pre>", () => {
    const input = "```\nsome code\n```";
    const result = markdownToTelegramHtml(input);
    expect(result).toBe("<pre>some code</pre>");
  });

  it("should convert links [text](url) to <a href=\"url\">text</a>", () => {
    expect(markdownToTelegramHtml("[Google](https://google.com)")).toBe(
      '<a href="https://google.com">Google</a>',
    );
  });

  it("should convert blockquotes (> text) to <blockquote>text</blockquote>", () => {
    expect(markdownToTelegramHtml("> quoted text")).toBe(
      "<blockquote>quoted text</blockquote>",
    );
  });

  it("should handle multiple inline formatting in one line", () => {
    const input = "**bold** and *italic* and `code`";
    const result = markdownToTelegramHtml(input);
    expect(result).toBe("<b>bold</b> and <i>italic</i> and <code>code</code>");
  });

  it("should escape HTML entities in plain text", () => {
    expect(markdownToTelegramHtml("1 < 2 & 3 > 0")).toBe("1 &lt; 2 &amp; 3 &gt; 0");
  });

  it("should handle multiline input", () => {
    const input = "Line 1\nLine 2\n**bold**";
    const result = markdownToTelegramHtml(input);
    expect(result).toBe("Line 1\nLine 2\n<b>bold</b>");
  });

  it("should handle empty string", () => {
    expect(markdownToTelegramHtml("")).toBe("");
  });

  it("should handle unclosed code block gracefully", () => {
    const input = "```\nunclosed code";
    const result = markdownToTelegramHtml(input);
    expect(result).toBe("<pre>unclosed code</pre>");
  });

  it("should not process formatting inside code blocks", () => {
    const input = "```\n**not bold**\n```";
    const result = markdownToTelegramHtml(input);
    // Content inside code blocks should be escaped, not formatted
    expect(result).not.toContain("<b>");
    expect(result).toContain("<pre>");
  });

  it("should escape HTML entities inside code blocks", () => {
    const input = "```\n<div>hello</div>\n```";
    const result = markdownToTelegramHtml(input);
    expect(result).toContain("&lt;div&gt;hello&lt;/div&gt;");
    expect(result).not.toContain("<div>");
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- Lifecycle
// ---------------------------------------------------------------------------

describe("MirrorEngine lifecycle", () => {
  it("should start successfully with valid configuration", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
    });

    await expect(engine.start()).resolves.not.toThrow();
    expect(engine.isStarted()).toBe(true);
  });

  it("should stop successfully", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    await expect(engine.stop()).resolves.not.toThrow();
    expect(engine.isStarted()).toBe(false);
  });

  it("should throw MirrorEngineError on double start", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    await expect(engine.start()).rejects.toThrow(MirrorEngineError);
    await expect(engine.start()).rejects.toThrow("already started");
  });

  it("should throw MirrorEngineError on stop without start", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
    });

    await expect(engine.stop()).rejects.toThrow(MirrorEngineError);
    await expect(engine.stop()).rejects.toThrow("not started");
  });

  it("should work with no mirrors configured", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    expect(engine.getActiveMirrors()).toHaveLength(0);

    const results = await engine.mirror("some-chat", "Hello");
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- Direction filtering
// ---------------------------------------------------------------------------

describe("MirrorEngine direction filtering", () => {
  it("should activate mirrors with direction 'osai-to-tg'", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "osai-to-tg" })],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    expect(engine.getActiveMirrors()).toHaveLength(1);
  });

  it("should activate mirrors with direction 'both'", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    expect(engine.getActiveMirrors()).toHaveLength(1);
  });

  it("should NOT activate mirrors with direction 'tg-to-osai'", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    expect(engine.getActiveMirrors()).toHaveLength(0);
  });

  it("should filter mixed directions correctly", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({ chatId: "c1", direction: "osai-to-tg" }),
        createMirrorConfig({ chatId: "c2", direction: "tg-to-osai" }),
        createMirrorConfig({ chatId: "c3", direction: "both" }),
      ],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    expect(engine.getActiveMirrors()).toHaveLength(2);
    expect(engine.getActiveMirrors().map((m) => m.chatId)).toEqual(["c1", "c3"]);
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- osai-to-TG message delivery
// ---------------------------------------------------------------------------

describe("MirrorEngine osai-to-TG message delivery", () => {
  let sender: ReturnType<typeof createMockSender>;
  let engine: MirrorEngine;

  beforeEach(async () => {
    sender = createMockSender();
    engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "osai-chat-1",
          telegramChatId: -1001234567890,
          direction: "osai-to-tg",
        }),
      ],
      sender,
      logger: createTestLogger(),
    });
    await engine.start();
  });

  it("should deliver a plain text message to Telegram", async () => {
    const results = await engine.mirror("osai-chat-1", "Hello from osaI");

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.telegramChatId).toBe(-1001234567890);
    expect(sender.sendMessage).toHaveBeenCalledTimes(1);
    expect(sender.sendMessage).toHaveBeenCalledWith(
      -1001234567890,
      "Hello from osaI",
    );
  });

  it("should convert Markdown to Telegram HTML before sending", async () => {
    const results = await engine.mirror("osai-chat-1", "**Bold** and *italic*");

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(sender.sendMessage).toHaveBeenCalledWith(
      -1001234567890,
      "<b>Bold</b> and <i>italic</i>",
    );
  });

  it("should return empty results for non-matching chat ID", async () => {
    const results = await engine.mirror("non-existent-chat", "Hello");

    expect(results).toHaveLength(0);
    expect(sender.sendMessage).not.toHaveBeenCalled();
  });

  it("should deliver to multiple mirrors for the same chat ID", async () => {
    const multiEngine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "shared-chat",
          telegramChatId: -1001111111111,
          direction: "osai-to-tg",
        }),
        createMirrorConfig({
          chatId: "shared-chat",
          telegramChatId: -1002222222222,
          direction: "osai-to-tg",
        }),
      ],
      sender,
      logger: createTestLogger(),
    });

    await multiEngine.start();
    const results = await multiEngine.mirror("shared-chat", "Multi target");

    expect(results).toHaveLength(2);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.telegramChatId).toBe(-1001111111111);
    expect(results[1]!.success).toBe(true);
    expect(results[1]!.telegramChatId).toBe(-1002222222222);
    expect(sender.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("should return empty results when engine is not started", async () => {
    await engine.stop();
    const results = await engine.mirror("osai-chat-1", "Hello");

    expect(results).toHaveLength(0);
    expect(sender.sendMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- on_mirror_message hook
// ---------------------------------------------------------------------------

describe("MirrorEngine on_mirror_message hook", () => {
  it("should invoke on_mirror_message hook on successful delivery", async () => {
    const sender = createMockSender();
    const hookFn = vi.fn();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: hookFn,
    });

    await engine.start();
    await engine.mirror("osai-chat-1", "**Hello** from osaI");

    expect(hookFn).toHaveBeenCalledTimes(1);

    const event: MirrorMessageEvent = hookFn.mock.calls[0]![0] as MirrorMessageEvent;
    expect(event.direction).toBe("osai-to-tg");
    expect(event.osaiChatId).toBe("osai-chat-1");
    expect(event.telegramChatId).toBe(-1001234567890);
    expect(event.originalText).toBe("**Hello** from osaI");
    expect(event.formattedText).toBe("<b>Hello</b> from osaI");
    expect(event.success).toBe(true);
    expect(event.error).toBeUndefined();
    expect(event.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO string
    expect(new Date(event.timestamp).getTime()).not.toBeNaN();
  });

  it("should invoke on_mirror_message hook with error on failed delivery", async () => {
    const sender = createMockSender(true, false);
    const hookFn = vi.fn();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: hookFn,
    });

    await engine.start();
    const results = await engine.mirror("osai-chat-1", "Will fail");

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toBeDefined();

    // Hook should still be invoked even on failure
    expect(hookFn).toHaveBeenCalledTimes(1);
    const event = hookFn.mock.calls[0]![0] as MirrorMessageEvent;
    expect(event.success).toBe(false);
    expect(event.error).toContain("Telegram API error");
  });

  it("should not crash when hook throws an error", async () => {
    const sender = createMockSender();
    const hookFn = vi.fn(() => {
      throw new Error("Hook callback error");
    });
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: hookFn,
    });

    await engine.start();

    // Should not throw even though hook throws
    const results = await engine.mirror("osai-chat-1", "Test hook error");

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    // Hook was still invoked
    expect(hookFn).toHaveBeenCalledTimes(1);
  });

  it("should work without on_mirror_message hook configured", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
      // No onMirrorMessage callback
    });

    await engine.start();
    const results = await engine.mirror("osai-chat-1", "No hook");

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
  });

  it("should invoke hook for each target in multi-mirror scenario", async () => {
    const sender = createMockSender();
    const hookFn = vi.fn();
    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "shared-chat",
          telegramChatId: -1001111111111,
          direction: "both",
        }),
        createMirrorConfig({
          chatId: "shared-chat",
          telegramChatId: -1002222222222,
          direction: "both",
        }),
      ],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: hookFn,
    });

    await engine.start();
    await engine.mirror("shared-chat", "Hello both");

    expect(hookFn).toHaveBeenCalledTimes(2);
    expect((hookFn.mock.calls[0]![0] as MirrorMessageEvent).telegramChatId).toBe(-1001111111111);
    expect((hookFn.mock.calls[1]![0] as MirrorMessageEvent).telegramChatId).toBe(-1002222222222);
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- Error handling and retry
// ---------------------------------------------------------------------------

describe("MirrorEngine error handling and retry", () => {
  it("should retry once on first send failure and succeed on retry", async () => {
    // Fail on first attempt, succeed on retry
    let callCount = 0;
    const sender: TelegramSender = {
      sendMessage: vi.fn(async (_chatId: number, _text: string): Promise<unknown> => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Temporary network error");
        }
        return { ok: true };
      }),
    };

    const hookFn = vi.fn();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: hookFn,
    });

    await engine.start();
    const results = await engine.mirror("osai-chat-1", "Retry me");

    // Should have retried: 2 total calls
    expect(sender.sendMessage).toHaveBeenCalledTimes(2);

    // Should have succeeded after retry
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);

    // Hook should indicate success
    const event = hookFn.mock.calls[0]![0] as MirrorMessageEvent;
    expect(event.success).toBe(true);
  });

  it("should fail after retry if both attempts fail", async () => {
    // Fail on both attempts
    const sender: TelegramSender = {
      sendMessage: vi.fn(async () => {
        throw new Error("Persistent API error");
      }),
    };

    const hookFn = vi.fn();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: hookFn,
    });

    await engine.start();
    const results = await engine.mirror("osai-chat-1", "Will fail twice");

    // Should have retried: 2 total calls
    expect(sender.sendMessage).toHaveBeenCalledTimes(2);

    // Should have failed
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toContain("Persistent API error");

    // Hook should indicate failure
    const event = hookFn.mock.calls[0]![0] as MirrorMessageEvent;
    expect(event.success).toBe(false);
    expect(event.error).toContain("Persistent API error");
  });

  it("should continue to other targets if one target fails", async () => {
    let callCount = 0;
    const sender: TelegramSender = {
      sendMessage: vi.fn(async (chatId: number, _text: string): Promise<unknown> => {
        callCount++;
        if (chatId === -1001111111111) {
          throw new Error("Target 1 failed");
        }
        return { ok: true };
      }),
    };

    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "shared-chat",
          telegramChatId: -1001111111111,
          direction: "osai-to-tg",
        }),
        createMirrorConfig({
          chatId: "shared-chat",
          telegramChatId: -1002222222222,
          direction: "osai-to-tg",
        }),
      ],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    const results = await engine.mirror("shared-chat", "Partial fail");

    // First target should fail (2 calls: original + retry)
    // Second target should succeed (1 call)
    expect(results).toHaveLength(2);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.telegramChatId).toBe(-1001111111111);
    expect(results[1]!.success).toBe(true);
    expect(results[1]!.telegramChatId).toBe(-1002222222222);
  });

  it("should log errors during failed delivery", async () => {
    const errorSpy = vi.fn();
    const logger = createTestLogger();
    logger.error = errorSpy;

    const sender: TelegramSender = {
      sendMessage: vi.fn(async () => {
        throw new Error("API error");
      }),
    };

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger,
    });

    await engine.start();
    await engine.mirror("osai-chat-1", "Error test");

    // Error should be logged
    expect(errorSpy).toHaveBeenCalled();
    const logCall = errorSpy.mock.calls[0];
    expect(logCall[0]).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- Markdown formatting preservation (AC-016-4)
// ---------------------------------------------------------------------------

describe("MirrorEngine Markdown formatting preservation", () => {
  it("should preserve bold formatting in mirrored messages", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    await engine.mirror("osai-chat-1", "**Important result**");

    expect(sender.sendMessage).toHaveBeenCalledWith(
      -1001234567890,
      "<b>Important result</b>",
    );
  });

  it("should preserve code blocks in mirrored messages", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    await engine.mirror("osai-chat-1", "```js\nconsole.log('hi');\n```");

    const sentText = (sender.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(sentText).toContain("<pre>");
    expect(sentText).toContain("console.log");
  });

  it("should preserve links in mirrored messages", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    await engine.mirror("osai-chat-1", "See [docs](https://example.com)");

    expect(sender.sendMessage).toHaveBeenCalledWith(
      -1001234567890,
      'See <a href="https://example.com">docs</a>',
    );
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- Integration: multiple mirrors with different directions
// ---------------------------------------------------------------------------

describe("MirrorEngine with mixed mirror directions", () => {
  it("should only mirror to osai-to-tg and both directions", async () => {
    const sender = createMockSender();
    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "chat-1",
          telegramChatId: -1001111111111,
          direction: "osai-to-tg",
        }),
        createMirrorConfig({
          chatId: "chat-1",
          telegramChatId: -1002222222222,
          direction: "tg-to-osai",
        }),
        createMirrorConfig({
          chatId: "chat-1",
          telegramChatId: -1003333333333,
          direction: "both",
        }),
      ],
      sender,
      logger: createTestLogger(),
    });

    await engine.start();
    const results = await engine.mirror("chat-1", "Multi-direction");

    // Only 2 targets should receive: osai-to-tg and both
    expect(results).toHaveLength(2);
    expect(results[0]!.telegramChatId).toBe(-1001111111111);
    expect(results[1]!.telegramChatId).toBe(-1003333333333);
    expect(sender.sendMessage).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// MirrorMessageEvent structure
// ---------------------------------------------------------------------------

describe("MirrorMessageEvent structure", () => {
  it("should contain all required fields", async () => {
    const sender = createMockSender();
    const hookFn = vi.fn();
    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "test-chat",
          telegramChatId: -1009999999999,
          direction: "both",
        }),
      ],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: hookFn,
    });

    await engine.start();
    await engine.mirror("test-chat", "Event structure test");

    const event = hookFn.mock.calls[0]![0] as MirrorMessageEvent;

    // Verify all fields exist and have correct types
    expect(typeof event.direction).toBe("string");
    expect(typeof event.osaiChatId).toBe("string");
    expect(typeof event.telegramChatId).toBe("number");
    expect(typeof event.originalText).toBe("string");
    expect(typeof event.formattedText).toBe("string");
    expect(typeof event.success).toBe("boolean");
    expect(typeof event.timestamp).toBe("string");

    // Verify specific values
    expect(event.direction).toBe("both");
    expect(event.osaiChatId).toBe("test-chat");
    expect(event.telegramChatId).toBe(-1009999999999);
    expect(event.originalText).toBe("Event structure test");
    expect(event.formattedText).toBe("Event structure test");
    expect(event.success).toBe(true);
    expect(event.error).toBeUndefined();
  });

  it("should have ISO 8601 timestamp", async () => {
    const sender = createMockSender();
    const hookFn = vi.fn();
    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig()],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: hookFn,
    });

    await engine.start();
    const beforeMirror = new Date().toISOString();
    await engine.mirror("osai-chat-1", "Timestamp test");
    const afterMirror = new Date().toISOString();

    const event = hookFn.mock.calls[0]![0] as MirrorMessageEvent;
    const eventTime = new Date(event.timestamp).getTime();
    const beforeTime = new Date(beforeMirror).getTime();
    const afterTime = new Date(afterMirror).getTime();

    expect(eventTime).toBeGreaterThanOrEqual(beforeTime);
    expect(eventTime).toBeLessThanOrEqual(afterTime);
  });
});
