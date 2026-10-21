import test from "node:test";
import assert from "node:assert/strict";
import {
  chronological,
  filterAgents,
  safeEvidence,
  cacheWorkspace,
} from "../src/history.mjs";
test("browser cache is bounded without changing archive, avatar or milestones", () => {
  const agent = {
    id: "one",
    avatarId: "monk",
    milestones: [{ title: "Existing" }],
    tracking: {
      archiveVersion: 1,
      changes: Array.from({ length: 136 }, (_, i) => ({ sha: String(i) })),
    },
  };
  const [cached] = cacheWorkspace([agent]);
  assert.equal(cached.tracking.changes.length, 20);
  assert.equal(cached.tracking.totalCount, 136);
  assert.equal(cached.tracking.cached, true);
  assert.equal(agent.tracking.changes.length, 136);
  assert.equal(cached.avatarId, agent.avatarId);
  assert.strictEqual(cached.milestones, agent.milestones);
  assert.deepEqual(cacheWorkspace([cached]), [cached]);
  const legacy = { ...agent, tracking: { changes: agent.tracking.changes } };
  assert.strictEqual(cacheWorkspace([legacy])[0], legacy);
});
test("backdated milestones sort without changing stored data", () => {
  const events = [
    { date: "2026-09-20" },
    { date: "2026-08-01" },
    { date: "2026-09-23" },
  ];
  assert.deepEqual(
    chronological(events).map((e) => e.date),
    ["2026-09-23", "2026-09-20", "2026-08-01"],
  );
  assert.equal(events[0].date, "2026-09-20");
});
test("search and tags combine", () => {
  const agents = [
    { name: "Milo", role: "Support", tags: ["Retail", "Northstar"] },
    { name: "Fern", role: "Sales", tags: ["Retail"] },
  ];
  assert.equal(filterAgents(agents, " NORTHSTAR ", "Retail").length, 1);
  assert.equal(filterAgents(agents, "Support", "Travel").length, 0);
  assert.equal(filterAgents(agents, "", "").length, 2);
});
test("evidence rejects executable URLs", () => {
  assert.equal(safeEvidence("javascript:alert(1)"), null);
  assert.equal(safeEvidence("data:text/html,hello"), null);
  assert.equal(safeEvidence("not a URL"), null);
  assert.equal(
    safeEvidence("https://github.com/example/repo"),
    "https://github.com/example/repo",
  );
});
