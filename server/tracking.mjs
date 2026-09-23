import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { HistoryStore } from "./history-store.mjs";
import { analyzeHistory } from "./evolution.mjs";

const execute = promisify(execFile);
export function normalizeFolder(value) {
  if (typeof value !== "string") throw new Error("Choose one agent folder.");
  const folder = value.replace(/\/$/, "");
  if (
    !folder ||
    folder.startsWith("/") ||
    folder.includes("\\") ||
    folder.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\x00-\x1f\x7f]/.test(folder)
  )
    throw new Error("Invalid agent folder.");
  return folder;
}

async function git(root, args) {
  const env = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
  };
  for (const name of Object.keys(env)) {
    if (
      name.startsWith("GIT_") &&
      ![
        "GIT_OPTIONAL_LOCKS",
        "GIT_TERMINAL_PROMPT",
        "GIT_NO_REPLACE_OBJECTS",
      ].includes(name)
    )
      delete env[name];
  }
  const { stdout } = await execute("git", ["-C", root, ...args], {
    env,
    timeout: 15000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export async function configuredRepositories(configFile) {
  let config;
  try {
    config = JSON.parse(await readFile(configFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error("Cannot read local repository configuration.");
  }
  if (!Array.isArray(config.repositories))
    throw new Error("Invalid local repository configuration.");
  return Promise.all(
    config.repositories.map(async (entry) => {
      if (
        typeof entry.id !== "string" ||
        !/^[a-z0-9-]+$/.test(entry.id) ||
        typeof entry.name !== "string" ||
        typeof entry.path !== "string"
      ) {
        throw new Error("Invalid local repository configuration.");
      }
      const root = await realpath(entry.path);
      const top = (await git(root, ["rev-parse", "--show-toplevel"])).trim();
      if ((await realpath(top)) !== root)
        throw new Error("Configure the repository root, not a subfolder.");
      const agentsRoot = normalizeFolder(entry.agentsRoot);
      const directory = await realpath(path.join(root, agentsRoot));
      if (!directory.startsWith(root + path.sep))
        throw new Error("Agent folders must be inside the repository.");
      const folders = (await readdir(directory, { withFileTypes: true }))
        .filter((item) => item.isDirectory() && !item.name.startsWith("."))
        .map((item) => `${agentsRoot}/${item.name}`)
        .sort();
      return { id: entry.id, name: entry.name, root, folders };
    }),
  );
}

// Metadata only: never read a whole-commit message or a file's content.
// Pin ref tips for this scan; branch switching does not change the history queried.
export function dateRange(input) {
  const valid = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!input || !valid(input.from) || !valid(input.to) || input.from > input.to)
    throw new Error("Choose a valid date range.");
  return { from: input.from, to: input.to };
}

// Propagate ref membership through a single pinned, topologically ordered DAG.
// Unlike for-each-ref --contains, this never resolves moving refs mid-scan.
export function memberships(graph, refs) {
  const masks = new Map();
  refs.forEach((ref, index) => {
    masks.set(ref.tip, (masks.get(ref.tip) || 0n) | (1n << BigInt(index)));
  });
  for (const line of graph.trim().split("\n").filter(Boolean)) {
    const [sha, ...parents] = line.split(" ");
    const mask = masks.get(sha) || 0n;
    for (const parent of parents)
      masks.set(parent, (masks.get(parent) || 0n) | mask);
  }
  return (sha) => {
    const mask = masks.get(sha) || 0n;
    return refs
      .filter((_, index) => (mask & (1n << BigInt(index))) !== 0n)
      .map((ref) => ref.name);
  };
}

export async function scanFolder(repository, requestedFolder, options = 20) {
  const range = typeof options === "number" ? null : dateRange(options);
  const limit = range ? 5000 : options;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
    throw new Error("Invalid scan limit.");
  const folder = normalizeFolder(requestedFolder);
  if (!repository.folders.includes(folder))
    throw new Error("Choose a folder listed for this repository.");
  const destination = await realpath(path.join(repository.root, folder));
  if (destination !== path.join(repository.root, folder))
    throw new Error("Symlinked agent folders are not supported.");
  const refs = (
    await git(repository.root, [
      "for-each-ref",
      "--format=%(objectname)%09%(refname)%09%(symref)",
      "refs/heads/",
      "refs/remotes/",
    ])
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter(([, , symref]) => !symref)
    .map(([tip, name]) => ({ tip, name }));
  const tips = [...new Set(refs.map(({ tip }) => tip))];
  const shallow =
    (
      await git(repository.root, ["rev-parse", "--is-shallow-repository"])
    ).trim() === "true";
  const graph = tips.length
    ? await git(repository.root, [
        "rev-list",
        "--topo-order",
        "--parents",
        ...tips,
        "--",
      ])
    : "";
  const contains = memberships(graph, refs);
  const scope = `:(literal)${folder}/`;
  const candidates = tips.length
    ? (
        await git(repository.root, [
          "log",
          "--full-history",
          "--date-order",
          `--max-count=${limit + 1}`,
          ...(range
            ? [
                `--since-as-filter=${range.from}T00:00:00Z`,
                `--until=${range.to}T23:59:59Z`,
              ]
            : []),
          "--format=%H%x09%cI%x09%P",
          ...tips,
          "--",
          scope,
        ])
      )
        .trim()
        .split("\n")
        .filter(Boolean)
    : [];
  if (range && candidates.length > limit)
    throw new Error("More than 5,000 commits. Choose a smaller date range.");
  const changes = [];
  for (const line of candidates.slice(0, limit)) {
    const [sha, date, parents] = line.split("\t");
    const parent = parents?.split(" ")[0];
    // Compare merges with their first parent; no rename detection across folders.
    const files = (
      await git(
        repository.root,
        parent
          ? [
              "diff",
              "--no-ext-diff",
              "--no-textconv",
              "--no-renames",
              "--name-only",
              "-z",
              parent,
              sha,
              "--",
              scope,
            ]
          : [
              "diff-tree",
              "--root",
              "--no-commit-id",
              "--no-renames",
              "--name-only",
              "-r",
              "-z",
              sha,
              "--",
              scope,
            ],
      )
    )
      .split("\0")
      .filter(Boolean)
      .filter((file) => file.startsWith(folder + "/"));
    if (!files.length) continue;
    const containingRefs = contains(sha);
    const branches = containingRefs.map((ref) =>
      ref.replace(/^refs\/(heads|remotes)\//, ""),
    );
    changes.push({
      sha,
      date,
      files,
      branches,
      refs: containingRefs,
      parents: parents ? parents.split(" ") : [],
      merge: (parents?.split(" ").length || 0) > 1,
    });
  }
  const snapshot = {
    repositoryId: repository.id,
    repositoryName: repository.name,
    folder,
    branchMode: "all-local-and-remote-tracking",
    lastSyncedAt: new Date().toISOString(),
    branchCount: refs.length,
    refs,
    shallow,
    ...(range ? { range } : {}),
    truncated: candidates.length > limit,
    limit,
    changes: changes.sort(
      (a, b) =>
        Date.parse(b.date) - Date.parse(a.date) || a.sha.localeCompare(b.sha),
    ),
  };
  // Only the archive layer needs the membership function, never the client.
  Object.defineProperty(snapshot, "contains", { value: contains });
  return snapshot;
}

export function localTrackingPlugin(configFile) {
  const databaseFile = path.join(
    path.dirname(configFile),
    ".agentarium",
    "history.sqlite",
  );
  let store;
  const archive = () => (store ||= new HistoryStore(databaseFile));
  return {
    name: "agentarium-local-tracking",
    configureServer(server) {
      server.httpServer?.once("close", () => {
        store?.close();
        store = undefined;
      });
      let scanning = false;
      server.middlewares.use(async (req, res, next) => {
        const route = req.url?.split("?")[0];
        if (!route?.startsWith("/api/tracking/")) return next();
        const send = (status, body) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(JSON.stringify(body));
        };
        const host = req.headers.host;
        const origin = req.headers.origin;
        if (
          !host ||
          !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) ||
          (origin && origin !== `http://${host}`) ||
          req.headers["sec-fetch-site"] === "cross-site"
        )
          return send(403, { error: "Local same-origin access only." });
        try {
          if (route === "/api/tracking/repositories" && req.method === "GET") {
            const repositories = await configuredRepositories(configFile);
            return send(200, {
              repositories: repositories.map(({ root, ...entry }) => entry),
            });
          }
          if (
            ![
              "/api/tracking/scan",
              "/api/tracking/history",
              "/api/tracking/export",
              "/api/tracking/restore",
              "/api/tracking/evolution",
              "/api/tracking/analyze",
              "/api/tracking/review",
            ].includes(route) ||
            req.method !== "POST"
          )
            return send(404, { error: "Not found." });
          if (
            origin !== `http://${host}` ||
            req.headers["content-type"] !== "application/json"
          )
            return send(403, {
              error: "Local same-origin JSON request required.",
            });
          const mutating = [
            "/api/tracking/scan",
            "/api/tracking/restore",
            "/api/tracking/analyze",
            "/api/tracking/review",
          ].includes(route);
          if (mutating && scanning)
            return send(409, {
              error: "Another scan is running. Try again shortly.",
            });
          if (mutating) scanning = true;
          try {
            let body = "";
            for await (const chunk of req) {
              body += chunk;
              if (
                Buffer.byteLength(body) >
                (route === "/api/tracking/restore" ? 16 * 1024 * 1024 : 4096)
              )
                return send(413, { error: "Request too large." });
            }
            const input = JSON.parse(body);
            const repositories = await configuredRepositories(configFile);
            const repository = repositories.find(
              (entry) => entry.id === input.repositoryId,
            );
            if (!repository)
              return send(400, {
                error: "Repository is not configured locally.",
              });
            const folder = normalizeFolder(input.folder);
            if (!repository.folders.includes(folder))
              throw new Error("Choose a folder listed for this repository.");
            if (route === "/api/tracking/evolution")
              return send(200, archive().evolution(repository, folder));
            if (route === "/api/tracking/analyze") {
              const history = archive().read(repository, folder);
              const analysis = await analyzeHistory(repository, history, git);
              return send(
                200,
                archive().saveEvolution(repository, folder, analysis),
              );
            }
            if (route === "/api/tracking/review")
              return send(200, archive().review(repository, folder, input));
            if (route === "/api/tracking/history")
              return send(200, { history: archive().read(repository, folder) });
            if (route === "/api/tracking/export")
              return send(200, archive().export(repository, folder));
            if (route === "/api/tracking/restore")
              return send(
                200,
                archive().restore(repository, folder, input.backup),
              );
            const snapshot = await scanFolder(
              repository,
              folder,
              dateRange(input),
            );
            return send(200, archive().save(repository, snapshot));
          } finally {
            if (mutating) scanning = false;
          }
        } catch (error) {
          send(400, {
            error:
              error.publicMessage ||
              (error.message?.startsWith("Choose a valid date") ||
              error.message?.startsWith("More than 5,000")
                ? error.message
                : "Sync failed. Last scan kept."),
          });
        }
      });
    },
  };
}
