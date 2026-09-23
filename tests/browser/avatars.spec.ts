import { test, expect } from "@playwright/test";
import { avatarOptions } from "../../src/avatars.mjs";

const key = "agentarium.workspace.v1";
const readAgents = (page: import("@playwright/test").Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);

test("legacy agents get persistent avatars without losing their histories", async ({
  page,
}) => {
  await page.goto("/");
  const originals = await readAgents(page);
  await page.evaluate((key) => {
    const agents = JSON.parse(localStorage.getItem(key)!);
    for (const agent of agents) delete agent.avatarId;
    localStorage.setItem(key, JSON.stringify(agents));
  }, key);
  await page.reload();
  await expect(
    page.locator('.world-resident .character-avatar[data-status="ready"]'),
  ).toHaveCount(6);
  const assigned = await readAgents(page);
  expect(
    assigned.every((a: { avatarId: string }) =>
      avatarOptions.some((option) => option.id === a.avatarId),
    ),
  ).toBe(true);
  expect(assigned.map(({ avatarId, ...a }: any) => a)).toEqual(
    originals.map(({ avatarId, ...a }: any) => a),
  );
  await page.reload();
  expect(await readAgents(page)).toEqual(assigned);
});

test("choose, cancel, save, reload and export an avatar across all views", async ({
  page,
}) => {
  await page.goto("/");
  const original = await readAgents(page);
  const target = original[0];
  const choice = target.avatarId === "huberthart-monk" ? "Hood" : "Monk";
  const avatarId = `huberthart-${choice.toLowerCase()}`;
  await page
    .getByRole("button", { name: `Visit ${target.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Change avatar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator('.character-avatar[data-status="ready"]'),
  ).toHaveCount(7);
  await page.getByRole("button", { name: `Choose ${choice}` }).click();
  await page.keyboard.press("Escape");
  expect(await readAgents(page)).toEqual(original);
  await page
    .getByRole("button", { name: "Change avatar", exact: true })
    .click();
  await page.getByRole("button", { name: `Choose ${choice}` }).click();
  await page.screenshot({ path: "/private/tmp/agentarium-avatar-picker.png" });
  await page.getByRole("button", { name: "Save avatar", exact: true }).click();
  await expect(
    page.locator(".profile-avatar .character-avatar"),
  ).toHaveAttribute("data-avatar", avatarId);
  const changed = await readAgents(page);
  expect(changed[0]).toEqual({ ...target, avatarId });
  expect(changed.slice(1)).toEqual(original.slice(1));
  await page.getByRole("button", { name: "All agents" }).click();
  await expect(
    page
      .getByRole("button", { name: `Visit ${target.name}`, exact: true })
      .locator(".character-avatar"),
  ).toHaveAttribute("data-avatar", avatarId);
  await page.getByRole("button", { name: "Agent map" }).click();
  await expect(
    page.locator(".agent-card").first().locator(".character-avatar"),
  ).toHaveAttribute("data-avatar", avatarId);
  await page.getByRole("button", { name: "Recent evolution" }).click();
  await expect(
    page
      .locator(".activity-row")
      .filter({ hasText: target.name })
      .first()
      .locator(".character-avatar"),
  ).toHaveAttribute("data-avatar", avatarId);
  await page.reload();
  expect(await readAgents(page)).toEqual(changed);
  const download = page.waitForEvent("download");
  await page.locator(".game-menu:visible > summary").click();
  await page.getByRole("button", { name: "Export workspace" }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).agents).toEqual(changed);
});

test("new agents keep their random default and mobile picker is keyboard usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Add an agent" }).click();
  const selected = page.locator(
    '.avatar-picker button[aria-pressed="true"] .character-avatar',
  );
  const avatarId = await selected.getAttribute("data-avatar");
  await page.getByLabel("Name", { exact: true }).fill("Test avatar");
  await page.getByLabel("What does this agent do?").fill("Tests defaults");
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  await expect(
    page.locator(".profile-avatar .character-avatar"),
  ).toHaveAttribute("data-avatar", avatarId!);
  await page
    .getByRole("button", { name: "Change avatar", exact: true })
    .click();
  const choice = page.getByRole("button", { name: "Choose Monk" });
  await choice.focus();
  await page.keyboard.press("Enter");
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/private/tmp/agentarium-avatar-mobile.png" });
  await page.getByRole("button", { name: "Save avatar" }).click();
  await page.reload();
  expect(
    (await readAgents(page)).find((a: any) => a.name === "Test avatar")
      .avatarId,
  ).toBe("huberthart-monk");
});

test("reduced motion freezes sprites and missing artwork has a clear fallback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.locator('.world-resident .character-avatar[data-status="ready"]'),
  ).toHaveCount(6);
  const canvas = page.locator(".world-resident canvas").first();
  const before = await canvas.evaluate((el: HTMLCanvasElement) =>
    el.toDataURL(),
  );
  await page.waitForTimeout(400);
  expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(
    before,
  );
  await page.route("**/assets/**/*.png", (route) => route.abort());
  await page.reload();
  await expect(
    page.locator('.world-resident .character-avatar[data-status="error"]'),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Milo", exact: true }),
  ).toBeVisible();
});

test("all seven avatars load, can be saved, and retain their artwork after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  for (const avatar of avatarOptions) {
    await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
    await page
      .getByRole("button", { name: "Change avatar", exact: true })
      .click();
    await expect(
      page.locator('.avatar-picker .character-avatar[data-status="ready"]'),
    ).toHaveCount(7);
    await page
      .getByRole("button", { name: `Choose ${avatar.name}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save avatar", exact: true })
      .click();
    const portrait = page.locator(".profile-avatar .character-avatar");
    await expect(portrait).toHaveAttribute("data-avatar", avatar.id);
    await expect(portrait).toHaveAttribute("data-status", "ready");
    const filledPixels = await portrait
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
        return count;
      });
    expect(filledPixels).toBeGreaterThan(5000);
    await page.reload();
    await expect(
      page
        .getByRole("button", { name: "Visit Milo", exact: true })
        .locator(".character-avatar"),
    ).toHaveAttribute("data-avatar", avatar.id);
  }
  expect(errors).toEqual([]);
});

test("a Styloo walk animation moves and the pause control freezes it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Visit Milo", exact: true }).click();
  await page
    .getByRole("button", { name: "Change avatar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose Knight", exact: true })
    .click();
  await page.getByRole("button", { name: "Save avatar", exact: true }).click();
  await page.getByRole("button", { name: "All agents" }).click();
  const avatar = page
    .getByRole("button", { name: "Visit Milo", exact: true })
    .locator(".character-avatar");
  await expect(avatar).toHaveAttribute("data-status", "ready");
  const snapshot = () =>
    avatar
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const moving = await snapshot();
  await expect.poll(snapshot).not.toBe(moving);
  await page
    .getByRole("button", { name: "Pause movement", exact: true })
    .click();
  await expect(avatar).toHaveAttribute("data-status", "ready");
  const paused = await snapshot();
  await page.waitForTimeout(300);
  expect(await snapshot()).toBe(paused);
});
