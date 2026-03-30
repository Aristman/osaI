/**
 * Docker Sandbox (Graceful Degradation) -- Types
 * Task T-005, Feature F-012, Domain DOMAIN-001
 */

/** Sandbox execution mode */
export enum SandboxMode {
  /** Docker is available: commands run in isolated containers */
  DOCKER = 'docker',
  /** Docker is NOT available: permission-only mode (prompts) */
  PERMISSION_ONLY = 'permission_only',
}

/** Docker container resource constraints */
export interface DockerConstraints {
  /** Memory limit (e.g. '512m') */
  memory: string;
  /** CPU limit (e.g. 1.0) */
  cpus: string;
  /** Network isolation (always true) */
  networkNone: boolean;
  /** Container auto-removal after execution */
  autoRemove: boolean;
  /** Read-only root filesystem */
  readOnly: boolean;
}

/** Docker sandbox configuration */
export interface DockerConfig {
  /** Docker image to use for sandbox */
  image: string;
  /** Container resource constraints */
  constraints: DockerConstraints;
  /** Timeout for docker exec (ms) */
  execTimeoutMs: number;
  /** Working directory inside container */
  workdir: string;
}

/** Result of a sandbox execution */
export interface SandboxExecResult {
  /** Whether execution succeeded */
  success: boolean;
  /** stdout from command */
  stdout: string;
  /** stderr from command */
  stderr: string;
  /** Exit code (0 = success) */
  exitCode: number;
  /** Execution time in ms */
  durationMs: number;
  /** Sandbox mode used */
  mode: SandboxMode;
}

/** Docker info as returned by `docker info` */
export interface DockerInfo {
  /** Whether Docker daemon is reachable */
  available: boolean;
  /** Docker server version */
  serverVersion?: string;
  /** Error message if unavailable */
  error?: string;
}

/** Internal container state */
export interface ContainerState {
  /** Container ID */
  id: string;
  /** Image used */
  image: string;
  /** Whether container is running */
  running: boolean;
  /** Creation timestamp */
  createdAt: number;
}

/** SandboxManager state */
export interface SandboxManagerState {
  /** Detected sandbox mode */
  mode: SandboxMode;
  /** Docker info (when available) */
  dockerInfo: DockerInfo | null;
  /** Docker configuration */
  dockerConfig: DockerConfig;
}
