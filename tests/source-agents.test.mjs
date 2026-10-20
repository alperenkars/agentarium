import test from "node:test";
import assert from "node:assert/strict";
import { mergeSourceAgents, markExamples } from "../src/source-agents.mjs";
const source = {
  repositoryId: "backend",
  repositoryName: "Backend",
  folder: "agents/avvapoc",
  agentKey: "avvapoc",
  name: "AVVA",
};
test("Exact folder discovery preserves existing profiles and never invents scans or history", () => {
  const existing = {
    id: "my-avva",
    name: "My AVVA",
    avatarId: "styloo-knight",
    milestones: [{ title: "My note" }],
    tracking: { repositoryId: "backend", folder: "agents/avvapoc" },
  };
  assert.deepEqual(mergeSourceAgents([existing], [source]), [existing]);
  const added = mergeSourceAgents(
    [existing],
    [{ ...source, folder: "agents/suwen", agentKey: "suwen", name: "suwen" }],
  );
  assert.equal(added.length, 2);
  assert.strictEqual(added[0], existing);
  assert.equal(added[1].tracking.lastSyncedAt, "");
  assert.deepEqual(added[1].milestones, []);
  assert.deepEqual(
    mergeSourceAgents(added, [
      source,
      { ...source, folder: "agents/suwen", agentKey: "suwen", name: "suwen" },
    ]),
    added,
  );
});
test("Only unchanged seed content is classified as examples; edited user data survives", () => {
  const seed = [
    {
      id: "milo",
      name: "Milo",
      role: "Care",
      shape: 0,
      color: "blue",
      tags: [],
      milestones: [{ title: "Example" }],
    },
  ];
  assert.equal(markExamples(seed, seed)[0].demo, true);
  assert.equal(
    markExamples(
      [{ ...seed[0], milestones: [{ title: "User note" }] }],
      seed,
    )[0].demo,
    undefined,
  );
  assert.equal(
    markExamples([{ ...seed[0], tracking: { folder: "agents/real" } }], seed)[0]
      .demo,
    undefined,
  );
});

test("An unchanged catalog preserves state identity and cannot trigger a stale storage write", () => {
  const current = mergeSourceAgents([], [source]);
  assert.strictEqual(mergeSourceAgents(current, [source]), current);
  assert.strictEqual(mergeSourceAgents(current, []), current);
});
