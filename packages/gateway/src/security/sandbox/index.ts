/**
 * Security Sandbox -- Barrel Exports
 * Task T-005, Feature F-012, Domain DOMAIN-001
 */

// Types
export {
  SandboxMode,
  type SandboxExecResult,
  type SandboxManagerState,
  type DockerConfig,
  type DockerConstraints,
  type DockerInfo,
  type ContainerState,
} from './types.js';

// DockerSandbox -- Container lifecycle management
export { DockerSandbox } from './DockerSandbox.js';

// SandboxManager -- Mode detection + graceful degradation
export { SandboxManager, DEFAULT_DOCKER_CONFIG } from './SandboxManager.js';
