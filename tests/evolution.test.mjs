import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectChanges, analyzeHistory } from "../server/evolution.mjs";
import { HistoryStore } from "../server/history-store.mjs";
import { approvedHistory } from "../src/history.mjs";

const file = "src/agents/pilot/helpers/tools.js";
const definition =
  'const get_magaza_listesi = { description: "Find a store", parameters: {properties: {city: {type: "string"}}}, execute: async () => {} };';
test("only explicit supported changes become proposals, not formatting, comments or unknown tools", () => {
  const [addition] = detectChanges("", definition, file);
  assert.equal(addition.title, "Store lookup added");
  assert.equal(addition.afterLine, 1);
  assert.equal(
    detectChanges(definition, definition.replace(/ /g, "  "), file).length,
    0,
  );
  assert.equal(
    detectChanges(definition, definition + "\n// improved support", file)
      .length,
    0,
  );
  assert.equal(
    detectChanges(
      definition,
      definition.replace('"Find a store"', '"Find " + "a store"'),
      file,
    ).length,
    0,
  );
  assert.equal(
    detectChanges("", definition, file.replace(".js", ".test.js")).length,
    0,
  );
  assert.equal(
    detectChanges(
      "",
      definition.replace("get_magaza_listesi", "unknown_feature"),
      file,
    ).length,
    0,
  );
  assert.equal(
    detectChanges(definition, "", file)[0].title,
    "Store lookup removed",
  );
  assert.equal(
    detectChanges(definition, definition.replace("city:", "brand:"), file)[0]
      .title,
    "Store lookup inputs changed",
  );
});
test("instruction detection needs a new literal rule and retains scoped evidence", () => {
  const instruction =
    "const prompt = `transfer_call_to_human yalnızca sonraki turda açık onay verilirse çağrılır.`;";
  const filename = "src/agents/pilot/agentConfig.js";
  assert.equal(
    detectChanges("", instruction, filename)[0].title,
    "Ask permission before transferring a caller",
  );
  assert.equal(
    detectChanges(instruction, instruction + "\n// unchanged", filename).length,
    0,
  );
  assert.equal(detectChanges("", "// " + instruction, filename).length, 0);
  const evidence = detectChanges("", instruction, filename)[0];
  assert.match(evidence.after, /açık onay/);
  assert.equal(evidence.file, filename);
});
test("analyzer scopes source reads and groups equivalent introductions without executing code", async () => {
  const calls = [];
  const git = async (_, args) => {
    calls.push(args);
    if (args[0] === "ls-tree")
      return `100644 blob ${"d".repeat(40)}\t${file}\0`;
    if (args[1] === "-s") return String(definition.length);
    if (args[1] === "blob") return definition;
    throw new Error("Unexpected command");
  };
  const base = {
    parents: [],
    files: [file, "src/agents/other/secret.js"],
    refs: ["refs/heads/experiment"],
    date: "2026-09-20T12:00:00Z",
  };
  const history = {
    folder: "src/agents/pilot",
    changes: [
      { ...base, sha: "a".repeat(40) },
      { ...base, sha: "b".repeat(40) },
      { ...base, sha: "c".repeat(40), merge: true },
      { ...base, sha: "e".repeat(40), unverified: true },
    ],
  };
  const result = await analyzeHistory(
    { id: "fixture", root: "/fixture" },
    history,
    git,
  );
  assert.equal(result.analyzed, 2);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].evidence.length, 2);
  assert.equal(result.proposals[0].status, "proposed");
  assert(!JSON.stringify(calls).includes("secret.js"));
  await assert.rejects(
    analyzeHistory({ id: "fixture" }, { ...history, shallow: true }, git),
  );
});
test("review decisions persist, reject stale edits and never auto-approve regenerated proposals", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "agentarium-review-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dbFile = path.join(directory, "history.sqlite");
  let store = new HistoryStore(dbFile);
  const repository = { id: "fixture", root: directory };
  const folder = "src/agents/pilot";
  store.write(repository, { folder, changes: [] });
  const analysis = {
    at: "2026-09-20",
    analyzed: 1,
    eligible: 1,
    proposals: [
      {
        id: "one",
        title: "Store lookup added",
        description: "Introduced store lookup.",
        kind: "Capability",
        date: "2026-09-20",
        status: "proposed",
        evidence: [{ sha: "a".repeat(40), file }],
      },
    ],
  };
  store.saveEvolution(repository, folder, analysis);
  let data = store.review(repository, folder, {
    id: "one",
    version: 1,
    status: "proposed",
    title: "Find a store",
  });
  assert.equal(data.proposals[0].title, "Find a store");
  assert.throws(() =>
    store.review(repository, folder, {
      id: "one",
      version: 1,
      status: "approved",
    }),
  );
  data = store.review(repository, folder, {
    id: "one",
    version: 2,
    status: "approved",
  });
  store.close();
  store = new HistoryStore(dbFile);
  t.after(() => store.close());
  data = store.saveEvolution(repository, folder, analysis);
  assert.equal(data.proposals.length, 1);
  assert.equal(data.proposals[0].status, "approved");
  assert.equal(data.proposals[0].title, "Find a store");
  const agent = {
    milestones: [],
    tracking: { repositoryId: "fixture", folder },
    updates: data,
  };
  assert.equal(approvedHistory(agent).length, 1);
  assert.equal(approvedHistory({ milestones: [] }).length, 0);
  assert.equal(
    approvedHistory({
      ...agent,
      tracking: { repositoryId: "fixture", folder: "other" },
    }).length,
    0,
  );
  data = store.review(repository, folder, {
    id: "one",
    version: 3,
    status: "dismissed",
  });
  assert.equal(approvedHistory({ ...agent, updates: data }).length, 0);
  assert.equal(
    store.saveEvolution(repository, folder, analysis).proposals[0].status,
    "dismissed",
  );
});
