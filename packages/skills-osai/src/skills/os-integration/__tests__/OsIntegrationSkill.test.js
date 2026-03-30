/**
 * @osai/skills-osai -- OS Integration Skill Unit Tests
 *
 * TC-008-6: show_notification delegates to OsIntegration.notify()
 * TC-008-7: list_processes delegates to OsIntegration.listProcesses()
 * TC-008-8: get_system_info delegates to OsIntegration.getSystemInfo()
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// ---------------------------------------------------------------------------
// Mock @osai/observability
// ---------------------------------------------------------------------------
vi.mock('@osai/observability', () => ({
    LoggerFactory: {
        create: vi.fn().mockReturnValue({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        }),
    },
}));
// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { OsIntegrationSkill } from '../OsIntegrationSkill.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockOsIntegrationService() {
    return {
        notify: vi.fn(),
        listProcesses: vi.fn(),
        getSystemInfo: vi.fn(),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('OsIntegrationSkill', () => {
    let skill;
    let mockService;
    beforeEach(() => {
        vi.clearAllMocks();
        mockService = createMockOsIntegrationService();
        skill = new OsIntegrationSkill({ osIntegrationService: mockService });
    });
    // -------------------------------------------------------------------------
    // getDefinition
    // -------------------------------------------------------------------------
    describe('getDefinition', () => {
        it('returns a valid SkillDefinition', () => {
            const definition = skill.getDefinition();
            expect(definition.name).toBe('os-integration');
            expect(definition.version).toBe('1.0.0');
            expect(definition.category).toBe('osaI');
            expect(definition.enabled).toBe(true);
            expect(definition.tools).toHaveLength(3);
        });
        it('has correct tool names', () => {
            const definition = skill.getDefinition();
            const toolNames = definition.tools.map(t => t.name);
            expect(toolNames).toContain('show_notification');
            expect(toolNames).toContain('list_processes');
            expect(toolNames).toContain('get_system_info');
        });
        it('has correct permission mapping', () => {
            const definition = skill.getDefinition();
            expect(definition.permissions['show_notification']).toBe('confirm');
            expect(definition.permissions['list_processes']).toBe('auto');
            expect(definition.permissions['get_system_info']).toBe('auto');
        });
        it('tools have valid JSON Schema parameters', () => {
            const definition = skill.getDefinition();
            for (const tool of definition.tools) {
                expect(tool.parameters.type).toBe('object');
                expect(tool.parameters.properties).toBeDefined();
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-008-6: show_notification
    // -------------------------------------------------------------------------
    describe('show_notification (TC-008-6)', () => {
        it('delegates to OsIntegrationService.notify() with title and message', async () => {
            vi.mocked(mockService.notify).mockResolvedValue({ ok: true });
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'show_notification');
            const result = await tool.handler({ title: 'Test Title', message: 'Test message' });
            expect(mockService.notify).toHaveBeenCalledOnce();
            expect(mockService.notify).toHaveBeenCalledWith({ title: 'Test Title', message: 'Test message' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ notified: true, title: 'Test Title' });
            }
        });
        it('sends notification without message', async () => {
            vi.mocked(mockService.notify).mockResolvedValue({ ok: true });
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'show_notification');
            const result = await tool.handler({ title: 'Alert' });
            expect(mockService.notify).toHaveBeenCalledWith({ title: 'Alert', message: undefined });
            expect(result.success).toBe(true);
        });
        it('returns error when title is missing', async () => {
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'show_notification');
            const result = await tool.handler({ message: 'no title' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('title');
            }
            expect(mockService.notify).not.toHaveBeenCalled();
        });
        it('returns error when notification service fails', async () => {
            vi.mocked(mockService.notify).mockResolvedValue({ ok: false, error: 'Notification daemon not running' });
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'show_notification');
            const result = await tool.handler({ title: 'Fail' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Notification daemon not running');
            }
        });
        it('returns error when service throws', async () => {
            vi.mocked(mockService.notify).mockRejectedValue(new Error('Service crashed'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'show_notification');
            const result = await tool.handler({ title: 'Test' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Service crashed');
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-008-7: list_processes
    // -------------------------------------------------------------------------
    describe('list_processes (TC-008-7)', () => {
        it('delegates to OsIntegrationService.listProcesses()', async () => {
            const processes = [
                { pid: 1, name: 'systemd', cpu: 0.1, mem: 0.5, status: 'running' },
                { pid: 1234, name: 'node', cpu: 5.2, mem: 3.1, status: 'running' },
            ];
            vi.mocked(mockService.listProcesses).mockResolvedValue(processes);
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'list_processes');
            const result = await tool.handler({});
            expect(mockService.listProcesses).toHaveBeenCalledOnce();
            expect(mockService.listProcesses).toHaveBeenCalledWith(undefined);
            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data;
                expect(data).toHaveLength(2);
                expect(data[0].name).toBe('systemd');
                expect(data[1].name).toBe('node');
            }
        });
        it('passes filter to service', async () => {
            vi.mocked(mockService.listProcesses).mockResolvedValue([]);
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'list_processes');
            await tool.handler({ filter: 'node' });
            expect(mockService.listProcesses).toHaveBeenCalledWith({ name: 'node' });
        });
        it('returns empty array when no processes match', async () => {
            vi.mocked(mockService.listProcesses).mockResolvedValue([]);
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'list_processes');
            const result = await tool.handler({ filter: 'nonexistent' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual([]);
            }
        });
        it('returns error when service throws', async () => {
            vi.mocked(mockService.listProcesses).mockRejectedValue(new Error('Access denied'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'list_processes');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Access denied');
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-008-8: get_system_info
    // -------------------------------------------------------------------------
    describe('get_system_info (TC-008-8)', () => {
        it('delegates to OsIntegrationService.getSystemInfo()', async () => {
            const systemInfo = {
                cpu: {
                    model: 'Intel Core i7-12700K',
                    physicalCores: 12,
                    logicalCores: 20,
                    speed: 3.6,
                    load: 25.5,
                },
                memory: {
                    total: 32768,
                    used: 16384,
                    free: 16384,
                    swapTotal: 8192,
                    swapUsed: 1024,
                },
                disk: [
                    { mount: 'C:', fsType: 'NTFS', totalGb: 512, usedGb: 256, freeGb: 256, usedPercent: 50 },
                ],
            };
            vi.mocked(mockService.getSystemInfo).mockResolvedValue(systemInfo);
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'get_system_info');
            const result = await tool.handler({});
            expect(mockService.getSystemInfo).toHaveBeenCalledOnce();
            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data;
                expect(data.cpu.model).toBe('Intel Core i7-12700K');
                expect(data.cpu.logicalCores).toBe(20);
                expect(data.memory.total).toBe(32768);
                expect(data.disk).toHaveLength(1);
                expect(data.disk[0].mount).toBe('C:');
            }
        });
        it('returns error when service throws', async () => {
            vi.mocked(mockService.getSystemInfo).mockRejectedValue(new Error('systeminformation unavailable'));
            const definition = skill.getDefinition();
            const tool = definition.tools.find(t => t.name === 'get_system_info');
            const result = await tool.handler({});
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('systeminformation unavailable');
            }
        });
    });
});
//# sourceMappingURL=OsIntegrationSkill.test.js.map