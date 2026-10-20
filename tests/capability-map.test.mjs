import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCapabilities,
  statusLabel,
  groupCapabilities,
  readMapView,
} from "../src/capability-map.mjs";
const cards = [
  {
    id: "sms",
    title: "Mağaza faturası SMS",
    summary: "Fatura bağlantısı",
    tool: "store_sms",
    tools: ["store_sms"],
    group: "Fatura",
    providers: [
      { name: "Nebim", role: "veri" },
      { name: "Mobildev", role: "gönderim" },
    ],
    channels: ["Web metin"],
  },
  {
    id: "review",
    title: "İnceleme durumu",
    summary: "Güvenilir numara",
    tool: "review_lookup",
    tools: ["review_lookup"],
    group: "İade",
    providers: [{ name: "Nebim", role: "veri" }],
    channels: ["Telefon"],
  },
];
test("Discovery combines human words, exact tools, provider, channel and group without guessing unknowns", () => {
  assert.deepEqual(
    filterCapabilities(cards, {
      query: "magaza sms",
      provider: "Mobildev",
      channel: "Web metin",
      group: "Fatura",
    }).map((c) => c.id),
    ["sms"],
  );
  assert.deepEqual(
    filterCapabilities(cards, {
      query: "INCELEME",
      provider: "Nebim",
      channel: "Telefon",
    }).map((c) => c.id),
    ["review"],
  );
  assert.equal(
    filterCapabilities(cards, { provider: "Mobildev", channel: "Telefon" })
      .length,
    0,
  );
  assert.equal(filterCapabilities(cards, { query: "review_lookup" }).length, 1);
});
test("Test and live labels remain independent of merged development and distinguish missing, not-run and failed evidence", () => {
  assert.notEqual(
    statusLabel("tests", "unknown"),
    statusLabel("tests", "not-run"),
  );
  assert.equal(statusLabel("tests", "failed"), "başarısız");
  assert.equal(statusLabel("development", "main"), "main kaydı");
  assert.equal(statusLabel("live", "main"), "bilinmiyor");
  assert.equal(statusLabel("tests", "main"), "bilinmiyor");
});

test("Overview groups retain actual provider relationships and flag incomplete source evidence without success scores", () => {
  const grouped = groupCapabilities([
    { ...cards[0], sourceStatus: "snapshot" },
    { ...cards[1], sourceStatus: "unverified" },
  ]);
  assert.equal(grouped[0].cards.length, 1);
  assert.deepEqual(
    grouped[0].providers.map((p) => p.name),
    ["Nebim", "Mobildev"],
  );
  assert.equal(grouped[1].hasMissingEvidence, true);
  assert.ok(!("successRate" in grouped[0]));
});
test("View restoration rejects malformed or unavailable storage and copies only view fields", () => {
  const good = {
    query: "sms",
    group: "Fatura",
    provider: "Nebim",
    channel: "Web metin",
    mode: "cards",
    milestones: ["must not enter view storage"],
  };
  assert.deepEqual(
    readMapView({ getItem: () => JSON.stringify(good) }, "key"),
    {
      query: "sms",
      group: "Fatura",
      provider: "Nebim",
      channel: "Web metin",
      mode: "cards",
    },
  );
  assert.equal(
    readMapView({ getItem: () => "{invalid" }, "key").mode,
    "overview",
  );
  assert.equal(
    readMapView(
      {
        getItem: () => {
          throw Error("unavailable");
        },
      },
      "key",
    ).query,
    "",
  );
  assert.equal(
    readMapView(
      { getItem: () => JSON.stringify({ ...good, query: "a".repeat(1000) }) },
      "key",
    ).query,
    "",
  );
});
