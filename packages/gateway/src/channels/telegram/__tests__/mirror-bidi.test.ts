// ---------------------------------------------------------------------------
// MirrorEngine Tests -- Bidirectional Sync + Config (T-008)
//
// Test cases from roadmap (section T-008):
//   - Full bidirectional sync (osai <-> TG)
//   - Direction configuration: both | osai-to-tg | tg-to-osai
//   - Media handling (best-effort): download -> pass to osaI
//   - Mirror binding to specific osaI chat_id via configuration
//   - Multiple mirrors
//   - Mirror loop prevention (dedup by message_id)
//   - Lifecycle for bidirectional engine
//   - Hook invocation for both directions
//   - Edge cases: media download failure, no text in media message
//
// All tests mock Telegram API and Gateway (no real calls).
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MirrorEngine,
  MirrorEngineError,
  markdownToTelegramHtml,
  telegramHtmlToMarkdown,
  type MirrorEngineConfig,
  type MirrorMessageEvent,
  type TelegramSender,
  type IncomingTelegramMessage,
  type GatewayInjector,
  type MediaDownloader,
  type TelegramMediaMessage,
  type TelegramMediaInfo,
  type MirrorEngineStats,
} from "../mirror.js";
import type {
  MirrorConfig,
  MirrorDirection,
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
function createMockSender(
  shouldFail = false,
  failOnRetry = false,
): TelegramSender & { callHistory: Array<{ chatId: number; text: string }> } {
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

/** Create a mock GatewayInjector. */
function createMockInjector(
  shouldFail = false,
): GatewayInjector & {
  callHistory: Array<{
    chatId: string;
    text: string;
    source: string;
    mediaAttachment?: { buffer: Buffer; filename: string; mimeType: string };
  }>;
} {
  const callHistory: Array<{
    chatId: string;
    text: string;
    source: string;
    mediaAttachment?: { buffer: Buffer; filename: string; mimeType: string };
  }> = [];

  const injector: GatewayInjector & {
    callHistory: Array<{
      chatId: string;
      text: string;
      source: string;
      mediaAttachment?: { buffer: Buffer; filename: string; mimeType: string };
    }>;
  } = {
    callHistory,
    injectMessage: vi.fn(async (params): Promise<void> => {
      callHistory.push({
        chatId: params.chatId,
        text: params.text,
        source: params.source,
        mediaAttachment: params.mediaAttachment
          ? {
              buffer: params.mediaAttachment.buffer,
              filename: params.mediaAttachment.filename,
              mimeType: params.mediaAttachment.mimeType,
            }
          : undefined,
      });

      if (shouldFail) {
        throw new Error("Agent Runtime injection failed");
      }
    }),
  };

  return injector;
}

/** Create a mock MediaDownloader. */
function createMockMediaDownloader(
  shouldFail = false,
  mediaBuffer = Buffer.from("fake-media-content"),
): MediaDownloader & { downloadCallCount: number; lastFileId: string | undefined } {
  let downloadCallCount = 0;
  let lastFileId: string | undefined;

  const downloader: MediaDownloader & {
    downloadCallCount: number;
    lastFileId: string | undefined;
  } = {
    downloadCallCount: 0,
    lastFileId: undefined,
    downloadMedia: vi.fn(async (fileId: string, _maxSize: number): Promise<Buffer | null> => {
      downloadCallCount++;
      lastFileId = fileId;

      if (shouldFail) {
        return null;
      }

      return mediaBuffer;
    }),
  };

  return downloader;
}

/** Create a default mirror configuration. */
function createMirrorConfig(overrides: Partial<MirrorConfig> = {}): MirrorConfig {
  return {
    chatId: "osai-chat-1",
    telegramChatId: -1001234567890,
    direction: "both",
    ...overrides,
  };
}

/** Create a default incoming Telegram message. */
function createTelegramMessage(
  overrides: Partial<IncomingTelegramMessage> = {},
): IncomingTelegramMessage {
  return {
    message_id: 1,
    chat: { id: -1001234567890 },
    from: { id: 12345, first_name: "Test", username: "testuser" },
    text: "Hello from Telegram",
    date: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

/** Create a Telegram message with media (photo). */
function createMediaTelegramMessage(
  overrides: Partial<TelegramMediaMessage> = {},
): TelegramMediaMessage {
  return {
    message_id: 1,
    chat: { id: -1001234567890 },
    from: { id: 12345, first_name: "Test", username: "testuser" },
    text: "Look at this photo",
    date: Math.floor(Date.now() / 1000),
    photo: {
      fileId: "AgACAgIAAxkBAAI",
      width: 800,
      height: 600,
      fileSize: 45000,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Bidirectional sync: osai-to-TG + TG-to-osai
// ---------------------------------------------------------------------------

describe("MirrorEngine bidirectional sync (T-008)", () => {
  let sender: ReturnType<typeof createMockSender>;
  let injector: ReturnType<typeof createMockInjector>;
  let engine: MirrorEngine;

  beforeEach(async () => {
    sender = createMockSender();
    injector = createMockInjector();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    };

    engine = new MirrorEngine(config);
    await engine.start();
  });

  it("should deliver osai-to-TG message", async () => {
    const results = await engine.mirror("osai-chat-1", "Hello from osaI");

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.telegramChatId).toBe(-1001234567890);
    expect(sender.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("should receive TG-to-osai message", async () => {
    const msg = createTelegramMessage({ message_id: 10 });
    await engine.receiveMessage(msg);

    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
    const call = injector.callHistory[0]!;
    expect(call.chatId).toBe("osai-chat-1");
    expect(call.text).toBe("Hello from Telegram");
    expect(call.source).toBe("telegram-mirror");
  });

  it("should handle full bidirectional flow: TG msg -> osaI response -> TG delivery", async () => {
    // Step 1: Receive TG message
    const incomingMsg = createTelegramMessage({ message_id: 20, text: "What is the weather?" });
    await engine.receiveMessage(incomingMsg);
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);

    // Step 2: osaI responds
    const responseResults = await engine.mirror("osai-chat-1", "The weather is sunny.");
    expect(responseResults).toHaveLength(1);
    expect(responseResults[0]!.success).toBe(true);
    expect(sender.sendMessage).toHaveBeenCalledTimes(1);

    // Verify full roundtrip
    expect(injector.callHistory[0]!.text).toBe("What is the weather?");
    expect(sender.callHistory[0]!.text).toBe("The weather is sunny.");
  });

  it("should support multiple mirrors with different directions", async () => {
    const multiEngine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "chat-alpha",
          telegramChatId: -1001111111111,
          direction: "osai-to-tg",
        }),
        createMirrorConfig({
          chatId: "chat-beta",
          telegramChatId: -1002222222222,
          direction: "tg-to-osai",
        }),
        createMirrorConfig({
          chatId: "chat-gamma",
          telegramChatId: -1003333333333,
          direction: "both",
        }),
      ],
      sender,
      injector,
      logger: createTestLogger(),
    });

    await multiEngine.start();

    // osai-to-TG: should target chat-alpha and chat-gamma
    const outResults = await multiEngine.mirror("chat-alpha", "Outbound");
    expect(outResults).toHaveLength(1);

    const outResultsGamma = await multiEngine.mirror("chat-gamma", "Outbound gamma");
    expect(outResultsGamma).toHaveLength(1);

    // chat-beta has tg-to-osai only, so mirror() should not target it
    const outResultsBeta = await multiEngine.mirror("chat-beta", "Should not send");
    expect(outResultsBeta).toHaveLength(0);

    // TG-to-osai: should target chat-beta and chat-gamma
    const tgMsgBeta = createTelegramMessage({
      message_id: 100,
      chat: { id: -1002222222222 },
    });
    await multiEngine.receiveMessage(tgMsgBeta);
    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-beta" }),
    );

    const tgMsgGamma = createTelegramMessage({
      message_id: 101,
      chat: { id: -1003333333333 },
    });
    await multiEngine.receiveMessage(tgMsgGamma);
    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-gamma" }),
    );

    // chat-alpha has osai-to-tg only, so receiveMessage should not inject for it
    const tgMsgAlpha = createTelegramMessage({
      message_id: 102,
      chat: { id: -1001111111111 },
    });
    await multiEngine.receiveMessage(tgMsgAlpha);
    expect(injector.injectMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-alpha" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Direction configuration
// ---------------------------------------------------------------------------

describe("MirrorEngine direction configuration (T-008)", () => {
  it("should only send osai-to-TG when direction is 'osai-to-tg'", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "osai-to-tg" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // osai-to-TG should work
    const results = await engine.mirror("osai-chat-1", "Outbound");
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);

    // TG-to-osai should not work
    const msg = createTelegramMessage({ message_id: 1 });
    await engine.receiveMessage(msg);
    expect(injector.injectMessage).not.toHaveBeenCalled();
  });

  it("should only receive TG-to-osai when direction is 'tg-to-osai'", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // osai-to-TG should not work
    const results = await engine.mirror("osai-chat-1", "Outbound");
    expect(results).toHaveLength(0);

    // TG-to-osai should work
    const msg = createTelegramMessage({ message_id: 1 });
    await engine.receiveMessage(msg);
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
  });

  it("should support both directions when direction is 'both'", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // osai-to-TG
    const outResults = await engine.mirror("osai-chat-1", "Outbound");
    expect(outResults).toHaveLength(1);

    // TG-to-osai
    const msg = createTelegramMessage({ message_id: 1 });
    await engine.receiveMessage(msg);
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);

    // Verify active mirror counts
    expect(engine.getActiveMirrors()).toHaveLength(1); // osai-to-tg side
    expect(engine.getActiveMirrorsIn()).toHaveLength(1); // tg-to-osai side
  });

  it("should reflect correct active mirror counts per direction", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({ chatId: "c1", direction: "osai-to-tg" }),
        createMirrorConfig({ chatId: "c2", direction: "tg-to-osai" }),
        createMirrorConfig({ chatId: "c3", direction: "both" }),
        createMirrorConfig({ chatId: "c4", direction: "osai-to-tg" }),
        createMirrorConfig({ chatId: "c5", direction: "tg-to-osai" }),
      ],
      sender,
      injector,
      logger: createTestLogger(),
    });

    await engine.start();

    // osai-to-tg: c1, c3, c4 (3 mirrors)
    expect(engine.getActiveMirrors()).toHaveLength(3);
    expect(engine.getActiveMirrors().map((m) => m.chatId).sort()).toEqual(["c1", "c3", "c4"]);

    // tg-to-osai: c2, c3, c5 (3 mirrors)
    expect(engine.getActiveMirrorsIn()).toHaveLength(3);
    expect(engine.getActiveMirrorsIn().map((m) => m.chatId).sort()).toEqual(["c2", "c3", "c5"]);
  });
});

// ---------------------------------------------------------------------------
// Media handling (best-effort)
// ---------------------------------------------------------------------------

describe("MirrorEngine media handling (T-008)", () => {
  let sender: ReturnType<typeof createMockSender>;
  let injector: ReturnType<typeof createMockInjector>;
  let downloader: ReturnType<typeof createMockMediaDownloader>;
  let engine: MirrorEngine;

  beforeEach(async () => {
    sender = createMockSender();
    injector = createMockInjector();
    downloader = createMockMediaDownloader();

    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      mediaDownloader: downloader,
      logger: createTestLogger(),
    };

    engine = new MirrorEngine(config);
    await engine.start();
  });

  it("should download media and pass buffer to injector", async () => {
    const mediaMsg = createMediaTelegramMessage({ message_id: 50 });
    await engine.receiveMessage(mediaMsg);

    expect(downloader.downloadMedia).toHaveBeenCalledTimes(1);
    expect(downloader.downloadMedia).toHaveBeenCalledWith("AgACAgIAAxkBAAI", expect.any(Number));
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);

    const call = injector.callHistory[0]!;
    expect(call.mediaAttachment).toBeDefined();
    expect(call.mediaAttachment!.buffer).toEqual(Buffer.from("fake-media-content"));
    expect(call.mediaAttachment!.filename).toContain("photo");
    expect(call.mediaAttachment!.mimeType).toBe("image/jpeg");
  });

  it("should inject text along with media attachment", async () => {
    const mediaMsg = createMediaTelegramMessage({
      message_id: 51,
      text: "Caption for photo",
    });
    await engine.receiveMessage(mediaMsg);

    const call = injector.callHistory[0]!;
    expect(call.text).toBe("Caption for photo");
    expect(call.mediaAttachment).toBeDefined();
  });

  it("should handle media download failure gracefully (best-effort)", async () => {
    const failDownloader = createMockMediaDownloader(true);
    const failEngine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      mediaDownloader: failDownloader,
      logger: createTestLogger(),
    });
    await failEngine.start();

    const mediaMsg = createMediaTelegramMessage({ message_id: 52 });
    await failEngine.receiveMessage(mediaMsg);

    // Message should still be injected, but without media
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
    const call = injector.callHistory[0]!;
    expect(call.mediaAttachment).toBeUndefined();
  });

  it("should handle message with no text and only media", async () => {
    const mediaMsg = createMediaTelegramMessage({
      message_id: 53,
      text: undefined,
    });
    await engine.receiveMessage(mediaMsg);

    // Should still inject (media-only messages are valid)
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
    const call = injector.callHistory[0]!;
    expect(call.text).toBe("[media: photo]");
    expect(call.mediaAttachment).toBeDefined();
  });

  it("should deduplicate media messages by message_id", async () => {
    const mediaMsg = createMediaTelegramMessage({ message_id: 54 });

    await engine.receiveMessage(mediaMsg);
    await engine.receiveMessage(mediaMsg);

    expect(downloader.downloadMedia).toHaveBeenCalledTimes(1);
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
  });

  it("should respect maxMediaSize limit", async () => {
    const strictDownloader = createMockMediaDownloader(false);
    const config: MirrorEngineConfig = {
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      mediaDownloader: strictDownloader,
      maxMediaSize: 1024, // 1 KB limit
      logger: createTestLogger(),
    };

    const sizeAwareEngine = new MirrorEngine(config);
    await sizeAwareEngine.start();

    const mediaMsg = createMediaTelegramMessage({ message_id: 55 });
    await sizeAwareEngine.receiveMessage(mediaMsg);

    expect(strictDownloader.downloadMedia).toHaveBeenCalledWith("AgACAgIAAxkBAAI", 1024);
  });

  it("should pass no text-only message without mediaDownloader", async () => {
    const noMediaEngine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      // No mediaDownloader
      logger: createTestLogger(),
    });
    await noMediaEngine.start();

    const textMsg = createTelegramMessage({ message_id: 56 });
    await noMediaEngine.receiveMessage(textMsg);

    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
    const call = injector.callHistory[0]!;
    expect(call.text).toBe("Hello from Telegram");
    expect(call.mediaAttachment).toBeUndefined();
  });

  it("should handle media message without mediaDownloader gracefully", async () => {
    const noMediaEngine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      // No mediaDownloader
      logger: createTestLogger(),
    });
    await noMediaEngine.start();

    const mediaMsg = createMediaTelegramMessage({ message_id: 57 });
    await noMediaEngine.receiveMessage(mediaMsg);

    // Should inject text, but without media attachment
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
    const call = injector.callHistory[0]!;
    expect(call.text).toBe("Look at this photo");
    expect(call.mediaAttachment).toBeUndefined();
  });

  it("should invoke on_mirror_message hook for media messages", async () => {
    const hookCalls: MirrorMessageEvent[] = [];
    const hookEngine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      mediaDownloader: downloader,
      logger: createTestLogger(),
      onMirrorMessage: (event) => hookCalls.push(event),
    });
    await hookEngine.start();

    const mediaMsg = createMediaTelegramMessage({ message_id: 58 });
    await hookEngine.receiveMessage(mediaMsg);

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]).toMatchObject({
      direction: "both",
      osaiChatId: "osai-chat-1",
      telegramChatId: -1001234567890,
      success: true,
      hasMedia: true,
    });
  });

  it("should generate appropriate filename for different media types", async () => {
    // Document media
    const docMsg = createMediaTelegramMessage({
      message_id: 59,
      text: undefined,
      photo: undefined,
      document: {
        fileId: "BQACAgIAAxkBAAJ",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 120000,
      },
    });

    await engine.receiveMessage(docMsg);

    const call = injector.callHistory[0]!;
    expect(call.mediaAttachment).toBeDefined();
    expect(call.mediaAttachment!.filename).toBe("report.pdf");
    expect(call.mediaAttachment!.mimeType).toBe("application/pdf");
  });

  it("should handle null return from mediaDownloader gracefully", async () => {
    const nullDownloader = createMockMediaDownloader(true); // returns null
    const nullEngine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      mediaDownloader: nullDownloader,
      logger: createTestLogger(),
    });
    await nullEngine.start();

    const mediaMsg = createMediaTelegramMessage({ message_id: 60 });
    await nullEngine.receiveMessage(mediaMsg);

    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
    const call = injector.callHistory[0]!;
    expect(call.mediaAttachment).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mirror binding to osaI chat_id via configuration
// ---------------------------------------------------------------------------

describe("MirrorEngine osaI chat_id binding (T-008)", () => {
  it("should only mirror to the configured osaI chat_id", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "osai-chat-target",
          telegramChatId: -1001111111111,
          direction: "both",
        }),
      ],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // mirror() with correct chatId
    const results = await engine.mirror("osai-chat-target", "Correct chat");
    expect(results).toHaveLength(1);

    // mirror() with wrong chatId
    const noResults = await engine.mirror("wrong-chat-id", "Wrong chat");
    expect(noResults).toHaveLength(0);
  });

  it("should inject TG messages to the correct osaI chat_id", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "osai-dest-alpha",
          telegramChatId: -1001111111111,
          direction: "both",
        }),
        createMirrorConfig({
          chatId: "osai-dest-beta",
          telegramChatId: -1002222222222,
          direction: "both",
        }),
      ],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // TG message from chat -1001111111111 -> osai-dest-alpha
    const msgAlpha = createTelegramMessage({
      message_id: 70,
      chat: { id: -1001111111111 },
    });
    await engine.receiveMessage(msgAlpha);
    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "osai-dest-alpha" }),
    );

    // TG message from chat -1002222222222 -> osai-dest-beta
    const msgBeta = createTelegramMessage({
      message_id: 71,
      chat: { id: -1002222222222 },
    });
    await engine.receiveMessage(msgBeta);
    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "osai-dest-beta" }),
    );

    // TG message from unknown chat -> no injection
    const msgUnknown = createTelegramMessage({
      message_id: 72,
      chat: { id: -1009999999999 },
    });
    await engine.receiveMessage(msgUnknown);
    expect(injector.injectMessage).toHaveBeenCalledTimes(2); // Only alpha and beta
  });

  it("should map same TG chat to multiple osaI chats (fan-out)", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "osai-dest-1",
          telegramChatId: -1001111111111,
          direction: "tg-to-osai",
        }),
        createMirrorConfig({
          chatId: "osai-dest-2",
          telegramChatId: -1001111111111,
          direction: "tg-to-osai",
        }),
      ],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    const msg = createTelegramMessage({
      message_id: 73,
      chat: { id: -1001111111111 },
    });
    await engine.receiveMessage(msg);

    expect(injector.injectMessage).toHaveBeenCalledTimes(2);
    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "osai-dest-1" }),
    );
    expect(injector.injectMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "osai-dest-2" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Mirror loop prevention (dedup by message_id)
// ---------------------------------------------------------------------------

describe("MirrorEngine loop prevention (T-008)", () => {
  it("should not create a loop when osaI response mirrors back to TG and TG echoes", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // Simulate a message arriving from TG
    const tgMsg = createTelegramMessage({ message_id: 80, text: "Original TG message" });
    await engine.receiveMessage(tgMsg);
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);

    // Simulate the same message being re-delivered (e.g., bot echo)
    await engine.receiveMessage(tgMsg);
    expect(injector.injectMessage).toHaveBeenCalledTimes(1); // Still 1, dedup worked

    // osaI responds -> mirror to TG
    await engine.mirror("osai-chat-1", "osaI response");
    expect(sender.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("should prevent processing duplicate message_id across multiple mirrors", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "osai-a",
          telegramChatId: -1001111111111,
          direction: "tg-to-osai",
        }),
        createMirrorConfig({
          chatId: "osai-b",
          telegramChatId: -1001111111111,
          direction: "tg-to-osai",
        }),
      ],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    const msg = createTelegramMessage({
      message_id: 81,
      chat: { id: -1001111111111 },
    });

    // First call: message processed for both mirrors
    await engine.receiveMessage(msg);
    expect(injector.injectMessage).toHaveBeenCalledTimes(2); // osai-a and osai-b

    // Second call with same message_id: dedup prevents reprocessing
    await engine.receiveMessage(msg);
    expect(injector.injectMessage).toHaveBeenCalledTimes(2); // Still 2
  });

  it("should track all processed message IDs for introspection", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    await engine.receiveMessage(createTelegramMessage({ message_id: 90 }));
    await engine.receiveMessage(createTelegramMessage({ message_id: 91 }));
    await engine.receiveMessage(createTelegramMessage({ message_id: 92 }));

    const processedIds = engine.getProcessedMessageIds();
    expect(processedIds).toContain(90);
    expect(processedIds).toContain(91);
    expect(processedIds).toContain(92);
    expect(processedIds).toHaveLength(3);
  });

  it("should clear dedup set on stop/start cycle", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    await engine.receiveMessage(createTelegramMessage({ message_id: 95 }));
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);

    await engine.stop();
    await engine.start();

    // Same message_id can be processed again after restart
    await engine.receiveMessage(createTelegramMessage({ message_id: 95 }));
    expect(injector.injectMessage).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Bidirectional hook invocation
// ---------------------------------------------------------------------------

describe("MirrorEngine bidirectional hook (T-008)", () => {
  it("should invoke hook for osai-to-TG direction with correct event", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();
    const hookCalls: MirrorMessageEvent[] = [];

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
      onMirrorMessage: (event) => hookCalls.push(event),
    });
    await engine.start();

    await engine.mirror("osai-chat-1", "**Bold** text");

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]).toMatchObject({
      direction: "both",
      osaiChatId: "osai-chat-1",
      telegramChatId: -1001234567890,
      originalText: "**Bold** text",
      formattedText: "<b>Bold</b> text",
      success: true,
      hasMedia: false,
    });
  });

  it("should invoke hook for TG-to-osai direction with correct event", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();
    const hookCalls: MirrorMessageEvent[] = [];

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
      onMirrorMessage: (event) => hookCalls.push(event),
    });
    await engine.start();

    const msg = createTelegramMessage({ message_id: 110, text: "<b>Hello</b> TG" });
    await engine.receiveMessage(msg);

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]).toMatchObject({
      direction: "both",
      osaiChatId: "osai-chat-1",
      telegramChatId: -1001234567890,
      originalText: "<b>Hello</b> TG",
      formattedText: "**Hello** TG",
      success: true,
      hasMedia: false,
    });
  });

  it("should invoke hooks for both directions in a full roundtrip", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();
    const hookCalls: MirrorMessageEvent[] = [];

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
      onMirrorMessage: (event) => hookCalls.push(event),
    });
    await engine.start();

    // TG -> osaI
    const tgMsg = createTelegramMessage({ message_id: 120, text: "User question" });
    await engine.receiveMessage(tgMsg);

    // osaI -> TG
    await engine.mirror("osai-chat-1", "Agent answer");

    expect(hookCalls).toHaveLength(2);
    // First hook: TG-to-osai
    expect(hookCalls[0]).toMatchObject({
      originalText: "User question",
      success: true,
    });
    // Second hook: osai-to-TG
    expect(hookCalls[1]).toMatchObject({
      originalText: "Agent answer",
      success: true,
    });
  });
});

// ---------------------------------------------------------------------------
// MirrorEngineStats
// ---------------------------------------------------------------------------

describe("MirrorEngine stats (T-008)", () => {
  it("should return stats with correct counts", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [
        createMirrorConfig({
          chatId: "c1",
          telegramChatId: -1001111111111,
          direction: "osai-to-tg",
        }),
        createMirrorConfig({
          chatId: "c2",
          telegramChatId: -1002222222222,
          direction: "tg-to-osai",
        }),
        createMirrorConfig({
          chatId: "c3",
          telegramChatId: -1003333333333,
          direction: "both",
        }),
      ],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    const stats = engine.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalMirrors).toBe(3);
    expect(stats.activeMirrorsOut).toBe(2); // c1, c3
    expect(stats.activeMirrorsIn).toBe(2); // c2, c3
    expect(stats.processedMessageCount).toBe(0);

    // Process some messages
    await engine.mirror("c1", "test");
    await engine.receiveMessage(createTelegramMessage({ message_id: 1, chat: { id: -1002222222222 } }));

    const statsAfter = engine.getStats();
    expect(statsAfter.processedMessageCount).toBe(1);
    expect(statsAfter.started).toBe(true);
  });

  it("should track media download attempts", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();
    const downloader = createMockMediaDownloader();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      mediaDownloader: downloader,
      logger: createTestLogger(),
    });
    await engine.start();

    await engine.receiveMessage(createMediaTelegramMessage({ message_id: 200 }));

    const stats = engine.getStats();
    expect(stats.mediaDownloadAttempts).toBe(1);
    expect(stats.mediaDownloadSuccesses).toBe(1);

    // Failed download
    const failDownloader = createMockMediaDownloader(true);
    const failEngine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      mediaDownloader: failDownloader,
      logger: createTestLogger(),
    });
    await failEngine.start();

    await failEngine.receiveMessage(createMediaTelegramMessage({ message_id: 201 }));

    const failStats = failEngine.getStats();
    expect(failStats.mediaDownloadAttempts).toBe(1);
    expect(failStats.mediaDownloadSuccesses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle bidirectional
// ---------------------------------------------------------------------------

describe("MirrorEngine lifecycle bidirectional (T-008)", () => {
  it("should start and stop bidirectional engine cleanly", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });

    await expect(engine.start()).resolves.not.toThrow();
    expect(engine.isStarted()).toBe(true);

    await expect(engine.stop()).resolves.not.toThrow();
    expect(engine.isStarted()).toBe(false);
  });

  it("should not accept messages when stopped", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();
    await engine.stop();

    // osai-to-TG should be dropped
    const outResults = await engine.mirror("osai-chat-1", "Dropped");
    expect(outResults).toHaveLength(0);

    // TG-to-osai should be dropped
    const msg = createTelegramMessage({ message_id: 1 });
    await engine.receiveMessage(msg);
    expect(injector.injectMessage).not.toHaveBeenCalled();
  });

  it("should handle start-stop-start cycle without errors", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });

    await engine.start();
    await engine.receiveMessage(createTelegramMessage({ message_id: 300 }));
    await engine.stop();
    await engine.start();
    await engine.receiveMessage(createTelegramMessage({ message_id: 301 }));

    // Both messages should be processed (dedup reset after stop/start)
    expect(injector.injectMessage).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Bidirectional formatting (end-to-end)
// ---------------------------------------------------------------------------

describe("MirrorEngine bidirectional formatting (T-008)", () => {
  it("should preserve formatting through full roundtrip", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // TG message with HTML -> Markdown -> osaI
    const tgMsg = createTelegramMessage({
      message_id: 400,
      text: "<b>Bold</b> and <i>italic</i>",
    });
    await engine.receiveMessage(tgMsg);

    // Verify HTML was converted to Markdown
    const injectedText = injector.callHistory[0]!.text;
    expect(injectedText).toBe("**Bold** and *italic*");

    // osaI response with Markdown -> HTML -> TG
    await engine.mirror("osai-chat-1", "**Agent** response with `code`");

    // Verify Markdown was converted to HTML
    expect(sender.callHistory[0]!.text).toBe("<b>Agent</b> response with <code>code</code>");
  });

  it("should handle code blocks bidirectionally", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // TG -> osaI: HTML pre/code -> Markdown fenced code
    const tgMsg = createTelegramMessage({
      message_id: 401,
      text: '<pre><code class="language-python">print("hi")</code></pre>',
    });
    await engine.receiveMessage(tgMsg);
    expect(injector.callHistory[0]!.text).toContain("```");
    expect(injector.callHistory[0]!.text).toContain('print("hi")');

    // osaI -> TG: Markdown fenced code -> HTML pre/code
    await engine.mirror("osai-chat-1", "```js\nconsole.log('test');\n```");
    expect(sender.callHistory[0]!.text).toContain("<pre>");
    expect(sender.callHistory[0]!.text).toContain("console.log");
  });
});

// ---------------------------------------------------------------------------
// Error scenarios specific to bidirectional
// ---------------------------------------------------------------------------

describe("MirrorEngine bidirectional error handling (T-008)", () => {
  it("should handle injection failure without affecting outbound mirror", async () => {
    const sender = createMockSender();
    const failInjector = createMockInjector(true);

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector: failInjector,
      logger: createTestLogger(),
    });
    await engine.start();

    // TG-to-osai: injection fails
    const tgMsg = createTelegramMessage({ message_id: 500 });
    await engine.receiveMessage(tgMsg);
    // No throw

    // osai-to-TG: should still work
    const results = await engine.mirror("osai-chat-1", "Still works");
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
  });

  it("should handle sender failure without affecting inbound injection", async () => {
    const failSender = createMockSender(true);
    const injector = createMockInjector();

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender: failSender,
      injector,
      logger: createTestLogger(),
    });
    await engine.start();

    // osai-to-TG: sender fails
    const results = await engine.mirror("osai-chat-1", "Will fail");
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    // No throw

    // TG-to-osai: should still work
    const tgMsg = createTelegramMessage({ message_id: 501 });
    await engine.receiveMessage(tgMsg);
    expect(injector.injectMessage).toHaveBeenCalledTimes(1);
  });

  it("should handle both directions failing simultaneously", async () => {
    const failSender = createMockSender(true);
    const failInjector = createMockInjector(true);

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender: failSender,
      injector: failInjector,
      logger: createTestLogger(),
    });
    await engine.start();

    // Both fail, but no crash
    const outResults = await engine.mirror("osai-chat-1", "Fail outbound");
    expect(outResults).toHaveLength(1);
    expect(outResults[0]!.success).toBe(false);

    const tgMsg = createTelegramMessage({ message_id: 502 });
    await engine.receiveMessage(tgMsg);
    expect(failInjector.injectMessage).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// MirrorMessageEvent hasMedia field
// ---------------------------------------------------------------------------

describe("MirrorMessageEvent hasMedia field (T-008)", () => {
  it("should set hasMedia=false for text-only TG-to-osai messages", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();
    const hookCalls: MirrorMessageEvent[] = [];

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
      onMirrorMessage: (event) => hookCalls.push(event),
    });
    await engine.start();

    const msg = createTelegramMessage({ message_id: 600 });
    await engine.receiveMessage(msg);

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]!.hasMedia).toBe(false);
  });

  it("should set hasMedia=true for media TG-to-osai messages", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();
    const downloader = createMockMediaDownloader();
    const hookCalls: MirrorMessageEvent[] = [];

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      mediaDownloader: downloader,
      logger: createTestLogger(),
      onMirrorMessage: (event) => hookCalls.push(event),
    });
    await engine.start();

    const mediaMsg = createMediaTelegramMessage({ message_id: 601 });
    await engine.receiveMessage(mediaMsg);

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]!.hasMedia).toBe(true);
  });

  it("should set hasMedia=false for osai-to-TG messages", async () => {
    const sender = createMockSender();
    const injector = createMockInjector();
    const hookCalls: MirrorMessageEvent[] = [];

    const engine = new MirrorEngine({
      mirrors: [createMirrorConfig({ direction: "both" })],
      sender,
      injector,
      logger: createTestLogger(),
      onMirrorMessage: (event) => hookCalls.push(event),
    });
    await engine.start();

    await engine.mirror("osai-chat-1", "Text only");

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]!.hasMedia).toBe(false);
  });
});
