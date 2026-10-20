import { test, expect } from "./fixtures";

test("browse, filter, add an agent, record a milestone, reload and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Agent map" }).click();
  await expect(page.locator(".agent-card")).toHaveCount(6);
  await page.getByLabel("Search agents").fill("Milo");
  await expect(page.locator(".agent-card")).toHaveCount(1);
  await page.locator(".agent-card").click();
  await expect(page.locator(".timeline .event")).toHaveCount(3);
  await page.getByRole("button", { name: "All agents" }).click();
  await page.getByRole("button", { name: "Add an agent" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Cedar");
  await page.getByLabel("What does this agent do?").fill("Customer care");
  await page.getByRole("button", { name: "Choose Hood", exact: true }).click();
  await expect(page.getByLabel("Tags")).toHaveCount(0);
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cedar" })).toBeVisible();
  await page.getByRole("button", { name: "Record a milestone" }).click();
  await page.getByLabel("What changed?").fill("Order search added");
  await page.getByLabel("Date", { exact: true }).fill("2026-09-22");
  await page.getByLabel("Short description").fill("Looks up customer orders.");
  await page
    .getByLabel("Evidence link")
    .fill("https://github.com/example/repo/pull/1");
  await page.getByRole("button", { name: "Save milestone" }).click();
  await expect(
    page.getByRole("heading", { name: "Order search added" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Agent map" }).click();
  await page.getByLabel("Search agents").fill("Cedar");
  await page.locator(".agent-card").click();
  await expect(
    page.getByRole("heading", { name: "Order search added" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".game-menu:visible > summary").click();
  await page.getByRole("button", { name: "Export workspace" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "agentarium-workspace.json",
  );
  expect(errors).toEqual([]);
});

test("responsive map, activity and empty search", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.screenshot({
    path: "/private/tmp/agentarium-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Recent evolution" }).click();
  await expect(page.locator(".activity-row")).toHaveCount(10);
  await page.getByRole("button", { name: "Agent map" }).click();
  await page.getByLabel("Search agents").fill("missing");
  await expect(page.getByText("No agents", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".agent-card")).toHaveCount(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/agentarium-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add an agent" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
