import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // main.ts is the Foundry boundary and is covered by the live check, not by unit tests.
      include: ['src/templates.ts', 'src/mythic.ts', 'src/wild.ts', 'src/levels.ts', 'src/cryptids.ts', 'src/npc.ts', 'src/build.ts', 'src/facts.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
