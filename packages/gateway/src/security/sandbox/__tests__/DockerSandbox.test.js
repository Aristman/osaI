/**
 * DockerSandbox -- Unit Tests
 * Task T-005, Feature F-012
 *
 * Test Cases:
 * TC-005-3: Docker container created with constraints (no-network, cpu, memory)
 * TC-005-4: Docker container cleanup after completion
 * TC-005-5: Command executed inside Docker container
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const defaultConfig = {
    image: 'alpine:latest',
    constraints: defaultConstraints,
    execTimeoutMs: 30000,
    workdir: '/workspace',
};
/** Create a mock for execFileAsync that captures calls */
function createExecMock() {
    const calls = [];
    const mock = vi.fn();
    mock.mockImplementation(async (cmd, args) => {
        calls.push({ command: cmd, args });
        // Simulate successful docker run
        if (cmd === 'docker' && args[0] === 'run') {
            return { stdout: 'container output', stderr: '' };
        }
        // Simulate successful docker rm
        if (cmd === 'docker' && args[0] === 'rm') {
            return { stdout: 'container-id', stderr: '' };
        }
        // Simulate docker ps
        if (cmd === 'docker' && args[0] === 'ps') {
            return { stdout: '', stderr: '' };
        }
        // Simulate docker info
        if (cmd === 'docker' && args[0] === 'info') {
            return { stdout: JSON.stringify({ ServerVersion: '25.0.3' }), stderr: '' };
        }
        return { stdout: '', stderr: 'unknown command' };
    });
    return { mock, calls };
}
// ---- Tests ----
describe('DockerSandbox', () => {
    describe('constructor', () => {
        it('creates instance with default config', () => {
            const sandbox = new DockerSandbox(defaultConfig);
            expect(sandbox).toBeDefined();
            expect(sandbox.getConfig()).toEqual(defaultConfig);
        });
        it('accepts custom config', () => {
            const customConfig = {
                ...defaultConfig,
                image: 'ubuntu:22.04',
                constraints: {
                    ...defaultConstraints,
                    memory: '1g',
                    cpus: '2.0',
                },
            };
            const sandbox = new DockerSandbox(customConfig);
            expect(sandbox.getConfig().image).toBe('ubuntu:22.04');
            expect(sandbox.getConfig().constraints.memory).toBe('1g');
        });
    });
    describe('exec', () => {
        it('TC-005-3: creates container with correct constraints', async () => {
            const { mock, calls } = createExecMock();
            const sandbox = new DockerSandbox(defaultConfig);
            // Replace the internal exec
            sandbox.execFileAsync = mock;
            await sandbox.exec('echo hello');
            // Verify docker run was called
            expect(calls.length).toBeGreaterThanOrEqual(1);
            const dockerRun = calls.find(c => c.command === 'docker' && c.args[0] === 'run');
            expect(dockerRun).toBeDefined();
            expect(dockerRun.args).toContain('--network=none');
            expect(dockerRun.args).toContain('--memory=512m');
            expect(dockerRun.args).toContain('--cpus=1.0');
            expect(dockerRun.args).toContain('--read-only');
            expect(dockerRun.args).toContain('--rm');
            expect(dockerRun.args).toContain('alpine:latest');
        });
        it('TC-005-4: cleanup (container removed with --rm flag)', async () => {
            const { mock, calls } = createExecMock();
            const sandbox = new DockerSandbox(defaultConfig);
            sandbox.execFileAsync = mock;
            await sandbox.exec('echo test');
            // --rm flag ensures auto-cleanup; no explicit rm call needed
            const dockerRun = calls.find(c => c.command === 'docker' && c.args[0] === 'run');
            expect(dockerRun).toBeDefined();
            expect(dockerRun.args).toContain('--rm');
        });
        it('TC-005-5: command executed inside container returns result', async () => {
            const execMock = vi.fn();
            execMock.mockResolvedValue({ stdout: 'hello world\n', stderr: '' });
            const sandbox = new DockerSandbox(defaultConfig);
            sandbox.execFileAsync = execMock;
            const result = await sandbox.exec('echo hello world');
            expect(result.success).toBe(true);
            expect(result.stdout).toBe('hello world');
            expect(result.mode).toBe(SandboxMode.DOCKER);
            expect(result.exitCode).toBe(0);
        });
        it('handles command failure (non-zero exit code)', async () => {
            const execMock = vi.fn();
            const dockerError = new Error('docker run failed');
            dockerError.code = '1';
            execMock.mockRejectedValue(dockerError);
            const sandbox = new DockerSandbox(defaultConfig);
            sandbox.execFileAsync = execMock;
            const result = await sandbox.exec('exit 1');
            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
            expect(result.mode).toBe(SandboxMode.DOCKER);
        });
        it('handles timeout error', async () => {
            const execMock = vi.fn();
            const timeoutError = new Error('Signal: SIGKILL');
            timeoutError.killed = true;
            execMock.mockRejectedValue(timeoutError);
            const sandbox = new DockerSandbox(defaultConfig);
            sandbox.execFileAsync = execMock;
            const result = await sandbox.exec('sleep 999');
            expect(result.success).toBe(false);
            expect(result.stderr).toContain('timeout');
        });
        it('builds correct docker run args for complex command', async () => {
            const { mock, calls } = createExecMock();
            const sandbox = new DockerSandbox(defaultConfig);
            sandbox.execFileAsync = mock;
            await sandbox.exec('ls -la /tmp');
            const dockerRun = calls.find(c => c.command === 'docker' && c.args[0] === 'run');
            expect(dockerRun).toBeDefined();
            expect(dockerRun.args).toContain('ls');
            expect(dockerRun.args).toContain('-la');
            expect(dockerRun.args).toContain('/tmp');
        });
    });
    describe('buildRunArgs', () => {
        it('returns array of docker run arguments', () => {
            const sandbox = new DockerSandbox(defaultConfig);
            const args = sandbox.buildRunArgs('echo test');
            expect(Array.isArray(args)).toBe(true);
            expect(args[0]).toBe('run');
            expect(args).toContain('--network=none');
            expect(args).toContain('--memory=512m');
            expect(args).toContain('--cpus=1.0');
        });
        it('splits command string into arguments', () => {
            const sandbox = new DockerSandbox(defaultConfig);
            const args = sandbox.buildRunArgs('echo hello world');
            expect(args).toContain('echo');
            expect(args).toContain('hello');
            expect(args).toContain('world');
        });
    });
});
//# sourceMappingURL=DockerSandbox.test.js.map