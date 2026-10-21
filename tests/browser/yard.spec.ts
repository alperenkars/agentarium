import { test, expect } from "./fixtures";
test("larger rosters have reachable gardens and keyboard access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => {
    const key = "agentarium.workspace.v1";
    const agents = JSON.parse(localStorage.getItem(key)!);
    for (let i = 6; i < 11; i++)
      agents.push({
        ...agents[0],
        id: `extra-${i}`,
        name: `Agent ${i}`,
        milestones: [],
      });
    localStorage.setItem(key, JSON.stringify(agents));
  });
  await page.reload();
  await expect(page.locator(".yard-resident")).toHaveCount(8);
  const dock = await page.locator(".world-dock").boundingBox();
  expect(dock).not.toBeNull();
  await expect(page.locator(".world-name")).toHaveCount(8);
  for (const nameplate of await page.locator(".world-name").all()) {
    const box = await nameplate.boundingBox();
    expect(box).not.toBeNull();
    expect(
      box!.x + box!.width <= dock!.x ||
        box!.x >= dock!.x + dock!.width ||
        box!.y + box!.height <= dock!.y ||
        box!.y >= dock!.y + dock!.height,
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Next garden" }).click();
  await expect(page.locator(".yard-resident")).toHaveCount(3);
  const agent = page.getByRole("button", {
    name: "Visit Agent 10",
    exact: true,
  });
  await agent.focus();
  await expect(agent.locator(".resident-thought")).toHaveCount(0);
  await expect(agent).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Agent 10", exact: true }),
  ).toBeVisible();
});
test("yard is home, characters open histories, and filters work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Agent yard" })).toBeVisible();
  await expect(page.locator(".yard-resident")).toHaveCount(6);
  await expect(page.locator(".game-world")).toHaveCSS("position", "fixed");
  expect(await page.locator(".game-world").boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  });
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await page.getByRole("button", { name: "Pause movement" }).click();
  await expect(
    page.getByRole("button", { name: "Movement paused" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "/private/tmp/agentarium-yard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Visit Milo", exact: true }).hover();
  await expect(
    page
      .getByRole("button", { name: "Visit Milo", exact: true })
      .locator(".resident-thought"),
  ).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Milo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All agents" }).click();
  await page.getByRole("button", { name: "Find an agent" }).click();
  await page.getByLabel("Search agents").fill("Milo");
  await expect(page.locator(".yard-resident")).toHaveCount(1);
  await page.getByRole("button", { name: "Agent map" }).click();
  await expect(page.locator(".agent-card")).toHaveCount(1);
});
test("yard fits mobile and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Movement paused" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/agentarium-world-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Visit Remy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Remy", exact: true }),
  ).toBeVisible();
});
