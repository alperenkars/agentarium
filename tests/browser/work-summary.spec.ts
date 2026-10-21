import { test, expect } from "./fixtures";
const tracking = (folder: string) => ({
  repositoryId: "fixture",
  repositoryName: "Fixture",
  folder,
  branchMode: "all-local-and-remote-tracking",
  lastSyncedAt: "2026-10-20",
  branchCount: 1,
  truncated: false,
  limit: 20,
  changes: [],
});
const agents = ["Alpha", "Beta"].map((name) => ({
  id: name,
  name,
  role: "Test",
  shape: 0,
  color: "#b9cbb0",
  avatarId: "styloo-student",
  tags: [],
  milestones: [],
  tracking: tracking(`agents/${name.toLowerCase()}`),
}));
const data = {
  connections: {
    jira: {
      state: "snapshot",
      liveState: "missing-config",
      checkedAt: "2020-01-01T12:00:00Z",
      items: [
        {
          id: "VAG-1",
          title: "Order review",
          status: "In Review",
          updatedAt: "2026-10-19T12:00:00Z",
          url: "https://example.atlassian.net/browse/VAG-1",
        },
        {
          id: "VAG-2",
          title: "Completed work",
          status: "Done",
          url: "https://example.atlassian.net/browse/VAG-2",
        },
      ],
    },
    github: {
      state: "connected",
      checkedAt: "2026-10-20T12:00:00Z",
      items: [
        {
          id: "#7",
          title: "Fix build",
          status: "open",
          review: "changes-requested",
          url: "https://github.com/example/repo/pull/7",
          ci: {
            state: "failure",
            complete: true,
            items: [
              {
                name: "Build",
                state: "failure",
                url: "https://github.com/example/repo/pull/7/checks",
              },
            ],
          },
        },
      ],
    },
  },
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (value) =>
      localStorage.setItem("agentarium.workspace.v1", JSON.stringify(value)),
    agents,
  );
});
test("Agent summary filters linked work, names the CI blocker and preserves successful reads on failure", async ({
  page,
}) => {
  let fail = false;
  await page.route("**/api/work-summary?*", (route) =>
    fail
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: data }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Agent iş özeti", exact: true })
    .click();
  const summary = page.getByRole("region", { name: "Agent iş özeti" });
  await expect(
    summary.getByRole("heading", { name: "Sıradaki adım" }),
  ).toBeVisible();
  await expect(
    summary.getByText("Başarısız CI kontrolünü incele."),
  ).toBeVisible();
  await expect(
    summary.getByRole("button", { name: "Açık işler 2", exact: true }),
  ).toBeVisible();
  await summary
    .getByRole("button", { name: "İnceleme bekleyen 1", exact: true })
    .click();
  await expect(
    summary.locator(".work-items").getByRole("link", { name: /VAG-1/ }),
  ).toHaveAttribute("href", "https://example.atlassian.net/browse/VAG-1");
  await expect(
    summary.locator(".work-items").getByText(/Fix build/),
  ).toHaveCount(0);
  await summary
    .getByRole("button", { name: "CI takibi 1", exact: true })
    .click();
  await expect(
    summary
      .locator(".work-items")
      .getByRole("link", { name: "Build ↗", exact: true }),
  ).toHaveAttribute("href", "https://github.com/example/repo/pull/7/checks");
  await expect(summary.getByText(/Değişiklik istendi/)).toBeVisible();
  fail = true;
  await summary.getByRole("button", { name: "Yenile", exact: true }).click();
  await expect(summary.getByRole("status")).toContainText(
    "Son başarılı okuma korunuyor",
  );
  await expect(
    summary.locator(".work-items").getByText(/Fix build/),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("Agent switches clear previous records while loading and missing coverage stays unknown", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  await page.route("**/api/work-summary?*", async (route) => {
    if (route.request().url().includes("beta")) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({
        json: {
          connections: {
            jira: { state: "missing-config", items: [] },
            github: { state: "missing-config", items: [] },
          },
        },
      });
    }
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Agent iş özeti", exact: true })
    .click();
  const summary = page.getByRole("region", { name: "Agent iş özeti" });
  await expect(
    summary.getByText("Başarısız CI kontrolünü incele."),
  ).toBeVisible();
  await summary
    .getByRole("combobox", { name: "Özeti gösterilecek agent" })
    .selectOption("Beta");
  await expect(summary.getByText("İş bilgileri okunuyor…")).toBeVisible();
  await expect(summary.getByText(/Fix build/)).toHaveCount(0);
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  await expect(summary.getByText(/açık iş sayısı bilinmiyor/)).toBeVisible();
  await expect(summary.getByRole("button", { name: /Açık işler/ })).toHaveCount(
    0,
  );
});
test("Stale reads and absent CI remain explicit; search and all filter reveal closed work", async ({
  page,
}) => {
  const saved = structuredClone(data);
  saved.connections.jira.state = "stale";
  saved.connections.github = {
    state: "missing-config",
    checkedAt: "",
    items: [],
  };
  await page.route("**/api/work-summary?*", (route) =>
    route.fulfill({ json: saved }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Agent iş özeti", exact: true })
    .click();
  const summary = page.getByRole("region", { name: "Agent iş özeti" });
  await expect(summary.getByText("Eski kayıt", { exact: true })).toBeVisible();
  await expect(summary.getByText(/Tarihli kayda dayanıyor/)).toBeVisible();
  await expect(summary.getByText(/iş sayıları eksik olabilir/)).toBeVisible();
  await summary
    .getByRole("button", { name: "Tüm kayıtlar 2", exact: true })
    .click();
  await summary
    .getByRole("searchbox", { name: "Kayıtlarda ara" })
    .fill("Completed");
  await expect(summary.locator(".work-items li")).toHaveCount(1);
  await expect(
    summary.locator(".work-items").getByText(/Completed work/),
  ).toBeVisible();
});
