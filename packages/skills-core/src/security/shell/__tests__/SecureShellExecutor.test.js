/**
 * @osai/skills-core -- SecureShellExecutor Tests (DOMAIN-003, T-004)
 *
 * Test cases from ROADMAP_TASKS_F-012.md:
 * TC-004-1: exec with allowed command -- executes successfully
 * TC-004-2: exec with blocked command -- returns ToolResult with success=false
 * TC-004-3: exec with timeout -- killed in time, returns ToolResult with success=false
 * TC-004-4: Audit log entry created for every exec
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SecureShellExecutor } from '../SecureShellExecutor.js';
import { ShellSecurity } from '../ShellSecurity.js';
// --- Platform-specific sleep command for timeout tests ---
function getSleepCommand(seconds) {
    if (process.platform === 'win32') {
        return `ping -n ${seconds + 1} 127.0.0.1`;
    }
    return `sleep ${seconds}`;
}
// --- Helper: extract stdout from ToolResult data ---
function extractStdout(result) {
    const data = result.data;
    if (data && typeof data['stdout'] === 'string') {
        return data['stdout'];
    }
    return '';
}
// --- Tests ---
describe('SecureShellExecutor', () => {
    let executor;
    let security;
    beforeEach(() => {
        security = new ShellSecurity();
        executor = new SecureShellExecutor(security);
    });
    // --- TC-004-1: Allowed command executes ---
    describe('TC-004-1: exec with allowed command', () => {
        it('should execute a simple command and return ToolResult with stdout', async () => {
            const result = await executor.exec({ command: 'echo hello-world' });
            expect(result.success).toBe(true);
            expect(extractStdout(result)).toContain('hello-world');
        });
        it('should include stdout and exitCode in data', async () => {
            const result = await executor.exec({ command: 'echo test-123' });
            expect(result.success).toBe(true);
            const data = result.data;
            expect(typeof data['stdout']).toBe('string');
            expect(typeof data['stderr']).toBe('string');
            expect(typeof data['exitCode']).toBe('number');
            expect(data['exitCode']).toBe(0);
        });
        it('should handle commands that produce stderr', async () => {
            // The command writes to stderr but exits with 0.
            // On Windows: ShellSecurity uses cmd.exe /c, so we pass the raw redirection.
            // On Unix: shell is /bin/sh -c.
            let command;
            if (process.platform === 'win32') {
                // Inside cmd.exe /c <command>, just use echo with >&2 redirection directly
                command = 'echo error 1>&2';
            }
            else {
                command = 'echo error >&2';
            }
            const result = await executor.exec({ command });
            // The command itself succeeds (exitCode 0), but stderr contains output
            expect(result.success).toBe(true);
            const data = result.data;
            expect(typeof data['stderr']).toBe('string');
            expect(data['stderr'].length).toBeGreaterThan(0);
        });
    });
    // --- TC-004-2: Blocked command returns success=false ---
    describe('TC-004-2: exec with blocked command', () => {
        it('should return success=false for "rm -rf /"', async () => {
            const result = await executor.exec({ command: 'rm -rf /' });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.toLowerCase()).toContain('blocked');
        });
        it('should return success=false for "sudo rm -rf /"', async () => {
            const result = await executor.exec({ command: 'sudo rm -rf /' });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.toLowerCase()).toContain('blocked');
        });
        it('should return success=false for "mkfs.ext4 /dev/sda1"', async () => {
            const result = await executor.exec({ command: 'mkfs.ext4 /dev/sda1' });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.toLowerCase()).toContain('blocked');
        });
        it('should not execute the blocked command (no stdout produced)', async () => {
            const result = await executor.exec({ command: 'rm -rf /' });
            expect(result.success).toBe(false);
            // Blocked commands should not have stdout -- exitCode should be -1
            const data = result.data;
            expect(data['exitCode']).toBe(-1);
            expect(data['stdout']).toBeUndefined();
        });
        it('should return success=false for user-configured blocked commands', async () => {
            const customSecurity = new ShellSecurity({
                blockedCommands: ['shutdown'],
            });
            const customExecutor = new SecureShellExecutor(customSecurity);
            const result = await customExecutor.exec({ command: 'shutdown -h now' });
            expect(result.success).toBe(false);
            expect(result.error?.toLowerCase()).toContain('blocked');
        });
    });
    // --- TC-004-3: Timeout enforcement ---
    describe('TC-004-3: exec with timeout', () => {
        it('should kill a long-running command and return success=false', async () => {
            const sleepCommand = getSleepCommand(10);
            const shortTimeoutExecutor = new SecureShellExecutor(new ShellSecurity());
            const startTime = Date.now();
            const result = await shortTimeoutExecutor.exec({
                command: sleepCommand,
                timeout: 500,
            });
            const elapsed = Date.now() - startTime;
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.toLowerCase()).toContain('timed out');
            // Should have completed well before the 10s sleep
            expect(elapsed).toBeLessThan(3000);
        }, 10000);
        it('should include timeout info in ToolResult data', async () => {
            const sleepCommand = getSleepCommand(10);
            const shortTimeoutExecutor = new SecureShellExecutor(new ShellSecurity());
            const result = await shortTimeoutExecutor.exec({
                command: sleepCommand,
                timeout: 500,
            });
            expect(result.success).toBe(false);
            const data = result.data;
            expect(data['timedOut']).toBe(true);
            expect(data['exitCode']).toBe(-1);
        }, 10000);
        it('should kill long-running command without waiting for full command duration', async () => {
            const sleepCommand = getSleepCommand(60);
            const shortTimeoutExecutor = new SecureShellExecutor(new ShellSecurity());
            const startTime = Date.now();
            await shortTimeoutExecutor.exec({
                command: sleepCommand,
                timeout: 300,
            });
            const elapsed = Date.now() - startTime;
            // Should NOT wait 60 seconds
            expect(elapsed).toBeLessThan(5000);
        }, 10000);
    });
    // --- TC-004-4: Audit log entry ---
    describe('TC-004-4: Audit log entry for every exec', () => {
        it('should create an audit log entry for a successful command', async () => {
            await executor.exec({ command: 'echo audit-test' });
            const logEntries = security.getLogEntries();
            expect(logEntries).toHaveLength(1);
            expect(logEntries[0]?.command).toBe('echo audit-test');
        });
        it('should create an audit log entry for a blocked command', async () => {
            await executor.exec({ command: 'rm -rf /' });
            const logEntries = security.getLogEntries();
            expect(logEntries).toHaveLength(1);
            expect(logEntries[0]?.command).toBe('rm -rf /');
            expect(logEntries[0]?.exitCode).toBe(-1);
        });
        it('should create an audit log entry for a timed-out command', async () => {
            const sleepCommand = getSleepCommand(10);
            await executor.exec({
                command: sleepCommand,
                timeout: 500,
            });
            const logEntries = security.getLogEntries();
            expect(logEntries).toHaveLength(1);
            expect(logEntries[0]?.timedOut).toBe(true);
            expect(logEntries[0]?.exitCode).toBe(-1);
        }, 10000);
        it('should accumulate log entries across multiple exec calls', async () => {
            await executor.exec({ command: 'echo first' });
            await executor.exec({ command: 'echo second' });
            await executor.exec({ command: 'rm -rf /' });
            const logEntries = security.getLogEntries();
            expect(logEntries).toHaveLength(3);
            expect(logEntries[0]?.command).toBe('echo first');
            expect(logEntries[1]?.command).toBe('echo second');
            expect(logEntries[2]?.command).toBe('rm -rf /');
        });
        it('should include timestamp in audit log entry', async () => {
            await executor.exec({ command: 'echo timestamp-test' });
            const logEntries = security.getLogEntries();
            const timestamp = logEntries[0]?.timestamp;
            expect(timestamp).toBeDefined();
            const parsed = Date.parse(timestamp);
            expect(parsed).not.toBeNull();
            expect(parsed).not.toBeNaN();
        });
        it('should include cwd in audit log entry', async () => {
            const customSecurity = new ShellSecurity({ cwd: '/custom/path' });
            const customExecutor = new SecureShellExecutor(customSecurity);
            await customExecutor.exec({ command: 'echo cwd-test' });
            const logEntries = customSecurity.getLogEntries();
            expect(logEntries[0]?.cwd).toBe('/custom/path');
        });
        it('should include durationMs in audit log entry', async () => {
            await executor.exec({ command: 'echo duration-test' });
            const logEntries = security.getLogEntries();
            expect(typeof logEntries[0]?.durationMs).toBe('number');
            expect(logEntries[0]?.durationMs).toBeGreaterThanOrEqual(0);
        });
    });
    // --- Edge cases ---
    describe('edge cases', () => {
        it('should handle empty command string', async () => {
            const result = await executor.exec({ command: '' });
            // Empty command is not blocked, but shell returns error
            // (on Unix: exit 0 with no output; on Windows: may vary)
            // The key is it should not crash
            expect(result).toBeDefined();
            expect(typeof result.success).toBe('boolean');
        });
        it('should handle command with non-zero exit code', async () => {
            const result = await executor.exec({ command: 'exit 42' });
            expect(result.success).toBe(false);
            const data = result.data;
            expect(data['exitCode']).toBe(42);
        });
        it('should return ToolResult type (interface compliance)', async () => {
            const result = await executor.exec({ command: 'echo type-check' });
            // Verify ToolResult interface shape
            expect('success' in result).toBe(true);
            expect(typeof result.success).toBe('boolean');
            if (!result.success) {
                // On failure, error should be a string
                expect(typeof result.error).toBe('string');
            }
        });
    });
    // --- Constructor validation ---
    describe('constructor', () => {
        it('should create executor with ShellSecurity instance', () => {
            const sec = new ShellSecurity();
            const exec = new SecureShellExecutor(sec);
            expect(exec).toBeDefined();
        });
        it('should expose the underlying ShellSecurity', () => {
            const sec = new ShellSecurity();
            const exec = new SecureShellExecutor(sec);
            expect(exec.getSecurity()).toBe(sec);
        });
    });
});
//# sourceMappingURL=SecureShellExecutor.test.js.map