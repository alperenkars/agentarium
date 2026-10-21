import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  validateWorkLink,
  mergeWorkLink,
  importWorkLink,
} from "../scripts/import-work-link.mjs";
const link = {
  schemaVersion: 1,
  repository: "example/backend",
  agentUID: "example",
  folder: "src/agents/example",
  jira: { site: "https://example.atlassian.net", issueKey: "VAG-123" },
  pullRequest: {
    number: 99,
    url: "https://github.com/example/backend/pull/99",
  },
};
const empty = () => ({ schemaVersion: 1, agents: [] });
test("Association import creates only exact ID links, no capabilities or completed/live claims", () => {
  const result = mergeWorkLink(empty(), link, "my-backend");
  const agent = result.agents[0];
  assert.equal(agent.agentKey, "example");
  assert.deepEqual(agent.capabilities, []);
  assert.deepEqual(agent.jira.issueKeys, ["VAG-123"]);
  assert.deepEqual(agent.github.pullNumbers, [99]);
  assert.deepEqual(agent.workLinks, [{ jiraKey: "VAG-123", pullNumber: 99 }]);
  assert.ok(!("status" in agent));
  assert.equal(mergeWorkLink(result, link, "my-backend"), result);
});
test("Existing capability evidence, snapshots and other agents survive; one PR cannot acquire another primary Jira", () => {
  const manifest = mergeWorkLink(empty(), link, "my-backend");
  manifest.agents[0].capabilities = [{ id: "existing evidence" }];
  manifest.agents[0].jira.snapshot = { checkedAt: "2020-01-01", items: [] };
  manifest.agents.push({
    repositoryId: "other",
    folder: "src/agents/example",
    agentKey: "example",
    capabilities: [],
  });
  const next = {
    ...link,
    jira: { ...link.jira, issueKey: "VAG-124" },
    pullRequest: {
      number: 100,
      url: "https://github.com/example/backend/pull/100",
    },
  };
  const result = mergeWorkLink(manifest, next, "my-backend");
  assert.equal(result.agents[0].capabilities, manifest.agents[0].capabilities);
  assert.equal(
    result.agents[0].jira.snapshot,
    manifest.agents[0].jira.snapshot,
  );
  assert.equal(result.agents[1], manifest.agents[1]);
  assert.throws(
    () => mergeWorkLink(manifest, { ...link, jira: next.jira }, "my-backend"),
    /another primary Jira/,
  );
});
test("Credentials, customer text, ambiguous identities and foreign PR URLs are rejected", () => {
  for (const override of [
    { token: "fixture" },
    { summary: "private text" },
    { completed: true },
    { agentUID: "shared", folder: "src/agents/shared" },
    { folder: "src/agents/other" },
    {
      pullRequest: {
        number: 99,
        url: "https://github.com/other/backend/pull/99",
      },
    },
    {
      jira: {
        site: "https://user:pass@example.atlassian.net",
        issueKey: "VAG-123",
      },
    },
  ])
    assert.throws(() => validateWorkLink({ ...link, ...override }));
  const conflict = {
    schemaVersion: 1,
    agents: Array(2).fill({ repositoryId: "my-backend", folder: link.folder }),
  };
  assert.throws(
    () => mergeWorkLink(conflict, link, "my-backend"),
    /Conflicting/,
  );
  const foreign = {
    schemaVersion: 1,
    agents: [
      {
        repositoryId: "my-backend",
        folder: link.folder,
        agentKey: "example",
        github: { repository: "other/backend", pullNumbers: [] },
      },
    ],
  };
  assert.throws(
    () => mergeWorkLink(foreign, link, "my-backend"),
    /another agent, repository/,
  );
});
test("Record limits never silently discard prior work", () => {
  const manifest = mergeWorkLink(empty(), link, "my-backend");
  manifest.agents[0].jira.issueKeys = Array.from(
    { length: 10 },
    (_, i) => `VAG-${i + 1}`,
  );
  assert.throws(
    () => mergeWorkLink(manifest, link, "my-backend"),
    /limit reached/,
  );
  assert.equal(manifest.agents[0].jira.issueKeys.length, 10);
});
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-work-link-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const repo = path.join(dir, "backend");
  await fs.mkdir(path.join(repo, link.folder), { recursive: true });
  execFileSync("git", ["init", "--quiet", repo]);
  execFileSync("git", [
    "-C",
    repo,
    "remote",
    "add",
    "origin",
    "https://github.com/example/backend.git",
  ]);
  const input = path.join(dir, "work-link.json"),
    local = path.join(dir, "local.json"),
    manifest = path.join(dir, ".agentarium/capabilities.json");
  await fs.writeFile(input, JSON.stringify(link));
  await fs.writeFile(
    local,
    JSON.stringify({
      repositories: [
        {
          id: "my-backend",
          name: "Fixture",
          path: repo,
          agentsRoot: "src/agents",
        },
      ],
    }),
  );
  return {
    dir,
    repo,
    input,
    local,
    manifest,
    args: [
      "--input",
      input,
      "--local-config",
      local,
      "--manifest",
      manifest,
      "--repository-id",
      "my-backend",
    ],
  };
}
test("CLI path defaults to dry run, applies only with --write and is idempotent", async (t) => {
  const f = await fixture(t);
  assert.equal((await importWorkLink(f.args)).dryRun, true);
  await assert.rejects(fs.stat(f.manifest), /ENOENT/);
  const applied = await importWorkLink([...f.args, "--write"]);
  assert.equal(applied.statusImported, false);
  const saved = await fs.readFile(f.manifest, "utf8");
  assert.equal(JSON.parse(saved).agents[0].workLinks[0].pullNumber, 99);
  assert.equal((await importWorkLink([...f.args, "--write"])).changed, false);
  assert.equal(await fs.readFile(f.manifest, "utf8"), saved);
  assert.equal((await fs.stat(f.manifest)).mode & 0o777, 0o600);
});
test("Local allowlist and checkout remote must match before importing", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    importWorkLink([...f.args.slice(0, -1), "other"]),
    /local allowlist/,
  );
  execFileSync("git", [
    "-C",
    f.repo,
    "remote",
    "set-url",
    "origin",
    "https://github.com/other/backend.git",
  ]);
  await assert.rejects(importWorkLink([...f.args, "--write"]), /differs/);
  await assert.rejects(fs.stat(f.manifest), /ENOENT/);
});
