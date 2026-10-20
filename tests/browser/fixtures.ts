import { test as base, expect } from "@playwright/test";
// Keep synthetic regression journeys independent of the user's private repositories.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/api/agents", (route) =>
      route.fulfill({ json: { agents: [] } }),
    );
    await use(page);
  },
});
export { expect };
