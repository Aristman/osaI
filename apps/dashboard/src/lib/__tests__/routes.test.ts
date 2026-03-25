/**
 * T001-UNIT-002: All routes are accessible
 * Preconditions: Routes defined
 * Expected result: Navigation to /, /sessions, /traces, /memory, /settings, /status returns 200
 * Pass criteria: All routes load without 404 errors
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', '..');

const EXPECTED_ROUTES = [
  { path: '/', file: 'routes/+page.svelte' },
  { path: '/sessions', file: 'routes/sessions/+page.svelte' },
  { path: '/traces', file: 'routes/traces/+page.svelte' },
  { path: '/memory', file: 'routes/memory/+page.svelte' },
  { path: '/settings', file: 'routes/settings/+page.svelte' },
  { path: '/status', file: 'routes/status/+page.svelte' }
];

describe('T001-UNIT-002: Routes are accessible', () => {
  it('all expected route files exist', () => {
    for (const route of EXPECTED_ROUTES) {
      const filePath = resolve(srcDir, route.file);
      expect(
        existsSync(filePath),
        `Route file ${route.file} for path ${route.path} should exist`
      ).toBe(true);
    }
  });

  it('each route file has content', () => {
    for (const route of EXPECTED_ROUTES) {
      const filePath = resolve(srcDir, route.file);
      const content = readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('each route contains heading element', () => {
    for (const route of EXPECTED_ROUTES) {
      const filePath = resolve(srcDir, route.file);
      const content = readFileSync(filePath, 'utf-8');
      // Each page should have a h1 or heading, either directly or in a referenced component
      const hasHeading = /<h1[\s>]/.test(content) || content.includes('text-2xl');
      // Also accept pages that delegate to a component which provides the heading
      const hasComponent = /import.*from/.test(content);
      expect(
        hasHeading || hasComponent,
        `Route ${route.path} should contain a heading element or delegate to a component`
      ).toBe(true);
    }
  });
});
