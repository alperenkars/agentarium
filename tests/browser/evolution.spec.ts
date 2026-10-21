import { test, expect } from "./fixtures";

test("plain updates lead the profile; review, edit, dismiss and reopen persist without exposing Git by default", async ({
  page,
}) => {
  const folder = "src/agents/pilot";
  const tracking = {
    repositoryId: "fixture",
    repositoryName: "Fixture",
    folder,
    archiveVersion: 1,
    branchMode: "all-local-and-remote-tracking",
    branchCount: 1,
    lastSyncedAt: "2026-09-23T12:00:00Z",
    truncated: false,
    limit: 5000,
    changes: [
      {
        sha: "a".repeat(40),
        date: "2026-09-23T12:00:00Z",
        files: [folder + "/tools.js"],
        branches: ["experiment"],
        refs: ["refs/heads/experiment"],
        merge: false,
      },
    ],
  };
  const proposal = {
    id: "update-1",
    version: 1,
    date: "2026-09-23",
    title: "Store lookup added",
    description: "Introduced a tool for finding stores.",
    kind: "Capability",
    status: "proposed",
    evidence: [
      {
        sha: "a".repeat(40),
        date: "2026-09-23T12:00:00Z",
        file: folder + "/tools.js",
        afterLine: 4,
        before: "Not defined",
        after: "Store lookup defined",
      },
    ],
  };
  let data = {
    repositoryId: "fixture",
    folder,
    proposals: [] as (typeof proposal)[],
    analyzed: 1,
    eligible: 1,
    at: "2026-09-23T12:00:00Z",
  };
  await page.route("**/api/tracking/history", (route) =>
    route.fulfill({ json: { history: tracking } }),
  );
  await page.route("**/api/tracking/evolution", (route) =>
    route.fulfill({ json: data }),
  );
  await page.route("**/api/tracking/analyze", (route) => {
    if (!data.proposals.length) data.proposals = [proposal];
    return route.fulfill({ json: data });
  });
  await page.route("**/api/tracking/review", (route) => {
    const input = route.request().postDataJSON();
    expect(input.folder).toBe(folder);
    expect(input.version).toBe(data.proposals[0].version);
    data = {
      ...data,
      proposals: data.proposals.map((p) => ({
        ...p,
        title: input.title ?? p.title,
        description: input.description ?? p.description,
        status: input.status,
        version: p.version + 1,
      })),
    };
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.evaluate((value) => {
    const key = "agentarium.workspace.v1";
    const agents = JSON.parse(localStorage.getItem(key)!);
    agents[0].tracking = value;
    agents[0].milestones = [];
    localStorage.setItem(key, JSON.stringify(agents));
  }, tracking);
  await page.reload();
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await page.getByRole("button", { name: "Find updates", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Store lookup added", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".update-evidence code")).not.toBeVisible();
  await expect(page.locator(".tracking > details")).not.toHaveAttribute("open");
  await expect(page.locator(".timeline")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Find stores by city");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Find stores by city" }),
  ).toBeVisible();
  await page.locator(".proposal .update-evidence > summary").click();
  await expect(page.locator(".update-evidence code")).toContainText(folder);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator(".proposal")).toHaveCount(0);
  await expect(page.locator(".timeline")).toContainText("Find stores by city");
  await page.getByRole("button", { name: "The yard", exact: true }).click();
  await expect(
    page
      .getByRole("button", { name: "Visit Milo", exact: true })
      .locator(".resident-thought"),
  ).toHaveText("Find stores by city");
  await page.reload();
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await expect(page.locator(".timeline")).toContainText("Find stores by city");
  await page.locator(".review-record > summary").click();
  await page.getByRole("button", { name: "Review again", exact: true }).click();
  await expect(page.locator(".timeline")).toHaveCount(0);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("button", { name: "Find updates", exact: true }).click();
  await expect(page.locator(".proposal")).toHaveCount(0);
  await page.getByRole("button", { name: "Review again", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/agentarium-evolution-mobile.png",
    fullPage: true,
  });
});
