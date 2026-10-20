import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
test("Capability panel separates source evidence, unknown runtime and saved Jira work", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "agentarium.workspace.v1",
      JSON.stringify([
        {
          id: "fixture",
          name: "Fixture agent",
          role: "Test",
          shape: 0,
          color: "#b9cbb0",
          avatarId: "styloo-student",
          tags: [],
          milestones: [],
          tracking: {
            repositoryId: "fixture",
            folder: "agents/alpha",
            repositoryName: "Fixture",
            branchMode: "all-local-and-remote-tracking",
            lastSyncedAt: "2026-10-07",
            branchCount: 1,
            truncated: false,
            limit: 20,
            changes: [],
          },
        },
      ]),
    ),
  );
  await page.route("**/api/capabilities?*", (route) =>
    route.fulfill({
      json: {
        state: "configured",
        agentKey: "alpha",
        capabilities: [
          {
            id: "sms",
            title: "Send order link",
            tool: "send_link",
            provider: "Example provider",
            channels: ["Phone", "Web text"],
            sourceStatus: "source",
            runtimeStatus: "unknown",
            runtimeVerifiedAt: null,
            sourceCheckedAt: "2026-10-07T12:00:00Z",
            evidence: [
              {
                sha: "a".repeat(40),
                file: "agents/alpha/tools.js",
                line: 3,
                supports: ["tool", "provider", "channel"],
              },
            ],
          },
        ],
        connections: {
          jira: {
            state: "snapshot",
            liveState: "missing-config",
            checkedAt: "2026-10-07T12:00:00Z",
            items: [
              {
                id: "VAG-3",
                title: "Example issue",
                status: "Done",
                url: "https://example.atlassian.net/browse/VAG-3",
              },
            ],
          },
          github: { state: "missing-config", items: [] },
        },
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Visit Fixture agent", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Capabilities" });
  await expect(panel.getByText("Live verification unknown")).toBeVisible();
  await expect(panel.getByText("Example provider")).not.toBeVisible();
  await panel.getByText("Evidence", { exact: true }).click();
  await expect(panel.getByText("Example provider")).toBeVisible();
  await expect(
    panel.getByText("Last live verification: unknown"),
  ).toBeVisible();
  await panel.getByText("Related work · Jira / GitHub").click();
  await expect(
    panel.getByRole("link", { name: "VAG-3 · Example issue" }),
  ).toHaveAttribute("href", "https://example.atlassian.net/browse/VAG-3");
  await expect(
    panel.getByText("Live connection: Missing config"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("Real local folders appear automatically; examples stay hidden and reconnecting preserves user data", async ({
  page,
}) => {
  await page.route("**/api/agents", (route) =>
    route.fulfill({
      json: {
        agents: [
          {
            repositoryId: "fixture",
            repositoryName: "Local backend",
            folder: "agents/avvapoc",
            agentKey: "avvapoc",
            name: "AVVA",
            mapped: true,
          },
          {
            repositoryId: "fixture",
            repositoryName: "Local backend",
            folder: "agents/suwen",
            agentKey: "suwen",
            name: "suwen",
            mapped: false,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Visit AVVA", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Visit Milo", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Visit AVVA", exact: true }).click();
  await expect(page.getByText("Local source · avvapoc")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "AVVA", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record a milestone" }).click();
  await page.getByLabel("What changed?").fill("My own note");
  await page
    .getByLabel("Short description")
    .fill("A user-owned note preserved across discovery.");
  await page
    .getByRole("button", { name: "Save milestone", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My own note" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Visit AVVA", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My own note" }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("agentarium.workspace.v1")!),
  );
  expect(
    stored.filter((a: any) => a.tracking?.folder === "agents/avvapoc"),
  ).toHaveLength(1);
  expect(stored.find((a: any) => a.id === "milo").demo).toBe(true);
});

test("Visual map preserves filters, source/test dates and keyboard focus across close, Escape and browser Back", async ({
  page,
}) => {
  const cards = [
    [
      "store-sms",
      "Mağaza faturası SMS",
      "Fatura",
      ["Web metin"],
      [
        { name: "Nebim", role: "fatura verisi" },
        { name: "Mobildev", role: "SMS gönderimi" },
      ],
    ],
    [
      "review",
      "İnceleme durumu",
      "İade",
      ["Telefon"],
      [{ name: "Nebim", role: "inceleme verisi" }],
    ],
    [
      "cart",
      "Sepete ekleme",
      "Alışveriş",
      ["Web metin"],
      [{ name: "AVVA", role: "site sepeti" }],
    ],
  ] as const;
  const data = cards.map(([id, title, group, channels, providers]) => ({
    id,
    title,
    group,
    channels,
    providers,
    tool: `${id}_tool`,
    tools: [`${id}_tool`],
    summary: "Anonim işlev özeti",
    condition: "Güvenilir kimlik ve açık onay",
    sourceStatus: "snapshot",
    sourceRecord: {
      at: "2026-10-12T19:00:00Z",
      commit: "b".repeat(40),
      origin: "Fixture",
    },
    development: {
      state: "main",
      at: "2026-10-12",
      summary: "main kaynak kaydı",
    },
    tests: {
      state: id === "cart" ? "failed" : "reported",
      at: "2026-09-20",
      summary: "Yerel test kaydı",
      scope: "Widget kabulü değil",
    },
    live: { state: "unknown", summary: "Canlı kabul kaydı yok" },
    evidence: [
      {
        sha: "b".repeat(40),
        file: "src/agents/avvapoc/helpers/tools.js",
        line: 20,
        supports: ["tool", "provider"],
        url:
          "https://github.com/example/backend/blob/" +
          "b".repeat(40) +
          "/src/agents/avvapoc/helpers/tools.js#L20",
      },
    ],
  }));
  await page.addInitScript(() =>
    localStorage.setItem(
      "agentarium.workspace.v1",
      JSON.stringify([
        {
          id: "fixture-map",
          name: "AVVA",
          role: "Local source · avvapoc",
          shape: 0,
          color: "#b9cbb0",
          avatarId: "styloo-student",
          tags: [],
          milestones: [],
          tracking: {
            repositoryId: "fixture",
            repositoryName: "Fixture",
            folder: "src/agents/avvapoc",
            branchMode: "all-local-and-remote-tracking",
            lastSyncedAt: "",
            branchCount: 0,
            truncated: false,
            limit: 5000,
            changes: [],
          },
        },
      ]),
    ),
  );
  await page.route("**/api/capabilities?*", (route) =>
    route.fulfill({
      json: {
        state: "configured",
        agentKey: "avvapoc",
        presentation: "avva-map",
        context: {
          sourceAt: "2026-10-12T19:00:00Z",
          commit: "b".repeat(40),
          branch: "main / fixture",
          scope: "Test fixture",
        },
        capabilities: data,
        connections: {
          jira: { state: "missing-config", items: [] },
          github: { state: "missing-config", items: [] },
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Visit AVVA", exact: true }).click();
  const map = page.locator(".capability-map");
  await expect(map.getByText("3 / 3 yetenek")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fatura işlevlerini aç" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tüm işlevleri göster", exact: true })
    .click();
  await expect(map.getByText("Test başarısız", { exact: true })).toBeVisible();
  await map.getByText("Filtrele", { exact: true }).click();
  await map.getByRole("button", { name: "Nebim", exact: true }).click();
  await map
    .getByRole("button", { name: "Fatura", exact: false })
    .first()
    .click();
  await page.getByLabel("Yetenek ara").fill("sms");
  await page.getByLabel("Kanal filtresi").selectOption("Web metin");
  await expect(map.getByText("1 / 3 yetenek")).toBeVisible();
  const card = page.getByRole("button", {
    name: "Mağaza faturası SMS ayrıntısı",
  });
  await card.click();
  const detail = page.getByRole("dialog");
  await expect(
    detail.getByText("fatura verisi", { exact: true }),
  ).not.toBeVisible();
  await detail.getByText("Sağlayıcılar ve koşullar", { exact: true }).click();
  await expect(
    detail.getByText("fatura verisi", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByText("SMS gönderimi", { exact: true }),
  ).toBeVisible();
  await expect(detail.getByText("Test gözlemi: 20 Eyl 2026")).not.toBeVisible();
  await detail.getByText("Test ve canlı kanıtı", { exact: true }).click();
  await expect(detail.getByText("Test gözlemi: 20 Eyl 2026")).toBeVisible();
  await detail.getByText("Tool ve kaynaklar", { exact: true }).click();
  await expect(
    detail.getByText("store-sms_tool", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();
  await expect(card).toBeFocused();
  await expect(map.getByText("1 / 3 yetenek")).toBeVisible();
  await expect(page.getByLabel("Yetenek ara")).toHaveValue("sms");
  await card.click();
  await page.goBack();
  await expect(detail).not.toBeVisible();
  await card.click();
  await detail.getByRole("button", { name: "Haritaya dön" }).click();
  await expect(detail).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const size = await card.boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(44);
  expect(
    await card.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await page.getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(map.getByText("3 / 3 yetenek")).toBeVisible();
});

test("Agent discovery searches real capability terms and excludes uncharted agents from provider/channel claims", async ({
  page,
}) => {
  await page.route("**/api/agents", (route) =>
    route.fulfill({
      json: {
        agents: [
          {
            repositoryId: "fixture",
            repositoryName: "Fixture",
            folder: "agents/avvapoc",
            agentKey: "avvapoc",
            name: "AVVA",
            mapped: true,
            capabilityCount: 2,
            providers: ["Nebim", "Mobildev"],
            channels: ["Web metin"],
            capabilityTerms: ["Mağaza faturası SMS", "store_sms"],
          },
          {
            repositoryId: "fixture",
            repositoryName: "Fixture",
            folder: "agents/suwen",
            agentKey: "suwen",
            name: "suwen",
            mapped: false,
            capabilityCount: 0,
            providers: [],
            channels: [],
            capabilityTerms: [],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Agent map", exact: true }).click();
  await expect(page.locator(".agent-card")).toHaveCount(2);
  await page.getByLabel("Search agents").fill("sms");
  await expect(page.locator(".agent-card")).toHaveCount(1);
  await expect(page.locator(".agent-card")).toContainText("AVVA");
  await page.getByLabel("Search agents").fill("");
  await page.getByLabel("Agent sağlayıcı filtresi").selectOption("Mobildev");
  await expect(page.locator(".agent-card")).toHaveCount(1);
  await page.getByLabel("Agent kanal filtresi").selectOption("Web metin");
  await expect(page.locator(".agent-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Filtreleri temizle", exact: true })
    .click();
  await expect(page.locator(".agent-card")).toHaveCount(2);
  await expect(page.getByText("Yetenekler bilinmiyor")).toBeVisible();
});

function polishSnapshot(version = 1) {
  const sourceAt =
    version === 1 ? "2026-10-12T19:00:00Z" : "2026-10-13T19:00:00Z";
  const card = (
    id: string,
    title: string,
    group: string,
    providers: { name: string; role: string }[],
  ) => ({
    id,
    title,
    group,
    providers,
    summary: version === 1 ? "İlk kaynak özeti" : "Güncellenmiş kaynak özeti",
    tool: id + "_tool",
    tools: [id + "_tool"],
    channels: ["Web metin"],
    condition: "Tekil kayıt ve açık onay",
    sourceStatus: "snapshot",
    sourceRecord: { at: sourceAt, commit: "c".repeat(40), origin: "Fixture" },
    development: {
      state: "main",
      at: "2026-10-12",
      summary: "main kaynak kaydı",
    },
    tests: {
      state: "reported",
      at: "2026-09-20",
      summary: "Tarihi değiştirilmemesi gereken yerel test kaydı",
      scope: "Canlı widget kabulü değil",
    },
    live: { state: "unknown", summary: "Canlı kabul kaydı yok" },
    evidence: [
      {
        sha: "c".repeat(40),
        file: "src/agents/avvapoc/helpers/tools.js",
        line: 20,
        supports: ["tool", "provider"],
      },
    ],
  });
  return {
    state: "configured",
    agentKey: "avvapoc",
    presentation: "avva-map",
    context: {
      sourceAt,
      commit: "c".repeat(40),
      branch: "main / fixture",
      scope: "Anonymous fixture",
    },
    capabilities: [
      card("store-sms", "Mağaza faturası SMS", "Fatura", [
        { name: "Nebim", role: "fatura verisi" },
        { name: "Mobildev", role: "SMS gönderimi" },
      ]),
      card("cart", "Sepete ekleme", "Alışveriş", [
        { name: "AVVA", role: "site sepeti" },
      ]),
    ],
    connections: {
      jira: {
        state: "snapshot",
        checkedAt: sourceAt,
        liveState: "missing-config",
        source: "Fixture",
        items: [],
      },
      github: {
        state: "snapshot",
        checkedAt: sourceAt,
        liveState: "missing-config",
        source: "Fixture",
        items: [],
      },
    },
  };
}
async function seedPolishProfile(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("agentarium.workspace.v1"))
      localStorage.setItem(
        "agentarium.workspace.v1",
        JSON.stringify([
          {
            id: "existing-avva",
            name: "My AVVA",
            role: "My preserved role",
            shape: 0,
            color: "#b9cbb0",
            avatarId: "styloo-knight",
            tags: ["preserve"],
            milestones: [
              {
                id: "my-note",
                date: "2026-09-20",
                kind: "Capability",
                title: "My preserved note",
                description: "User-owned note",
              },
            ],
            tracking: {
              repositoryId: "fixture",
              repositoryName: "Fixture",
              folder: "src/agents/avvapoc",
              branchMode: "all-local-and-remote-tracking",
              lastSyncedAt: "",
              branchCount: 0,
              truncated: false,
              limit: 5000,
              changes: [],
            },
          },
        ]),
      );
  });
  await page.route("**/api/tracking/history", (route) =>
    route.fulfill({ json: { history: null } }),
  );
  await page.route("**/api/agents", (route) =>
    route.fulfill({
      json: {
        agents: [
          {
            repositoryId: "fixture",
            repositoryName: "Fixture",
            folder: "src/agents/avvapoc",
            agentKey: "avvapoc",
            name: "Remote AVVA name",
            mapped: true,
            capabilityCount: 2,
            providers: ["Nebim", "Mobildev", "AVVA"],
            channels: ["Web metin"],
            capabilityTerms: ["Mağaza faturası SMS", "Sepete ekleme"],
          },
        ],
      },
    }),
  );
}

test("Overview reveals groups; refresh failure and updated snapshots preserve notes, avatar, filters and old test dates", async ({
  page,
}) => {
  await seedPolishProfile(page);
  let version = 1;
  let unavailable = false;
  await page.route("**/api/capabilities?*", (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { error: "Fixture unavailable" } }
        : { json: polishSnapshot(version) },
    ),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Visit My AVVA", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Fatura işlevlerini aç" }),
  ).toBeVisible();
  await expect(page.locator(".map-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Fatura işlevlerini aç" }).click();
  await expect(page.locator(".map-card")).toHaveCount(1);
  await expect(page.getByLabel("Yetenek ara")).not.toBeVisible();
  await page.getByText("Filtrele", { exact: true }).click();
  await page.getByLabel("Yetenek ara").fill("sms");
  await page.getByRole("button", { name: "Nebim", exact: true }).click();
  await page.getByLabel("Kanal filtresi").selectOption("Web metin");
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("agentarium.workspace.v1")!),
  );
  unavailable = true;
  await page
    .getByRole("button", { name: "Yerel kaydı yeniden oku", exact: true })
    .click();
  await expect(
    page.getByText("Kaynak kaydı okunamadı. Son başarılı görünüm korunuyor."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mağaza faturası SMS ayrıntısı" }),
  ).toBeVisible();
  await expect(page.getByLabel("Yetenek ara")).toHaveValue("sms");
  unavailable = false;
  version = 2;
  await page
    .getByRole("button", { name: "Yerel kaydı yeniden oku", exact: true })
    .click();
  await expect(
    page.getByText("Kaynak kaydı okunamadı. Son başarılı görünüm korunuyor."),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Mağaza faturası SMS ayrıntısı" })
    .click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("Güncellenmiş kaynak özeti")).toBeVisible();
  await expect(detail.getByText("Test gözlemi: 20 Eyl 2026")).not.toBeVisible();
  await detail.getByText("Test ve canlı kanıtı", { exact: true }).click();
  await expect(detail.getByText("Test gözlemi: 20 Eyl 2026")).toBeVisible();
  await detail.getByText("Tool ve kaynaklar", { exact: true }).click();
  unavailable = true;
  await detail
    .getByRole("button", { name: "Yerel kaydı yeniden oku", exact: true })
    .click();
  await expect(
    detail.getByText("Kaynak kaydı okunamadı. Son başarılı görünüm korunuyor."),
  ).toBeVisible();
  await expect(detail.getByText("Test gözlemi: 20 Eyl 2026")).toBeVisible();
  unavailable = false;
  await detail
    .getByRole("button", { name: "Yerel kaydı yeniden oku", exact: true })
    .click();
  await expect(
    detail.getByText("Kaynak kaydı okunamadı. Son başarılı görünüm korunuyor."),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.reload();
  await page
    .getByRole("button", { name: "Visit My AVVA", exact: true })
    .click();
  await expect(page.getByLabel("Yetenek ara")).toHaveValue("sms");
  await expect(page.getByLabel("Kanal filtresi")).toHaveValue("Web metin");
  await expect(
    page.getByRole("button", { name: "Nebim", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "My preserved note" }),
  ).toBeVisible();
  await expect(
    page.locator(".profile-avatar").getByRole("img", { name: "Knight avatar" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mağaza faturası SMS ayrıntısı" })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Visit My AVVA", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mağaza faturası SMS ayrıntısı" }),
  ).toBeFocused();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("agentarium.workspace.v1")!),
  );
  expect(after).toEqual(before);
  await page
    .getByText("Jira / GitHub · Tarihli kayıt", { exact: true })
    .click();
  await expect(page.getByText(/Canlı bağlantı: yapılandırılmadı/)).toHaveCount(
    2,
  );
});

test("No matches and missing evidence remain readable; removed snapshot detail closes safely and mobile touch targets stay usable", async ({
  page,
}) => {
  await seedPolishProfile(page);
  let missing = false;
  await page.route("**/api/capabilities?*", (route) => {
    const data = polishSnapshot(2);
    if (missing)
      data.capabilities = data.capabilities.filter((c) => c.id !== "store-sms");
    else {
      const c = data.capabilities[0];
      c.sourceStatus = "unverified";
      c.providers = [{ name: "Bilinmiyor", role: "kaynak doğrulanamadı" }];
      c.channels = [];
      c.development.state = "unknown";
      c.tests.state = "unknown";
    }
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Visit My AVVA", exact: true })
    .click();
  await expect(
    page.getByText("Kaynak kanıtı eksik", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tüm işlevleri göster", exact: true })
    .click();
  await page.getByText("Filtrele", { exact: true }).click();
  await page.getByLabel("Yetenek ara").fill("eşleşmeyen-işlev");
  await expect(
    page.getByText("Bu filtrelerle eşleşen yetenek yok."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Filtreleri temizle", exact: true })
    .click();
  const card = page.getByRole("button", {
    name: "Mağaza faturası SMS ayrıntısı",
  });
  await expect(card.getByText("Kaynak uyuşmuyor")).toBeVisible();
  await expect(card.getByText("Test kaydı yok", { exact: true })).toBeVisible();
  await expect(
    card.getByText("Canlı doğrulanmadı", { exact: true }),
  ).toBeVisible();
  await card.click();
  const detail = page.getByRole("dialog");
  await detail.getByText("Sağlayıcılar ve koşullar", { exact: true }).click();
  await expect(detail.getByText("Bilinmiyor", { exact: true })).toBeVisible();
  await detail.getByText("Tool ve kaynaklar", { exact: true }).click();
  missing = true;
  await detail
    .getByRole("button", { name: "Yerel kaydı yeniden oku", exact: true })
    .click();
  await expect(detail).not.toBeVisible();
  await expect(
    page.getByText(
      "Bu işlev yeni kaynak kaydında bulunamadı. Filtrelerin korundu.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Yetenek ara")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Özet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Alışveriş işlevlerini aç" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const targets = await page
    .locator(".map-room,.map-view-switch button,.map-providers button")
    .evaluateAll((els) =>
      els
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => el.getBoundingClientRect().height),
    );
  expect(targets.every((h) => h >= 44)).toBe(true);
});
