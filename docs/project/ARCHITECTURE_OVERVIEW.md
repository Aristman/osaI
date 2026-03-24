# Architecture Overview: osaI -- Operation System AI

**Version:** v1.0
**Generated:** 2026-03-24
**Author:** Solution Architect Agent
**Status:** Approved for implementation
**Traceability:** TECH_REQUIREMENTS.md v1.0, SCOPE.md v1.0, PROJECT_PROFILE.md v1.0

---

## 1. Architectural Goals

### 1.1 Key Quality Attributes

| Attribute | Priority | Target |
|-----------|----------|--------|
| **Security** | CRITICAL | 6-layer model (Network, Sandbox, Permissions, File Sandbox, Shell, Audit) |
| **Reliability** | HIGH | Model failover chain, circuit breaker, session persistence, graceful shutdown |
| **Maintainability** | HIGH | TypeScript strict, monorepo with acyclic dependencies, 70%+ unit coverage |
| **Observability** | HIGH | OpenTelemetry traces/metrics/logs, audit log, Prometheus endpoint |
| **Performance** | MEDIUM | Agent loop overhead < 50ms, RAG query < 200ms, worker threads for CPU-bound |
| **Extensibility** | MEDIUM | Hook system, SKILL.md skills, workspace custom skills |
| **Scalability** | LOW | Single-user local-first, up to 10 concurrent sessions |

### 1.2 Constraints Influencing Architecture

| Constraint | Impact on Architecture |
|-----------|----------------------|
| OpenClaw недоступен | Все компоненты реализуются с нуля по паттернам из спецификации |
| TypeScript 5.x / Node.js 20+ | Синхронный better-sqlite3; worker threads для CPU-bound (embeddings) |
| Local-first, один пользователь | Нет multi-tenant; нет облачного backend; SQLite + Qdrant на localhost |
| Solo developer | Monorepo с чёткими границами; CI/CD автоматизация; приоритезация MVP |
| Qdrant -- REST client, не in-process | Требуется запущенный Qdrant server (Docker container с auto-start) |
| @xenova/transformers устарел | Используется @huggingface/transformers v3 |

---

## 2. System Context

### 2.1 System Boundaries

osaI -- локальная AI-система для desktop Linux/macOS. Границы системы:

- **Внутри:** Gateway (WS server), Agent Runtime, Skills, Memory, Observability, OS Integration, CLI, Dashboard
- **Вне (external dependencies):** LLM API (Anthropic, OpenAI, Ollama), Qdrant Server, Docker (sandbox), Tailscale (remote), мессенджеры (Telegram, WhatsApp)

### 2.2 External Systems and Actors

```
+------------------------------------------------------------------+
|                    USER MACHINE                                   |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |                      osaI System                            |  |
|  |                                                             |  |
|  |  [CLI] --WS--> [Gateway] --WS--> [Dashboard]               |  |
|  |                  |                                           |  |
|  |                  +--> Agent Runtime --> Skills --> Memory   |  |
|  |                                                             |  |
|  |  [System Tray] <-- [OS Integration]                         |  |
|  +------------------------------------------------------------+  |
|                                                                   |
|  +----------------+  +----------------+  +-------------------+    |
|  | SQLite (osai)  |  | Qdrant Server  |  | Ollama (optional) |    |
|  | (data/osai.db) |  | (Docker/6333)  |  | (localhost:11434) |    |
|  +----------------+  +----------------+  +-------------------+    |
+------------------------------------------------------------------+
         |                    |                     |
    (cloud APIs)       (local server)        (local LLM)
         |                    |                     |
  +-------------+     (container)         (local inference)
  | Anthropic   |
  | OpenAI      |
  +-------------+
         |
  (cloud APIs)
         |
  +-------------+     +----------------+
  | Telegram    |     | Tailscale      |
  | WhatsApp    |     | (E2E tunnel)  |
  +-------------+     +----------------+
```

### 2.3 Actors

| Actor | Interface | Access Pattern |
|-------|-----------|----------------|
| User (CLI) | Terminal (stdin/stdout) через WS client | Локально, interactive |
| User (Dashboard) | Browser (SvelteKit SPA + WS client) | Локально, real-time |
| User (Telegram/WhatsApp) | Мессенджер через channel handler | Remote через Tailscale |
| LLM Provider | HTTPS REST API (streaming) | Outbound |
| Qdrant Server | HTTP REST (localhost:6333) | Outbound local |

---

## 3. High-Level Architecture

### 3.1 Architectural Style

**Gateway-centric layered architecture** с event-driven internals и plugin-based extensibility.

Ключевые стилистические принципы:
- **Gateway-centric:** Единая WebSocket control plane -- точка входа для всех клиентов
- **Layered:** Gateway -> Agent Runtime -> Skills -> Infrastructure
- **Event-driven (hooks):** Hook-based extensibility в agent loop
- **Plugin-based (skills):** SKILL.md declarative skills с runtime tool registration
- **Local-first monolith:** Все компоненты работают в едином Node.js процессе (за исключением Qdrant и Docker)

### 3.2 High-Level Diagram (ASCII)

```
+====================================================================+
|                        osaI SYSTEM                                   |
|                                                                      |
|  LAYER 1: CLIENT INTERFACES                                         |
|  +----------+  +-----------+  +----------+  +----------+            |
|  |   CLI    |  | Dashboard |  | Telegram |  | WhatsApp |            |
|  | (oclif)  |  |(SvelteKit)|  |(grammY)  |  |(Baileys) |            |
|  +----+-----+  +-----+-----+  +----+-----+  +----+-----+            |
|       |               |              |              |                |
|       +-------+-------+------+-------+------+-------+                |
|               |              |                                    |
|               v              v                                    |
|  LAYER 2: GATEWAY (WS Control Plane)  ws://127.0.0.1:18789        |
|  +-----------------------------------------------------------+     |
|  |  WS Server (ws)     Session Router      Channel Handlers  |     |
|  |  +----------+   +-----------------+   +-----------------+ |     |
|  |  | Listener |-->| Router + Queue  |<--| TG | WA | CLI  | |     |
|  |  +----------+   +-----------------+   +-----------------+ |     |
|  +---------------------------+-----------------------------------+  |
|                              |                                      |
|                              v                                      |
|  LAYER 3: AGENT RUNTIME                                            |
|  +-----------------------------------------------------------+     |
|  |                    AGENT LOOP                                |     |
|  |                                                             |     |
|  |  [intake] --> [before_model_resolve]                         |     |
|  |       --> [context_assembly] --> [before_prompt_build]       |     |
|  |       --> [model_inference (streaming)]                      |     |
|  |           +-> [before_tool_call] -> [execute] -> [after]     |     |
|  |       --> [streaming to clients]                             |     |
|  |       --> [persistence] --> [agent_end]                       |     |
|  +-----------------------------------------------------------+     |
|                              |                                      |
|  LAYER 4: SKILLS + EXTENSIONS                                     |
|  +------------+ +------------+ +------------+ +------------------+  |
|  | skills-core| |skills-osai | |   memory   | | observability    |  |
|  | filesystem | |os-integ.   | | +RAG+embed | | +OTel+audit      |  |
|  | shell      | |memory skill| |            | |                  |  |
|  | browser    | |knowledge-b.| |            | |                  |  |
|  | http       | |            | |            | |                  |  |
|  +------------+ +------------+ +------------+ +------------------+  |
|                              |                                      |
|  LAYER 5: INFRASTRUCTURE                                          |
|  +--------+ +--------+ +----------+ +--------+ +----------+         |
|  | SQLite | | Qdrant | |  Docker  | |pino log| | OTel exp.|         |
|  |(better)| |(REST)  | | (sandbox)| |        | |          |         |
|  +--------+ +--------+ +----------+ +--------+ +----------+         |
|                                                                      |
|  CROSS-CUTTING: OS Integration (tray, notifications, file watcher)  |
+====================================================================+
```

### 3.3 Major Subsystems

| Subsystem | Package | Responsibility |
|-----------|---------|----------------|
| Gateway | `packages/gateway` | WS server, channel handlers, session router, client connections |
| Agent Runtime | `packages/agent` | Agent loop, hook system, model resolver/failover, skills loader/executor, tool/block streaming |
| Skills Core | `packages/skills-core` | Bundled skills: Filesystem, Shell, Browser (CDP), HTTP |
| Skills osaI | `packages/skills-osai` | osaI skills: OS Integration, Memory, Knowledge Base |
| Memory | `packages/memory` | Short-term (SQLite) + Long-term (SQLite + Qdrant) + RAG + Embeddings |
| Observability | `packages/observability` | OpenTelemetry traces/metrics/logs, audit log, Prometheus exporter |
| OS Integration | `packages/os-integration` | System tray, notifications, file watcher, process management |
| CLI | `packages/cli` | CLI client (oclif/ink): chat, session, config, skills, memory commands |
| Dashboard | `apps/dashboard` | Web Dashboard (SvelteKit + TailwindCSS): chat, traces, status |

---

## 4. Core Components

### 4.1 Gateway (`packages/gateway`)

**Responsibility:** Единая точка входа для всех клиентских подключений. WS server, маршрутизация сообщений к сессиям, управление channel handlers.

**Inputs:**
- WS подключения от CLI, Dashboard, Telegram, WhatsApp
- WS сообщения: `message`, `command`, `permission_response`, `subscribe`

**Outputs:**
- WS сообщения клиентам: `block`, `tool_stream`, `permission_request`
- Маршрутизированные сообщения в Agent Runtime

**Dependencies:**
- `packages/agent` -- вызов agent loop для обработки сообщений
- `better-sqlite3` -- session persistence
- `ws` -- WebSocket server

**Exported Interface:**

```typescript
// packages/gateway/src/index.ts

interface GatewayConfig {
  host: string;          // default: "127.0.0.1"
  port: number;          // default: 18789
  channels: ChannelConfig[];
}

interface ChannelConfig {
  type: "cli" | "telegram" | "whatsapp" | "dashboard";
  enabled: boolean;
  options: Record<string, unknown>;
}

class Gateway {
  constructor(config: GatewayConfig, agent: AgentRuntime): void;
  start(): Promise<void>;
  stop(): Promise<void>;

  // Session management
  getSession(sessionId: string): Session | undefined;
  createSession(type: SessionType, config?: SessionConfig): Session;
  resumeSession(sessionId: string): Session;

  // Channel management
  registerChannel(channel: ChannelHandler): void;
  unregisterChannel(channelType: string): void;

  // Messaging
  sendToSession(sessionId: string, message: OutboundMessage): void;
  broadcastEvent(event: GatewayEvent): void;
}

interface Session {
  id: string;
  type: "main" | "group" | "isolated";
  activationMode: "always" | "mention" | "wake_word" | "passive";
  queueMode: "sequential" | "parallel";
  state: SessionState;
  history: Message[];
  createdAt: Date;
  lastActiveAt: Date;
}

// WS Protocol Messages
type InboundMessage =
  | { type: "message"; session_id: string; content: string; channel?: string }
  | { type: "command"; command: string; params?: Record<string, unknown> }
  | { type: "permission_response"; request_id: string; decision: "approved" | "denied" }
  | { type: "subscribe"; events: string[] };

type OutboundMessage =
  | { type: "block"; session_id: string; block_type: "text" | "code" | "image" | "card" | "table"; content: string; language?: string }
  | { type: "tool_stream"; session_id: string; tool: string; action: string; chunk: Record<string, unknown> }
  | { type: "permission_request"; request_id: string; session_id: string; tool: string; action: string; params: Record<string, unknown>; risk_level: string }
  | { type: "error"; code: string; message: string; severity: string }
  | { type: "status"; session_id: string; state: SessionState }
  | { type: "event"; event: string; data: Record<string, unknown> };
```

### 4.2 Agent Runtime (`packages/agent`)

**Responsibility:** Реализация agent loop (intake -> context -> inference -> tools -> stream -> persist), hook system, model resolver + failover, skills loader + executor.

**Inputs:**
- Сообщения от Gateway (через Session)
- Configuration (model config, skills config, session config)
- Hook registrations от внешних модулей (memory, observability)

**Outputs:**
- Streaming responses (tool_stream, block) в Gateway
- Session state updates в persistence
- Audit log entries в observability

**Dependencies:**
- LLM API clients (Anthropic, OpenAI, Ollama)
- Skills registry (skills-core, skills-osai)
- SQLite (session persistence)
- Observability (traces, metrics)

**Exported Interface:**

```typescript
// packages/agent/src/index.ts

class AgentRuntime {
  constructor(config: AgentConfig): void;

  // Core loop
  processMessage(message: AgentMessage, session: Session): Promise<void>;

  // Hook system
  registerHook(hookPoint: HookPoint, handler: HookHandler, priority?: number): void;
  unregisterHook(hookPoint: HookPoint, handlerId: string): void;

  // Skills management
  loadSkills(skillsConfig: SkillsConfig): Promise<void>;
  getToolSchemas(): ToolSchema[];
  executeTool(toolName: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;

  // Session management
  pruneSession(session: Session, maxTokens: number): void;
  serializeSession(session: Session): SerializedSession;
  deserializeSession(data: SerializedSession): Session;

  // Model management
  getModelConfig(): ModelConfig;
  getActiveModel(): ModelInfo;
}

interface AgentConfig {
  model: ModelConfig;
  session: SessionConfig;
  skills: SkillsConfig;
  hooks?: HookRegistration[];
}

interface ModelConfig {
  primary: ModelProviderConfig;
  fallback: ModelProviderConfig[];
  authProfiles: AuthProfileConfig[];    // V1: auth rotation
  circuitBreaker: CircuitBreakerConfig; // V1: circuit breaker
}

type HookPoint =
  | "before_model_resolve"
  | "before_prompt_build"
  | "before_agent_start"
  | "before_tool_call"
  | "after_tool_call"
  | "agent_end"
  | "on_error"
  // osaI extensions
  | "before_memory_query"
  | "after_memory_extract"
  | "on_file_access"
  | "on_desktop_notification";

interface HookContext {
  sessionId: string;
  traceId: string;
  message?: AgentMessage;
  prompt?: PromptData;
  toolCall?: ToolCallData;
  toolResult?: ToolResult;
  error?: Error;
  metadata: Record<string, unknown>;
}

interface HookHandler {
  id: string;
  name: string;
  execute(context: HookContext): Promise<HookContext | null>; // null = abort chain
  priority: number; // lower = earlier execution
}

// Tool system
interface ToolSchema {
  name: string;
  description: string;
  parameters: JSONSchema;
  category: "read" | "write" | "execute" | "system";
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### 4.3 Skills Core (`packages/skills-core`)

**Responsibility:** Встроенные (bundled) skills с tool реализациями: Filesystem, Shell, Browser, HTTP. SKILL.md parser и skill registry.

**Inputs:**
- Tool call requests от Agent Runtime
- Configuration (sandbox config, shell config)

**Outputs:**
- Tool results в Agent Runtime
- Tool schemas для LLM
- Audit entries через on_file_access hook

**Dependencies:**
- Agent Runtime (hook registration, skill loader interface)
- File system (fs, fs-extra)
- Shell (child_process)
- CDP (puppeteer-core, V1)

**Exported Interface:**

```typescript
// packages/skills-core/src/index.ts

// SKILL.md Parser
interface SkillDefinition {
  name: string;
  description: string;
  tools: ToolDefinition[];
  permissions: PermissionConfig;
  examples?: Example[];
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  category: "read" | "write" | "execute" | "system";
  returns: string;
}

// Skill Registry
class SkillRegistry {
  registerSkill(skill: SkillDefinition, executor: SkillExecutor): void;
  unregisterSkill(skillName: string): void;
  getSkill(skillName: string): SkillDefinition | undefined;
  getAllToolSchemas(): ToolSchema[];
  getToolExecutor(toolName: string): SkillExecutor | undefined;
}

type SkillExecutor = (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;

// Bundled skills
// -- Filesystem
namespace FilesystemSkill {
  function readFile(params: { path: string; offset?: number; limit?: number }, ctx: ToolContext): Promise<ToolResult>;
  function writeFile(params: { path: string; content: string }, ctx: ToolContext): Promise<ToolResult>;
  function listDirectory(params: { path: string; recursive?: boolean }, ctx: ToolContext): Promise<ToolResult>;
  function searchFiles(params: { pattern: string; path?: string; glob?: boolean }, ctx: ToolContext): Promise<ToolResult>;
  function moveFile(params: { from: string; to: string }, ctx: ToolContext): Promise<ToolResult>;
  function deleteFile(params: { path: string; recursive?: boolean }, ctx: ToolContext): Promise<ToolResult>;
}

// -- Shell
namespace ShellSkill {
  function execute(params: { command: string; timeout?: number; cwd?: string }, ctx: ToolContext): Promise<ToolResult>;
}

// File Sandbox
class FileSandbox {
  constructor(config: SandboxConfig): void;
  validatePath(path: string): { allowed: boolean; reason?: string; resolvedPath: string };
  // Checks: allowed dirs, blocked patterns, symlink resolution, path traversal
}
```

### 4.4 Skills osaI (`packages/skills-osai`)

**Responsibility:** osaI-specific skills: OS Integration, Memory, Knowledge Base.

**Inputs:**
- Tool call requests от Agent Runtime
- Dependencies от os-integration (tray, notifications) и memory (RAG)

**Outputs:**
- Tool results в Agent Runtime

**Dependencies:**
- `packages/os-integration` -- system tray, notifications, file watcher, processes
- `packages/memory` -- long-term memory, RAG, knowledge base
- Agent Runtime (skill loader interface)

**Exported Interface:**

```typescript
// packages/skills-osai/src/index.ts

// OS Integration Skill
namespace OsIntegrationSkill {
  function showNotification(params: { title: string; body: string; urgency: "low"|"normal"|"critical" }, ctx: ToolContext): Promise<ToolResult>;
  function watchDirectory(params: { path: string; events: ("create"|"modify"|"delete")[] }, ctx: ToolContext): Promise<ToolResult>;
  function listProcesses(params: { filter?: string }, ctx: ToolContext): Promise<ToolResult>;
  function openApplication(params: { app_name: string; args?: string[] }, ctx: ToolContext): Promise<ToolResult>;
  function getSystemInfo(params: {}, ctx: ToolContext): Promise<ToolResult>;
}

// Memory Skill
namespace MemorySkill {
  function remember(params: { content: string; category?: string; tags?: string[] }, ctx: ToolContext): Promise<ToolResult>;
  function recall(params: { query: string; top_k?: number; category?: string }, ctx: ToolContext): Promise<ToolResult>;
  function forget(params: { memory_id: string }, ctx: ToolContext): Promise<ToolResult>;
  function summarizeSession(params: { session_id?: string }, ctx: ToolContext): Promise<ToolResult>;
}

// Knowledge Base Skill
namespace KnowledgeBaseSkill {
  function ingestDocument(params: { path: string; title?: string; tags?: string[] }, ctx: ToolContext): Promise<ToolResult>;
  function queryKnowledge(params: { query: string; filters?: Record<string, unknown>; top_k?: number }, ctx: ToolContext): Promise<ToolResult>;
  function listSources(params: { tag?: string }, ctx: ToolContext): Promise<ToolResult>;
  function removeSource(params: { document_id: string }, ctx: ToolContext): Promise<ToolResult>;
}
```

### 4.5 Memory (`packages/memory`)

**Responsibility:** Двухуровневая система памяти: short-term (SQLite session storage) + long-term (SQLite metadata + Qdrant vectors) + RAG pipeline + embedding generation + fact extraction.

**Inputs:**
- Query requests от Agent Runtime (через before_prompt_build hook)
- Store requests от fact extraction (через after_tool_call hook)
- Ingest requests от Knowledge Base skill

**Outputs:**
- Relevant memories для context assembly
- Embedding vectors для Qdrant
- Metadata records в SQLite

**Dependencies:**
- `better-sqlite3` -- session messages, memory metadata, knowledge base metadata
- `@qdrant/js-client-rest` -- vector storage и similarity search
- `@huggingface/transformers` v3 -- local embeddings (ONNX)
- OpenAI API -- remote embeddings
- Ollama API -- local embeddings fallback

**Exported Interface:**

```typescript
// packages/memory/src/index.ts

class MemoryManager {
  constructor(config: MemoryConfig): void;

  // Short-term memory
  getShortTermMessages(sessionId: string, limit?: number): SessionMessage[];
  addShortTermMessage(sessionId: string, message: SessionMessage): void;
  clearShortTermMemory(sessionId: string): void;

  // Long-term memory
  store(entry: MemoryEntry): Promise<string>;           // returns memory_id
  recall(query: string, options?: RecallOptions): Promise<MemoryEntry[]>;
  forget(memoryId: string): Promise<void>;
  getByCategory(category: MemoryCategory, limit?: number): MemoryEntry[];

  // RAG Pipeline
  queryForContext(query: string, options?: RagOptions): Promise<FormattedMemoryContext>;

  // Knowledge Base
  ingestDocument(path: string, options?: IngestOptions): Promise<{ documentId: string; chunksCount: number }>;
  queryKnowledge(query: string, options?: KbQueryOptions): Promise<KbSearchResult[]>;
  listSources(tag?: string): KbSource[];
  removeSource(documentId: string): Promise<void>;

  // Fact Extraction
  extractFacts(text: string, sessionId: string): Promise<MemoryEntry[]>;
  summarizeSession(sessionId: string): Promise<string>;

  // Embedding
  generateEmbedding(text: string): Promise<number[]>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

interface MemoryConfig {
  embeddingProvider: "auto" | "openai" | "ollama" | "onnx";
  openaiApiKey?: string;
  ollamaEndpoint?: string;          // default: "http://localhost:11434"
  qdrantEndpoint: string;           // default: "http://localhost:6333"
  ragTopK: number;                  // default: 5
  similarityThreshold: number;      // default: 0.7
  chunkSize: number;                // default: 512 tokens
  chunkOverlap: number;             // default: 50 tokens
  autoExtractFacts: boolean;        // default: true (V1)
}

interface MemoryEntry {
  id: string;
  content: string;
  category: MemoryCategory;         // FACT | PREFERENCE | KNOWLEDGE | ERROR | PATTERN
  tags: string[];
  sourceSession: string;
  accessCount: number;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

type MemoryCategory = "FACT" | "PREFERENCE" | "KNOWLEDGE" | "ERROR" | "PATTERN";

interface RecallOptions {
  topK?: number;                    // default: 5
  threshold?: number;               // default: 0.7
  category?: MemoryCategory;
}

interface RagOptions {
  topK?: number;
  threshold?: number;
  maxTokens?: number;               // limit context injection size
}

// Embedding Provider with fallback chain
class EmbeddingProvider {
  constructor(config: MemoryConfig): void;
  embed(text: string): Promise<{ vector: number[]; provider: string; dimension: number }>;
  embedBatch(texts: string[]): Promise<Array<{ vector: number[]; provider: string; dimension: number }>>;
  getActiveProvider(): string;
}
```

### 4.6 Observability (`packages/observability`)

**Responsibility:** OpenTelemetry интеграция (traces, metrics, structured logs), audit log, Prometheus exporter.

**Inputs:**
- Span/metric/data от всех компонентов через OTel API
- Audit entries от Gateway и Agent Runtime

**Outputs:**
- Traces в configured exporters
- Metrics на Prometheus endpoint
- Structured logs через pino
- Audit log records в SQLite

**Dependencies:**
- `@opentelemetry/sdk-node` -- OTel SDK
- `pino` -- structured logging
- `prom-client` -- Prometheus metrics

**Exported Interface:**

```typescript
// packages/observability/src/index.ts

class ObservabilityManager {
  constructor(config: ObservabilityConfig): void;

  // Initialization (must be called before other imports)
  initialize(): void;

  // Tracing
  startSpan(name: string, options?: SpanOptions): Span;
  getActiveTraceId(): string | undefined;

  // Metrics
  incrementCounter(name: string, value?: number, attributes?: Record<string, string>): void;
  recordHistogram(name: string, value: number, attributes?: Record<string, string>): void;
  setGauge(name: string, value: number, attributes?: Record<string, string>): void;

  // Audit log
  recordAudit(entry: AuditEntry): void;
  queryAudit(filters?: AuditFilters): AuditEntry[];

  // Lifecycle
  shutdown(): Promise<void>;
}

interface ObservabilityConfig {
  serviceName: string;               // "osai"
  serviceVersion: string;
  tracesEnabled: boolean;
  metricsEnabled: boolean;
  samplingRate: number;              // 1.0 (dev), 0.1 (prod)
  exporters: {
    console: boolean;
    file: boolean;                   // ~/.osai/logs/telemetry.jsonl
    jaeger?: { endpoint: string };
    otlp?: { endpoint: string };
  };
  prometheus: {
    enabled: boolean;
    port: number;                    // default: 9090
  };
}

interface AuditEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  traceId: string;
  action: "tool_call" | "permission_request" | "permission_response" | "file_access" | "shell_command" | "memory_store" | "memory_query";
  toolName?: string;
  skillName?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  userDecision?: "approved" | "denied" | "auto";
  riskLevel: "low" | "medium" | "high";
  sandboxChecked: boolean;
}
```

### 4.7 OS Integration (`packages/os-integration`)

**Responsibility:** Desktop OS integration: system tray, desktop notifications, file system watcher, process management, system info.

**Inputs:**
- Tool call requests от skills-osai
- Configuration (file watcher config)
- Event callbacks от ОС (tray clicks, notification clicks, file events)

**Outputs:**
- Desktop notifications пользователю
- File change events
- System/process information
- Tray menu actions

**Dependencies:**
- `systray2` -- system tray (X11; Wayland fallback)
- `node-notifier` -- desktop notifications
- `chokidar` -- file system watcher
- `systeminformation` -- process and system info

**Exported Interface:**

```typescript
// packages/os-integration/src/index.ts

class OsIntegrationManager {
  constructor(config?: OsIntegrationConfig): void;

  // System Tray
  createTray(menuItems: TrayMenuItem[]): TrayHandle;
  updateTrayStatus(status: "active" | "inactive" | "error"): void;
  destroyTray(): void;

  // Notifications
  notify(notification: NotificationOptions): Promise<void>;

  // File Watcher
  watchDirectory(path: string, events?: ("create"|"modify"|"delete")[], callback?: WatcherCallback): WatcherHandle;
  unwatch(watcherId: string): void;
  unwatchAll(): void;

  // Process Management
  listProcesses(filter?: string): Promise<ProcessInfo[]>;
  getSystemInfo(): Promise<SystemInfo>;

  // Service Management
  installService(): Promise<void>;   // systemd --user / launchd
  uninstallService(): Promise<void>();

  // Capability detection
  isDesktopAvailable(): boolean;     // tray + notifications
  getCapabilities(): OsCapabilities;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

interface OsCapabilities {
  tray: boolean;
  notifications: boolean;
  fileWatcher: boolean;
  processManagement: boolean;
  serviceManagement: boolean;
  platform: "linux" | "macos";
  displayServer?: "x11" | "wayland";
}
```

### 4.8 CLI (`packages/cli`)

**Responsibility:** CLI клиент на oclif с интерактивным TUI на ink: chat, session management, config, skills, memory, channel management, system status.

**Inputs:**
- Пользовательские команды и аргументы (stdin)
- WS сообщения от Gateway

**Outputs:**
- WS сообщения в Gateway
- Terminal output (stdout)

**Dependencies:**
- `oclif` -- CLI framework
- `ink` -- TUI rendering
- `ws` -- WS client для подключения к Gateway

**Exported Interface:**

```typescript
// packages/cli/src/index.ts

// oclif commands (main entry points)
// osai                          -> Interactive chat (ink TUI)
// osai "command text"           -> Quick command mode
// osai chat                     -> Explicit chat command
// osai session list             -> List sessions
// osai session resume <id>      -> Resume session
// osai config                   -> Edit configuration
// osai config show              -> Display current config
// osai skills list              -> List available skills
// osai skills enable <name>     -> Enable skill
// osai skills disable <name>    -> Disable skill
// osai memory search <query>    -> Search long-term memory
// osai memory stats             -> Memory statistics
// osai channel list             -> List channels
// osai status                   -> System status
// osai init                     -> Initialize ~/.osai/
// osai version                  -> Version info

class GatewayClient {
  constructor(config: ClientConfig): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: InboundMessage): void;
  onMessage(handler: (msg: OutboundMessage) => void): void;
  onPermissionRequest(handler: (req: PermissionRequest) => Promise<boolean>): void;
}
```

### 4.9 Dashboard (`apps/dashboard`)

**Responsibility:** Web Dashboard на SvelteKit + TailwindCSS: chat area, channel sidebar, agent trace view, permission prompts, memory search, system status.

**Inputs:**
- WS сообщения от Gateway
- Пользовательский ввод через UI

**Outputs:**
- WS сообщения в Gateway

**Dependencies:**
- `SvelteKit` -- framework
- `TailwindCSS` -- styling
- WS client -- real-time communication

**Exported Interface:** (SPA, нет server-side exports)

```
Routes:
  /                           -> Chat area (main)
  /sessions                   -> Session list
  /sessions/:id               -> Session detail
  /traces                     -> Agent trace view
  /traces/:id                 -> Trace detail
  /memory                     -> Memory search
  /memory/:id                 -> Memory detail
  /settings                   -> Configuration view
  /status                     -> System status (metrics, health)
```

---

## 5. Data Flow

### 5.1 Primary Data Flow: User Message -> Agent Response

```
User types message in CLI/Dashboard/Messenger
    |
    v
[Gateway] receives WS message { type: "message", session_id: "main", content: "..." }
    |
    v
[Session Router] resolves session, checks activation mode
    |
    v
[Agent Runtime] agent.processMessage(message, session)
    |
    +--> [before_model_resolve] hook
    |        - Select model (primary Claude)
    |        - Auth profile rotation (V1)
    |
    +--> [Context Assembly]
    |        - Load system prompt (AGENTS.md, SOUL.md)
    |        - Load workspace files (TOOLS.md)
    |        - Load skill tool schemas (from SkillRegistry)
    |        - Load session history (from SQLite short-term memory)
    |        - [before_memory_query] hook -> Memory RAG query
    |             -> Embedding of user message
    |             -> Qdrant search (top_k=5, threshold=0.7)
    |             -> Format relevant memories as context section
    |
    +--> [before_prompt_build] hook
    |        - Inject memory context into system prompt
    |        - Agent persona modifications
    |
    +--> [Model Inference] (streaming)
    |        - Send to Claude API (streaming response)
    |        - Parse response: text blocks + tool_call requests
    |
    +--> [Tool Execution Loop]
    |        For each tool_call:
    |        +--> [before_tool_call] hook
    |        |     - Permission check (read=auto, write/exec=confirm)
    |        |     - Sandbox verification
    |        |     - If confirm: send permission_request to Gateway -> Client
    |        |     - Wait for permission_response
    |        |
    |        +--> [Skill Executor] executes tool
    |        |     - Filesystem/Shell/HTTP/Browser/OS/Memory/KB
    |        |     - Audit log entry
    |        |
    |        +--> Stream tool_stream to Gateway -> Clients
    |        |
    |        +--> [after_tool_call] hook
    |              - Metrics recording
    |              - Fact extraction (V1)
    |
    +--> [Streaming] text blocks to Gateway -> Clients
    |        - Block messages: text, code, image, card, table
    |        - TypeWriter effect in CLI
    |
    +--> [Persistence]
    |        - Save messages + tool results to SQLite (short-term)
    |        - Update session state
    |        - Session pruning if context overflow
    |
    +--> [agent_end] hook
    |        - Desktop notification (if async/completed)
    |        - Metrics flush
    |        - [after_memory_extract] hook (V1: extract facts from response)
    |
    v
[Gateway] sends final status to clients
```

### 5.2 RAG Pipeline Data Flow

```
User message (text)
    |
    v
[EmbeddingProvider.embed(text)]
    |
    +--> Try OpenAI (text-embedding-3-small, 1536-dim)
    |        |
    |        +-- success --> return vector
    |        +-- failure --> try next
    |
    +--> Try Ollama (nomic-embed-text, 768-dim)
    |        |
    |        +-- success --> return vector
    |        +-- failure --> try next
    |
    +--> Try ONNX (all-MiniLM-L6-v2, 384-dim)
             |
             +-- success --> return vector
             +-- failure --> no memory context (graceful degradation)
    |
    v
[QdrantClient.search(collection="osai_memory", vector, top_k=5, score_threshold=0.7)]
    |
    v
[Format results]
    ## Relevant Memory
    - [FACT] User prefers dark theme
    - [KNOWLEDGE] Working on project "osaI"
    - [ERROR] Qdrant timeout -> restart fixed
    |
    v
[Inject into system prompt before model inference]
```

### 5.3 Knowledge Base Ingestion Flow

```
User/Agent requests document ingestion
    |
    v
[Read document from filesystem]
    |
    v
[Chunking] (512 tokens, 50 token overlap)
    |
    v
[EmbeddingProvider.embedBatch(chunks)]
    |
    v
[Store in Qdrant] (collection="osai_kb", vectors + payload with document_id)
    |
    v
[Store metadata in SQLite] (knowledge_documents + knowledge_chunks tables)
    |
    v
Return { documentId, chunksCount }
```

### 5.4 Data Ownership and Lifecycle

| Data Type | Owner Package | Storage | TTL | Deletion Policy |
|-----------|--------------|---------|-----|-----------------|
| Session messages | agent | SQLite (osai.db) | Session lifetime + pruning | Auto-pruned on context overflow; manual session delete |
| Session state | agent | SQLite (osai.db) | Session lifetime | Manual session delete |
| Long-term memory (metadata) | memory | SQLite (osai.db) | Permanent | Explicit `forget` |
| Long-term memory (vectors) | memory | Qdrant | Permanent | Explicit `forget` or re-index |
| Knowledge base (metadata) | memory | SQLite (osai.db) | Until source removal | Explicit `remove_source` |
| Knowledge base (chunks) | memory | Qdrant | Until source removal | Explicit `remove_source` |
| Audit log | observability | SQLite (osai.db) | Permanent, immutable | Never deleted (read-only API) |
| Structured logs | observability | File (~/.osai/logs/) | 7 days | Auto-rotation |
| Telemetry | observability | File (~/.osai/logs/telemetry.jsonl) | 30 days | Auto-rotation |
| Configuration | gateway | File (~/.osai/openclaw.json) | Until user modifies | Manual |
| Workspace files | agent | File system (~/.osai/workspace/) | Until user modifies | Manual |

---

## 6. Control Flow

### 6.1 Application Startup Sequence

```
1. [CLI / Gateway process start]
    |
2. [Load config] ~/.osai/openclaw.json
    |
3. [Initialize ObservabilityManager]
    |   - OpenTelemetry SDK setup
    |   - pino logger creation
    |   - Prometheus metrics endpoint start
    |
4. [Initialize SQLite]
    |   - Open osai.db (WAL mode)
    |   - Run migrations (create tables if not exist)
    |
5. [Start Qdrant] (if not running)
    |   - Check localhost:6333 availability
    |   - If not running: docker run qdrant/qdrant (or fail gracefully)
    |
6. [Initialize MemoryManager]
    |   - Connect to Qdrant REST client
    |   - Ensure collections exist (osai_memory, osai_kb)
    |   - Load embedding model (lazy: on first use)
    |
7. [Initialize AgentRuntime]
    |   - Load skills (skills-core + skills-osai)
    |   - Register bundled skills in SkillRegistry
    |   - Load workspace skills (SKILL.md from ~/.osai/workspace/skills/)
    |   - Register osaI hooks:
    |       - before_memory_query -> MemoryManager.queryForContext
    |       - after_tool_call -> Metrics + Audit logging
    |       - after_memory_extract -> Fact extraction (V1)
    |       - on_file_access -> Audit logging
    |       - on_desktop_notification -> OsIntegrationManager.notify
    |
8. [Initialize Gateway]
    |   - Start WS server (127.0.0.1:18789)
    |   - Register channel handlers (CLI, Dashboard)
    |   - Resume persisted sessions from SQLite
    |
9. [Initialize OS Integration] (if desktop available)
    |   - Create system tray
    |   - Register tray menu actions
    |   - Capability detection (X11/Wayland)
    |
10. [System Ready]
        - CLI: render status bar
        - Dashboard: serve SPA
        - Tray: update status to "active"
```

### 6.2 Graceful Shutdown Sequence

```
1. [SIGTERM / SIGINT received]
    |
2. [Gateway] stop accepting new connections
    |
3. [Agent Runtime] complete pending agent loop iterations
    |
4. [Memory Manager] flush pending writes to SQLite + Qdrant
    |
5. [Observability Manager] flush OTel traces/metrics
    |   - sdk.shutdown() -- force flush
    |
6. [SQLite] close database connection (WAL checkpoint)
    |
7. [OS Integration] destroy tray, stop file watchers
    |
8. [Gateway] close WS server
    |
9. [Process exit]
```

### 6.3 Permission Request Flow

```
Agent requests write/exec tool call
    |
    v
[before_tool_call hook]
    |
    v
[PermissionManager.check(toolCall)]
    |
    +--> category == "read" --> AUTO APPROVE
    |        --> continue execution
    |
    +--> category == "write" or "exec" --> CONFIRM REQUIRED
             |
             v
         [Gateway] sends permission_request to active client(s)
         { type: "permission_request", request_id: "...", tool: "filesystem", action: "write_file", params: { path: "~/notes/test.md" }, risk_level: "medium" }
             |
             v
         [Client] displays prompt:
           "osaI wants to write to: ~/notes/test.md"
           "Risk: medium | [y/N]"
             |
             v
         [Client] sends permission_response:
           { type: "permission_response", request_id: "...", decision: "approved" }
             |
             v
         [Gateway] forwards response to Agent Runtime
             |
             +--> decision == "approved" --> execute tool
             +--> decision == "denied" --> abort tool call, notify agent
             |
             v
         [Audit log] record permission decision
```

---

## 7. Cross-Cutting Concerns

### 7.1 Security

**6-Layer Security Model (последовательная проверка):**

| Layer | Component | Mechanism | Package |
|-------|-----------|-----------|---------|
| L1 Network | Gateway | WS bind 127.0.0.1; Tailscale E2E for remote | gateway |
| L2 Sandbox | Docker | Docker containers для non-main sessions; resource limits; network isolation | agent |
| L3 Permissions | Agent Runtime | Category-based: read=auto, write=confirm, exec=confirm, system=auto; desktop notifications | agent |
| L4 File Sandbox | FileSandbox | Allowed dirs; blocked patterns; symlink resolution (realpathSync); path traversal prevention | skills-core |
| L5 Shell Security | ShellSkill | Blocked commands list; timeout enforcement (120s); command logging; dangerous pattern detection | skills-core |
| L6 Audit | ObservabilityManager | All actions logged with trace_id; immutable records; queryable via API | observability |

**File Sandbox Enforcement Rules:**
- Allowed dirs: `~/projects`, `~/documents`, `/tmp/osai`
- Blocked patterns: `~/.ssh/**`, `~/.gnupg/**`, `/etc/**`, `/boot/**`, `/proc/**`, `/dev/**`, `/sys/**`
- Every path resolved via `fs.realpathSync()` before check
- Path traversal (`../`) prevented via path normalization
- Validation occurs at tool implementation level (not only by SKILL.md category)

**API Key Security:**
- Keys stored in `~/.osai/openclaw.json`
- File permissions: `0600` (owner read/write only)
- No keys logged or transmitted except to respective API endpoints

### 7.2 Observability

**Three pillars:**

1. **Traces (OpenTelemetry):**
   - Root span: `agent.loop`
   - Child spans: `agent.context_assembly`, `agent.inference`, `agent.tool_call`, `memory.rag_query`, `memory.extract`
   - Resource attributes: `service.name=osai`, `service.version=x.y.z`
   - Correlation: trace_id propagated через все components

2. **Metrics (Prometheus):**
   - Counters: `osai.agent.llm.tokens_input`, `osai.agent.llm.tokens_output`, `osai.agent.llm.cost_usd`, `osai.agent.tool_call.total`, `osai.agent.tool_call.errors`, `osai.sandbox.violations`
   - Histograms: `osai.agent.session.duration_ms`, `osai.agent.tool_call.duration_ms`, `osai.agent.llm.duration_ms`, `osai.memory.query.duration_ms`
   - Gauges: `osai.memory.entries.total`, `osai.session.active`

3. **Logs (pino):**
   - Structured JSON format
   - Fields: `trace_id`, `session_id`, `level`, `msg`, `timestamp`, component
   - Levels: error, warn, info, debug, trace
   - Correlation with OTel via `trace_id` field

4. **Audit Log (SQLite):**
   - Immutable records (no DELETE via API)
   - Fields: id, session_id, timestamp, trace_id, action, tool_name, skill_name, params (JSON), result (JSON), user_decision, risk_level, sandbox_checked
   - Queried via REST API: `GET /api/v1/observability/audit`

### 7.3 Error Handling

**Error Hierarchy:**

```
OsaError (base)
  +-- AgentError
  |     +-- ModelError
  |     |     +-- ModelUnavailableError      -> fallback to next provider
  |     |     +-- RateLimitError              -> wait + retry with backoff
  |     |     +-- AuthError                   -> rotate auth profile
  |     +-- ContextOverflowError             -> session pruning
  |     +-- ToolExecutionError
  |           +-- PermissionDeniedError       -> notify user, halt task
  |           +-- SandboxViolationError       -> audit log, deny access
  |           +-- TimeoutError                -> retry or abort
  +-- GatewayError
  |     +-- SessionNotFoundError
  |     +-- ChannelError
  +-- MemoryError
  |     +-- QdrantUnavailableError           -> degrade (no memory context)
  |     +-- EmbeddingError                    -> skip memory injection
  +-- SkillError
  |     +-- SkillLoadError
  |     +-- ToolNotFoundError
  +-- OsIntegrationError
        +-- TrayUnavailableError             -> fallback CLI-only
        +-- NotificationError                -> log warning, continue
```

**Error Severity and Strategies:**

| Severity | Strategy | Example |
|----------|----------|---------|
| LOW | Retry silently (max 3, exponential backoff) | Transient network error |
| MEDIUM | Notify user, retry (max 3, backoff) | Embedding provider failure |
| HIGH | Halt current task, ask user for decision | Sandbox violation, permission denied |
| CRITICAL | Abort session, log full context | Model failover chain exhausted |

**Retry with Exponential Backoff:**
- Base delay: 1s
- Max delay: 30s
- Max attempts: 3 (configurable)
- Jitter: +/- 25%

**Circuit Breaker (V1):**
- After N consecutive errors (default: 3) for a provider
- Provider excluded for cooldown period (default: 30s)
- Automatic recovery attempt after cooldown

### 7.4 Configuration

**Configuration Model (`~/.osai/openclaw.json`):**

```jsonc
{
  // Gateway
  "gateway": {
    "host": "127.0.0.1",
    "port": 18789
  },

  // Model
  "model": {
    "primary": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-..."
    },
    "fallback": [
      {
        "provider": "openai",
        "model": "gpt-4o",
        "apiKey": "sk-..."
      },
      {
        "provider": "ollama",
        "model": "llama3",
        "endpoint": "http://localhost:11434"
      }
    ],
    "authProfiles": [
      { "provider": "anthropic", "apiKey": "sk-ant-key1" },
      { "provider": "anthropic", "apiKey": "sk-ant-key2" }
    ],
    "circuitBreaker": {
      "failureThreshold": 3,
      "cooldownSeconds": 30
    },
    "budget": {
      "monthlyUsd": 50,
      "alertThreshold": 0.8
    }
  },

  // Session
  "session": {
    "persistence": true,
    "pruning": true,
    "maxHistoryMessages": 100,
    "queueMode": "sequential"
  },

  // Skills
  "skills": {
    "allowBundled": true,
    "extraDirs": [
      "~/.osai/workspace/skills",
      "~/.osai/skills"
    ],
    "watch": true,
    "entries": {
      "filesystem": { "enabled": true },
      "shell": { "enabled": true, "timeout": 120 },
      "browser": { "enabled": false, "sandboxed": true },
      "http": { "enabled": false, "timeout": 30 },
      "os-integration": { "enabled": true },
      "memory": { "enabled": true },
      "knowledge-base": { "enabled": true }
    }
  },

  // Security
  "security": {
    "sandbox": {
      "allowedDirs": ["~/projects", "~/documents", "/tmp/osai"],
      "blockedPatterns": [
        "~/.ssh/**", "~/.gnupg/**", "/etc/**",
        "/boot/**", "/proc/**", "/dev/**", "/sys/**"
      ],
      "autoApproveRead": true,
      "resolveSymlinks": true
    },
    "shell": {
      "blockedCommands": [
        "rm -rf /", "mkfs", "dd if=/dev/zero",
        "chmod -R 777 /", "> /dev/sda",
        ":(){ :|:& };:", "sudo rm -rf /"
      ],
      "timeout": 120,
      "logAll": true
    },
    "docker": {
      "image": "osai/sandbox:latest",
      "cpuLimit": "2",
      "memoryLimit": "512m",
      "networkAccess": false
    }
  },

  // Memory (V1)
  "memory": {
    "embeddingProvider": "auto",
    "qdrantEndpoint": "http://localhost:6333",
    "ragTopK": 5,
    "similarityThreshold": 0.7,
    "chunkSize": 512,
    "chunkOverlap": 50,
    "autoExtractFacts": true
  },

  // Observability (V1)
  "observability": {
    "tracesEnabled": true,
    "metricsEnabled": true,
    "samplingRate": 1.0,
    "exporters": {
      "console": true,
      "file": true,
      "jaeger": { "endpoint": "http://localhost:14268" }
    },
    "prometheus": {
      "enabled": true,
      "port": 9090
    },
    "logLevel": "info"
  },

  // OS Integration (V1)
  "osIntegration": {
    "tray": true,
    "notifications": true,
    "fileWatcher": {
      "maxWatchedFiles": 100000
    }
  }
}
```

**Configuration Loading Priority:**
1. CLI flags (highest priority)
2. Environment variables (`OSAI_GATEWAY_PORT`, etc.)
3. `~/.osai/openclaw.json`
4. Built-in defaults (lowest priority)

**Hot Reload:**
- Skills config changes: hot-reload (file watcher on SKILL.md)
- Session/model config changes: require restart
- Observability config changes: hot-reload (sampling rate, log level)

### 7.5 Logging Strategy

- **Logger:** pino (structured JSON)
- **Correlation:** Every log entry includes `trace_id` and `session_id` when available
- **Levels:** error (user-facing), warn (degraded), info (operational), debug (development), trace (detailed)
- **Output:** stdout (dev), file with rotation (production)
- **Sensitive data:** API keys, file contents never logged; command arguments logged with truncation

---

## 8. Non-Functional Requirement Mapping

### 8.1 Performance

| NFR | Architectural Element | Implementation |
|-----|----------------------|----------------|
| NFR-001 RAG < 200ms | Memory package | Qdrant local (Docker), pre-warmed connection, connection pooling |
| NFR-002 Agent loop overhead < 50ms | Agent Runtime | Minimal processing between intake and model call; context assembly optimized |
| NFR-003 Worker threads for CPU-bound | Memory package | Embedding generation in worker_threads; chunking in worker_threads |
| NFR-004 OTel overhead < 5% | Observability | Sampling (10% prod), async exporters, no inline span processing |
| NFR-005 Cold start embedding < 5s | Memory package | Lazy loading; quantized models (INT8); cached model in memory |
| NFR-006 WS processing < 10ms | Gateway | Direct dispatch, no complex routing; message parsing < 1ms |

### 8.2 Reliability

| NFR | Architectural Element | Implementation |
|-----|----------------------|----------------|
| NFR-007 Failover < 5s | Agent Runtime (ModelResolver) | Failover chain with immediate switch on error; circuit breaker |
| NFR-008 Crash recovery | Agent + Gateway | SQLite WAL mode; session serialization on every update; resume on start |
| NFR-009 Circuit breaker | Agent Runtime | N consecutive errors -> cooldown -> auto-recovery attempt |
| NFR-010 SQLite WAL | Memory package | `PRAGMA journal_mode=WAL` on initialization |
| NFR-011 Graceful shutdown | All packages | Signal handlers; pending op completion; OTel flush; DB close |

### 8.3 Security

| NFR | Architectural Element | Implementation |
|-----|----------------------|----------------|
| NFR-012 No data to third parties | Architecture | All data local; only LLM API calls outbound; audit verification |
| NFR-013 API keys 0600 | Configuration | `fs.chmodSync(0600)` on config file creation |
| NFR-014 Blocked commands always blocked | ShellSkill | Multi-level check: pattern matching + alias resolution + encoding normalization |
| NFR-015 Symlink resolution | FileSandbox | `fs.realpathSync()` on every path before allow/block check |
| NFR-016 Docker no network | Agent Runtime (DockerSandbox) | `--network none` default for non-main sessions |
| NFR-017 Immutable audit | ObservabilityManager | No DELETE endpoint; SQLite table with triggers preventing modification |

### 8.4 Maintainability

| NFR | Architectural Element | Implementation |
|-----|----------------------|----------------|
| NFR-25 TypeScript strict | All packages | `"strict": true` in tsconfig; CI check |
| NFR-26 ESLint + Biome 0 errors | All packages | CI pipeline; pre-commit hooks |
| NFR-27 Unit coverage >= 70% | Backend packages | vitest --coverage; CI threshold check |
| NFR-28 Integration coverage >= 50% | Cross-package | Integration tests in tests/integration/ |
| NFR-29 Acyclic dependencies | Monorepo | madge --circular in CI; dependency graph documented |
| NFR-30 SKILL.md for each skill | Skills packages | SKILL.md as single source of truth; generated tool schemas |

### 8.5 Observability

| NFR | Architectural Element | Implementation |
|-----|----------------------|----------------|
| NFR-031 Spans for agent loop | Agent Runtime + Memory | Custom spans with OTel API |
| NFR-032 Correlation IDs | pino + OTel | trace_id injected in every log entry |
| NFR-033 Audit coverage | ObservabilityManager + hooks | Audit on every tool_call, permission, file_access, shell_command |
| NFR-034 Sampling rate configurable | ObservabilityConfig | `observability.samplingRate` in config |

### 8.6 Compatibility

| NFR | Architectural Element | Implementation |
|-----|----------------------|----------------|
| NFR-35 Linux desktop (primary) | OS Integration + all packages | systemd --user service; X11 primary, Wayland fallback |
| NFR-36 macOS desktop (secondary) | OS Integration | launchd service; NSStatusBar tray |
| NFR-37 Offline capable | Model failover + Memory | Ollama fallback; ONNX embeddings; graceful degradation |

---

## 9. Architectural Decisions & Trade-offs

### AD-1: Самостоятельная реализация вместо форка OpenClaw

**Decision:** osaI реализует все компоненты с нуля по паттернам из спецификации, так как OpenClaw не найден в публичных источниках.

**Alternatives:**
1. Самостоятельная реализация (выбрано)
2. Поиск альтернативного base проекта
3. Ждать появления OpenClaw

**Rationale:**
- Устраняет блокирующую зависимость от недоступного проекта
- Полный контроль над архитектурой и интерфейсами
- Больше объём разработки, но предсказуемый результат
- SCOPE.md (IE-1) и TECH_REQUIREMENTS.md (1.3) уже фиксируют этот подход

### AD-2: Gateway-centric monolith (единый Node.js процесс)

**Decision:** Все backend компоненты работают в едином Node.js процессе. Внешние сервисы: Qdrant (Docker), Docker (sandbox), Ollama (optional).

**Alternatives:**
1. Monolith в едином процессе (выбрано)
2. Microservices (каждый компонент -- отдельный процесс)
3. Plugin-based architecture с dynamic loading

**Rationale:**
- Local-first, один пользователь -- нет нужды в distributed architecture
- Simpler deployment и debugging для solo developer
- Межпроцессное взаимодействие добавляет latency без преимуществ
- Worker threads достаточно для CPU-bound (embeddings)

**Trade-off:** Меньшая изоляция между компонентами; crash одного компонента может затронуть весь процесс.

### AD-3: SQLite (better-sqlite3) как основной storage

**Decision:** SQLite через better-sqlite3 для всех structured data (sessions, memory metadata, audit, config state).

**Alternatives:**
1. better-sqlite3 (выбрано)
2. sql.js (pure JS SQLite)
3. LowDB (JSON file)
4. LevelDB

**Rationale:**
- Synchronous API = меньше overhead, simpler code
- WAL mode обеспечивает concurrent read/write без блокировок
- Проверен в production; активное community
- Единая БД для всех данных упрощает backup и migration

**Trade-off:** Нативная компиляция (node-gyp) может быть сложна на некоторых платформах; синхронный API блокирует event loop для тяжёлых запросов (mitigated через WAL и worker threads для тяжелых операций).

### AD-4: Qdrant Server (Docker) для vector storage

**Decision:** Qdrant запускается как Docker container (auto-start через osai) или systemd service. Используется REST client `@qdrant/js-client-rest`.

**Alternatives:**
1. Qdrant Docker container (выбрано)
2. Qdrant systemd service
3. In-process vector DB (hnswlib-node, LanceDB, Vectra)

**Rationale:**
- Qdrant не имеет in-process embedded mode для Node.js
- Docker container обеспечивает изоляцию и простоту управления
- Auto-start через osai устраняет ручную настройку
- Fallback: graceful degradation при недоступности Qdrant (no long-term memory)

**Trade-off:** Дополнительный infrastructure requirement (Docker); добавляет latency через HTTP REST.

### AD-5: Embedding Provider Fallback Chain (separate collections per provider)

**Decision:** Разные embedding провайдеры используют раздельные Qdrant collections для избежания конфликтов размерностей.

**Alternatives:**
1. Раздельные коллекции (выбрано)
2. Единая коллекция с dimension-padding до максимальной
3. Re-indexing при переключении провайдера

**Rationale:**
- OpenAI: 1536-dim, Ollama: 768-dim, ONNX: 384-dim -- нельзя смешивать в одной коллекции
- Раздельные коллекции: `osai_memory_openai`, `osai_memory_ollama`, `osai_memory_onnx`
- Query выполняется только в коллекции активного провайдера
- Re-indexing deferred to V2

**Trade-off:** Дублирование данных при переключении провайдера; неполный поиск при fallback.

### AD-6: Hook System -- Observer Pattern с Priority

**Decision:** Hook system реализуется как Observer с приоритетным выполнением. Hook может модифицировать контекст или прервать цепочку (вернуть null).

**Alternatives:**
1. Observer с priority (выбрано)
2. Middleware chain (Express-style)
3. Event emitter (fire-and-forget)

**Rationale:**
- Priority позволяет контролировать порядок выполнения
- Возврат null = прерывание цепочки (для permission denial, error handling)
- Synchronous-like async chain -- результат одного hook доступен следующему
- Middleware pattern слишком tied к request/response

**Trade-off:** Сложнее debug при большом количестве hooks; порядок выполнения критичен.

### AD-7: File Watcher -- chokidar с fallback на @parcel/watcher (V2)

**Decision:** MVP/V1 использует chokidar для file watching. Оценка производительности и замена на @parcel/watcher (Rust-based) deferred to V2.

**Alternatives:**
1. chokidar (выбрано для MVP/V1)
2. @parcel/watcher (Rust-based, NAPI)
3. node-watch (simpler, lighter)
4. nsfw (native OS APIs)

**Rationale:**
- chokidar -- проверенное решение, широко используемое
- Известные проблемы на больших директориях mitigated через configurable limit
- @parcel/watcher -- более производительный, но добавляет Rust/NAPI complexity
- Оценка реальной нагрузки на file watcher нужна после MVP

### AD-8: System Tray -- systray2 с Wayland fallback

**Decision:** systray2 для system tray на X11. На Wayland -- graceful degradation (CLI-only mode).

**Alternatives:**
1. systray2 (выбрано)
2. Electron (overkill для tray-only)
3. Tauri (Rust dependency)
4. CLI-only (no tray)

**Rationale:**
- Linux desktop fragmentation (X11 vs Wayland, GNOME vs KDE) делает надежный tray сложным
- systray2 работает стабильно на X11 и macOS
- Wayland fallback: detect display server, log warning, continue without tray
- Функциональность доступна через CLI в любом случае

### AD-9: CLI Framework -- oclif + ink

**Decision:** oclif для структуры команд + ink для TUI rendering. ink рендерится внутри oclif command.

**Alternatives:**
1. oclif + ink (выбрано)
2. Commander + blessed/ink
3. Pure ink (custom command routing)
4. Clack (simpler prompts, no full TUI)

**Rationale:**
- oclif: зрелый framework с plugin system, TypeScript-first, auto-help generation
- ink: React-based TUI, компонентная модель, подходящ для chat UI
- Potential conflict React reconciler vs oclif lifecycle mitigated через аккуратную интеграцию (ink rendering внутри oclif run method)

### AD-10: Dashboard -- SvelteKit SPA (no SSR)

**Decision:** Dashboard реализуется как SvelteKit SPA (static export), подключающийся к Gateway через WebSocket.

**Alternatives:**
1. SvelteKit SPA (выбрано)
2. SvelteKit SSR
3. React + Vite
4. Pure HTML + vanilla JS

**Rationale:**
- Local-first: нет нужды в SSR; SPA подключается к local Gateway
- SvelteKit: современный framework, small bundle size, great DX
- TailwindCSS: utility-first styling, rapid prototyping
- No server-side -- simpler deployment, no additional Node.js server for frontend

---

## 10. Assumptions & Risks

### 10.1 Architectural Assumptions

| # | Assumption | Confidence | Impact if Incorrect | Mitigation |
|---|-----------|------------|---------------------|------------|
| A-1 | osaI реализуется с нуля по паттернам из спецификации | **CONFIRMED** | Больше объём разработки, но устранена блокирующая зависимость | Чёткие интерфейсы, модульная архитектура |
| A-2 | Node.js 20+ производительность достаточна для local-first AI OS | HIGH | Worker threads для CPU-bound; в целом достаточно | Monitor event loop lag; optimize hot paths |
| A-3 | Docker доступен на целевых машинах (Linux, macOS) | HIGH | Sandbox ограничится file-level без Docker isolation | File sandbox для main session; document Docker requirement |
| A-4 | Qdrant server запускается через Docker с auto-start | HIGH | Встроить systemd service как fallback; graceful degradation без Qdrant | Auto-start script; fallback: no long-term memory |
| A-5 | @huggingface/transformers v3 стабилен для local embeddings | HIGH | Fallback на Ollama embeddings; monitor for issues | Fallback chain: OpenAI -> Ollama -> ONNX |
| A-6 | Ollama предоставляет достаточное качество для offline fallback | MEDIUM | Ограниченная функциональность при offline; предупредить пользователя | Document limitations; recommend online mode |
| A-7 | Solo developer может поддерживать monorepo из 8+ пакетов | MEDIUM | Риск технического долга; чёткий CI/CD mitigate | Automated CI/CD; strict dependency management |
| A-8 | better-sqlite3 синхронный API не создаёт проблем | HIGH | WAL mode; для тяжелых запросов -- worker threads | Benchmark; fallback на sql.js |
| A-9 | oclif + ink совместимы в одном CLI приложении | MEDIUM | Аккуратная интеграция; ink внутри oclif command run() | POC перед implementation; fallback: oclif-only |
| A-10 | systray2 работает на X11; Wayland -- fallback CLI-only | MEDIUM | Detect display server; graceful degradation | Capability detection; CLI always available |
| A-11 | RAG pipeline latency (< 200ms) приемлема в agent loop | MEDIUM | Если нет -- async pre-fetch на основе user typing | Benchmark; optimize Qdrant queries; async pre-fetch |
| A-12 | Session model поддерживает metadata extension | MEDIUM | Отдельная таблица osai_session_metadata | Separate extension tables; no modification to core schema |
| A-13 | OpenTelemetry overhead (< 5%) допустим | HIGH | Sampling; async exporters; benchmark | Monitoring; configurable sampling |

### 10.2 Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| R-1 Объём разработки превышает ожидания (from-scratch вместо fork) | **High** | High | Чёткий MVP scope; incremental delivery; reuse existing patterns |
| R-2 Qdrant server недоступен (Docker не установлен) | Medium | Medium | Auto-install; systemd fallback; graceful degradation |
| R-3 LLM prompt injection для выполнения опасных команд | Medium | High | Permission system; sandbox; audit log |
| R-4 Context window overflow | High | Medium | Session pruning; summarization; RAG for context |
| R-5 High LLM API cost | Medium | Medium | Budget limits in config; cost metrics; Ollama fallback |
| R-6 Solo developer overload | High | High | Strict prioritization (MVP first); automated CI/CD |
| R-7 Tool execution crashes Node.js process | Low | High | Sandboxed execution; worker threads for tools; process supervisor |
| R-8 Embedding quality gap between providers | Medium | Medium | Separate collections per provider; document limitations |
| R-9 File sandbox bypass via TOCTOU | Low | Critical | Atomic path resolution + check + open; audit logging |
| R-10 better-sqlite3 build failure on ARM/Apple Silicon | Low | Medium | Pre-built binaries; fallback sql.js; install guide |

---

## 11. Open Questions

| # | Question | Impact | Recommendation | Status |
|---|----------|--------|----------------|--------|
| OQ-1 | Требуется ли в MVP поддержка workspace skills (SKILL.md from ~/.osai/workspace/skills/) или достаточно bundled? | Влияет на MVP scope skills loader | MVP: bundled only; V1: workspace skills hot-reload | Deferred to V1 |
| OQ-2 | Какой размер chunk'ов оптимален для RAG pipeline? | Влияет на качество поиска и latency | 512 tokens, 50 token overlap (на основе ANALYSIS F-2) | Recommendation accepted |
| OQ-3 | Как синхронизировать память между устройствами (Tailscale multi-device)? | V1: single device; V2 architecture | V1: не требуется. V2: оценить sync protocol | Deferred to V2 |
| OQ-4 | Нужен ли REPL-режим в CLI или только интерактивный чат? | Влияет на CLI UX | V1: interactive chat only. V2: REPL mode | Deferred to V2 |
| OQ-5 | Требуется ли support для multiple LLM models одновременно (different sessions use different models)? | Влияет на model resolver complexity | V1: model config per system, not per session. V2: per-session | Deferred to V2 |
| OQ-6 | Какой максимальный размер для monitored directories? | File watcher performance | Configurable limit (default: 100k files); warning when exceeded | Recommendation accepted |

---

## Appendix A: Package Dependency Graph

```
                              +-------------------+
                              |   monorepo root   |
                              | (workspace config)|
                              +--------+----------+
                                       |
              +------------------------+------------------------+
              |                        |                        |
     +--------v---------+    +---------v--------+    +---------v--------+
     | packages/        |    | packages/        |    | packages/        |
     | os-integration   |    | gateway          |    | observability    |
     | (no deps)        |    | (ws, sqlite)     |    | (otel, pino)     |
     +------------------+    +---------+--------+    +--+--------------+
                                       |                  |
                              +--------v--------+         |
                              | packages/        |         |
                              | agent            |<--------+
                              | (model, hooks)   |
                              +--+------+--------+
                                 |      |
                    +------------+      +------------+
                    |                              |
           +--------v---------+          +---------v--------+
           | packages/        |          | packages/        |
           | skills-core      |          | memory           |
           | (filesystem,     |          | (sqlite, qdrant, |
           |  shell, browser) |          |  embeddings, rag)|
           +--------+---------+          +---------+--------+
                    |                              |
                    +------------+      +-----------+
                                 |      |
                        +--------v------v--------+
                        | packages/              |
                        | skills-osai            |
                        | (os-integ, memory,     |
                        |  knowledge-base skills)|
                        +------------------------+

     Clients (no deps on other osai packages, only WS client):
     +----------------+    +------------------+
     | packages/cli   |    | apps/dashboard   |
     | (oclif, ink)   |    | (sveltekit)      |
     +----------------+    +------------------+
```

**Dependency Levels (build order):**

| Level | Package | Dependencies |
|-------|---------|-------------|
| 0 | monorepo root | None |
| 1 | os-integration | None |
| 2 | gateway | ws, better-sqlite3 |
| 3 | agent | gateway (WS protocol types) |
| 4 | skills-core | agent (skill loader interface, hook types) |
| 5 | memory | agent (hook types, tool context types) |
| 6 | skills-osai | memory, os-integration |
| 7 | observability | agent (hook types), gateway (WS types) |
| 8 | cli | ws (client) |
| 9 | dashboard | ws (client) |

**Parallelization:**
- Level 1 (os-integration) параллельно с Level 2-3 (gateway, agent)
- Level 7 (observability) параллельно с Level 6 (skills-osai)
- Level 8 (cli) параллельно с Level 9 (dashboard)

---

## Appendix B: Database Schema (SQLite)

```sql
-- Session messages (short-term memory)
CREATE TABLE IF NOT EXISTS session_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,              -- "user" | "assistant" | "system" | "tool"
    content TEXT NOT NULL,
    tool_calls TEXT,                 -- JSON: array of tool call results
    tokens_used INTEGER DEFAULT 0,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,              -- "main" | "group" | "isolated"
    activation_mode TEXT DEFAULT 'always',
    queue_mode TEXT DEFAULT 'sequential',
    state TEXT DEFAULT 'active',     -- "active" | "idle" | "paused" | "closed"
    channel TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT                     -- JSON: osaI session metadata
);

-- osaI session metadata (extension table)
CREATE TABLE IF NOT EXISTS osai_session_metadata (
    session_id TEXT PRIMARY KEY,
    total_tokens_used INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0,
    memory_query_count INTEGER DEFAULT 0,
    tool_call_count INTEGER DEFAULT 0,
    tool_error_count INTEGER DEFAULT 0,
    last_model TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Long-term memory entries (metadata)
CREATE TABLE IF NOT EXISTS memory_entries (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    category TEXT NOT NULL,          -- "FACT" | "PREFERENCE" | "KNOWLEDGE" | "ERROR" | "PATTERN"
    tags TEXT,                       -- JSON: array of strings
    source_session TEXT,
    embedding_provider TEXT,         -- "openai" | "ollama" | "onnx"
    qdrant_point_id TEXT,            -- reference to Qdrant point
    access_count INTEGER DEFAULT 0,
    confidence REAL DEFAULT 1.0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Knowledge base documents
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    title TEXT,
    path TEXT NOT NULL,
    tags TEXT,                       -- JSON: array of strings
    chunks_count INTEGER DEFAULT 0,
    embedding_provider TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Knowledge base chunks (metadata)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding_provider TEXT,
    qdrant_point_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
);

-- Audit log (immutable)
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    trace_id TEXT,
    action TEXT NOT NULL,             -- "tool_call" | "permission_request" | "permission_response" | "file_access" | "shell_command" | "memory_store" | "memory_query"
    tool_name TEXT,
    skill_name TEXT,
    params TEXT,                     -- JSON
    result TEXT,                     -- JSON
    user_decision TEXT,              -- "approved" | "denied" | "auto"
    risk_level TEXT,                 -- "low" | "medium" | "high"
    sandbox_checked INTEGER DEFAULT 0,
    memory_accessed INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_entries_category ON memory_entries(category);
CREATE INDEX IF NOT EXISTS idx_memory_entries_session ON memory_entries(source_session);
CREATE INDEX IF NOT EXISTS idx_audit_log_session ON audit_log(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_trace ON audit_log(trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id);
```

---

## Appendix C: Qdrant Collections

### Collection: `osai_memory_openai` (1536-dim)

```json
{
  "vectors": { "size": 1536, "distance": "Cosine" },
  "payload_schema": {
    "memory_id": "keyword",
    "category": "keyword",
    "tags": "keyword[]",
    "source_session": "keyword",
    "created_at": "datetime",
    "confidence": "float"
  }
}
```

### Collection: `osai_memory_ollama` (768-dim)

```json
{
  "vectors": { "size": 768, "distance": "Cosine" },
  "payload_schema": {
    "memory_id": "keyword",
    "category": "keyword",
    "tags": "keyword[]",
    "source_session": "keyword",
    "created_at": "datetime",
    "confidence": "float"
  }
}
```

### Collection: `osai_memory_onnx` (384-dim)

```json
{
  "vectors": { "size": 384, "distance": "Cosine" },
  "payload_schema": {
    "memory_id": "keyword",
    "category": "keyword",
    "tags": "keyword[]",
    "source_session": "keyword",
    "created_at": "datetime",
    "confidence": "float"
  }
}
```

### Collection: `osai_kb_{provider}` (same dimensions as memory)

```json
{
  "vectors": { "size": "<provider_dim>", "distance": "Cosine" },
  "payload_schema": {
    "chunk_id": "keyword",
    "document_id": "keyword",
    "chunk_index": "integer",
    "document_title": "keyword",
    "tags": "keyword[]"
  }
}
```

---

## Appendix D: WS Protocol Specification

### Message Types

| Direction | Type | Purpose | Payload |
|-----------|------|---------|---------|
| Client -> Server | `message` | User message to agent | `{ session_id, content, channel? }` |
| Client -> Server | `command` | Control command | `{ command, params? }` |
| Client -> Server | `permission_response` | Approve/deny tool execution | `{ request_id, decision: "approved"\|"denied" }` |
| Client -> Server | `subscribe` | Subscribe to events | `{ events: string[] }` |
| Server -> Client | `block` | Structured content block | `{ session_id, block_type, content, language? }` |
| Server -> Client | `tool_stream` | Real-time tool execution chunk | `{ session_id, tool, action, chunk }` |
| Server -> Client | `permission_request` | Request user approval | `{ request_id, session_id, tool, action, params, risk_level }` |
| Server -> Client | `error` | Error notification | `{ code, message, severity }` |
| Server -> Client | `status` | Session status update | `{ session_id, state }` |
| Server -> Client | `event` | System event | `{ event, data }` |

### Block Types

| block_type | Description | Additional Fields |
|-----------|-------------|-------------------|
| `text` | Text content | None |
| `code` | Code block | `language` |
| `image` | Image | `url`, `alt?` |
| `card` | Info card | `title`, `subtitle?`, `fields?` |
| `table` | Data table | `headers`, `rows` |

### Channels

| Channel | Implementation | Direction | Notes |
|---------|---------------|-----------|-------|
| CLI | WS client (packages/cli) | Bidirectional | Primary interface |
| Dashboard | WS client (apps/dashboard) | Bidirectional | Secondary interface |
| Telegram | grammY -> Gateway adapter | Bidirectional | V1 |
| WhatsApp | Baileys -> Gateway adapter | Bidirectional | V1 |
| Slack | Bolt SDK -> Gateway adapter | Bidirectional | V2 |
| Discord | discord.js -> Gateway adapter | Bidirectional | V2 |

---

## Appendix E: Directory Structure (Runtime)

```
~/.osai/
  openclaw.json                  # Main configuration
  workspace/
    AGENTS.md                    # Agent persona (read by agent for system prompt)
    SOUL.md                      # Agent soul/values
    TOOLS.md                     # Tool descriptions (supplement)
    skills/                      # User-defined skills (V1)
      my-skill/
        SKILL.md
  data/
    osai.db                      # SQLite database (sessions, memory, audit)
  logs/
    osai.log                     # pino structured logs (rotated, 7-day)
    telemetry.jsonl              # OTel telemetry export (rotated, 30-day)
  skills/                        # osaI system skills (V1)
    os-integration/SKILL.md
    memory/SKILL.md
    knowledge-base/SKILL.md
```

---

*End of Architecture Overview v1.0*
