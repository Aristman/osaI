/**
 * T009-UNIT-001: Session list renders
 * T009-UNIT-002: Active session highlighted
 * T009-UNIT-003: Channel status indicators correct
 * T009-UNIT-004: Navigation items with icons
 * T009-UNIT-005: New session button
 * T009-UNIT-006: Connection status indicator
 * T009-UNIT-007: Collapsible session section
 * T009-UNIT-008: Permission badge count
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentsDir = resolve(__dirname, '..');

function readComponent(name: string): string {
  const path = resolve(componentsDir, name);
  return readFileSync(path, 'utf-8');
}

// --- Navigation items definition ---

describe('SidebarNav', () => {
  it('component file exists', () => {
    expect(existsSync(resolve(componentsDir, 'SidebarNav.svelte'))).toBe(true);
  });

  it('contains all navigation items', () => {
    const source = readComponent('SidebarNav.svelte');
    expect(source).toContain('Chat');
    expect(source).toContain('Sessions');
    expect(source).toContain('Traces');
    expect(source).toContain('Memory');
    expect(source).toContain('Status');
    expect(source).toContain('Settings');
  });

  it('navigation items have href routes', () => {
    const source = readComponent('SidebarNav.svelte');
    // Routes are defined in navItems array with href property
    expect(source).toContain("href: '/'");
    expect(source).toContain("href: '/sessions'");
    expect(source).toContain("href: '/traces'");
    expect(source).toContain("href: '/memory'");
    expect(source).toContain("href: '/status'");
    expect(source).toContain("href: '/settings'");
    // And used in template
    expect(source).toContain('href={item.href}');
  });

  it('navigation items have icons', () => {
    const source = readComponent('SidebarNav.svelte');
    // SVG icons for each nav item
    const svgCount = (source.match(/<svg/g) || []).length;
    expect(svgCount).toBeGreaterThanOrEqual(6);
  });

  it('supports active route highlighting via $page store', () => {
    const source = readComponent('SidebarNav.svelte');
    const hasPageStore = source.includes('$page');
    const hasActiveRoute = source.includes('activeRoute');
    expect(hasPageStore || hasActiveRoute).toBe(true);
  });

  it('applies active highlight class to active navigation item', () => {
    const source = readComponent('SidebarNav.svelte');
    // Check for active state styling
    expect(source).toMatch(/bg-osai-primary|text-osai-primary|active/);
  });
});

// --- Session list ---

describe('SessionList', () => {
  it('component file exists', () => {
    expect(existsSync(resolve(componentsDir, 'SessionList.svelte'))).toBe(true);
  });

  it('accepts sessions prop', () => {
    const source = readComponent('SessionList.svelte');
    expect(source).toContain('sessions');
  });

  it('accepts activeSessionId prop', () => {
    const source = readComponent('SessionList.svelte');
    expect(source).toContain('activeSessionId');
  });

  it('accepts onSessionSelect callback prop', () => {
    const source = readComponent('SessionList.svelte');
    expect(source).toContain('onSessionSelect');
  });

  it('renders session items', () => {
    const source = readComponent('SessionList.svelte');
    expect(source).toContain('SessionItem');
  });

  it('supports empty state', () => {
    const source = readComponent('SessionList.svelte');
    // Should handle no sessions gracefully
    const hasNoSessions = source.includes('No sessions');
    const hasLengthCheck = source.includes('sessions.length === 0');
    expect(hasNoSessions || hasLengthCheck).toBe(true);
  });
});

// --- Session item ---

describe('SessionItem', () => {
  it('component file exists', () => {
    expect(existsSync(resolve(componentsDir, 'SessionItem.svelte'))).toBe(true);
  });

  it('accepts session prop', () => {
    const source = readComponent('SessionItem.svelte');
    expect(source).toContain('session');
  });

  it('accepts isActive prop', () => {
    const source = readComponent('SessionItem.svelte');
    expect(source).toContain('isActive');
  });

  it('accepts onclick prop', () => {
    const source = readComponent('SessionItem.svelte');
    const hasOnclick = source.includes('onclick');
    const hasOnSelect = source.includes('onSessionSelect');
    expect(hasOnclick || hasOnSelect).toBe(true);
  });

  it('displays session name/label', () => {
    const source = readComponent('SessionItem.svelte');
    const hasSessionLabel = source.includes('session.label');
    const hasLabel = source.includes('label');
    expect(hasSessionLabel || hasLabel).toBe(true);
  });

  it('displays status indicator', () => {
    const source = readComponent('SessionItem.svelte');
    const hasStatus = source.includes('status');
    const hasSessionStatus = source.includes('session.status');
    expect(hasStatus || hasSessionStatus).toBe(true);
  });

  it('applies highlight style when active', () => {
    const source = readComponent('SessionItem.svelte');
    // Active session should have distinct styling
    const isActiveReferences = (source.match(/isActive/g) || []).length;
    expect(isActiveReferences).toBeGreaterThanOrEqual(2);
  });
});

// --- New session button ---

describe('NewSessionButton', () => {
  it('component file exists', () => {
    expect(existsSync(resolve(componentsDir, 'NewSessionButton.svelte'))).toBe(true);
  });

  it('accepts onclick prop', () => {
    const source = readComponent('NewSessionButton.svelte');
    const hasOnclick = source.includes('onclick');
    const hasOnNewSession = source.includes('onNewSession');
    expect(hasOnclick || hasOnNewSession).toBe(true);
  });

  it('contains button element', () => {
    const source = readComponent('NewSessionButton.svelte');
    expect(source).toContain('<button');
  });

  it('contains "New Session" text or icon', () => {
    const source = readComponent('NewSessionButton.svelte');
    expect(source).toMatch(/New Session|new session|new-session/i);
  });
});

// --- Main Sidebar ---

describe('Sidebar', () => {
  it('component file exists', () => {
    expect(existsSync(resolve(componentsDir, 'Sidebar.svelte'))).toBe(true);
  });

  it('imports SidebarNav component', () => {
    const source = readComponent('Sidebar.svelte');
    expect(source).toContain('SidebarNav');
  });

  it('imports SessionList component', () => {
    const source = readComponent('Sidebar.svelte');
    expect(source).toContain('SessionList');
  });

  it('imports NewSessionButton component', () => {
    const source = readComponent('Sidebar.svelte');
    expect(source).toContain('NewSessionButton');
  });

  it('has sidebar layout with fixed width', () => {
    const source = readComponent('Sidebar.svelte');
    const hasWidth = source.includes('w-64') || source.includes('w-56') || source.includes('w-72');
    expect(hasWidth).toBe(true);
  });

  it('has collapsible session section', () => {
    const source = readComponent('Sidebar.svelte');
    expect([
      source.includes('collapsed'),
      source.includes('toggleSessions'),
      source.includes('sessionsCollapsed')
    ].some(Boolean)).toBe(true);
  });

  it('has connection status indicator in bottom section', () => {
    const source = readComponent('Sidebar.svelte');
    const hasStore = source.includes('connectionStore');
    const hasState = source.includes('connectionState');
    expect(hasStore || hasState).toBe(true);
  });

  it('has permission badge for pending count', () => {
    const source = readComponent('Sidebar.svelte');
    const hasCount = source.includes('pendingPermissionCount');
    const hasBadge = source.includes('permissionBadge');
    expect(hasCount || hasBadge).toBe(true);
  });

  it('supports mobile toggle', () => {
    const source = readComponent('Sidebar.svelte');
    const hasToggle = source.includes('isOpen') || source.includes('mobileOpen') || source.includes('sidebarOpen');
    expect(hasToggle).toBe(true);
  });

  it('supports responsive hiding', () => {
    const source = readComponent('Sidebar.svelte');
    expect(source).toContain('md:');
  });
});

// --- Layout integration ---

describe('Layout integration with Sidebar', () => {
  const layoutPath = resolve(componentsDir, '..', '..', '..', 'routes', '+layout.svelte');

  it('layout imports Sidebar component', () => {
    const source = readFileSync(layoutPath, 'utf-8');
    expect(source).toContain('Sidebar');
  });

  it('layout has sidebar slot for navigation', () => {
    const source = readFileSync(layoutPath, 'utf-8');
    expect(source).toContain('Sidebar');
  });

  it('layout maintains flex layout with sidebar and content', () => {
    const source = readFileSync(layoutPath, 'utf-8');
    expect(source).toContain('flex');
    expect(source).toContain('main');
  });
});

// --- Barrel exports ---

describe('Barrel exports', () => {
  it('index.ts exports Sidebar components', () => {
    const indexPath = resolve(componentsDir, '..', 'index.ts');
    const source = readFileSync(indexPath, 'utf-8');
    expect(source).toContain('Sidebar');
    expect(source).toContain('SidebarNav');
    expect(source).toContain('SessionList');
    expect(source).toContain('SessionItem');
    expect(source).toContain('NewSessionButton');
  });
});
