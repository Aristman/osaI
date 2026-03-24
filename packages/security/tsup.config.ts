import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  tsconfig: './tsconfig.types.json',
  sourcemap: true,
  clean: true,
  outDir: 'dist',
});
