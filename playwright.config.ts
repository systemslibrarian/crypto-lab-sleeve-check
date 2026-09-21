import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what passes
 * here is what ships. Two projects:
 *   - a11y.spec.ts     — the axe WCAG 2.1 A/AA gate (Chromium only, deterministic).
 *   - claims.spec.ts   — §4.1b cross-checks and independent re-derivations,
 *                        §4.1c mutation targets, §4.1d negative-claim scope tests.
 *   - verdicts.spec.ts — verdict coverage derived by walking the rendered page
 *                        for `data-verdict` markers, plus the §4.1c owning test
 *                        for each one.
 *
 * Port 4206 is this lab's, pinned in crypto-lab/tools/playwright-ports.json and
 * enforced by `node tools/port-sync.js check`. It appears THREE times below --
 * baseURL, webServer.url, and the --port the preview server actually binds --
 * and all three have to agree. They did not: 595d51b moved the first two to 4206
 * and left the bind on 4660, so every Playwright run timed out waiting for a
 * server that was listening on another port. port-sync could not see it: it
 * reads the FIRST port-shaped number in this file, which is the baseURL.
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
    // Verdict coverage, taken from the rendered page rather than from anyone's
    // list of what the page shows. Its own project so CI can name it as a
    // distinct step and so `npm run test:verdicts` is one command; it is still
    // inside the single `build` gate that `deploy` needs, so it cannot drift
    // away from what ships.
    {
      name: 'verdicts',
      testMatch: /verdicts\.spec\.ts/,
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
    command: 'npm run build && npm run preview -- --port 4206 --strictPort',
    url: 'http://localhost:4206/crypto-lab-sleeve-check/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
