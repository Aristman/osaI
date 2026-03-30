/**
 * @osai/skills-core -- CommandValidator Tests (DOMAIN-003, T-003)
 *
 * Test cases from ROADMAP_TASKS_F-012.md:
 * TC-003-1: Обычная команда (ls -la) -- разрешена
 * TC-003-2: "rm -rf /" -- заблокирована
 * TC-003-3: "mkfs.ext4" -- заблокирована
 * TC-003-4: "sudo rm -rf /" -- заблокирована (sudo prefix strip)
 * TC-003-8: Конфигурируемый blocked_commands из osai.json
 */
export {};
//# sourceMappingURL=CommandValidator.test.d.ts.map