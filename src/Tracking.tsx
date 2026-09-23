import { useEffect, useRef, useState } from "react";
import type { TrackingSnapshot } from "./model";

type Repository = { id: string; name: string; folders: string[] };
function recentRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
const refLabel = (ref: string) =>
  ref.startsWith("refs/heads/")
    ? `Local · ${ref.slice(11)}`
    : `Remote · ${ref.slice(13)}`;
async function request(url: string, body?: object) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Connector offline. Start the development server.");
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Could not reach the local connector.");
  return result;
}

export function Tracking({
  value,
  onSave,
}: {
  value?: TrackingSnapshot;
  onSave: (tracking: TrackingSnapshot) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoryId, setRepositoryId] = useState(value?.repositoryId || "");
  const [folder, setFolder] = useState(value?.folder || "");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState(value?.range || recentRange);
  const [branch, setBranch] = useState("");
  const [shown, setShown] = useState(50);
  const [saved, setSaved] = useState<TrackingSnapshot | null>(null);
  const saveRef = useRef(onSave);
  const operation = useRef(0);
  saveRef.current = onSave;
  const backupInput = useRef<HTMLInputElement>(null);
  const changes = (value?.changes || []).filter(
    (change) =>
      !branch ||
      (branch === "archived"
        ? change.refs?.length === 0
        : change.refs?.includes(branch)),
  );
  useEffect(() => {
    setShown(50);
  }, [branch, value?.folder]);
  useEffect(() => {
    if (!value) return;
    let disposed = false;
    const sequence = operation.current;
    request("/api/tracking/history", {
      repositoryId: value.repositoryId,
      folder: value.folder,
    })
      .then(({ history }) => {
        if (!disposed && sequence === operation.current && history)
          saveRef.current(history);
        if (
          !disposed &&
          sequence === operation.current &&
          !history &&
          value.archiveVersion
        )
          setError("No local archive. Sync or restore.");
      })
      .catch(() => {
        if (!disposed && sequence === operation.current)
          setError("Archive unavailable. Showing saved copy.");
      });
    return () => {
      disposed = true;
    };
  }, [value?.repositoryId, value?.folder]);
  useEffect(() => {
    setSaved(null);
    if (!editing || !repositoryId || !folder) return;
    let disposed = false;
    request("/api/tracking/history", { repositoryId, folder })
      .then(({ history }) => {
        if (!disposed) setSaved(history);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [editing, repositoryId, folder]);
  const repository = repositories.find((entry) => entry.id === repositoryId);
  useEffect(() => {
    if (!editing) return;
    let disposed = false;
    setLoading(true);
    setError("");
    request("/api/tracking/repositories")
      .then((result) => {
        if (disposed) return;
        setRepositories(result.repositories);
        setRepositoryId(
          value?.repositoryId || result.repositories[0]?.id || "",
        );
        setFolder(value?.folder || "");
      })
      .catch((reason) => {
        if (!disposed) setError(reason.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [editing, value?.repositoryId, value?.folder]);

  async function sync(id: string, selectedFolder: string) {
    operation.current++;
    setBusy(true);
    setError("");
    try {
      const snapshot = await request("/api/tracking/scan", {
        repositoryId: id,
        folder: selectedFolder,
        ...range,
      });
      onSave(snapshot);
      setEditing(false);
      setBranch("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not sync. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportHistory() {
    if (!value) return;
    setError("");
    try {
      const backup = await request("/api/tracking/export", {
        repositoryId: value.repositoryId,
        folder: value.folder,
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "agentarium-folder-history.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Backup failed. Try again.");
    }
  }

  async function restoreHistory(file?: File) {
    if (!file) return;
    operation.current++;
    setBusy(true);
    setError("");
    try {
      if (file.size > 15 * 1024 * 1024)
        throw new Error("Backup is too large (15 MB maximum).");
      const history = await request("/api/tracking/restore", {
        repositoryId: editing ? repositoryId : value?.repositoryId,
        folder: editing ? folder : value?.folder,
        backup: JSON.parse(await file.text()),
      });
      onSave(history);
      setEditing(false);
      setBranch("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Restore failed.");
    } finally {
      setBusy(false);
      if (backupInput.current) backupInput.current.value = "";
    }
  }

  const dates = (
    <div className="form-row tracking-range">
      <label>
        From (UTC)
        <input
          aria-label="From date"
          type="date"
          required
          value={range.from}
          max={range.to}
          disabled={busy}
          onChange={(e) => setRange({ ...range, from: e.target.value })}
        />
      </label>
      <label>
        To (UTC)
        <input
          aria-label="To date"
          type="date"
          required
          value={range.to}
          min={range.from}
          disabled={busy}
          onChange={(e) => setRange({ ...range, to: e.target.value })}
        />
      </label>
    </div>
  );

  return (
    <section className="tracking" aria-labelledby="tracking-heading">
      <details>
        <summary className="tracking-toggle">
          <h2 id="tracking-heading">Technical details</h2>
          <span>
            {value?.archiveVersion
              ? "Local archive"
              : value
                ? "Local Git"
                : "Not connected"}
          </span>
        </summary>
        {value ? (
          <>
            <dl className="tracking-facts">
              <dt>Repository</dt>
              <dd>{value.repositoryName}</dd>
              <dt>Agent folder</dt>
              <dd>
                <code>{value.folder}/</code>
              </dd>
              <dt>Branches</dt>
              <dd>All known ({value.branchCount})</dd>
              <dt>{value.restored ? "Backup scan" : "Scanned"}</dt>
              <dd>{new Date(value.lastSyncedAt).toLocaleString()}</dd>
            </dl>
            {value.shallow && (
              <p className="tracking-note">
                Shallow clone · history incomplete
              </p>
            )}
            {value.restored && (
              <p className="tracking-note">Restored · sync to verify</p>
            )}
            {!editing && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  sync(value.repositoryId, value.folder);
                }}
              >
                {dates}
                <div className="tracking-actions">
                  <button type="submit" className="primary" disabled={busy}>
                    {busy ? "Syncing…" : "Sync now"}
                  </button>
                  <button
                    type="button"
                    className="change-avatar"
                    disabled={busy}
                    onClick={() => setEditing(true)}
                  >
                    Change connection
                  </button>
                  <button
                    type="button"
                    disabled={busy || !value.archiveVersion}
                    onClick={exportHistory}
                  >
                    Backup
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => backupInput.current?.click()}
                  >
                    Restore
                  </button>
                </div>
              </form>
            )}
            <details className="tracking-changes">
              <summary>Commits ({value.changes.length})</summary>
              {value.cached && (
                <p className="tracking-note">
                  Cached {value.changes.length} / {value.totalCount}
                </p>
              )}
              {value.refs && (
                <label className="tracking-branch">
                  Branch at scan
                  <select
                    aria-label="Branch at scan"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  >
                    <option value="">All recorded</option>
                    <option value="archived">No verified branch</option>
                    {value.refs.map((ref) => (
                      <option key={ref.name} value={ref.name}>
                        {refLabel(ref.name)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {value.truncated && (
                <p className="tracking-note">
                  Recent window: {value.limit} commits
                </p>
              )}
              {!changes.length && <p>No commits</p>}
              <ul className="tracking-commits">
                {changes.slice(0, shown).map((change) => (
                  <li key={change.sha}>
                    <div>
                      <code title={change.sha}>{change.sha.slice(0, 8)}</code> ·{" "}
                      {new Date(change.date).toLocaleDateString()} ·{" "}
                      {change.files.length}{" "}
                      {change.files.length === 1 ? "file" : "files"} changed
                      {change.merge ? " · merge" : ""}
                      {change.unverified
                        ? " · unverified backup"
                        : change.refs?.length === 0
                          ? " · not on scanned branches"
                          : ""}
                    </div>
                    <details>
                      <summary>Files and branches</summary>
                      <ul>
                        {change.files.map((file) => (
                          <li key={file}>
                            <code>{file}</code>
                          </li>
                        ))}
                      </ul>
                      <p>
                        Branches:{" "}
                        {change.refs
                          ? change.refs.map(refLabel).join(", ") || "—"
                          : change.branches.join(", ") || "—"}
                      </p>
                      {change.refs?.length === 0 &&
                        !!change.lastSeenRefs?.length && (
                          <p>
                            Last seen:{" "}
                            {change.lastSeenRefs.map(refLabel).join(", ")} ·{" "}
                            {new Date(change.lastSeenAt!).toLocaleDateString()}
                          </p>
                        )}
                      {!!change.parents?.length && (
                        <p>
                          Parents:{" "}
                          {change.parents
                            .map((parent) => parent.slice(0, 8))
                            .join(", ")}
                        </p>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
              {shown < changes.length && (
                <button onClick={() => setShown(shown + 50)}>
                  More ({changes.length - shown})
                </button>
              )}
            </details>
            {!!value.imports?.length && (
              <details className="tracking-imports">
                <summary>Imports ({value.imports.length})</summary>
                <ul>
                  {[...value.imports].reverse().map((item) => (
                    <li key={item.id}>
                      {item.range.from} – {item.range.to} · {item.count} commits
                      {item.shallow ? " · shallow" : ""}
                      {item.restored ? " · backup" : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <>
            {!editing && (
              <button
                className="change-avatar"
                onClick={() => setEditing(true)}
              >
                Connect folder
              </button>
            )}
          </>
        )}
        {editing && (
          <form
            className="tracking-form"
            onSubmit={(event) => {
              event.preventDefault();
              sync(repositoryId, folder);
            }}
          >
            {loading ? (
              <p role="status">Loading…</p>
            ) : (
              <>
                {!repositories.length && !error && (
                  <p>
                    Configure <code>.agentarium.local.json</code>
                  </p>
                )}
                {repositories.length > 0 && (
                  <>
                    <label>
                      Repository
                      <select
                        aria-label="Repository"
                        required
                        disabled={busy}
                        value={repositoryId}
                        onChange={(event) => {
                          setRepositoryId(event.target.value);
                          setFolder("");
                        }}
                      >
                        {repositories.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Agent folder
                      <select
                        aria-label="Agent folder"
                        required
                        disabled={busy}
                        value={folder}
                        onChange={(event) => setFolder(event.target.value)}
                      >
                        <option value="">Choose folder</option>
                        {repository?.folders.map((entry) => (
                          <option key={entry} value={entry}>
                            {entry}
                          </option>
                        ))}
                      </select>
                    </label>
                    {dates}
                    {saved && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          onSave(saved);
                          setEditing(false);
                          setBranch("");
                        }}
                      >
                        Load saved history ({saved.changes.length})
                      </button>
                    )}
                    <button
                      className="primary"
                      disabled={busy || !repository?.folders.includes(folder)}
                    >
                      {busy ? "Syncing…" : "Connect and sync"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !repository?.folders.includes(folder)}
                      onClick={() => backupInput.current?.click()}
                    >
                      Restore
                    </button>
                  </>
                )}
              </>
            )}
            <button
              className="change-avatar"
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </form>
        )}
        <input
          ref={backupInput}
          type="file"
          accept=".json,application/json"
          aria-label="History backup"
          hidden
          onChange={(e) => restoreHistory(e.target.files?.[0])}
        />
        {error && (
          <p className="tracking-error" role="alert">
            {error}
          </p>
        )}
      </details>
    </section>
  );
}
