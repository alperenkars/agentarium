import { test, expect } from "@playwright/test";

test("yard uses the approved controls only; tags are retained but never exposed", async ({
  page,
}) => {
  await page.goto("/");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("agentarium.workspace.v1")!),
  );
  const controls = await page
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.getAttribute("aria-label") || button.textContent?.trim(),
      ),
    );
  expect(controls.sort()).toEqual(
    [
      ...stored.map((agent: { name: string }) => `Visit ${agent.name}`),
      "Find an agent",
      "Pause movement",
      "The yard",
      "Agent map",
      "Recent evolution",
      "Add an agent",
    ].sort(),
  );
  await expect(page.locator(".world-name small")).toHaveCount(0);
  await expect(page.locator(".world-header")).toHaveText(
    "aagentarium⌕Ⅱ☰ExportCreditsHuberthartStyloo",
  );
  await page
    .getByRole("button", { name: "Find an agent", exact: true })
    .click();
  await expect(page.getByLabel("Filter by tag")).toHaveCount(0);
  await page.getByLabel("Search agents").fill("Northstar");
  await expect(page.locator(".yard-resident")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await expect(page.locator(".tags")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect folder", exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".tracking > details")).not.toHaveAttribute("open");
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("agentarium.workspace.v1")!),
  );
  expect(after).toEqual(stored);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/agentarium-minimal-profile.png",
    fullPage: true,
  });
});
