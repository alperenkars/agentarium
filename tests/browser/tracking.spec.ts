import { test, expect } from "./fixtures";

const snapshot = {
  repositoryId: "fixture",
  repositoryName: "Fixture backend",
  folder: "src/agents/beymeninbound",
  branchMode: "all-local-and-remote-tracking",
  lastSyncedAt: "2026-09-23T10:00:00Z",
  branchCount: 3,
  truncated: false,
  limit: 20,
  changes: [
    {
      sha: "abcdef0123456789",
      date: "2026-09-22T09:00:00Z",
      files: ["src/agents/beymeninbound/helpers/tools.js"],
      branches: ["main", "beymen-work"],
      merge: false,
    },
  ],
};

test("connect one folder, sync, preserve history, reload and export tracking", async ({
  page,
}) => {
  await page.route("**/api/tracking/repositories", (route) =>
    route.fulfill({
      json: {
        repositories: [
          {
            id: "fixture",
            name: "Fixture backend",
            folders: ["src/agents/beymeninbound", "src/agents/ebebekpoc"],
          },
        ],
      },
    }),
  );
  let fail = false;
  await page.route("**/api/tracking/scan", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      repositoryId: "fixture",
      folder: "src/agents/beymeninbound",
      from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    await route.fulfill(
      fail
        ? {
            status: 400,
            json: { error: "Repository unavailable. Previous scan unchanged." },
          }
        : { json: snapshot },
    );
  });
  await page.route("**/api/tracking/history", (route) =>
    route.fulfill({ json: { history: null } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  const before = await page.locator(".timeline").innerText();
  await page.locator(".tracking-toggle").click();
  await page
    .getByRole("button", { name: "Connect folder", exact: true })
    .click();
  await page
    .getByLabel("Agent folder", { exact: true })
    .selectOption(snapshot.folder);
  await expect(page.getByLabel("Agent folder", { exact: true })).toHaveValue(
    snapshot.folder,
  );
  await page
    .getByRole("button", { name: "Connect and sync", exact: true })
    .click();
  await expect(page.getByText("All known (3)")).toBeVisible();
  await expect(page.getByText("Commits (1)")).toBeVisible();
  expect(await page.locator(".timeline").innerText()).toBe(before);
  await page.getByText("Commits (1)").click();
  await page.getByText("Files and branches", { exact: true }).click();
  await expect(
    page.getByText(snapshot.changes[0].files[0], { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Branches: main, beymen-work")).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Previous scan unchanged",
  );
  await expect(page.getByText("Commits (1)")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await expect(page.locator(".tracking-facts")).not.toBeVisible();
  await page.locator(".tracking-toggle").click();
  await expect(
    page.getByText("Fixture backend", { exact: true }),
  ).toBeVisible();
  expect(await page.locator(".timeline").innerText()).toBe(before);
  await page.getByRole("button", { name: "Change connection" }).click();
  await page
    .getByLabel("Agent folder", { exact: true })
    .selectOption("src/agents/ebebekpoc");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".tracking-facts")).toContainText(snapshot.folder);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/agentarium-tracking-mobile.png",
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page.locator(".game-menu:visible > summary").click();
  await page.getByRole("button", { name: "Export workspace" }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const data = JSON.parse(Buffer.concat(chunks).toString());
  expect(
    data.agents.find((agent: { id: string }) => agent.id === "milo").tracking,
  ).toEqual(snapshot);
  expect(
    data.agents.filter((agent: { tracking?: unknown }) => agent.tracking),
  ).toHaveLength(1);
});

test("static preview or missing connector gives an honest error without saving", async ({
  page,
}) => {
  await page.route("**/api/tracking/repositories", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await page.locator(".tracking-toggle").click();
  await page.getByRole("button", { name: "Connect folder" }).click();
  await expect(page.getByRole("alert")).toContainText("development server");
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
});
