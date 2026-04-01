/**
 * @osai/cli -- useGateway Hook (DOMAIN-011, T-003)
 *
 * React-подобный хук для управления подключением к Gateway.
 * Предоставляет client ref и методы отправки сообщений.
 *
 * При подключении автоматически отправляет config.push с конфигурацией
 * из ~/.osai/osai.json (секции agent + providers).
 */

import { useEffect, useRef, useCallback } from "react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import pino from "pino";
import { GatewayClient } from "../ws/gateway-client.js";
import { MessageRouter } from "../ws/message-router.js";
import { sendUserMessage, sendSubscribe, sendConfigPush } from "../ws/protocol.js";
import type { ClientConfigPush } from "../ws/protocol.js";
import type { GatewayEventMessage } from "../ws/message-router.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseGatewayOptions {
  /** URL Gateway */
  url?: string;
  /** ID сессии */
  sessionId: string;
  /** ID чата */
  chatId?: string;
  /** Logger */
  logger?: pino.Logger;
  /** Callback при изменении статуса подключения */
  onConnectionStatusChange?: (status: "connected" | "disconnected" | "reconnecting" | "failed") => void;
  /** Callback при получении block сообщения */
  onBlock?: (msg: { type: "block"; block_type: string; content: string; language?: string }) => void;
  /** Callback при получении tool_stream сообщения */
  onToolStream?: (msg: { tool: string; action: string; chunk?: unknown; progress?: number }) => void;
}

export interface UseGatewayReturn {
  /** Отправить текстовое сообщение */
  sendMessage: (content: string) => void;
  /** Текущий статус подключения */
  getConnectionStatus: () => "connected" | "disconnected" | "reconnecting" | "failed";
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Reads ~/.osai/osai.json and returns the agent + providers sections.
 * Returns null if file doesn't exist or can't be parsed.
 */
async function loadLocalConfig(): Promise<ClientConfigPush["payload"] | null> {
  try {
    const configPath = join(homedir(), ".osai", "osai.json");
    const content = await readFile(configPath, { encoding: "utf-8" });
    const parsed = JSON.parse(content);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed["agent"] !== "object" ||
      typeof parsed["providers"] !== "object"
    ) {
      return null;
    }

    return {
      agent: parsed["agent"] as ClientConfigPush["payload"]["agent"],
      providers: parsed["providers"] as Record<string, Record<string, unknown>>,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Хук для управления WebSocket подключением к Gateway.
 *
 * Создаёт GatewayClient и MessageRouter при монтировании,
 * автоматически переподключается, маршрутизирует входящие сообщения.
 * При подключении отправляет config.push с локальной конфигурацией.
 */
export function useGateway(options: UseGatewayOptions): UseGatewayReturn {
  const {
    url,
    sessionId,
    chatId,
    logger: propLogger,
    onConnectionStatusChange,
    onBlock,
    onToolStream,
  } = options;

  const logger = propLogger ?? pino({ name: "use-gateway" });
  const clientRef = useRef<GatewayClient | null>(null);
  const routerRef = useRef<MessageRouter | null>(null);
  const statusRef = useRef<"connected" | "disconnected" | "reconnecting" | "failed">("disconnected");

  // Создание и подключение при монтировании
  useEffect(() => {
    const client = new GatewayClient({
      url,
      logger: logger.child({ component: "gateway-client" }),
    });

    const router = new MessageRouter({
      logger: logger.child({ component: "message-router" }),
    });

    clientRef.current = client;
    routerRef.current = router;

    // Connection lifecycle handlers
    const onConnected = async () => {
      statusRef.current = "connected";
      onConnectionStatusChange?.("connected");
      try {
        sendSubscribe(client, sessionId, ["tool_stream", "block"]);

        // Push local config to Gateway
        const localConfig = await loadLocalConfig();
        if (localConfig) {
          sendConfigPush(client, sessionId, localConfig.agent, localConfig.providers);
          logger.info("Config push sent to Gateway");
        } else {
          logger.warn("No local config found, using Gateway defaults");
        }
      } catch {
        // WS may have closed
      }
    };

    const onDisconnected = () => {
      statusRef.current = "disconnected";
      onConnectionStatusChange?.("disconnected");
    };

    const onReconnecting = () => {
      statusRef.current = "reconnecting";
      onConnectionStatusChange?.("reconnecting");
    };

    const onFailed = () => {
      statusRef.current = "failed";
      onConnectionStatusChange?.("failed");
    };

    client.on("connected", onConnected);
    client.on("disconnected", onDisconnected);
    client.on("reconnecting", onReconnecting);
    client.on("failed", onFailed);

    // Message handlers
    if (onBlock !== undefined) {
      router.on("block", onBlock);
    }
    if (onToolStream !== undefined) {
      router.on("tool_stream", onToolStream);
    }

    // Handle gateway events (connect.challenge, etc.)
    router.on("event", (msg: GatewayEventMessage) => {
      if (msg.event === "connect.challenge") {
        try {
          client.send({
            type: "event",
            event: "connect.response",
            payload: { nonce: msg.payload.nonce },
          });
        } catch {
          // WS may have closed
        }
      }
    });

    // Log config.ack results
    router.on("config_ack", (msg) => {
      if (msg.payload.status === "ok") {
        logger.info(
          { providers: msg.payload.providersLoaded, model: msg.payload.model },
          "Gateway accepted config push",
        );
      } else {
        logger.error(
          { error: msg.payload.error },
          "Gateway rejected config push",
        );
      }
    });

    // Suppress unknown-message errors — don't crash the app
    router.on("error", (_raw, _error) => {
      // Logged by MessageRouter itself
    });

    router.attach(client);
    client.connect();

    return () => {
      router.detach();
      client.disconnect();
      clientRef.current = null;
      routerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(
    (content: string) => {
      const client = clientRef.current;
      if (client === null || !client.isConnected) {
        logger.warn("Cannot send message: not connected to Gateway");
        return;
      }
      sendUserMessage(client, sessionId, content, chatId);
    },
    [sessionId, chatId, logger],
  );

  const getConnectionStatus = useCallback(() => {
    return statusRef.current;
  }, []);

  return { sendMessage, getConnectionStatus };
}
