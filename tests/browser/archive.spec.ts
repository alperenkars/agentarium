import { test, expect } from "./fixtures";

test("archive reload, date import, branch isolation, backup and restore", async ({
  page,
}) => {
  const folder = "src/agents/beymeninbound";
  const main = "refs/heads/main",
    feature = "refs/heads/experiment";
  let history = {
    repositoryId: "fixture",
    repositoryName: "Fixture",
    folder,
    branchMode: "all-local-and-remote-tracking",
    lastSyncedAt: "2026-09-23T12:00:00Z",
    archiveVersion: 1,
    branchCount: 2,
    truncated: false,
    limit: 5000,
    refs: [
      { name: main, tip: "a".repeat(40) },
      { name: feature, tip: "b".repeat(40) },
    ],
    range: { from: "2026-06-25", to: "2026-09-23" },
    imports: [
      {
        id: "e".repeat(64),
        at: "2026-09-23T12:00:00Z",
        range: { from: "2026-06-25", to: "2026-09-23" },
        count: 3,
        shallow: false,
      },
    ],
    changes: [
      {
        sha: "a".repeat(40),
        date: "2026-09-22T12:00:00Z",
        files: [folder + "/main.js"],
        refs: [main],
        branches: ["main"],
        parents: [],
        merge: false,
      },
      {
        sha: "b".repeat(40),
        date: "2026-09-21T12:00:00Z",
        files: [folder + "/experimental.js"],
        refs: [feature],
        branches: ["experiment"],
        parents: [],
        merge: false,
      },
      {
        sha: "c".repeat(40),
        date: "2026-09-20T12:00:00Z",
        files: [folder + "/archived.js"],
        refs: [],
        branches: [],
        lastSeenRefs: ["refs/heads/deleted"],
        lastSeenAt: "2026-09-20T12:00:00Z",
        parents: [],
        merge: false,
      },
    ],
  };
  await page.route("**/api/tracking/repositories", (route) =>
    route.fulfill({
      json: {
        repositories: [{ id: "fixture", name: "Fixture", folders: [folder] }],
      },
    }),
  );
  await page.route("**/api/tracking/history", (route) =>
    route.fulfill({ json: { history } }),
  );
  let scans = 0;
  await page.route("**/api/tracking/scan", (route) => {
    scans++;
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      repositoryId: "fixture",
      folder,
      from: "2026-01-01",
      to: "2026-09-23",
    });
    history = { ...history, range: { from: body.from, to: body.to } };
    return route.fulfill({ json: history });
  });
  await page.route("**/api/tracking/export", (route) =>
    route.fulfill({
      json: { schemaVersion: 1, kind: "agentarium-folder-history", history },
    }),
  );
  await page.route("**/api/tracking/restore", (route) => {
    expect(route.request().postDataJSON().backup.kind).toBe(
      "agentarium-folder-history",
    );
    return route.fulfill({
      status: 400,
      json: { error: "Backup conflicts with saved evidence. Nothing changed." },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await page.locator(".tracking-toggle").click();
  await page.getByRole("button", { name: "Connect folder" }).click();
  await page.getByLabel("Agent folder", { exact: true }).selectOption(folder);
  await page.getByRole("button", { name: "Load saved history (3)" }).click();
  expect(scans).toBe(0);
  await expect(page.getByText("Local archive", { exact: true })).toBeVisible();
  await page.getByText("Commits (3)", { exact: true }).click();
  await page.getByLabel("Branch at scan").selectOption(main);
  await expect(page.locator(".tracking-commits > li")).toHaveCount(1);
  await expect(page.locator(".tracking-commits")).toContainText("aaaaaaaa");
  await expect(page.locator(".tracking-commits")).not.toContainText("bbbbbbbb");
  await page.getByLabel("Branch at scan").selectOption(feature);
  await expect(page.locator(".tracking-commits")).toContainText("bbbbbbbb");
  await page.getByLabel("Branch at scan").selectOption("archived");
  await expect(page.locator(".tracking-commits")).toContainText(
    "not on scanned branches",
  );
  await page.getByText("Files and branches", { exact: true }).click();
  await expect(page.locator(".tracking-commits")).toContainText(
    "Local · deleted",
  );
  await page.getByLabel("From date").fill("2026-01-01");
  await page.getByLabel("To date").fill("2026-09-23");
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.locator(".tracking-commits > li")).toHaveCount(3);
  expect(scans).toBe(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const backup = Buffer.concat(chunks);
  expect(JSON.parse(backup.toString()).history.changes).toHaveLength(3);
  await page.getByLabel("History backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await expect(page.getByRole("alert")).toContainText("Nothing changed");
  await expect(page.getByText("Commits (3)", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await page.locator(".tracking-toggle").click();
  await expect(page.getByLabel("From date")).toHaveValue("2026-01-01");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/agentarium-stage-one-mobile.png",
    fullPage: true,
  });
});
