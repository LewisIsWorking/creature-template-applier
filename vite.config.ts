import { defineConfig } from 'vite';

/**
 * One ES module, with its name pinned: module.json lists it by name, and if it
 * drifts Foundry silently loads nothing.
 */
export default defineConfig({
  build: {
    lib: { entry: 'src/main.ts', formats: ['es'], fileName: () => 'creature-template-applier.js' },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Unminified: the bundle is tiny and readable stack traces are worth more.
    minify: false,
    target: 'es2022',
  },
});
