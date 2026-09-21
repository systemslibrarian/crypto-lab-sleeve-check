import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what passes
 * here is what ships. Two projects:
 *   - a11y.spec.ts   — the axe WCAG 2.1 A/AA gate (Chromium only, deterministic).
 *   - claims.spec.ts — §4.1b cross-checks and independent re-derivations,
 *                      §4.1c mutation targets, §4.1d negative-claim scope tests.
 *
 * Port 4660 is unique to this lab across the fleet (never the Vite default 4173).
 * Checked against every sibling lab's playwright config before it was chosen;
 * the 4600-4699 range was otherwise near-saturated.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 90_000, // the axe driver walks every pane + disclosure before scanning
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4206/crypto-lab-sleeve-check/',
  },
  projects: [
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      // Dark is the only theme this lab ships; scan what visitors actually get.
      // Chromium only, deliberately: the axe gate is a deterministic oracle and
      // running it three ways would triple the cost for no extra signal.
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    {
      name: 'claims',
      testMatch: /claims\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    // The critical-path journey, in every engine. Zero axe violations and zero
    // horizontal overflow are necessary and NOT sufficient for visual quality:
    // the 190px of dead space this lab shipped under its mobile hero passed
    // both. `flows.spec.ts` asserts geometry as well as behaviour.
    { name: 'flows-chromium', testMatch: /flows\.spec\.ts/, use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'flows-firefox', testMatch: /flows\.spec\.ts/, use: { ...devices['Desktop Firefox'], colorScheme: 'dark' } },
    { name: 'flows-webkit', testMatch: /flows\.spec\.ts/, use: { ...devices['Desktop Safari'], colorScheme: 'dark' } },
    { name: 'flows-mobile', testMatch: /flows\.spec\.ts/, use: { ...devices['Pixel 5'], colorScheme: 'dark' } },
  ],
  webServer: {
    // Build before serving: `vite preview` only serves whatever is already in
    // dist/, so without this a failing build leaves the previous good bundle in
    // place and the suite passes green against source that no longer compiles.
    command: 'npm run build && npm run preview -- --port 4660 --strictPort',
    url: 'http://localhost:4206/crypto-lab-sleeve-check/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
