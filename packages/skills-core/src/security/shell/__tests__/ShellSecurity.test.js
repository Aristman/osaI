/**
 * @osai/skills-core -- ShellSecurity Tests (DOMAIN-003, T-003)
 *
 * Test cases from ROADMAP_TASKS_F-012.md:
 * TC-003-1: Normal command is allowed (via validate)
 * TC-003-2: Blocked command is rejected (via validate + execute)
 * TC-003-5: Timeout enforcement -- process killed through timeout
 * TC-003-6: Timeout configurable from osai.json
 * TC-003-7: Command logging (command, cwd, exit_code, timestamp)
 * TC-003-8: Configurable blocked commands from osai.json
 */
import { describe, it, expect } from 'vitest';
import { ShellSecurity } from '../ShellSecurity.js';
import { resolveConfig } from '../ShellSecurity.js';
// --- Platform-specific long-running command ---
/**
 * Returns a command that will run for approximately `seconds` seconds.
 * On Windows: `ping -n <count+1> 127.0.0.1` (1 ping per second)
 * On Linux/macOS: `sleep <seconds>`
 */
function getSleepCommand(seconds) {
    if (process.platform === 'win32') {
        // ping sends 1 request per second, -n count+1 to account for startup
        return `ping -n ${seconds + 1} 127.0.0.1`;
    }
    return `sleep ${seconds}`;
}
// --- Tests ---
describe('ShellSecurity', () => {
    describe('Configuration', () => {
        it('should use default timeout of 120000ms', () => {
            const security = new ShellSecurity();
            expect(security.getTimeoutMs()).toBe(120_000);
        });
        it('TC-003-6: should accept custom timeout from config', () => {
            const security = new ShellSecurity({ timeoutMs: 5000 });
            expect(security.getTimeoutMs()).toBe(5000);
        });
        it('should use process.cwd() as default cwd', () => {
            const security = new ShellSecurity();
            expect(security.getCwd()).toBe(process.cwd());
        });
        it('should accept custom cwd from config', () => {
            const security = new ShellSecurity({ cwd: '/tmp' });
            expect(security.getCwd()).toBe('/tmp');
        });
    });
    describe('resolveConfig', () => {
        it('should merge user config with defaults', () => {
            const config = resolveConfig({ timeoutMs: 60_000 });
            expect(config.timeoutMs).toBe(60_000);
            expect(config.cwd).toBe(process.cwd());
            expect(config.userBlockedCommands).toHaveLength(0);
        });
        it('should handle undefined user config', () => {
            const config = resolveConfig();
            expect(config.timeoutMs).toBe(120_000);
            expect(config.cwd).toBe(process.cwd());
        });
        it('should map user blocked commands', () => {
            const config = resolveConfig({ blockedCommands: ['shutdown', 'reboot'] });
            expect(config.userBlockedCommands).toHaveLength(2);
            expect(config.userBlockedCommands[0].pattern).toBe('shutdown');
            expect(config.userBlockedCommands[1].pattern).toBe('reboot');
        });
    });
    describe('TC-003-1: validate() -- normal commands are allowed', () => {
        it('should allow "ls -la"', () => {
            const security = new ShellSecurity();
            const result = security.validate('ls -la');
            expect(result.allowed).toBe(true);
        });
        it('should allow "echo test"', () => {
            const security = new ShellSecurity();
            const result = security.validate('echo test');
            expect(result.allowed).toBe(true);
        });
    });
    describe('TC-003-2: validate() -- blocked commands are rejected', () => {
        it('should block "rm -rf /"', () => {
            const security = new ShellSecurity();
            const result = security.validate('rm -rf /');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Destructive');
        });
        it('should block "sudo rm -rf /"', () => {
            const security = new ShellSecurity();
            const result = security.validate('sudo rm -rf /');
            expect(result.allowed).toBe(false);
        });
        it('should block "mkfs.ext4"', () => {
            const security = new ShellSecurity();
            const result = security.validate('mkfs.ext4 /dev/sda1');
            expect(result.allowed).toBe(false);
        });
        it('should block "dd if=/dev/zero"', () => {
            const security = new ShellSecurity();
            const result = security.validate('dd if=/dev/zero of=/dev/sda');
            expect(result.allowed).toBe(false);
        });
    });
    describe('execute() -- command execution', () => {
        it('should execute a simple command successfully', async () => {
            const security = new ShellSecurity();
            const result = await security.execute('echo hello');
            expect(result.success).toBe(true);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('hello');
        });
        it('should execute a failing command', async () => {
            const security = new ShellSecurity();
            const result = await security.execute('exit 42');
            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(42);
        });
        it('should reject blocked commands without executing', async () => {
            const security = new ShellSecurity();
            const result = await security.execute('rm -rf /');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Blocked command');
        });
        it('TC-003-8: should reject user-configured blocked commands', async () => {
            const security = new ShellSecurity({
                blockedCommands: ['shutdown'],
            });
            const result = await security.execute('shutdown -h now');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Blocked command');
        });
    });
    describe('TC-003-5: Timeout enforcement', () => {
        it('should kill a long-running command after timeout', async () => {
            const security = new ShellSecurity();
            const sleepCommand = getSleepCommand(10); // 10 seconds
            const startTime = Date.now();
            const result = await security.execute(sleepCommand, {
                timeoutMs: 500, // 500ms
            });
            const elapsed = Date.now() - startTime;
            expect(result.success).toBe(false);
            expect(result.error).toContain('timed out');
            expect(result.exitCode).toBe(-1);
            // Should complete in roughly 500ms, give generous margin
            expect(elapsed).toBeLessThan(3000);
        }, 10000);
    });
    describe('TC-003-7: Command logging', () => {
        it('should log every command execution', async () => {
            const security = new ShellSecurity();
            await security.execute('echo test');
            const entries = security.getLogEntries();
            expect(entries).toHaveLength(1);
        });
        it('should log blocked command attempts', async () => {
            const security = new ShellSecurity();
            await security.execute('rm -rf /');
            const entries = security.getLogEntries();
            expect(entries).toHaveLength(1);
        });
        it('should include command in log entry', async () => {
            const security = new ShellSecurity();
            await security.execute('echo hello');
            const entries = security.getLogEntries();
            expect(entries[0]?.command).toBe('echo hello');
        });
        it('should include cwd in log entry', async () => {
            const security = new ShellSecurity({ cwd: '/tmp' });
            await security.execute('echo hello');
            const entries = security.getLogEntries();
            expect(entries[0]?.cwd).toBe('/tmp');
        });
        it('should include exit_code in log entry', async () => {
            const security = new ShellSecurity();
            await security.execute('echo hello');
            const entries = security.getLogEntries();
            expect(entries[0]?.exitCode).toBe(0);
        });
        it('should include timestamp in log entry', async () => {
            const security = new ShellSecurity();
            await security.execute('echo hello');
            const entries = security.getLogEntries();
            const timestamp = entries[0]?.timestamp;
            expect(timestamp).toBeDefined();
            // Verify it is a valid ISO 8601 date
            const parsed = Date.parse(timestamp);
            expect(parsed).not.toBeNull();
            expect(parsed).not.toBeNaN();
        });
        it('should include durationMs in log entry', async () => {
            const security = new ShellSecurity();
            await security.execute('echo hello');
            const entries = security.getLogEntries();
            expect(typeof entries[0]?.durationMs).toBe('number');
            expect(entries[0]?.durationMs).toBeGreaterThanOrEqual(0);
        });
        it('should mark timedOut=true for timeout kills', async () => {
            const security = new ShellSecurity();
            const sleepCommand = getSleepCommand(10);
            const result = await security.execute(sleepCommand, {
                timeoutMs: 500,
            });
            expect(result.logEntry.timedOut).toBe(true);
        }, 10000);
        it('should mark timedOut=false for normal execution', async () => {
            const security = new ShellSecurity();
            await security.execute('echo hello');
            const entries = security.getLogEntries();
            expect(entries[0]?.timedOut).toBe(false);
        });
        it('should accumulate log entries across multiple executions', async () => {
            const security = new ShellSecurity();
            await security.execute('echo first');
            await security.execute('echo second');
            await security.execute('rm -rf /'); // blocked
            const entries = security.getLogEntries();
            expect(entries).toHaveLength(3);
            expect(entries[0]?.command).toBe('echo first');
            expect(entries[1]?.command).toBe('echo second');
            expect(entries[2]?.command).toBe('rm -rf /');
        });
    });
    describe('getValidator()', () => {
        it('should return the underlying CommandValidator', () => {
            const security = new ShellSecurity();
            const validator = security.getValidator();
            expect(validator).toBeDefined();
            expect(validator.getBlockedPatterns().length).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=ShellSecurity.test.js.map