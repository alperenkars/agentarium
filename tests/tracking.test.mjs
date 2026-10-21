import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createServer, request } from "node:http";
import {
  configuredRepositories,
  scanFolder,
  normalizeFolder,
  localTrackingPlugin,
} from "../server/tracking.mjs";

test("folder tracking spans branches, scopes mixed commits and preserves the checkout", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "agentarium-tracking-test-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  const put = async (file, content) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  const commit = (title) => {
    git("add", ".");
    git("commit", "-qm", title);
    return git("rev-parse", "HEAD");
  };
  await put("src/agents/beymen/tools.js", "initial");
  await put("src/agents/beymen-other/tools.js", "sibling");
  await put("src/agents/ebebek/tools.js", "initial");
  const initial = commit("initial");
  git("checkout", "-qb", "beymen-feature");
  await put("src/agents/beymen/tools.js", "feature");
  await put("src/agents/ebebek/tools.js", "unrelated private content");
  const mixed = commit("Whole-commit message must not enter agent metadata");
  git("branch", "duplicate-ref");
  git("update-ref", "refs/remotes/origin/feature", mixed);
  await put("src/agents/beymen/new.js", "remote only");
  const remoteOnly = commit("remote-only");
  git("update-ref", "refs/remotes/origin/remote-only", remoteOnly);
  git("checkout", "-q", "main");
  git("branch", "-f", "beymen-feature", mixed);
  await put("src/agents/beymen-other/tools.js", "sibling change");
  const sibling = commit("only a similar name");
  await put("shared.js", "shared engine");
  const shared = commit("shared code");
  git("merge", "--no-ff", "beymen-feature", "-m", "merge");
  const merge = git("rev-parse", "HEAD");
  const worktree = await mkdtemp(
    path.join(os.tmpdir(), "agentarium-linked-test-"),
  );
  t.after(() => rm(worktree, { recursive: true, force: true }));
  git("worktree", "add", "-qb", "linked-feature", worktree);
  await writeFile(
    path.join(worktree, "src/agents/beymen/linked.js"),
    "linked worktree change",
  );
  execFileSync("git", ["-C", worktree, "add", "src/agents/beymen/linked.js"]);
  execFileSync("git", ["-C", worktree, "commit", "-qm", "linked worktree"]);
  const linked = git("rev-parse", "linked-feature");
  git("checkout", "-q", "--detach");
  await put("src/agents/beymen/detached.js", "detached");
  const detached = commit("detached only");
  git("checkout", "-q", "main");
  await put("src/agents/beymen/tools.js", "uncommitted edit");
  await put("src/agents/beymen/untracked.js", "untracked");
  const status = git("status", "--porcelain");
  const refs = git("show-ref");
  const repository = {
    id: "fixture",
    name: "Fixture",
    root: await import("node:fs/promises").then((fs) => fs.realpath(root)),
    folders: ["src/agents/beymen", "src/agents/ebebek"],
  };
  const snapshot = await scanFolder(repository, "src/agents/beymen/");
  assert.equal(snapshot.folder, "src/agents/beymen");
  assert.equal(snapshot.branchMode, "all-local-and-remote-tracking");
  assert.equal(
    snapshot.changes.filter((change) => change.sha === mixed).length,
    1,
  );
  for (const sha of [initial, mixed, remoteOnly, merge, linked])
    assert(snapshot.changes.some((change) => change.sha === sha));
  for (const sha of [sibling, shared, detached])
    assert(!snapshot.changes.some((change) => change.sha === sha));
  assert(
    snapshot.changes
      .find((change) => change.sha === mixed)
      .branches.includes("duplicate-ref"),
  );
  assert(
    snapshot.changes
      .find((change) => change.sha === remoteOnly)
      .branches.includes("origin/remote-only"),
  );
  assert(snapshot.changes.find((change) => change.sha === merge).merge);
  assert(
    snapshot.changes.every((change) =>
      change.files.every((file) => file.startsWith("src/agents/beymen/")),
    ),
  );
  assert(!JSON.stringify(snapshot).includes("unrelated private content"));
  assert(!JSON.stringify(snapshot).includes("Whole-commit message"));
  assert(!JSON.stringify(snapshot).includes("untracked.js"));
  assert.equal(git("status", "--porcelain"), status);
  assert.equal(git("show-ref"), refs);
  assert.equal(git("branch", "--show-current"), "main");
  const again = await scanFolder(repository, "src/agents/beymen");
  assert.deepEqual(again.changes, snapshot.changes);
  const bounded = await scanFolder(repository, "src/agents/beymen", 1);
  assert.equal(bounded.truncated, true);
  assert(bounded.changes.length <= 1);
  const other = await scanFolder(repository, "src/agents/ebebek");
  assert(
    other.changes.every((change) =>
      change.files.every((file) => file.startsWith("src/agents/ebebek/")),
    ),
  );
  await assert.rejects(scanFolder(repository, "src/agents/beymen-other"));
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
  await symlink(
    path.join(root, "src/agents/ebebek"),
    path.join(root, "src/agents/link"),
  );
  const [configured] = await configuredRepositories(config);
  assert(!configured.folders.includes("src/agents/link"));
});

test("folder validation rejects traversal, absolute paths and malformed values", () => {
  for (const value of [
    "",
    "/tmp",
    "../outside",
    "src/../shared",
    "src//agents",
    "src\\agents",
    ".",
    null,
    "src/agents\0evil",
  ])
    assert.throws(() => normalizeFolder(value));
  assert.equal(normalizeFolder("src/agents/beymen/"), "src/agents/beymen");
});

test("local API denies cross-origin access and unconfigured repository reads", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "agentarium-api-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  let middleware;
  localTrackingPlugin(path.join(directory, "absent.json")).configureServer({
    middlewares: {
      use(fn) {
        middleware = fn;
      },
    },
  });
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(
    await (await fetch(base + "/api/tracking/repositories")).json(),
    { repositories: [] },
  );
  assert.equal(
    (
      await fetch(base + "/api/tracking/repositories", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const scan = (origin, body) =>
    fetch(base + "/api/tracking/scan", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await scan("https://evil.example", {})).status, 403);
  assert.equal(
    (await scan(base, { repositoryId: "/etc", folder: "../" })).status,
    400,
  );
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = request(
      base + "/api/tracking/repositories",
      { headers: { Host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(badHostStatus, 403);
});
