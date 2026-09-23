import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { HistoryStore } from "../server/history-store.mjs";
import {
  scanFolder,
  dateRange,
  memberships,
  localTrackingPlugin,
} from "../server/tracking.mjs";

async function fixture(t) {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "agentarium-archive-test-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  const folder = "src/agents/beymen";
  await mkdir(path.join(root, folder), { recursive: true });
  const commit = async (date, content, extra = {}) => {
    await writeFile(path.join(root, folder, "agent.js"), content);
    for (const [file, text] of Object.entries(extra)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    }
    git("add", ".");
    execFileSync(
      "git",
      ["-C", root, "commit", "-qm", "private commit message"],
      {
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
        stdio: "pipe",
      },
    );
    return git("rev-parse", "HEAD");
  };
  return {
    root,
    git,
    folder,
    commit,
    repository: { root, id: "fixture", name: "Fixture", folders: [folder] },
  };
}

test("date ranges validate calendar days and membership propagation preserves ref identities", () => {
  for (const range of [
    {},
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "2026-03-02", to: "2026-03-01" },
    { from: "--all", to: "2026-03-01" },
  ])
    assert.throws(() => dateRange(range));
  assert.deepEqual(dateRange({ from: "2024-02-29", to: "2024-03-01" }), {
    from: "2024-02-29",
    to: "2024-03-01",
  });
  const contains = memberships(
    "merge left right\nleft root\nright root\nroot",
    [
      { name: "refs/heads/main", tip: "merge" },
      { name: "refs/remotes/main", tip: "right" },
    ],
  );
  assert.deepEqual(contains("left"), ["refs/heads/main"]);
  assert.deepEqual(contains("right"), ["refs/heads/main", "refs/remotes/main"]);
  assert.deepEqual(contains("missing"), []);
});

test("range imports exceed 20, survive restarts, deduplicate and retain deleted-branch evidence", async (t) => {
  const { root, git, folder, commit, repository } = await fixture(t);
  const initial = await commit("2026-05-31T23:59:59Z", "initial");
  const start = await commit("2026-06-01T00:00:00Z", "first included");
  for (let i = 0; i < 23; i++)
    await commit(
      `2026-06-02T12:00:${String(i).padStart(2, "0")}Z`,
      `change ${i}`,
    );
  git("checkout", "-qb", "experiment");
  const experiment = await commit("2026-06-30T23:59:59Z", "experimental", {
    "src/agents/beymen-other/private.txt": "sibling content",
  });
  git("branch", "same-commit");
  git("update-ref", "refs/remotes/origin/experiment", experiment);
  git("checkout", "-q", "main");
  const after = await commit("2026-07-01T00:00:00Z", "outside chosen range");
  // An old timestamp at the tip must not hide newer ancestors.
  await commit("2026-05-01T00:00:00Z", "clock skew");
  const before = git("status", "--porcelain");
  const refsBefore = git("show-ref");
  const range = { from: "2026-06-01", to: "2026-06-30" };
  const snapshot = await scanFolder(repository, folder, range);
  assert.equal(snapshot.changes.length, 25);
  assert(!snapshot.changes.some((c) => [initial, after].includes(c.sha)));
  assert(snapshot.changes.some((c) => c.sha === start));
  const feature = snapshot.changes.find((c) => c.sha === experiment);
  assert(!feature.refs.includes("refs/heads/main"));
  assert(feature.refs.includes("refs/remotes/origin/experiment"));
  assert.deepEqual(feature.files, [folder + "/agent.js"]);
  assert(!JSON.stringify(snapshot).includes("private commit message"));
  const dbFile = path.join(root, ".archive", "history.sqlite");
  let store = new HistoryStore(dbFile);
  let history = store.save(repository, snapshot);
  assert.equal(history.changes.length, 25);
  store.save(repository, snapshot);
  assert.equal(store.read(repository, folder).imports.length, 1);
  store.close();
  store = new HistoryStore(dbFile);
  t.after(() => store.close());
  assert.equal(store.read(repository, folder).changes.length, 25);
  git("branch", "-D", "experiment", "same-commit");
  git("update-ref", "-d", "refs/remotes/origin/experiment");
  history = store.save(repository, await scanFolder(repository, folder, range));
  assert.equal(history.changes.length, 25);
  const archived = history.changes.find((c) => c.sha === experiment);
  assert.deepEqual(archived.refs, []);
  assert(archived.lastSeenRefs.includes("refs/heads/experiment"));
  assert(archived.lastSeenAt);
  assert.equal(history.imports.length, 2);
  const backup = store.export(repository, folder);
  const recovery = new HistoryStore(":memory:");
  t.after(() => recovery.close());
  const recovered = recovery.restore(
    repository,
    folder,
    JSON.parse(JSON.stringify(backup)),
  );
  assert.equal(recovered.changes.length, 25);
  assert(recovered.restored);
  assert(recovered.changes.every((c) => c.unverified && !c.refs.length));
  const verified = recovery.save(
    repository,
    await scanFolder(repository, folder, range),
  );
  assert.equal(verified.changes.filter((c) => c.unverified).length, 1);
  assert(
    verified.changes
      .find((c) => c.sha === start)
      .refs.includes("refs/heads/main"),
  );
  assert.equal(recovery.restore(repository, folder, backup).changes.length, 25);
  assert.equal(git("branch", "--show-current"), "main");
  // Only test-owned branch deletion and database files changed this fixture.
  assert.equal(before, "");
  assert(refsBefore.includes("refs/heads/experiment"));
  assert.equal(git("diff", "--stat"), "");
});

test("invalid backups, conflicts and incomplete scans never replace saved history", async (t) => {
  const { folder, commit, repository } = await fixture(t);
  await commit("2026-06-01T12:00:00Z", "one");
  const store = new HistoryStore(":memory:");
  t.after(() => store.close());
  const scan = await scanFolder(repository, folder, {
    from: "2026-06-01",
    to: "2026-06-01",
  });
  store.save(repository, scan);
  const original = JSON.stringify(store.read(repository, folder));
  assert.throws(() => store.save(repository, { ...scan, truncated: true }));
  assert.throws(() =>
    store.read({ ...repository, root: "/different/repository" }, folder),
  );
  const bad = store.export(repository, folder);
  bad.history.changes[0].files = ["src/agents/other/secret.js"];
  assert.throws(() => store.restore(repository, folder, bad));
  const conflicting = store.export(repository, folder);
  conflicting.history.changes[0].files = [folder + "/different.js"];
  assert.throws(() => store.restore(repository, folder, conflicting));
  assert.throws(() =>
    store.restore(
      repository,
      "src/agents/other",
      store.export(repository, folder),
    ),
  );
  const duplicate = store.export(repository, folder);
  duplicate.history.changes.push(duplicate.history.changes[0]);
  assert.throws(() => store.restore(repository, folder, duplicate));
  assert.equal(JSON.stringify(store.read(repository, folder)), original);
  const scanCount = store.db.prepare("SELECT COUNT(*) AS n FROM scans").get().n;
  store.db.exec(
    "CREATE TRIGGER fail_write BEFORE UPDATE ON histories BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
  );
  assert.throws(() =>
    store.save(repository, {
      ...scan,
      lastSyncedAt: "2026-09-24T12:00:00Z",
      contains: scan.contains,
    }),
  );
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM scans").get().n,
    scanCount,
  );
  assert.equal(JSON.stringify(store.read(repository, folder)), original);
});

test("local API saves, reloads after restart and restores with origin and scope checks", async (t) => {
  const { root, folder, commit } = await fixture(t);
  await commit("2026-06-01T12:00:00Z", "one");
  const config = path.join(root, "local.json");
  await writeFile(
    config,
    JSON.stringify({
      repositories: [
        {
          id: "fixture",
          name: "Fixture",
          path: root,
          agentsRoot: "src/agents",
        },
      ],
    }),
  );
  let server;
  async function start() {
    let middleware;
    server = createServer((req, res) =>
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end();
      }),
    );
    localTrackingPlugin(config).configureServer({
      httpServer: server,
      middlewares: {
        use(fn) {
          middleware = fn;
        },
      },
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = (route, body = {}, origin = base) =>
    fetch(base + "/api/tracking/" + route, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryId: "fixture", folder, ...body }),
    });
  const scanResponse = await post("scan", {
    from: "2026-06-01",
    to: "2026-06-30",
  });
  assert.equal(scanResponse.status, 200);
  const snapshot = await scanResponse.json();
  assert.equal(snapshot.changes.length, 1);
  await new Promise((resolve) => server.close(resolve));
  base = await start();
  const concurrentReads = await Promise.all([
    post("history"),
    post("history"),
    post("export"),
  ]);
  assert(concurrentReads.every((response) => response.status === 200));
  assert.deepEqual((await (await post("history")).json()).history, snapshot);
  const backup = await (await post("export")).json();
  assert.equal(backup.kind, "agentarium-folder-history");
  for (const route of [
    "history",
    "scan",
    "restore",
    "export",
    "evolution",
    "analyze",
    "review",
  ]) {
    assert.equal((await post(route, {}, "https://evil.example")).status, 403);
    assert.equal(
      (await post(route, { folder: "src/agents/other" })).status,
      400,
    );
  }
  assert.equal(
    (await post("scan", { from: "invalid", to: "2026-06-01" })).status,
    400,
  );
  assert.equal((await post("restore", { backup })).status, 200);
  assert.equal(
    (await (await post("history")).json()).history.changes.length,
    1,
  );
  assert.equal(
    (await post("restore", { backup: { ...backup, schemaVersion: 99 } }))
      .status,
    400,
  );
  assert.equal(
    (await (await post("history")).json()).history.changes.length,
    1,
  );
});

test("a shallow clone is explicitly incomplete", async (t) => {
  const { root, folder, commit, repository } = await fixture(t);
  await commit("2026-06-01T12:00:00Z", "one");
  await commit("2026-06-02T12:00:00Z", "two");
  const shallow = await mkdtemp(
    path.join(os.tmpdir(), "agentarium-shallow-test-"),
  );
  t.after(() => rm(shallow, { recursive: true, force: true }));
  execFileSync("git", ["clone", "--depth=1", `file://${root}`, shallow], {
    stdio: "pipe",
  });
  const snapshot = await scanFolder(
    { ...repository, root: await realpath(shallow) },
    folder,
    { from: "2026-06-01", to: "2026-06-30" },
  );
  assert.equal(snapshot.shallow, true);
  assert.equal(snapshot.changes.length, 1);
});
