/**
 * SandboxManager -- Unit Tests
 * Task T-005, Feature F-012
 *
 * Test Cases:
 * TC-005-1: Docker available => mode = DOCKER
 * TC-005-2: Docker NOT available => graceful degradation => PERMISSION_ONLY
 * TC-006-6: Docker healthcheck at startup (docker info / docker ps)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SandboxManager } from '../SandboxManager.js';
import { DockerSandbox } from '../DockerSandbox.js';
import { SandboxMode } from '../types.js';
// ---- Helpers ----
const defaultConstraints = {
    memory: '512m',
    cpus: '1.0',
    networkNone: true,
    autoRemove: true,
    readOnly: true,
};
const defaultDockerConfig = {
    image: 'alpine:latest',
    constraints: defaultConstraints,
    execTimeoutMs: 30000,
    workdir: '/workspace',
};
function createMockedManager(overrides) {
    return new SandboxManager({
        mode: SandboxMode.PERMISSION_ONLY,
        dockerInfo: null,
        dockerConfig: defaultDockerConfig,
        ...overrides,
    });
}
// ---- Tests ----
describe('SandboxManager', () => {
    describe('detectMode', () => {
        let spawnSpy;
        beforeEach(() => {
            spawnSpy = vi.spyOn(SandboxManager.prototype, 'executeCommand');
        });
        afterEach(() => {
            spawnSpy.mockRestore();
        });
        it('TC-005-1: Docker available -- mode = DOCKER', async () => {
            // Simulate `docker info` success with JSON output
            spawnSpy.mockResolvedValue({
                success: true,
                stdout: JSON.stringify({ ServerVersion: '25.0.3' }),
                stderr: '',
                exitCode: 0,
                durationMs: 50,
                mode: SandboxMode.DOCKER,
            });
            const manager = createMockedManager();
            const mode = await manager.detectMode();
            expect(mode).toBe(SandboxMode.DOCKER);
        });
        it('TC-005-2: Docker NOT available -- graceful degradation to PERMISSION_ONLY', async () => {
            // Simulate `docker info` failure (docker not installed)
            spawnSpy.mockResolvedValue({
                success: false,
                stdout: '',
                stderr: 'docker: command not found',
                exitCode: 127,
                durationMs: 10,
                mode: SandboxMode.PERMISSION_ONLY,
            });
            const manager = createMockedManager();
            const mode = await manager.detectMode();
            expect(mode).toBe(SandboxMode.PERMISSION_ONLY);
        });
        it('TC-005-2b: Docker daemon not running -- graceful degradation', async () => {
            // Simulate `docker info` failure (daemon not reachable)
            spawnSpy.mockResolvedValue({
                success: false,
                stdout: '',
                stderr: 'Cannot connect to the Docker daemon',
                exitCode: 1,
                durationMs: 1000,
                mode: SandboxMode.PERMISSION_ONLY,
            });
            const manager = createMockedManager();
            const mode = await manager.detectMode();
            expect(mode).toBe(SandboxMode.PERMISSION_ONLY);
        });
        it('TC-006-6: Docker healthcheck -- docker info called on detectMode', async () => {
            spawnSpy.mockResolvedValue({
                success: true,
                stdout: JSON.stringify({ ServerVersion: '24.0.7' }),
                stderr: '',
                exitCode: 0,
                durationMs: 30,
                mode: SandboxMode.DOCKER,
            });
            const manager = createMockedManager();
            await manager.detectMode();
            expect(spawnSpy).toHaveBeenCalledTimes(1);
        });
    });
    describe('execSandbox', () => {
        let dockerExecSpy;
        beforeEach(() => {
            dockerExecSpy = vi.spyOn(DockerSandbox.prototype, 'exec');
        });
        afterEach(() => {
            dockerExecSpy.mockRestore();
        });
        it('executes in Docker mode when Docker is available', async () => {
            const dockerResult = {
                success: true,
                stdout: 'hello from container',
                stderr: '',
                exitCode: 0,
                durationMs: 500,
                mode: SandboxMode.DOCKER,
            };
            dockerExecSpy.mockResolvedValue(dockerResult);
            const manager = createMockedManager({ mode: SandboxMode.DOCKER });
            const result = await manager.execSandbox('echo hello');
            expect(result.success).toBe(true);
            expect(result.stdout).toBe('hello from container');
            expect(result.mode).toBe(SandboxMode.DOCKER);
            expect(dockerExecSpy).toHaveBeenCalledWith('echo hello');
        });
        it('returns permission_only result when Docker is unavailable', async () => {
            const manager = createMockedManager({ mode: SandboxMode.PERMISSION_ONLY, dockerInfo: { available: false, error: 'docker: command not found' } });
            const result = await manager.execSandbox('echo hello');
            expect(result.success).toBe(false);
            expect(result.mode).toBe(SandboxMode.PERMISSION_ONLY);
            expect(result.stderr).toContain('Docker is not available');
            // DockerSandbox.exec should NOT be called in permission_only mode
            expect(dockerExecSpy).not.toHaveBeenCalled();
        });
    });
    describe('getState', () => {
        it('returns current manager state', () => {
            const dockerInfo = {
                available: true,
                serverVersion: '25.0.3',
            };
            const manager = createMockedManager({
                mode: SandboxMode.DOCKER,
                dockerInfo,
                dockerConfig: defaultDockerConfig,
            });
            const state = manager.getState();
            expect(state.mode).toBe(SandboxMode.DOCKER);
            expect(state.dockerInfo).toEqual(dockerInfo);
            expect(state.dockerConfig).toEqual(defaultDockerConfig);
        });
    });
    describe('isDockerAvailable', () => {
        it('returns true when mode is DOCKER', () => {
            const manager = createMockedManager({ mode: SandboxMode.DOCKER });
            expect(manager.isDockerAvailable()).toBe(true);
        });
        it('returns false when mode is PERMISSION_ONLY', () => {
            const manager = createMockedManager({ mode: SandboxMode.PERMISSION_ONLY });
            expect(manager.isDockerAvailable()).toBe(false);
        });
    });
    describe('buildDockerRunArgs', () => {
        it('builds correct docker run arguments with constraints', () => {
            const manager = createMockedManager();
            const args = manager.buildDockerRunArgs('echo hello');
            expect(args).toContain('run');
            expect(args).toContain('--rm');
            expect(args).toContain('--network=none');
            expect(args).toContain('--memory=512m');
            expect(args).toContain('--cpus=1.0');
            expect(args).toContain('--read-only');
            expect(args).toContain('-w');
            expect(args).toContain('/workspace');
            expect(args).toContain('alpine:latest');
            expect(args).toContain('echo');
            expect(args).toContain('hello');
        });
        it('builds with custom workdir', () => {
            const manager = new SandboxManager({
                mode: SandboxMode.DOCKER,
                dockerInfo: null,
                dockerConfig: {
                    ...defaultDockerConfig,
                    workdir: '/app',
                },
            });
            const args = manager.buildDockerRunArgs('ls');
            const workdirIdx = args.indexOf('-w');
            expect(args[workdirIdx + 1]).toBe('/app');
        });
        it('builds with custom memory and cpu constraints', () => {
            const manager = new SandboxManager({
                mode: SandboxMode.DOCKER,
                dockerInfo: null,
                dockerConfig: {
                    ...defaultDockerConfig,
                    constraints: {
                        ...defaultConstraints,
                        memory: '256m',
                        cpus: '0.5',
                    },
                },
            });
            const args = manager.buildDockerRunArgs('echo test');
            expect(args).toContain('--memory=256m');
            expect(args).toContain('--cpus=0.5');
        });
    });
});
//# sourceMappingURL=SandboxManager.test.js.map