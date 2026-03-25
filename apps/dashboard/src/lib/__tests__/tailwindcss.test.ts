/**
 * T001-UNIT-003: TailwindCSS classes work
 * Preconditions: TailwindCSS configured
 * Expected result: Elements with Tailwind classes have correct styles
 * Pass criteria: CSS classes applied, custom theme variables defined
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', '..');

describe('T001-UNIT-003: TailwindCSS configuration', () => {
  it('app.css exists and uses TailwindCSS v4', () => {
    // TailwindCSS v4 uses CSS-based config via @import 'tailwindcss'
    // So we check app.css for the import instead of tailwind.config.js
    const cssPath = resolve(srcDir, 'app.css');
    expect(existsSync(cssPath), 'app.css should exist').toBe(true);
  });

  it('app.css imports tailwindcss', () => {
    const cssPath = resolve(srcDir, 'app.css');
    const css = readFileSync(cssPath, 'utf-8');
    expect(css).toContain("@import 'tailwindcss'");
  });

  it('postcss.config.js exists and includes tailwindcss', () => {
    const configPath = resolve(srcDir, '..', 'postcss.config.js');
    expect(existsSync(configPath), 'postcss.config.js should exist').toBe(true);
    const config = readFileSync(configPath, 'utf-8');
    expect(config).toContain('tailwindcss');
  });

  it('custom osaI theme variables are defined', () => {
    const cssPath = resolve(srcDir, 'app.css');
    const css = readFileSync(cssPath, 'utf-8');
    expect(css).toContain('@theme');
    expect(css).toContain('--color-osai-primary-500');
    expect(css).toContain('--color-osai-surface-900');
    expect(css).toContain('--color-osai-text-primary');
  });

  it('layout uses TailwindCSS utility classes', () => {
    const layoutPath = resolve(srcDir, 'routes', '+layout.svelte');
    const source = readFileSync(layoutPath, 'utf-8');

    // Check for standard Tailwind classes
    expect(source).toContain('flex');
    expect(source).toContain('h-screen');
  });

  it('layout uses osaI custom theme classes', () => {
    const layoutPath = resolve(srcDir, 'routes', '+layout.svelte');
    const source = readFileSync(layoutPath, 'utf-8');

    // Check for custom theme class usage (bg-osai-surface-900 and text-osai-* are in layout)
    expect(source).toContain('bg-osai-surface-900');
    expect(source).toContain('text-osai-text-');
  });
});
