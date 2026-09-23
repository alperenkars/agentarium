import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

function fail(message) {
  const error = new Error(message);
  error.publicMessage = message;
  throw error;
}
const sha = (value) =>
  typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const instant = (value) =>
  typeof value === "string" &&
  value.length <= 40 &&
  Number.isFinite(Date.parse(value));
const refName = (value) =>
  typeof value === "string" &&
  /^refs\/(heads|remotes)\/.+/.test(value) &&
  value.length < 1024 &&
  !/[\x00-\x20\x7f]/.test(value);
const label = (ref) => ref.replace(/^refs\/(heads|remotes)\//, "");
const sorted = (changes) =>
  [...changes].sort(
    (a, b) =>
      Date.parse(b.date) - Date.parse(a.date) || a.sha.localeCompare(b.sha),
  );

// Backups are untrusted input: reconstruct allowed fields, never spread input.
function validateBackup(backup, repository, folder) {
  const h = backup?.history;
  if (
    backup?.schemaVersion !== 1 ||
    backup?.kind !== "agentarium-folder-history" ||
    h?.repositoryId !== repository.id ||
    h?.folder !== folder ||
    !instant(h?.lastSyncedAt) ||
    !Array.isArray(h.changes) ||
    h.changes.length > 50000 ||
    !Array.isArray(h.refs) ||
    h.refs.length > 5000 ||
    !h.refs.every((ref) => refName(ref.name) && sha(ref.tip)) ||
    !Array.isArray(h.imports) ||
    h.imports.length > 10000
  )
    fail("Invalid backup or different folder.");
  const refs = h.refs.map(({ name, tip }) => ({ name, tip }));
  if (new Set(refs.map((ref) => ref.name)).size !== refs.length)
    fail("Invalid backup refs.");
  const seen = new Set();
  const changes = h.changes.map((c) => {
    if (
      !c ||
      !sha(c.sha) ||
      seen.has(c.sha) ||
      !instant(c.date) ||
      !Array.isArray(c.parents) ||
      !c.parents.every(sha) ||
      c.parents.length > 100 ||
      !Array.isArray(c.files) ||
      !c.files.length ||
      c.files.length > 10000 ||
      !c.files.every(
        (file) =>
          typeof file === "string" &&
          file.startsWith(folder + "/") &&
          file.length < 4096 &&
          !file
            .split("/")
            .some((part) => !part || part === "." || part === ".."),
      ) ||
      !Array.isArray(c.refs) ||
      !c.refs.every(refName) ||
      !Array.isArray(c.lastSeenRefs) ||
      !c.lastSeenRefs.every(refName) ||
      !instant(c.lastSeenAt) ||
      !instant(c.membershipAt)
    )
      fail("Invalid commit evidence in backup.");
    seen.add(c.sha);
    return {
      sha: c.sha,
      date: c.date,
      parents: [...c.parents],
      files: [...new Set(c.files)].sort(),
      merge: c.parents.length > 1,
      refs: [],
      branches: [],
      lastSeenRefs: [...c.lastSeenRefs],
      lastSeenAt: c.lastSeenAt,
      membershipAt: c.membershipAt,
      unverified: true,
    };
  });
  const imports = h.imports.map((item) => {
    const range = item?.range;
    const validDay = (value) =>
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value;
    if (
      !sha(item?.id) ||
      !instant(item?.at) ||
      !validDay(range?.from) ||
      !validDay(range?.to) ||
      range.from > range.to ||
      !Number.isInteger(item.count) ||
      item.count < 0 ||
      item.count > 5000
    )
      fail("Invalid import record in backup.");
    return {
      id: item.id,
      at: item.at,
      range: { from: range.from, to: range.to },
      count: item.count,
      shallow: !!item.shallow,
      restored: true,
    };
  });
  return { changes, imports, refs, lastSyncedAt: h.lastSyncedAt };
}

function sameCommit(a, b) {
  return (
    Date.parse(a.date) === Date.parse(b.date) &&
    JSON.stringify([...a.files].sort()) ===
      JSON.stringify([...b.files].sort()) &&
    JSON.stringify(a.parents) === JSON.stringify(b.parents)
  );
}

export class HistoryStore {
  constructor(filename) {
    if (filename !== ":memory:") {
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = DELETE;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS repositories (id TEXT PRIMARY KEY, root TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS histories (
        repository_id TEXT NOT NULL REFERENCES repositories(id), folder TEXT NOT NULL,
        snapshot TEXT NOT NULL, PRIMARY KEY(repository_id, folder)
      );
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id),
        folder TEXT NOT NULL, snapshot TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evolution (
        repository_id TEXT NOT NULL REFERENCES repositories(id), folder TEXT NOT NULL,
        snapshot TEXT NOT NULL, PRIMARY KEY(repository_id, folder)
      );
    `);
  }
  close() {
    this.db.close();
  }
  evolution(repository, folder) {
    this.check(repository);
    const row = this.db
      .prepare(
        "SELECT snapshot FROM evolution WHERE repository_id = ? AND folder = ?",
      )
      .get(repository.id, folder);
    return row
      ? JSON.parse(row.snapshot)
      : { repositoryId: repository.id, folder, proposals: [] };
  }
  saveEvolution(repository, folder, analysis) {
    if (!this.read(repository, folder)) fail("Import history first.");
    const previous = this.evolution(repository, folder);
    const incomingIds = new Set(analysis.proposals.map((p) => p.id));
    const checked = new Set(analysis.checkedShas || []);
    const proposals = new Map(
      previous.proposals
        .filter(
          (p) =>
            !(
              p.status === "proposed" &&
              p.version === 1 &&
              !incomingIds.has(p.id) &&
              p.evidence.every((e) => checked.has(e.sha))
            ),
        )
        .map((p) => [p.id, p]),
    );
    for (const incoming of analysis.proposals) {
      const old = proposals.get(incoming.id);
      const evidence = new Map(
        [...(old?.evidence || []), ...incoming.evidence].map((e) => [
          e.sha + e.file,
          e,
        ]),
      );
      proposals.set(incoming.id, {
        ...incoming,
        ...old,
        version: old?.version || 1,
        evidence: [...evidence.values()],
      });
    }
    const data = {
      ...analysis,
      repositoryId: repository.id,
      folder,
      proposals: [...proposals.values()].sort(
        (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
      ),
    };
    this.db
      .prepare(
        "INSERT INTO evolution VALUES (?, ?, ?) ON CONFLICT(repository_id, folder) DO UPDATE SET snapshot = excluded.snapshot",
      )
      .run(repository.id, folder, JSON.stringify(data));
    return data;
  }
  review(repository, folder, input) {
    const data = this.evolution(repository, folder);
    const proposal = data.proposals.find((p) => p.id === input.id);
    if (!proposal || input.version !== proposal.version)
      fail("This update changed. Reload and try again.");
    if (!["proposed", "approved", "dismissed"].includes(input.status))
      fail("Invalid review action.");
    const title = input.title ?? proposal.title,
      description = input.description ?? proposal.description;
    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.length > 120 ||
      typeof description !== "string" ||
      description.length > 400
    )
      fail("Use a title under 120 characters and a description under 400.");
    proposal.title = title.trim();
    proposal.description = description.trim();
    proposal.status = input.status;
    proposal.version++;
    proposal.reviewedAt = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE evolution SET snapshot = ? WHERE repository_id = ? AND folder = ?",
      )
      .run(JSON.stringify(data), repository.id, folder);
    return data;
  }
  check(repository) {
    const existing = this.db
      .prepare("SELECT root FROM repositories WHERE id = ?")
      .get(repository.id);
    if (existing && existing.root !== repository.root)
      fail("Repository location changed. Use a new repository ID.");
  }
  read(repository, folder) {
    this.check(repository);
    const row = this.db
      .prepare(
        "SELECT snapshot FROM histories WHERE repository_id = ? AND folder = ?",
      )
      .get(repository.id, folder);
    return row ? JSON.parse(row.snapshot) : null;
  }
  write(repository, history, scan) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.check(repository);
      this.db
        .prepare("INSERT OR IGNORE INTO repositories VALUES (?, ?)")
        .run(repository.id, repository.root);
      if (scan)
        this.db
          .prepare("INSERT OR IGNORE INTO scans VALUES (?, ?, ?, ?)")
          .run(
            scan.id,
            repository.id,
            history.folder,
            JSON.stringify(scan.snapshot),
          );
      this.db
        .prepare(
          "INSERT INTO histories VALUES (?, ?, ?) ON CONFLICT(repository_id, folder) DO UPDATE SET snapshot = excluded.snapshot",
        )
        .run(repository.id, history.folder, JSON.stringify(history));
      this.db.exec("COMMIT");
      return history;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  save(repository, scan) {
    if (!scan.range || scan.truncated)
      fail("Incomplete import. Previous history kept.");
    const previous = this.read(repository, scan.folder);
    const commits = new Map(
      (previous?.changes || []).map((change) => [change.sha, { ...change }]),
    );
    for (const change of scan.changes) {
      const old = commits.get(change.sha);
      if (old && !old.unverified && !sameCommit(old, change))
        fail("Commit evidence differs. Previous history kept.");
      commits.set(change.sha, { ...old, ...change, unverified: false });
    }
    for (const change of commits.values()) {
      // Restored metadata becomes verified only when re-read from Git in range.
      change.refs = change.unverified ? [] : scan.contains(change.sha);
      change.branches = change.refs.map(label);
      change.membershipAt = scan.lastSyncedAt;
      if (change.refs.length) {
        change.lastSeenRefs = change.refs;
        change.lastSeenAt = scan.lastSyncedAt;
      }
    }
    const id = createHash("sha256").update(JSON.stringify(scan)).digest("hex");
    const imports = new Map(
      (previous?.imports || []).map((item) => [item.id, item]),
    );
    imports.set(id, {
      id,
      at: scan.lastSyncedAt,
      range: scan.range,
      count: scan.changes.length,
      shallow: scan.shallow,
    });
    const history = {
      ...scan,
      archiveVersion: 1,
      changes: sorted(commits.values()),
      imports: [...imports.values()],
      storedAt: new Date().toISOString(),
      restored: false,
    };
    return this.write(repository, history, { id, snapshot: scan });
  }
  export(repository, folder) {
    const history = this.read(repository, folder);
    if (!history) fail("No saved history for this folder.");
    return { schemaVersion: 1, kind: "agentarium-folder-history", history };
  }
  restore(repository, folder, backup) {
    const restored = validateBackup(backup, repository, folder);
    const previous = this.read(repository, folder);
    const commits = new Map(
      (previous?.changes || []).map((change) => [change.sha, change]),
    );
    for (const change of restored.changes) {
      const old = commits.get(change.sha);
      if (old && !sameCommit(old, change))
        fail("Backup conflicts with saved evidence. Nothing changed.");
      if (!old) commits.set(change.sha, change);
    }
    const imports = new Map(
      (previous?.imports || []).map((item) => [item.id, item]),
    );
    for (const item of restored.imports)
      if (!imports.has(item.id)) imports.set(item.id, item);
    const history = {
      ...(previous || {
        repositoryId: repository.id,
        repositoryName: repository.name,
        folder,
        branchMode: "all-local-and-remote-tracking",
        lastSyncedAt: restored.lastSyncedAt,
        refs: [],
        branchCount: 0,
        shallow: false,
        truncated: false,
        limit: 5000,
        restored: true,
      }),
      archiveVersion: 1,
      changes: sorted(commits.values()),
      imports: [...imports.values()],
      storedAt: new Date().toISOString(),
    };
    return this.write(repository, history);
  }
}
