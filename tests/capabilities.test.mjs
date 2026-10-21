import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  freshness,
  validateEntry,
  verifyCapabilities,
  readConnections,
  capabilitiesPlugin,
} from "../server/capabilities.mjs";
const mapping = (sha) => ({
  agentKey: "alpha",
  repositoryId: "fixture",
  folder: "agents/alpha",
  capabilities: [
    {
      id: "orders",
      title: "Look up orders",
      tool: "order_lookup",
      provider: "Example",
      channels: ["Web"],
      evidence: [
        {
          sha,
          file: "agents/alpha/tools.js",
          line: 1,
          match: "order_lookup",
          supports: ["capability", "tool", "provider", "channel"],
        },
      ],
    },
  ],
});
test("Source evidence never proves runtime; wrong commit, line and sibling are rejected", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agentarium-capabilities-"));
  try {
    await mkdir(path.join(root, "agents/alpha"), { recursive: true });
    await writeFile(
      path.join(root, "agents/alpha/tools.js"),
      "// order_lookup Example Web\n",
    );
    const git = (...args) =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    git("init");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      "fixture",
    );
    const entry = mapping(git("rev-parse", "HEAD"));
    const result = await verifyCapabilities(entry, { root });
    assert.equal(result[0].sourceStatus, "source");
    assert.equal(result[0].runtimeStatus, "unknown");
    assert.equal(result[0].runtimeVerifiedAt, null);
    entry.capabilities[0].evidence[0].line = 2;
    assert.equal(
      (await verifyCapabilities(entry, { root }))[0].sourceStatus,
      "unverified",
    );
    entry.capabilities[0].evidence[0].file = "agents/beta/tools.js";
    assert.throws(() => validateEntry(entry));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("No credentials means missing config; real saved reads stay separate and expire", async () => {
  const entry = {
    jira: {
      site: "https://example.atlassian.net",
      issueKeys: ["VAG-3"],
      snapshot: {
        source: "Authorized connector",
        checkedAt: new Date().toISOString(),
        items: [{ id: "VAG-3", title: "Example work", status: "Done" }],
      },
    },
  };
  const result = await readConnections(entry, {
    env: {},
    fetchImpl: () => assert.fail("No network without credentials"),
  });
  assert.equal(result.jira.state, "snapshot");
  assert.equal(result.jira.liveState, "missing-config");
  assert.equal(result.github.state, "missing-config");
  assert.equal(freshness("2020-01-01"), "stale");
  assert.equal(freshness("bad date"), "stale");
  assert.equal(freshness(new Date(Date.now() + 10000).toISOString()), "stale");
  entry.jira.snapshot.items[0].id = "VOX-999";
  await assert.rejects(() => readConnections(entry, { env: {} }));
});
test("Live adapters use GET and exact IDs, omit tokens and never infer deployed capabilities", async () => {
  const calls = [];
  const result = await readConnections(
    {
      jira: { site: "https://example.atlassian.net", issueKeys: ["VAG-3"] },
      github: { repository: "example/backend", pullNumbers: [4] },
    },
    {
      env: {
        AGENTARIUM_JIRA_AUTH: "Bearer private",
        AGENTARIUM_GITHUB_TOKEN: "private",
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          text: async () =>
            JSON.stringify(
              url.includes("atlassian")
                ? {
                    key: "VAG-3",
                    fields: { summary: "Work", status: { name: "Done" } },
                  }
                : {
                    number: 4,
                    title: "Tool",
                    state: "closed",
                    merged_at: "2026-01-01",
                  },
            ),
        };
      },
    },
  );
  assert.equal(result.jira.state, "connected");
  assert.equal(result.github.items[0].status, "merged");
  assert.ok(
    calls.every(
      (c) => c.options.method === "GET" && c.options.redirect === "error",
    ),
  );
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes("runtimeStatus"));
  await assert.rejects(() =>
    readConnections({ jira: { site: "http://127.0.0.1", issueKeys: [] } }, {}),
  );
});
test("HTTP boundary rejects writes and cross-origin reads before reading files", async () => {
  let middleware;
  capabilitiesPlugin("/missing", "/missing").configureServer({
    middlewares: {
      use(fn) {
        middleware = fn;
      },
    },
  });
  async function request(headers, method = "GET") {
    let status;
    await middleware(
      { url: "/api/capabilities", method, headers },
      {
        writeHead(s) {
          status = s;
        },
        end() {},
      },
      () => assert.fail(),
    );
    return status;
  }
  assert.equal(
    await request({ host: "127.0.0.1:4173", origin: "https://evil.example" }),
    403,
  );
  assert.equal(await request({ host: "127.0.0.1:4173" }, "POST"), 405);
});

test("Pinned connector sources are integrity checked; refresh never refreshes old test evidence or live acceptance", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "capability-snapshot-"));
  try {
    await mkdir(path.join(root, "agents/alpha"), { recursive: true });
    const content = "// order_lookup Example Web\n";
    await writeFile(path.join(root, "agents/alpha/tools.js"), content);
    const git = (...args) =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    git("init");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      "fixture",
    );
    const recordSha = "b".repeat(40);
    const entry = mapping(recordSha);
    Object.assign(entry.capabilities[0], {
      group: "Orders",
      providers: [{ name: "Example", role: "data" }],
      tools: ["order_lookup"],
      summary: "Look up orders",
      condition: "Verified owner",
      development: { state: "main" },
      tests: {
        state: "reported",
        at: "2020-01-01",
        summary: "Historical test",
      },
      live: { summary: "No live acceptance" },
    });
    const { createHash } = await import("node:crypto");
    const record = {
      commit: recordSha,
      file: "agents/alpha/tools.js",
      content,
      blob: createHash("sha1")
        .update(`blob ${Buffer.byteLength(content)}\0`)
        .update(content)
        .digest("hex"),
      origin: "GitHub connector",
      fetchedAt: new Date().toISOString(),
    };
    const snapshotFile = path.join(root, "sources.json");
    await writeFile(
      snapshotFile,
      JSON.stringify({ schemaVersion: 1, files: [record] }),
    );
    const result = (
      await verifyCapabilities(entry, { root }, { snapshotFile })
    )[0];
    assert.equal(result.sourceStatus, "snapshot");
    assert.equal(result.tests.at, "2020-01-01");
    assert.equal(result.live.state, "unknown");
    assert.equal(result.runtimeVerifiedAt, null);
    record.content += "// tampered";
    await writeFile(
      snapshotFile,
      JSON.stringify({ schemaVersion: 1, files: [record] }),
    );
    const invalid = (
      await verifyCapabilities(entry, { root }, { snapshotFile })
    )[0];
    assert.equal(invalid.sourceStatus, "unverified");
    assert.equal(invalid.development.state, "unknown");
    assert.equal(invalid.tests.state, "unknown");
    assert.equal(invalid.live.state, "unknown");
    assert.equal(invalid.provider, null);
    assert.deepEqual(invalid.channels, []);
    assert.equal(invalid.providers[0].name, "Bilinmiyor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
