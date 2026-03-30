// ---------------------------------------------------------------------------
// MirrorEngine Tests -- Telegram-to-osaI direction (T-007)
//
// Test cases from roadmap (section T-007):
//   - Receiving messages from Telegram (bot/userbot)
//   - Mapping incoming Telegram messages to GatewayMessage
//   - Deduplication by message_id (preventing mirror loops)
//   - Telegram HTML -> Markdown conversion
//   - Injection of messages into Agent Runtime via Gateway channel router
//   - Error handling: logging on injection failure
//   - Lifecycle: start/stop
//   - Direction filtering: only "tg-to-osai" and "both" mirrors are active
//
// All tests mock Telegram API and Gateway (no real calls).
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MirrorEngine,
  telegramHtmlToMarkdown,
  type MirrorEngineConfig,
  type TelegramSender,
} from "../mirror.js";
import type {
  MirrorConfig,
} from "../types.js";
import pino from "pino";

// ---------------------------------------------------------------------------
// Types for incoming Telegram messages
// ---------------------------------------------------------------------------

/** Represents an incoming Telegram message (simplified). */
interface IncomingTelegramMessage {
  readonly message_id: number;
  readonly chat: { readonly id: number };
  readonly from?: { readonly id: number; readonly first_name?: string; readonly username?: string };
  readonly text?: string;
  readonly date: number;
}

// ---------------------------------------------------------------------------
// Types for Gateway message injection
// ---------------------------------------------------------------------------

/** Interface for injecting messages into Agent Runtime via Gateway. */
interface GatewayInjector {
  /** Inject a message into the Agent Runtime. */
  injectMessage(params: {
    chatId: string;
    text: string;
    source: string;
    telegramMessageId?: number;
    telegramUserId?: number;
    telegramChatId?: number;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a silent pino logger for tests. */
function createTestLogger(): pino.Logger {
  return pino({ level: "silent" });
}

/** Create a mock TelegramSender. */
function createMockSender(): TelegramSender & { callHistory: Array<{ chatId: number; text: string }> } {
  const callHistory: Array<{ chatId: number; text: string }> = [];

  const sender: TelegramSender & { callHistory: Array<{ chatId: number; text: string }> } = {
    callHistory,
    sendMessage: vi.fn(async (chatId: number, text: string): Promise<unknown> => {
      callHistory.push({ chatId, text });
      return { ok: true, message_id: 200 };
    }),
  };

  return sender;
}

/** Create a mock GatewayInjector. */
function createMockInjector(
  shouldFail = false,
): GatewayInjector & { callHistory: Array<{ chatId: string; text: string; source: string }> } {
  const callHistory: Array<{ chatId: string; text: string; source: string }> = [];

  const injector: GatewayInjector & { callHistory: Array<{ chatId: string; text: string; source: string }> } = {
    callHistory,
    injectMessage: vi.fn(async (params): Promise<void> => {
      callHistory.push({ chatId: params.chatId, text: params.text, source: params.source });

      if (shouldFail) {
        throw new Error("Agent Runtime injection failed");
      }
    }),
  };

  return injector;
}

/** Create a default mirror configuration with tg-to-osai direction. */
function createMirrorConfig(overrides: Partial<MirrorConfig> = {}): MirrorConfig {
  return {
    chatId: "osai-chat-1",
    telegramChatId: -1001234567890,
    direction: "tg-to-osai",
    ...overrides,
  };
}

/** Create a default incoming Telegram message. */
function createTelegramMessage(overrides: Partial<IncomingTelegramMessage> = {}): IncomingTelegramMessage {
  return {
    message_id: 1,
    chat: { id: -1001234567890 },
    from: { id: 12345, first_name: "Test", username: "testuser" },
    text: "Hello from Telegram",
    date: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// telegramHtmlToMarkdown
// ---------------------------------------------------------------------------

describe("telegramHtmlToMarkdown", () => {
  it("should preserve plain text without HTML tags", () => {
    expect(telegramHtmlToMarkdown("Hello world")).toBe("Hello world");
  });

  it("should convert <b>text</b> to **text**", () => {
    expect(telegramHtmlToMarkdown("<b>bold</b>")).toBe("**bold**");
  });

  it("should convert <i>text</i> to *text*", () => {
    expect(telegramHtmlToMarkdown("<i>italic</i>")).toBe("*italic*");
  });

  it("should convert <u>text</u> to __text__", () => {
    expect(telegramHtmlToMarkdown("<u>underline</u>")).toBe("__underline__");
  });

  it("should convert <s>text</s> to ~~text~~", () => {
    expect(telegramHtmlToMarkdown("<s>strikethrough</s>")).toBe("~~strikethrough~~");
  });

  it("should convert <code>text</code> to `text`", () => {
    expect(telegramHtmlToMarkdown("<code>inline code</code>")).toBe("`inline code`");
  });

  it("should convert <pre>text</pre> to ```text```", () => {
    expect(telegramHtmlToMarkdown("<pre>code block</pre>")).toBe("```\ncode block\n```");
  });

  it("should convert <pre><code>text</code></pre> to ```text```", () => {
    expect(telegramHtmlToMarkdown("<pre><code>code block</code></pre>")).toBe("```\ncode block\n```");
  });

  it("should convert <a href=\"url\">text</a> to [text](url)", () => {
    expect(telegramHtmlToMarkdown('<a href="https://example.com">link</a>')).toBe("[link](https://example.com)");
  });

  it("should convert <blockquote>text</blockquote> to > text", () => {
    expect(telegramHtmlToMarkdown("<blockquote>quoted text</blockquote>")).toBe("> quoted text");
  });

  it("should convert <tg-spoiler>text</tg-spoiler> to ||text||", () => {
    expect(telegramHtmlToMarkdown("<tg-spoiler>hidden</tg-spoiler>")).toBe("||hidden||");
  });

  it("should handle mixed formatting", () => {
    const html = "<b>Bold</b> and <i>italic</i> with <code>code</code>";
    expect(telegramHtmlToMarkdown(html)).toBe("**Bold** and *italic* with `code`");
  });

  it("should handle nested HTML tags", () => {
    const html = "<b><i>bold italic</i></b>";
    expect(telegramHtmlToMarkdown(html)).toBe("***bold italic***");
  });

  it("should handle multiline text", () => {
    const html = "Line 1\nLine 2\n<b>bold line</b>";
    expect(telegramHtmlToMarkdown(html)).toBe("Line 1\nLine 2\n**bold line**");
  });

  it("should handle empty string", () => {
    expect(telegramHtmlToMarkdown("")).toBe("");
  });

  it("should handle HTML entities in text", () => {
    expect(telegramHtmlToMarkdown("a &amp; b &lt; c")).toBe("a & b < c");
  });

  it("should handle text with no matching tags", () => {
    expect(telegramHtmlToMarkdown("just some text")).toBe("just some text");
  });

  it("should handle unclosed tags gracefully", () => {
    expect(telegramHtmlToMarkdown("<b>unclosed")).toBe("<b>unclosed");
  });

  it("should handle pre block with multiple lines", () => {
    const html = "<pre>line1\nline2\nline3</pre>";
    expect(telegramHtmlToMarkdown(html)).toBe("```\nline1\nline2\nline3\n```");
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- TG-to-osai: receiveMessage
// ---------------------------------------------------------------------------

describe("MirrorEngine (TG-to-osai): receiveMessage", () => {
  let sender: TelegramSender & { callHistory: Array<{ chatId: number; text: string }> };
  let injector: GatewayInjector & { callHistory: Array<{ chatId: string; text: string; source: string }> };
  let engine: MirrorEngine;

  beforeEach(async () => {
    sender = createMockSender();
    injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
    };

    engine = new MirrorEngine(config);
    await engine.start();
  });

  it("should inject an incoming Telegram message into Agent Runtime", async () => {
    const msg = createTelegramMessage();
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
    const call = injector.callHistory[0]!;
    expect(call).toBeDefined();
    expect(call.chatId).toBe("osai-chat-1");
    expect(call.text).toBe("Hello from Telegram");
    expect(call.source).toBe("telegram-mirror");
  });

  it("should pass telegramMessageId to the injector", async () => {
    const msg = createTelegramMessage({ message_id: 42 });
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramMessageId: 42,
      }),
    );
  });

  it("should pass telegramUserId to the injector", async () => {
    const msg = createTelegramMessage({ from: { id: 999, username: "alice" } });
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramUserId: 999,
      }),
    );
  });

  it("should pass telegramChatId to the injector", async () => {
    const msg = createTelegramMessage();
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramChatId: -1001234567890,
      }),
    );
  });

  it("should convert Telegram HTML to Markdown before injection", async () => {
    const msg = createTelegramMessage({ text: "<b>Hello</b> from <i>Telegram</i>" });
    await engine.receiveMessage(msg, injector);

    const call = injector.callHistory[0]!;
    expect(call.text).toBe("**Hello** from *Telegram*");
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- TG-to-osai: deduplication
// ---------------------------------------------------------------------------

describe("MirrorEngine (TG-to-osai): deduplication", () => {
  let sender: TelegramSender & { callHistory: Array<{ chatId: number; text: string }> };
  let injector: GatewayInjector & { callHistory: Array<{ chatId: string; text: string; source: string }> };
  let engine: MirrorEngine;

  beforeEach(async () => {
    sender = createMockSender();
    injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
    };

    engine = new MirrorEngine(config);
    await engine.start();
  });

  it("should not process the same message_id twice", async () => {
    const msg = createTelegramMessage({ message_id: 1 });

    await engine.receiveMessage(msg, injector);
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
  });

  it("should process messages with different message_ids", async () => {
    const msg1 = createTelegramMessage({ message_id: 1 });
    const msg2 = createTelegramMessage({ message_id: 2 });

    await engine.receiveMessage(msg1, injector);
    await engine.receiveMessage(msg2, injector);

    expect(injector.injectMessage).toHaveBeenCalledTimes(2);
  });

  it("should not process the same message_id across different mirrors", async () => {
    const config: MirrorEngineConfig = {
      mirrors: [
        createMirrorConfig({ direction: "tg-to-osai", telegramChatId: -100111 }),
        createMirrorConfig({ direction: "tg-to-osai", telegramChatId: -100222, chatId: "osai-chat-2" }),
      ],
      sender,
      logger: createTestLogger(),
    };

    const multiEngine = new MirrorEngine(config);
    await multiEngine.start();

    // Same message_id from same source should not be processed twice
    const msg = createTelegramMessage({ message_id: 1, chat: { id: -100111 } });
    await multiEngine.receiveMessage(msg, injector);
    await multiEngine.receiveMessage(msg, injector);

    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
  });

  it("should reset deduplication set after stop/start cycle", async () => {
    const msg = createTelegramMessage({ message_id: 1 });

    await engine.receiveMessage(msg, injector);
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);

    await engine.stop();
    await engine.start();

    await engine.receiveMessage(msg, injector);
    // After restart, the dedup set is reset, but this is acceptable behavior
    // since the set is in-memory. The important thing is within a session.
    expect(injector.injectMessage).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- TG-to-osai: no matching mirror
// ---------------------------------------------------------------------------

describe("MirrorEngine (TG-to-osai): no matching mirror", () => {
  it("should not inject message if no mirror matches the Telegram chat ID", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai", telegramChatId: -100999 })],
      sender,
      logger: createTestLogger(),
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    // Message from a different chat
    const msg = createTelegramMessage({ chat: { id: -100888 } });
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).not.toHaveBeenCalled();
  });

  it("should not inject message if mirror direction is osai-to-tg only", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "osai-to-tg" })],
      sender,
      logger: createTestLogger(),
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    const msg = createTelegramMessage();
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- TG-to-osai: "both" direction
// ---------------------------------------------------------------------------

describe("MirrorEngine (TG-to-osai): both direction", () => {
  it("should inject incoming TG message when direction is 'both'", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      logger: createTestLogger(),
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    const msg = createTelegramMessage();
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- TG-to-osai: error handling
// ---------------------------------------------------------------------------

describe("MirrorEngine (TG-to-osai): error handling", () => {
  it("should log error when injection fails but not throw", async () => {
    const sender = createMockSender();
    const injector = createMockInjector(true); // will fail

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    const msg = createTelegramMessage();

    // Should not throw
    await expect(engine.receiveMessage(msg, injector)).resolves.toBeUndefined();

    // But the injector was called
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
  });

  it("should not inject message when engine is not started", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
    };

    const engine = new MirrorEngine(config);
    // Not started

    const msg = createTelegramMessage();
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).not.toHaveBeenCalled();
  });

  it("should handle message with no text gracefully", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    const msg = createTelegramMessage({ text: undefined });
    await engine.receiveMessage(msg, injector);

    // Empty/undefined text messages are silently dropped
    expect(injector.injectMessage).not.toHaveBeenCalled();
  });

  it("should handle message with no from field", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    const msg = createTelegramMessage({ from: undefined });
    await engine.receiveMessage(msg, injector);

    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- TG-to-osai: on_mirror_message hook
// ---------------------------------------------------------------------------

describe("MirrorEngine (TG-to-osai): on_mirror_message hook", () => {
  it("should invoke on_mirror_message hook for incoming TG messages", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();
    const hookCalls: Array<Record<string, unknown>> = [];

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: (event) => {
        hookCalls.push(event as unknown as Record<string, unknown>);
      },
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    const msg = createTelegramMessage({ text: "<b>Hello</b>" });
    await engine.receiveMessage(msg, injector);

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]).toMatchObject({
      direction: "tg-to-osai",
      osaiChatId: "osai-chat-1",
      telegramChatId: -1001234567890,
      success: true,
    });
  });

  it("should invoke hook with failure status when injection fails", async () => {
    const sender = createMockSender();
    const injector = createMockInjector(true);
    const hookCalls: Array<Record<string, unknown>> = [];

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
      onMirrorMessage: (event) => {
        hookCalls.push(event as unknown as Record<string, unknown>);
      },
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    const msg = createTelegramMessage();
    await engine.receiveMessage(msg, injector);

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]).toMatchObject({
      success: false,
    });
    expect(hookCalls[0]).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// MirrorEngine -- getProcessedMessageIds (introspection)
// ---------------------------------------------------------------------------

describe("MirrorEngine (TG-to-osai): introspection", () => {
  it("should track processed message IDs", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      logger: createTestLogger(),
    };

    const engine = new MirrorEngine(config);
    await engine.start();

    const msg1 = createTelegramMessage({ message_id: 1 });
    const msg2 = createTelegramMessage({ message_id: 2 });

    await engine.receiveMessage(msg1, injector);
    await engine.receiveMessage(msg2, injector);

    const processedIds = engine.getProcessedMessageIds();
    expect(processedIds).toContain(1);
    expect(processedIds).toContain(2);
    expect(processedIds).toHaveLength(2);
  });
});
