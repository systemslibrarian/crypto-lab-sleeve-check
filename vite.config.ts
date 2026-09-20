import { defineConfig, configDefaults } from 'vitest/config';

// base must match the GitHub Pages project subpath:
// https://systemslibrarian.github.io/crypto-lab-sleeve-check/
export default defineConfig({
  base: '/crypto-lab-sleeve-check/',
  test: {
    // Colocated unit tests only; keep the Playwright specs in e2e/ out of the Vitest run.
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
