// ---------------------------------------------------------------------------
// Integration Test: Mirror E2E (T-009)
//
// Full end-to-end mirror chain tests with mocked Telegram API:
//   TG message -> MirrorEngine -> Agent Runtime (mock) -> MirrorEngine -> TG response
//
// Tests the complete bidirectional mirror flow:
//   1. Incoming TG message (via bot/userbot mock)
//   2. HTML -> Markdown conversion
//   3. Injection into Agent Runtime (GatewayInjector mock)
//   4. Agent response (via TelegramSender mock)
//   5. Markdown -> HTML conversion
//   6. Delivery to Telegram chat
//
// All external services are mocked -- no real Telegram API calls.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MirrorEngine, MirrorEngineError, markdownToTelegramHtml, telegramHtmlToMarkdown, } from "../../mirror.js";
import pino from "pino";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTestLogger() {
    return pino({ level: "silent" });
}
/** Create a mock TelegramSender that records calls. */
function createMockSender(shouldFail = false) {
    const callHistory = [];
    const sender = {
        callHistory,
        sendMessage: vi.fn(async (chatId, text) => {
            callHistory.push({ chatId, text });
            if (shouldFail) {
                throw new Error("Telegram API error: chat not found");
            }
            return { ok: true, message_id: callHistory.length + 100 };
        }),
    };
    return sender;
}
/** Create a mock GatewayInjector that simulates Agent Runtime processing. */
function createMockAgent(responseText = "Agent response to user", shouldFail = false, processingDelayMs = 0) {
    const injectedMessages = [];
    const agent = {
        injectedMessages,
        injectMessage: vi.fn(async (params) => {
            injectedMessages.push({
                chatId: params.chatId,
                text: params.text,
                source: params.source,
                telegramMessageId: params.telegramMessageId,
                telegramUserId: params.telegramUserId,
                telegramChatId: params.telegramChatId,
            });
            if (processingDelayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, processingDelayMs));
            }
            if (shouldFail) {
                throw new Error("Agent Runtime injection failed");
            }
        }),
    };
    return agent;
}
/** Create a default mirror configuration. */
function createMirrorConfig(overrides = {}) {
    return {
        chatId: "osai-chat-1",
        telegramChatId: -1001234567890,
        direction: "both",
        ...overrides,
    };
}
/** Create a default incoming Telegram message. */
function createTelegramMessage(overrides = {}) {
    return {
        message_id: 1,
        chat: { id: -1001234567890 },
        from: { id: 12345, first_name: "Test", username: "testuser" },
        text: "Hello from Telegram",
        date: Math.floor(Date.now() / 1000),
        ...overrides,
    };
}
/** Create a media Telegram message. */
function createMediaMessage(overrides = {}) {
    return {
        message_id: 1,
        chat: { id: -1001234567890 },
        from: { id: 12345, first_name: "Test", username: "testuser" },
        text: "Look at this",
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
/** Create a mock MediaDownloader. */
function createMockMediaDownloader(shouldFail = false, mediaBuffer = Buffer.from("fake-media-content")) {
    let downloadCallCount = 0;
    const downloader = {
        downloadCallCount: 0,
        downloadMedia: vi.fn(async (fileId, _maxSize) => {
            downloadCallCount++;
            if (shouldFail)
                return null;
            return mediaBuffer;
        }),
    };
    return downloader;
}
// ---------------------------------------------------------------------------
// Tests: Full E2E Mirror Chain
// ---------------------------------------------------------------------------
describe("E2E: Mirror full chain (TG -> Agent -> TG)", () => {
    let sender;
    let agent;
    let engine;
    let hookCalls;
    beforeEach(async () => {
        sender = createMockSender();
        agent = createMockAgent();
        hookCalls = [];
        const config = {
            mirrors: [createMirrorConfig({ direction: "both" })],
            sender,
            injector: agent,
            logger: createTestLogger(),
            onMirrorMessage: (event) => hookCalls.push(event),
        };
        engine = new MirrorEngine(config);
        await engine.start();
    });
    // -------------------------------------------------------------------------
    // Complete roundtrip
    // -------------------------------------------------------------------------
    describe("complete roundtrip", () => {
        it("should process TG message through agent and send response", async () => {
            // Step 1: TG user sends message
            const tgMessage = createTelegramMessage({
                message_id: 100,
                text: "What is the weather today?",
            });
            // Step 2: Mirror engine receives and injects into agent
            await engine.receiveMessage(tgMessage);
            // Verify injection
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
            const injected = agent.injectedMessages[0];
            expect(injected.chatId).toBe("osai-chat-1");
            expect(injected.text).toBe("What is the weather today?");
            expect(injected.source).toBe("telegram-mirror");
            expect(injected.telegramMessageId).toBe(100);
            expect(injected.telegramUserId).toBe(12345);
            expect(injected.telegramChatId).toBe(-1001234567890);
            // Step 3: Agent responds, mirror sends to TG
            const responseResults = await engine.mirror("osai-chat-1", "The weather is sunny with 25C. Perfect for a walk!");
            // Verify TG delivery
            expect(responseResults).toHaveLength(1);
            expect(responseResults[0].success).toBe(true);
            expect(responseResults[0].telegramChatId).toBe(-1001234567890);
            expect(sender.sendMessage).toHaveBeenCalledTimes(1);
            expect(sender.callHistory[0].text).toBe("The weather is sunny with 25C. Perfect for a walk!");
        });
        it("should invoke on_mirror_message hook for both directions", async () => {
            // TG -> osaI
            await engine.receiveMessage(createTelegramMessage({ message_id: 200, text: "User question" }));
            // osaI -> TG
            await engine.mirror("osai-chat-1", "Agent answer");
            expect(hookCalls).toHaveLength(2);
            // First hook: TG-to-osai direction
            expect(hookCalls[0]).toMatchObject({
                direction: "both",
                osaiChatId: "osai-chat-1",
                telegramChatId: -1001234567890,
                originalText: "User question",
                success: true,
                hasMedia: false,
            });
            // Second hook: osai-to-TG direction
            expect(hookCalls[1]).toMatchObject({
                direction: "both",
                osaiChatId: "osai-chat-1",
                telegramChatId: -1001234567890,
                originalText: "Agent answer",
                success: true,
                hasMedia: false,
            });
        });
        it("should handle multiple messages in sequence", async () => {
            // Message 1
            await engine.receiveMessage(createTelegramMessage({ message_id: 1, text: "Hello" }));
            await engine.mirror("osai-chat-1", "Hi there!");
            // Message 2
            await engine.receiveMessage(createTelegramMessage({ message_id: 2, text: "How are you?" }));
            await engine.mirror("osai-chat-1", "I'm doing great!");
            expect(agent.injectedMessages).toHaveLength(2);
            expect(sender.callHistory).toHaveLength(2);
            expect(hookCalls).toHaveLength(4);
            // Verify order
            expect(agent.injectedMessages[0].text).toBe("Hello");
            expect(sender.callHistory[0].text).toBe("Hi there!");
            expect(agent.injectedMessages[1].text).toBe("How are you?");
            expect(sender.callHistory[1].text).toBe("I'm doing great!");
        });
    });
    // -------------------------------------------------------------------------
    // Formatting conversion roundtrip
    // -------------------------------------------------------------------------
    describe("formatting conversion", () => {
        it("should convert TG HTML to Markdown on inbound", async () => {
            await engine.receiveMessage(createTelegramMessage({
                message_id: 300,
                text: "<b>Bold</b> and <i>italic</i> text",
            }));
            const injected = agent.injectedMessages[0];
            expect(injected.text).toBe("**Bold** and *italic* text");
        });
        it("should convert Markdown to TG HTML on outbound", async () => {
            await engine.mirror("osai-chat-1", "**Bold** and *italic* text");
            expect(sender.callHistory[0].text).toBe("<b>Bold</b> and <i>italic</i> text");
        });
        it("should preserve code blocks through roundtrip", async () => {
            // TG -> osaI: HTML code -> Markdown
            await engine.receiveMessage(createTelegramMessage({
                message_id: 301,
                text: '<pre><code class="language-python">print("hi")</code></pre>',
            }));
            const injected = agent.injectedMessages[0];
            expect(injected.text).toContain("```");
            expect(injected.text).toContain('print("hi")');
            // osaI -> TG: Markdown code -> HTML
            await engine.mirror("osai-chat-1", "```js\nconsole.log('test');\n```");
            expect(sender.callHistory[0].text).toContain("<pre>");
            expect(sender.callHistory[0].text).toContain("console.log");
        });
        it("should handle links through roundtrip", async () => {
            // TG -> osaiI: HTML link -> Markdown
            await engine.receiveMessage(createTelegramMessage({
                message_id: 302,
                text: '<a href="https://example.com">click here</a>',
            }));
            const injected = agent.injectedMessages[0];
            expect(injected.text).toBe("[click here](https://example.com)");
            // osaI -> TG: Markdown link -> HTML
            await engine.mirror("osai-chat-1", "[visit](https://example.com)");
            expect(sender.callHistory[0].text).toContain('<a href="https://example.com">visit</a>');
        });
        it("should handle strikethrough and underline through roundtrip", async () => {
            // TG -> osaI
            await engine.receiveMessage(createTelegramMessage({
                message_id: 303,
                text: "<s>deleted</s> and <u>underlined</u>",
            }));
            const injected = agent.injectedMessages[0];
            expect(injected.text).toContain("~~deleted~~");
            expect(injected.text).toContain("__underlined__");
            // osaI -> TG
            await engine.mirror("osai-chat-1", "~~strike~~ and __underline__");
            expect(sender.callHistory[0].text).toContain("<s>strike</s>");
            expect(sender.callHistory[0].text).toContain("<u>underline</u>");
        });
        it("should handle blockquotes through roundtrip", async () => {
            // TG -> osaI
            await engine.receiveMessage(createTelegramMessage({
                message_id: 304,
                text: "<blockquote>This is a quote</blockquote>",
            }));
            const injected = agent.injectedMessages[0];
            expect(injected.text).toContain("> This is a quote");
            // osaI -> TG
            await engine.mirror("osai-chat-1", "> This is my quote");
            expect(sender.callHistory[0].text).toContain("<blockquote>This is my quote</blockquote>");
        });
    });
    // -------------------------------------------------------------------------
    // Deduplication prevents loops
    // -------------------------------------------------------------------------
    describe("loop prevention", () => {
        it("should not process same message_id twice", async () => {
            const msg = createTelegramMessage({ message_id: 400, text: "Original" });
            await engine.receiveMessage(msg);
            await engine.receiveMessage(msg);
            await engine.receiveMessage(msg);
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
        });
        it("should allow different message_ids", async () => {
            await engine.receiveMessage(createTelegramMessage({ message_id: 401, text: "First" }));
            await engine.receiveMessage(createTelegramMessage({ message_id: 402, text: "Second" }));
            expect(agent.injectMessage).toHaveBeenCalledTimes(2);
        });
        it("should clear dedup on engine restart", async () => {
            const msg = createTelegramMessage({ message_id: 403, text: "Restart test" });
            await engine.receiveMessage(msg);
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
            await engine.stop();
            await engine.start();
            await engine.receiveMessage(msg);
            expect(agent.injectMessage).toHaveBeenCalledTimes(2);
        });
        it("should prevent mirror loops: TG -> agent -> TG -> agent", async () => {
            // Simulate what could happen if TG echoes a message back
            const msg = createTelegramMessage({ message_id: 500, text: "Loop test" });
            // First: process the message
            await engine.receiveMessage(msg);
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
            // Simulate agent response
            await engine.mirror("osai-chat-1", "Response to loop test");
            expect(sender.sendMessage).toHaveBeenCalledTimes(1);
            // TG echoes the same message back (possible with bot API)
            await engine.receiveMessage(msg);
            expect(agent.injectMessage).toHaveBeenCalledTimes(1); // No double processing
        });
    });
    // -------------------------------------------------------------------------
    // Media in E2E chain
    // -------------------------------------------------------------------------
    describe("media E2E", () => {
        it("should download media and inject with attachment", async () => {
            const downloader = createMockMediaDownloader();
            const mediaEngine = new MirrorEngine({
                mirrors: [createMirrorConfig({ direction: "both" })],
                sender,
                injector: agent,
                mediaDownloader: downloader,
                logger: createTestLogger(),
                onMirrorMessage: (event) => hookCalls.push(event),
            });
            await mediaEngine.start();
            const mediaMsg = createMediaMessage({
                message_id: 600,
                text: "Check this photo",
            });
            await mediaEngine.receiveMessage(mediaMsg);
            expect(downloader.downloadMedia).toHaveBeenCalledTimes(1);
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
            const injected = agent.injectedMessages[0];
            expect(injected.text).toBe("Check this photo");
            expect(injected.telegramMessageId).toBe(600);
            // Verify hook includes hasMedia=true
            expect(hookCalls).toHaveLength(1);
            expect(hookCalls[0].hasMedia).toBe(true);
        });
        it("should handle media-only message (no caption)", async () => {
            const downloader = createMockMediaDownloader();
            const mediaEngine = new MirrorEngine({
                mirrors: [createMirrorConfig({ direction: "both" })],
                sender,
                injector: agent,
                mediaDownloader: downloader,
                logger: createTestLogger(),
            });
            await mediaEngine.start();
            const mediaMsg = createMediaMessage({
                message_id: 601,
                text: undefined,
            });
            await mediaEngine.receiveMessage(mediaMsg);
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
            const injected = agent.injectedMessages[0];
            expect(injected.text).toBe("[media: photo]");
        });
        it("should handle media download failure (best-effort)", async () => {
            const failDownloader = createMockMediaDownloader(true);
            const mediaEngine = new MirrorEngine({
                mirrors: [createMirrorConfig({ direction: "both" })],
                sender,
                injector: agent,
                mediaDownloader: failDownloader,
                logger: createTestLogger(),
            });
            await mediaEngine.start();
            const mediaMsg = createMediaMessage({ message_id: 602 });
            await mediaEngine.receiveMessage(mediaMsg);
            // Should still inject message, just without media
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
            expect(failDownloader.downloadMedia).toHaveBeenCalledTimes(1);
        });
    });
    // -------------------------------------------------------------------------
    // Error handling in E2E chain
    // -------------------------------------------------------------------------
    describe("error handling", () => {
        it("should continue outbound when injection fails", async () => {
            const failAgent = createMockAgent("", true);
            const errorEngine = new MirrorEngine({
                mirrors: [createMirrorConfig({ direction: "both" })],
                sender,
                injector: failAgent,
                logger: createTestLogger(),
                onMirrorMessage: (event) => hookCalls.push(event),
            });
            await errorEngine.start();
            // TG -> osaI: injection fails
            await errorEngine.receiveMessage(createTelegramMessage({ message_id: 700, text: "Will fail" }));
            // Hook should show failure
            expect(hookCalls).toHaveLength(1);
            expect(hookCalls[0].success).toBe(false);
            // osaI -> TG: should still work
            const results = await errorEngine.mirror("osai-chat-1", "Still works");
            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(true);
        });
        it("should continue inbound when sending fails", async () => {
            const failSender = createMockSender(true);
            const errorEngine = new MirrorEngine({
                mirrors: [createMirrorConfig({ direction: "both" })],
                sender: failSender,
                injector: agent,
                logger: createTestLogger(),
                onMirrorMessage: (event) => hookCalls.push(event),
            });
            await errorEngine.start();
            // osaI -> TG: sender fails
            const results = await errorEngine.mirror("osai-chat-1", "Will fail");
            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(false);
            // TG -> osaI: should still work
            await errorEngine.receiveMessage(createTelegramMessage({ message_id: 701, text: "Still injects" }));
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
        });
        it("should drop messages when engine is not started", async () => {
            await engine.stop();
            const outResults = await engine.mirror("osai-chat-1", "Dropped");
            expect(outResults).toHaveLength(0);
            await engine.receiveMessage(createTelegramMessage({ message_id: 702 }));
            expect(agent.injectMessage).toHaveBeenCalledTimes(0);
        });
        it("should handle sender retry on first failure, succeed on second", async () => {
            let callCount = 0;
            const retrySender = {
                callHistory: [],
                sendMessage: vi.fn(async (chatId, text) => {
                    retrySender.callHistory.push({ chatId, text });
                    callCount++;
                    if (callCount === 1) {
                        throw new Error("Temporary failure");
                    }
                    return { ok: true, message_id: 1 };
                }),
            };
            const retryEngine = new MirrorEngine({
                mirrors: [createMirrorConfig({ direction: "both" })],
                sender: retrySender,
                injector: agent,
                logger: createTestLogger(),
            });
            await retryEngine.start();
            const results = await retryEngine.mirror("osai-chat-1", "Retry test");
            // Should have retried and succeeded
            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(true);
            expect(retrySender.callHistory).toHaveLength(2);
        });
    });
    // -------------------------------------------------------------------------
    // Direction-specific E2E
    // -------------------------------------------------------------------------
    describe("direction modes", () => {
        it("osai-to-tg only: outbound works, inbound ignored", async () => {
            const dirEngine = new MirrorEngine({
                mirrors: [createMirrorConfig({ direction: "osai-to-tg" })],
                sender,
                injector: agent,
                logger: createTestLogger(),
            });
            await dirEngine.start();
            const outResults = await dirEngine.mirror("osai-chat-1", "Outbound");
            expect(outResults).toHaveLength(1);
            expect(outResults[0].success).toBe(true);
            await dirEngine.receiveMessage(createTelegramMessage({ message_id: 800 }));
            expect(agent.injectMessage).toHaveBeenCalledTimes(0);
        });
        it("tg-to-osai only: inbound works, outbound ignored", async () => {
            const dirEngine = new MirrorEngine({
                mirrors: [createMirrorConfig({ direction: "tg-to-osai" })],
                sender,
                injector: agent,
                logger: createTestLogger(),
            });
            await dirEngine.start();
            await dirEngine.receiveMessage(createTelegramMessage({ message_id: 801, text: "Inbound" }));
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
            const outResults = await dirEngine.mirror("osai-chat-1", "Should be ignored");
            expect(outResults).toHaveLength(0);
        });
        it("both: full bidirectional", async () => {
            // Already covered in beforeEach, but explicit check
            await engine.receiveMessage(createTelegramMessage({ message_id: 802, text: "Bidirectional" }));
            expect(agent.injectMessage).toHaveBeenCalledTimes(1);
            const outResults = await engine.mirror("osai-chat-1", "Response");
            expect(outResults).toHaveLength(1);
            expect(outResults[0].success).toBe(true);
        });
    });
    // -------------------------------------------------------------------------
    // Multi-mirror E2E
    // -------------------------------------------------------------------------
    describe("multiple mirrors", () => {
        it("should route messages to correct osaI chats", async () => {
            const multiEngine = new MirrorEngine({
                mirrors: [
                    createMirrorConfig({
                        chatId: "work-chat",
                        telegramChatId: -1001111111111,
                        direction: "both",
                    }),
                    createMirrorConfig({
                        chatId: "personal-chat",
                        telegramChatId: -1002222222222,
                        direction: "both",
                    }),
                ],
                sender,
                injector: agent,
                logger: createTestLogger(),
            });
            await multiEngine.start();
            // TG message from work chat
            await multiEngine.receiveMessage(createTelegramMessage({
                message_id: 900,
                chat: { id: -1001111111111 },
                text: "Work question",
            }));
            // TG message from personal chat
            await multiEngine.receiveMessage(createTelegramMessage({
                message_id: 901,
                chat: { id: -1002222222222 },
                text: "Personal question",
            }));
            expect(agent.injectMessage).toHaveBeenCalledTimes(2);
            expect(agent.injectedMessages[0].chatId).toBe("work-chat");
            expect(agent.injectedMessages[1].chatId).toBe("personal-chat");
            // Response to work chat
            await multiEngine.mirror("work-chat", "Work answer");
            expect(sender.callHistory[0].chatId).toBe(-1001111111111);
            // Response to personal chat
            await multiEngine.mirror("personal-chat", "Personal answer");
            expect(sender.callHistory[1].chatId).toBe(-1002222222222);
        });
        it("should fan-out osaI response to multiple TG chats", async () => {
            const fanoutEngine = new MirrorEngine({
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
                injector: agent,
                logger: createTestLogger(),
            });
            await fanoutEngine.start();
            const results = await fanoutEngine.mirror("shared-chat", "Broadcast");
            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
            expect(results[0].telegramChatId).toBe(-1001111111111);
            expect(results[1].telegramChatId).toBe(-1002222222222);
        });
    });
    // -------------------------------------------------------------------------
    // Stats verification
    // -------------------------------------------------------------------------
    describe("stats in E2E", () => {
        it("should track stats through full E2E flow", async () => {
            expect(engine.getStats().processedMessageCount).toBe(0);
            await engine.receiveMessage(createTelegramMessage({ message_id: 950 }));
            expect(engine.getStats().processedMessageCount).toBe(1);
            await engine.receiveMessage(createTelegramMessage({ message_id: 951 }));
            expect(engine.getStats().processedMessageCount).toBe(2);
            // Duplicate should not increment
            await engine.receiveMessage(createTelegramMessage({ message_id: 950 }));
            expect(engine.getStats().processedMessageCount).toBe(2);
            expect(engine.getStats().started).toBe(true);
            expect(engine.getStats().totalMirrors).toBe(1);
            expect(engine.getStats().activeMirrorsOut).toBe(1);
            expect(engine.getStats().activeMirrorsIn).toBe(1);
        });
    });
});
//# sourceMappingURL=mirror-e2e.test.js.map