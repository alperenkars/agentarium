import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { summarizeWork, safeWorkUrl } from "../src/work-summary.mjs";
import {
  ciSignal,
  reviewSignal,
  readPullSignals,
} from "../server/work-signals.mjs";
import {
  readConnections,
  capabilitiesPlugin,
} from "../server/capabilities.mjs";
const sha = "a".repeat(40);
const pull = {
  number: 7,
  head: { sha },
  requested_reviewers: [{ login: "reviewer" }],
};
const connections = (jira = [], github = []) => ({
  jira: { state: "snapshot", items: jira },
  github: { state: "connected", items: github },
});

test("Only linked active work is counted; category handles custom Jira terminal names", () => {
  const summary = summarizeWork(
    connections(
      [
        { id: "VAG-1", title: "Review", status: "In Review" },
        {
          id: "VAG-2",
          title: "Custom terminal",
          status: "Yayına alındı",
          category: "done",
        },
      ],
      [
        {
          id: "#7",
          status: "open",
          review: "requested",
          ci: { state: "failure" },
        },
        { id: "#8", status: "merged", ci: { state: "failure" } },
        { id: "#9", status: "open", draft: true, review: "requested" },
      ],
    ),
  );
  assert.equal(summary.open.length, 3);
  assert.equal(summary.reviews.length, 2);
  assert.equal(summary.ci.length, 1);
  assert.equal(summary.next.target.id, "#7");
  assert.equal(summary.next.target.review, "requested");
  assert.match(summary.next.action, /CI/);
  assert.equal(summary.rows.find((r) => r.id === "VAG-1").saved, true);
});

test("No CI evidence or open unrequested PR does not imply green checks or requested review", () => {
  const summary = summarizeWork(
    connections([], [{ id: "#7", status: "open" }]),
  );
  assert.equal(summary.ci.length, 0);
  assert.equal(summary.reviews.length, 0);
  assert.equal(summary.open.length, 1);
});

test("Review decisions are latest per person, scoped to current head and never merge readiness", () => {
  const review = (state, commit_id = sha) => ({
    state,
    commit_id,
    user: { login: "reviewer" },
  });
  assert.equal(
    reviewSignal([review("APPROVED", "b".repeat(40))], pull),
    "requested",
  );
  assert.equal(
    reviewSignal([review("APPROVED"), review("DISMISSED")], pull),
    "requested",
  );
  assert.equal(
    reviewSignal([review("CHANGES_REQUESTED"), review("APPROVED")], pull),
    "approved",
  );
  assert.equal(
    reviewSignal([review("APPROVED"), review("COMMENTED")], pull),
    "approved",
  );
  assert.equal(
    reviewSignal(Array(100).fill(review("APPROVED")), pull),
    "unknown",
  );
});

test("CI combines checks and legacy statuses, partial or truncated evidence cannot be green", () => {
  const checks = {
    total_count: 1,
    check_runs: [{ name: "Build", status: "completed", conclusion: "success" }],
  };
  const statuses = { total_count: 0, statuses: [] };
  assert.equal(
    ciSignal(checks, statuses, "https://github.com/example/repo/pull/7").state,
    "success",
  );
  assert.equal(ciSignal(checks, null, "").state, "unknown");
  assert.equal(
    ciSignal({ ...checks, total_count: 101 }, statuses, "").state,
    "unknown",
  );
  assert.equal(
    ciSignal(
      checks,
      { total_count: 1, statuses: [{ state: "failure", context: "Deploy" }] },
      "",
    ).state,
    "failure",
  );
  assert.equal(
    ciSignal({ total_count: 0, check_runs: [] }, statuses, "").state,
    "unknown",
  );
});

test("Independent read failures preserve known blockers and unknown coverage", async () => {
  const result = await readPullSignals(pull, "example/repo", async (url) => {
    if (url.includes("check-runs"))
      return {
        total_count: 1,
        check_runs: [
          {
            name: "Build",
            status: "completed",
            conclusion: "failure",
            details_url: "javascript:bad",
          },
        ],
      };
    throw new Error("Denied");
  });
  assert.equal(result.review, "unknown");
  assert.equal(result.ci.state, "failure");
  assert.equal(result.ci.complete, false);
  assert.equal(
    result.ci.items[0].url,
    "https://github.com/example/repo/pull/7/checks",
  );
});

test("Work adapter reads exact mapped IDs and current head with GET and no raw secrets", async () => {
  const calls = [];
  const result = await readConnections(
    {
      jira: { site: "https://example.atlassian.net", issueKeys: ["VAG-1"] },
      github: { repository: "example/repo", pullNumbers: [7] },
    },
    {
      workSignals: true,
      env: {
        AGENTARIUM_GITHUB_TOKEN: "secret-value",
        AGENTARIUM_JIRA_AUTH: "Bearer secret-value",
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        const data = url.includes("atlassian")
          ? {
              key: "VAG-1",
              fields: {
                summary: "Test",
                updated: "2026-10-20T10:00:00Z",
                status: {
                  name: "Review",
                  statusCategory: { key: "indeterminate" },
                },
              },
            }
          : url.includes("/reviews?")
            ? []
            : url.includes("/check-runs?")
              ? { total_count: 0, check_runs: [] }
              : url.includes("/status?")
                ? { total_count: 0, statuses: [] }
                : { ...pull, title: "Test PR", state: "open", draft: false };
        return { ok: true, text: async () => JSON.stringify(data) };
      },
    },
  );
  assert.equal(calls.length, 5);
  assert.ok(
    calls.every(
      (c) => c.options.method === "GET" && c.options.redirect === "error",
    ),
  );
  assert.ok(
    calls
      .filter((c) => c.url.includes("/commits/"))
      .every((c) => c.url.includes(sha)),
  );
  assert.equal(result.github.items[0].review, "requested");
  assert.equal(result.jira.items[0].updatedAt, "2026-10-20T10:00:00Z");
  assert.ok(!JSON.stringify(result).includes("secret-value"));
});

test("Old snapshots keep their read date and unknown signals without network or new credentials", async () => {
  const result = await readConnections(
    {
      github: {
        repository: "example/repo",
        pullNumbers: [7],
        snapshot: {
          checkedAt: "2020-01-01T00:00:00Z",
          source: "Authorized connector",
          items: [{ id: "#7", title: "Old PR", status: "open" }],
        },
      },
    },
    {
      env: {},
      workSignals: true,
      fetchImpl: () => assert.fail("No credentials"),
    },
  );
  assert.equal(result.github.state, "stale");
  assert.equal(result.github.checkedAt, "2020-01-01T00:00:00Z");
  assert.equal(result.github.items[0].ci, undefined);
  assert.equal(result.github.items[0].review, undefined);
});

test("Summary endpoint shares the same-origin and read-only boundary", async () => {
  let middleware;
  capabilitiesPlugin("/missing", "/missing").configureServer({
    middlewares: {
      use(fn) {
        middleware = fn;
      },
    },
  });
  for (const [headers, method, expected] of [
    [{ host: "localhost:4173" }, "POST", 405],
    [{ host: "localhost:4173", origin: "https://evil.example" }, "GET", 403],
  ]) {
    let status;
    await middleware(
      { url: "/api/work-summary", headers, method },
      {
        writeHead(s) {
          status = s;
        },
        end() {},
      },
      () => assert.fail(),
    );
    assert.equal(status, expected);
  }
});

test("Only HTTPS Jira and GitHub evidence links are accepted", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://github.com.evil.example/x",
    "https://user:pass@github.com/example",
    "http://github.com/x",
  ])
    assert.equal(safeWorkUrl(url), null);
  assert.equal(
    safeWorkUrl("https://example.atlassian.net/browse/VAG-1"),
    "https://example.atlassian.net/browse/VAG-1",
  );
});

test("Summary GET isolates folders and rejects conflicting mappings without reading sources", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agentarium-work-"));
  try {
    execFileSync("git", ["init", "--quiet", root]);
    await mkdir(path.join(root, "agents/alpha"), { recursive: true });
    await mkdir(path.join(root, "agents/beta"), { recursive: true });
    const config = path.join(root, "config.json");
    const manifest = path.join(root, "mapping.json");
    await writeFile(
      config,
      JSON.stringify({
        repositories: [
          { id: "fixture", name: "Fixture", path: root, agentsRoot: "agents" },
        ],
      }),
    );
    const entry = {
      repositoryId: "fixture",
      agentKey: "alpha",
      folder: "agents/alpha",
      capabilities: [],
      jira: {
        site: "https://example.atlassian.net",
        issueKeys: ["VAG-1"],
        snapshot: {
          source: "Authorized read",
          checkedAt: "2020-01-01",
          items: [{ id: "VAG-1", title: "Scoped work", status: "Done" }],
        },
      },
    };
    await writeFile(
      manifest,
      JSON.stringify({ schemaVersion: 1, agents: [entry] }),
    );
    let middleware;
    capabilitiesPlugin(config, manifest).configureServer({
      middlewares: {
        use(fn) {
          middleware = fn;
        },
      },
    });
    const get = async (folder) => {
      let status, body;
      await middleware(
        {
          url:
            "/api/work-summary?" +
            new URLSearchParams({ repositoryId: "fixture", folder }),
          method: "GET",
          headers: { host: "localhost:4173" },
        },
        {
          writeHead(s) {
            status = s;
          },
          end(value) {
            body = JSON.parse(value);
          },
        },
        () => assert.fail(),
      );
      return { status, body };
    };
    assert.equal(
      (await get("agents/alpha")).body.connections.jira.items[0].id,
      "VAG-1",
    );
    assert.equal(
      (await get("agents/beta")).body.connections.jira.state,
      "missing-config",
    );
    assert.equal((await get("agents/other")).status, 404);
    await writeFile(
      manifest,
      JSON.stringify({ schemaVersion: 1, agents: [entry, entry] }),
    );
    assert.equal((await get("agents/alpha")).status, 400);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Saved read metadata keeps its original update date and rejects invalid fields", async () => {
  const item = {
    id: "VAG-1",
    title: "Work",
    status: "Custom terminal",
    category: "done",
    updatedAt: "2026-10-01T10:00:00Z",
    assignee: "Fixture owner",
  };
  const entry = {
    jira: {
      site: "https://example.atlassian.net",
      issueKeys: ["VAG-1"],
      snapshot: {
        source: "Authorized read",
        checkedAt: "2026-10-02",
        items: [item],
      },
    },
  };
  const result = await readConnections(entry, { env: {} });
  assert.equal(result.jira.items[0].updatedAt, item.updatedAt);
  assert.equal(result.jira.items[0].category, "done");
  assert.equal(
    summarizeWork({ ...result, github: { state: "missing-config", items: [] } })
      .open.length,
    0,
  );
  item.updatedAt = "not a date";
  await assert.rejects(() => readConnections(entry, { env: {} }));
});
