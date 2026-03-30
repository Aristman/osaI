/**
 * E2E Mock LLM Server -- OpenAI-compatible HTTP server
 *
 * Listens on a random available port and provides minimal
 * OpenAI Chat Completions API endpoints (/v1/chat/completions).
 *
 * Features:
 * - Configurable response content
 * - Configurable delay to simulate latency
 * - Failure mode (returns 500)
 * - Streaming support (SSE)
 * - Request logging for test assertions
 *
 * T-005 / F-013
 */
import { createServer } from "node:http";
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * Start a mock LLM server on a random available port.
 *
 * The server provides an OpenAI-compatible `/v1/chat/completions` endpoint
 * that returns a single-choice completion with the configured content.
 *
 * @param config - Server configuration.
 * @returns A MockLlmServer instance.
 */
export function startMockLlmServer(config = {}) {
    const { responseContent: initialContent = "Mock LLM response", delayMs = 0, shouldFail: initialFail = false, failStatusCode = 500, model = "mock-llm", } = config;
    let currentContent = initialContent;
    let currentShouldFail = initialFail;
    const recordedRequests = [];
    return new Promise((resolve, reject) => {
        const server = createServer(async (req, res) => {
            const url = req.url ?? "/";
            const method = req.method ?? "GET";
            // Health check
            if (url === "/health" && method === "GET") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "ok", model }));
                return;
            }
            // OpenAI-compatible: /v1/chat/completions or /v1/models
            if (url === "/v1/models" && method === "GET") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    object: "list",
                    data: [{ id: model, object: "model", owned_by: "mock" }],
                }));
                return;
            }
            if (url === "/v1/chat/completions" && method === "POST") {
                // Read request body
                const body = await readBody(req);
                const parsedBody = JSON.parse(body);
                recordedRequests.push({
                    method,
                    url,
                    body: parsedBody,
                    timestamp: Date.now(),
                });
                // Apply delay if configured
                if (delayMs > 0) {
                    await new Promise((r) => setTimeout(r, delayMs));
                }
                // Failure mode
                if (currentShouldFail) {
                    res.writeHead(failStatusCode, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        error: {
                            message: "Mock LLM server failure",
                            type: "server_error",
                            code: "internal_error",
                        },
                    }));
                    return;
                }
                // Check if streaming requested
                const stream = parsedBody.stream === true;
                if (stream) {
                    handleStreaming(res, currentContent, model);
                    return;
                }
                // Non-streaming response
                const messages = parsedBody.messages ?? [];
                const userMessage = findLastUserContent(messages);
                const responseText = currentContent.includes("{input}")
                    ? currentContent.replace("{input}", userMessage)
                    : currentContent;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    id: `chatcmpl-mock-${Date.now()}`,
                    object: "chat.completion",
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: responseText,
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: countTokens(JSON.stringify(messages)),
                        completion_tokens: countTokens(responseText),
                        total_tokens: countTokens(JSON.stringify(messages)) + countTokens(responseText),
                    },
                }));
                return;
            }
            // Fallback: 404
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not found" }));
        });
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (address === null || typeof address === "string") {
                reject(new Error("Failed to get server address"));
                return;
            }
            const port = address.port;
            const baseUrl = `http://127.0.0.1:${port}`;
            resolve({
                server,
                port,
                baseUrl,
                get requests() {
                    return recordedRequests;
                },
                setResponseContent(content) {
                    currentContent = content;
                },
                setShouldFail(shouldFail) {
                    currentShouldFail = shouldFail;
                },
                clearRequests() {
                    recordedRequests.length = 0;
                },
                stop() {
                    return new Promise((res) => {
                        server.close(() => res());
                    });
                },
            });
        });
        server.on("error", (err) => {
            reject(new Error(`Mock LLM server error: ${err.message}`));
        });
    });
}
// ---------------------------------------------------------------------------
// Streaming handler
// ---------------------------------------------------------------------------
/**
 * Handle a streaming chat completion request using Server-Sent Events (SSE).
 */
function handleStreaming(res, content, model) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });
    // Send chunks word by word
    const words = content.split(" ");
    let eventId = 0;
    for (let i = 0; i < words.length; i++) {
        const word = i === 0 ? words[i] : " " + words[i];
        const isLast = i === words.length - 1;
        const chunk = {
            id: `chatcmpl-mock-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
                {
                    index: 0,
                    delta: {
                        content: word,
                    },
                    finish_reason: isLast ? "stop" : null,
                },
            ],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        eventId++;
    }
    // Send [DONE] marker
    res.write("data: [DONE]\n\n");
    res.end();
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Read the full request body as text. */
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        req.on("error", reject);
    });
}
/** Find the last user message content from a messages array. */
function findLastUserContent(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === "user" && typeof messages[i]?.content === "string") {
            return messages[i].content;
        }
    }
    return "";
}
/** Very rough token count estimation (1 token ~ 4 chars). */
function countTokens(text) {
    return Math.max(1, Math.ceil(text.length / 4));
}
//# sourceMappingURL=mock-llm-server.js.map