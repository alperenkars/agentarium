import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { configuredRepositories, normalizeFolder } from "./tracking.mjs";
import { readPullSignals } from "./work-signals.mjs";
const execute = promisify(execFile);
const DAY = 86400000;
const text = (v) => typeof v === "string" && v.length > 0 && v.length <= 180;
export function freshness(at, now = Date.now()) {
  const date = Date.parse(at);
  return !Number.isFinite(date) || date > now || now - date > 7 * DAY
    ? "stale"
    : "snapshot";
}
export function validateEntry(entry) {
  if (
    !text(entry.agentKey) ||
    !text(entry.repositoryId) ||
    normalizeFolder(entry.folder).split("/").at(-1) !== entry.agentKey ||
    !Array.isArray(entry.capabilities) ||
    entry.capabilities.length > 30
  )
    throw new Error("Invalid capability mapping.");
  for (const c of entry.capabilities) {
    if (
      ![c.id, c.title, c.tool].every(text) ||
      (c.provider !== null && !text(c.provider)) ||
      !Array.isArray(c.channels) ||
      !c.channels.every(text) ||
      !Array.isArray(c.evidence) ||
      c.evidence.length > 20
    )
      throw new Error("Invalid capability record.");
    for (const e of c.evidence) {
      if (
        !/^[a-f0-9]{40}$/.test(e.sha) ||
        normalizeFolder(e.file) !== e.file ||
        !e.file.startsWith(entry.folder + "/") ||
        !Number.isInteger(e.line) ||
        e.line < 1 ||
        !text(e.match) ||
        !Array.isArray(e.supports) ||
        !e.supports.every((s) =>
          ["capability", "tool", "provider", "channel", "test"].includes(s),
        )
      )
        throw new Error("Invalid source evidence.");
    }
    if (
      c.group !== undefined &&
      (!text(c.group) ||
        !Array.isArray(c.providers) ||
        !c.providers.length ||
        !c.providers.every((p) => text(p.name) && text(p.role)) ||
        !text(c.condition) ||
        !text(c.summary) ||
        !Array.isArray(c.tools) ||
        !c.tools.every(text) ||
        !["main", "branch", "unknown"].includes(c.development?.state) ||
        !["reported", "unknown", "not-run", "failed"].includes(c.tests?.state))
    )
      throw new Error("Invalid capability map record.");
    const supports = new Set(c.evidence.flatMap((e) => e.supports));
    if (
      !supports.has("capability") ||
      !supports.has("tool") ||
      (c.provider && !supports.has("provider")) ||
      (c.channels.length && !supports.has("channel"))
    )
      throw new Error("Missing relationship evidence.");
  }
  return entry;
}
export async function verifyCapabilities(
  entry,
  repository,
  { snapshotFile } = {},
) {
  validateEntry(entry);
  const git = async (args) =>
    (
      await execute(
        "git",
        ["--no-replace-objects", "-C", repository.root, ...args],
        {
          timeout: 8000,
          maxBuffer: 256 * 1024,
          env: {
            PATH: process.env.PATH,
            GIT_OPTIONAL_LOCKS: "0",
            GIT_TERMINAL_PROMPT: "0",
          },
        },
      )
    ).stdout;
  const head = (await git(["rev-parse", "HEAD"])).trim();
  let records = [];
  if (snapshotFile) {
    try {
      const raw = await readFile(snapshotFile, "utf8");
      if (raw.length > 2 * 1024 * 1024) throw new Error();
      const saved = JSON.parse(raw);
      if (
        saved.schemaVersion !== 1 ||
        !Array.isArray(saved.files) ||
        saved.files.length > 30
      )
        throw new Error();
      records = saved.files;
    } catch {
      records = [];
    }
  }
  return Promise.all(
    entry.capabilities.map(async (c) => {
      let sourceStatus = "source";
      let sourceRecord = null;
      try {
        for (const e of c.evidence) {
          const record = records.find(
            (r) => r.commit === e.sha && r.file === e.file,
          );
          let content;
          if (record) {
            if (
              typeof record.content !== "string" ||
              record.content.length > 256 * 1024 ||
              !Number.isFinite(Date.parse(record.fetchedAt)) ||
              record.origin !== "GitHub connector"
            )
              throw new Error();
            const blob = createHash("sha1")
              .update(`blob ${Buffer.byteLength(record.content)}\0`)
              .update(record.content)
              .digest("hex");
            if (blob !== record.blob) throw new Error();
            content = record.content;
            sourceStatus =
              freshness(record.fetchedAt) === "stale"
                ? "stale-snapshot"
                : "snapshot";
            sourceRecord = {
              at: record.fetchedAt,
              commit: record.commit,
              origin: record.origin,
            };
          } else content = await git(["show", `${e.sha}:${e.file}`]);
          if (!(content.split("\n")[e.line - 1] || "").includes(e.match))
            throw new Error("Evidence mismatch");
          if (!record && e.sha !== head && sourceStatus === "source")
            sourceStatus = "historical";
        }
      } catch {
        sourceStatus = "unverified";
      }
      return {
        id: c.id,
        title: c.title,
        tool: c.tool,
        provider: sourceStatus === "unverified" ? null : c.provider,
        channels: sourceStatus === "unverified" ? [] : c.channels,
        sourceStatus,
        sourceRecord,
        ...(c.group
          ? {
              group: c.group,
              summary: c.summary,
              tools: c.tools,
              providers:
                sourceStatus === "unverified"
                  ? [{ name: "Bilinmiyor", role: "kaynak doğrulanamadı" }]
                  : c.providers,
              condition: c.condition,
              development:
                sourceStatus === "unverified"
                  ? { state: "unknown" }
                  : c.development,
              tests:
                sourceStatus === "unverified" ? { state: "unknown" } : c.tests,
              live: {
                state: "unknown",
                summary: c.live?.summary || "Canlı kabul kaydı yok.",
              },
            }
          : {}),
        runtimeStatus: "unknown",
        runtimeVerifiedAt: null,
        sourceCheckedAt: new Date().toISOString(),
        evidence: c.evidence.map(({ match, ...e }) => ({
          ...e,
          ...(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
            entry.github?.repository || "",
          )
            ? {
                url: `https://github.com/${entry.github.repository}/blob/${e.sha}/${e.file.split("/").map(encodeURIComponent).join("/")}#L${e.line}`,
              }
            : {}),
        })),
      };
    }),
  );
}
async function jsonRead(url, headers, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Read failed");
  const body = await response.text();
  if (body.length > 256 * 1024) throw new Error("Response too large");
  return JSON.parse(body);
}
// Exact IDs are curated per agent. Jira/PR status never changes runtimeStatus.
export async function readConnections(
  entry,
  { env = process.env, fetchImpl = fetch, workSignals = false } = {},
) {
  const result = {};
  for (const kind of ["jira", "github"]) {
    const config = entry[kind];
    result[kind] = { state: "missing-config", items: [] };
    if (!config) continue;
    const valid =
      kind === "jira"
        ? /^https:\/\/[a-z0-9-]+\.atlassian\.net$/.test(config.site) &&
          Array.isArray(config.issueKeys) &&
          config.issueKeys.length <= 10 &&
          config.issueKeys.every((k) => /^[A-Z][A-Z0-9]+-\d+$/.test(k))
        : /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository) &&
          Array.isArray(config.pullNumbers) &&
          config.pullNumbers.length <= 10 &&
          config.pullNumbers.every((n) => Number.isSafeInteger(n) && n > 0);
    if (!valid) throw new Error("Invalid connection scope.");
    const token =
      kind === "jira" ? env.AGENTARIUM_JIRA_AUTH : env.AGENTARIUM_GITHUB_TOKEN;
    if (token) {
      try {
        const ids = kind === "jira" ? config.issueKeys : config.pullNumbers;
        const items = await Promise.all(
          ids.map(async (id) => {
            const url =
              kind === "jira"
                ? `${config.site}/rest/api/3/issue/${id}?fields=summary,status,updated,assignee`
                : `https://api.github.com/repos/${config.repository}/pulls/${id}`;
            const data = await jsonRead(
              url,
              {
                Authorization: kind === "jira" ? token : `Bearer ${token}`,
                Accept: "application/json",
              },
              fetchImpl,
            );
            if (
              (kind === "jira" && data.key !== id) ||
              (kind === "github" && data.number !== id)
            )
              throw new Error("ID mismatch");
            return kind === "jira"
              ? {
                  id,
                  title: data.fields.summary,
                  status: data.fields.status.name,
                  category: data.fields.status.statusCategory?.key || "unknown",
                  updatedAt: data.fields.updated || null,
                  assignee: data.fields.assignee?.displayName || null,
                  url: `${config.site}/browse/${id}`,
                }
              : {
                  id: `#${id}`,
                  title: data.title,
                  status: data.merged_at ? "merged" : data.state,
                  updatedAt: data.updated_at || null,
                  draft: Boolean(data.draft),
                  ...(workSignals
                    ? await readPullSignals(data, config.repository, (url) =>
                        jsonRead(
                          url,
                          {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/vnd.github+json",
                          },
                          fetchImpl,
                        ),
                      )
                    : {}),
                  url: `https://github.com/${config.repository}/pull/${id}`,
                };
          }),
        );
        result[kind] = {
          state: "connected",
          checkedAt: new Date().toISOString(),
          items,
        };
        continue;
      } catch {
        result[kind] = { state: "unavailable", items: [] };
      }
    }
    if (config.snapshot) {
      const snapshot = config.snapshot;
      if (
        !Array.isArray(snapshot.items) ||
        snapshot.items.length > 10 ||
        !text(snapshot.source) ||
        !Number.isFinite(Date.parse(snapshot.checkedAt))
      )
        throw new Error("Invalid connection snapshot.");
      const items = snapshot.items.map((item) => {
        if (![item.id, item.title, item.status].every(text))
          throw new Error("Invalid snapshot item.");
        const validId =
          kind === "jira"
            ? config.issueKeys.includes(item.id)
            : config.pullNumbers.includes(Number(item.id.replace(/^#/, "")));
        if (!validId) throw new Error("Snapshot outside agent scope.");
        if (
          (item.updatedAt !== undefined &&
            !Number.isFinite(Date.parse(item.updatedAt))) ||
          (item.category !== undefined &&
            !["new", "indeterminate", "done", "unknown"].includes(
              item.category,
            )) ||
          (item.assignee !== undefined &&
            item.assignee !== null &&
            !text(item.assignee)) ||
          (item.draft !== undefined && typeof item.draft !== "boolean")
        )
          throw new Error("Invalid snapshot metadata.");
        return {
          id: item.id,
          title: item.title,
          status: item.status,
          ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
          ...(kind === "jira"
            ? {
                ...(item.category ? { category: item.category } : {}),
                ...(item.assignee ? { assignee: item.assignee } : {}),
              }
            : typeof item.draft === "boolean"
              ? { draft: item.draft }
              : {}),
          url:
            kind === "jira"
              ? `${config.site}/browse/${item.id}`
              : `https://github.com/${config.repository}/pull/${item.id.replace(/^#/, "")}`,
        };
      });
      result[kind] = {
        state: freshness(snapshot.checkedAt),
        checkedAt: snapshot.checkedAt,
        source: snapshot.source,
        liveState: token ? "unavailable" : "missing-config",
        items,
      };
    }
  }
  return result;
}
export function capabilitiesPlugin(configFile, manifestFile) {
  return {
    name: "agentarium-capabilities",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = req.url?.split("?")[0];
        if (
          !["/api/capabilities", "/api/agents", "/api/work-summary"].includes(
            route,
          )
        )
          return next();
        const send = (status, body) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(JSON.stringify(body));
        };
        const host = req.headers.host;
        if (
          !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host || "") ||
          (req.headers.origin && req.headers.origin !== `http://${host}`) ||
          req.headers["sec-fetch-site"] === "cross-site"
        )
          return send(403, { error: "Local same-origin access only." });
        if (req.method !== "GET")
          return send(405, { error: "Read-only endpoint." });
        try {
          if (route === "/api/agents") {
            const repositories = await configuredRepositories(configFile);
            let mappings = [];
            try {
              const content = await readFile(manifestFile, "utf8");
              if (content.length > 256 * 1024) throw new Error();
              const manifest = JSON.parse(content);
              if (
                manifest.schemaVersion !== 1 ||
                !Array.isArray(manifest.agents)
              )
                throw new Error();
              mappings = manifest.agents.map(validateEntry);
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
            const indexed = new Map(
              await Promise.all(
                mappings.map(async (entry) => {
                  const repository = repositories.find(
                    (r) =>
                      r.id === entry.repositoryId &&
                      r.folders.includes(entry.folder),
                  );
                  const cards = repository
                    ? await verifyCapabilities(entry, repository, {
                        snapshotFile: path.join(
                          path.dirname(manifestFile),
                          "source-snapshots.json",
                        ),
                      })
                    : [];
                  return [
                    `${entry.repositoryId}:${entry.folder}`,
                    cards.filter((c) => c.sourceStatus !== "unverified"),
                  ];
                }),
              ),
            );
            const agents = repositories
              .flatMap((repository) =>
                repository.folders.map((folder) => {
                  const mapping = mappings.find(
                    (m) =>
                      m.repositoryId === repository.id && m.folder === folder,
                  );
                  const agentKey = folder.split("/").at(-1);
                  const verifiedCards =
                    indexed.get(`${repository.id}:${folder}`) || [];
                  return {
                    repositoryId: repository.id,
                    repositoryName: repository.name,
                    folder,
                    agentKey,
                    name:
                      mapping && text(mapping.displayName)
                        ? mapping.displayName
                        : agentKey,
                    mapped: !!mapping,
                    capabilityCount: verifiedCards.length,
                    providers: [
                      ...new Set(
                        verifiedCards.flatMap(
                          (c) =>
                            c.providers?.map((p) => p.name) ||
                            (c.provider ? [c.provider] : []),
                        ) || [],
                      ),
                    ],
                    channels: [
                      ...new Set(
                        verifiedCards.flatMap((c) => c.channels) || [],
                      ),
                    ],
                    capabilityTerms:
                      verifiedCards.flatMap((c) => [
                        c.title,
                        c.tool,
                        ...(c.tools || []),
                      ]) || [],
                  };
                }),
              )
              .sort(
                (a, b) =>
                  Number(b.mapped) - Number(a.mapped) ||
                  a.folder.localeCompare(b.folder),
              );
            return send(200, { agents });
          }
          const params = new URL(req.url, `http://${host}`).searchParams;
          const folder = normalizeFolder(params.get("folder"));
          const repositoryId = params.get("repositoryId");
          const repository = (await configuredRepositories(configFile)).find(
            (r) => r.id === repositoryId && r.folders.includes(folder),
          );
          if (!repository)
            return send(404, { error: "Connect an allowlisted agent folder." });
          let manifest;
          try {
            const content = await readFile(manifestFile, "utf8");
            if (content.length > 256 * 1024) throw new Error();
            manifest = JSON.parse(content);
          } catch (e) {
            if (e.code === "ENOENT")
              return send(200, {
                state: "missing-config",
                capabilities: [],
                connections: {
                  jira: { state: "missing-config", items: [] },
                  github: { state: "missing-config", items: [] },
                },
              });
            throw e;
          }
          if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.agents))
            throw new Error();
          const matches = manifest.agents.filter(
            (a) => a.repositoryId === repositoryId && a.folder === folder,
          );
          if (!matches.length)
            return send(200, {
              state: "missing-config",
              capabilities: [],
              connections: {
                jira: { state: "missing-config", items: [] },
                github: { state: "missing-config", items: [] },
              },
            });
          if (matches.length !== 1) throw new Error();
          const entry = validateEntry(matches[0]);
          if (route === "/api/work-summary")
            return send(200, {
              state: "configured",
              agentKey: entry.agentKey,
              connections: await readConnections(entry, { workSignals: true }),
            });
          return send(200, {
            state: "configured",
            agentKey: entry.agentKey,
            presentation: entry.presentation,
            context: entry.context,
            capabilities: await verifyCapabilities(entry, repository, {
              snapshotFile: path.join(
                path.dirname(manifestFile),
                "source-snapshots.json",
              ),
            }),
            connections: await readConnections(entry),
          });
        } catch {
          return send(400, {
            error: "Capability configuration or evidence could not be read.",
          });
        }
      });
    },
  };
}
