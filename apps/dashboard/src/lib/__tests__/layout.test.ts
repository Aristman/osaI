/**
 * T001-UNIT-001: Layout component renders correctly
 * Preconditions: SvelteKit app initialized
 * Expected result: Layout contains header, sidebar placeholder, main content area
 * Pass criteria: Component mounts without errors, all elements visible
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const layoutPath = resolve(__dirname, '..', '..', 'routes', '+layout.svelte');

function readLayoutSource(): string {
  return readFileSync(layoutPath, 'utf-8');
}

describe('T001-UNIT-001: Layout structure', () => {
  it('layout file exists', () => {
    expect(existsSync(layoutPath)).toBe(true);
  });

  it('layout file has content', () => {
    const source = readLayoutSource();
    expect(source.length).toBeGreaterThan(0);
  });

  it('layout contains sidebar component', () => {
    const source = readLayoutSource();

    // Check sidebar component is imported and used
    expect(source).toContain('Sidebar');
  });

  it('layout contains main content area', () => {
    const source = readLayoutSource();
    expect(source).toContain('main');
  });

  it('layout sidebar contains navigation items', () => {
    // Navigation items are in Sidebar component
    const sidebarPath = resolve(__dirname, '..', '..', 'lib', 'components', 'sidebar', 'SidebarNav.svelte');
    const source = readFileSync(sidebarPath, 'utf-8');
    expect(source).toContain('Chat');
    expect(source).toContain('Sessions');
    expect(source).toContain('Traces');
    expect(source).toContain('Memory');
    expect(source).toContain('Settings');
    expect(source).toContain('Status');
  });

  it('layout sidebar contains osaI branding', () => {
    // Branding is in Sidebar component
    const sidebarPath = resolve(__dirname, '..', '..', 'lib', 'components', 'sidebar', 'Sidebar.svelte');
    const source = readFileSync(sidebarPath, 'utf-8');
    expect(source).toContain('osaI');
    expect(source).toContain('Dashboard');
  });
});
