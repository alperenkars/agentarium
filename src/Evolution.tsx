import { useEffect, useRef, useState } from "react";
import type {
  Agent,
  ChangeEvidence,
  EvolutionState,
  TrackingSnapshot,
  UpdateProposal,
} from "./model";

export function ChangeEvidenceView({
  evidence,
  tracking,
}: {
  evidence: ChangeEvidence[];
  tracking?: TrackingSnapshot;
}) {
  return (
    <details className="update-evidence">
      <summary>Evidence</summary>
      <p>Code history · not deployment status</p>
      {evidence.map((item) => {
        const commit = tracking?.changes.find((c) => c.sha === item.sha);
        return (
          <div key={item.sha + item.file} className="evidence-entry">
            <code>
              {item.sha.slice(0, 8)} · {item.file}
              {item.afterLine ? `:${item.afterLine}` : ""}
            </code>
            <dl>
              <dt>Before</dt>
              <dd>{item.before}</dd>
              <dt>After</dt>
              <dd>{item.after}</dd>
            </dl>
            <details>
              <summary>Branches at scan</summary>
              <p>
                {commit && !commit.unverified
                  ? commit.refs?.join(", ") || "No recorded branch"
                  : "Open the full archive to check"}
              </p>
            </details>
          </div>
        );
      })}
    </details>
  );
}

export function Evolution({
  agent,
  onSave,
}: {
  agent: Agent;
  onSave: (data: EvolutionState) => void;
}) {
  const connection = agent.tracking!;
  const data =
    agent.updates?.repositoryId === connection.repositoryId &&
    agent.updates?.folder === connection.folder
      ? agent.updates
      : undefined;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null),
    [shown, setShown] = useState(5);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const operation = useRef(0);
  async function request(action: string, body = {}) {
    const response = await fetch(`/api/tracking/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repositoryId: connection.repositoryId,
        folder: connection.folder,
        ...body,
      }),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error("Start the local server to review updates.");
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Could not save. Try again.");
    return result as EvolutionState;
  }
  useEffect(() => {
    let disposed = false;
    const sequence = operation.current;
    request("evolution")
      .then((value) => {
        if (!disposed && sequence === operation.current) saveRef.current(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [connection.repositoryId, connection.folder]);
  async function act(action: string, body = {}) {
    operation.current++;
    setBusy(true);
    setError("");
    try {
      onSave(await request(action, body));
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  function review(
    p: UpdateProposal,
    status: UpdateProposal["status"],
    fields = {},
  ) {
    return act("review", { id: p.id, version: p.version, status, ...fields });
  }
  const pending = data?.proposals.filter((p) => p.status === "proposed") || [];
  const dismissed =
    data?.proposals.filter((p) => p.status === "dismissed") || [];
  const approved = data?.proposals.filter((p) => p.status === "approved") || [];
  return (
    <section className="evolution" aria-label="Agent updates">
      <div className="section-title">
        <h2>Updates{pending.length ? ` · ${pending.length} to review` : ""}</h2>
        <button
          className="primary"
          disabled={busy}
          onClick={() => act("analyze")}
        >
          {busy ? "Working…" : "Find updates"}
        </button>
      </div>
      {!pending.length && (
        <p className="update-empty">
          {data?.at
            ? "No updates awaiting review"
            : "Find changes worth adding to the history"}
        </p>
      )}
      <div className="proposal-list">
        {pending.slice(0, shown).map((p) => (
          <article className="proposal" key={p.id}>
            <div className="proposal-meta">
              <time>
                {new Date(p.date + "T12:00:00Z").toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </time>
              <span>Needs review</span>
            </div>
            {editing === p.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  review(p, "proposed", {
                    title: fields.get("title"),
                    description: fields.get("description"),
                  });
                }}
              >
                <label>
                  Title
                  <input
                    name="title"
                    required
                    maxLength={120}
                    defaultValue={p.title}
                    disabled={busy}
                    autoFocus
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    maxLength={400}
                    defaultValue={p.description}
                    disabled={busy}
                  />
                </label>
                <div className="proposal-actions">
                  <button disabled={busy} type="submit">
                    Save changes
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h3>{p.title}</h3>
                {p.description && <p>{p.description}</p>}
                <div className="proposal-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => review(p, "approved")}
                  >
                    Approve
                  </button>
                  <button disabled={busy} onClick={() => setEditing(p.id)}>
                    Edit
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => review(p, "dismissed")}
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
            <ChangeEvidenceView evidence={p.evidence} tracking={connection} />
          </article>
        ))}
      </div>
      {pending.length > shown && (
        <button onClick={() => setShown(shown + 5)}>
          More updates ({pending.length - shown})
        </button>
      )}
      {!!(dismissed.length || approved.length || data?.at) && (
        <details className="review-record">
          <summary>Review record</summary>
          {data?.at && (
            <p>
              Local rules · {data.analyzed} / {data.eligible} eligible changes
              checked
            </p>
          )}
          {[...dismissed, ...approved].map((p) => (
            <div key={p.id}>
              <span>
                {p.title} · {p.status}
              </span>
              <button disabled={busy} onClick={() => review(p, "proposed")}>
                Review again
              </button>
            </div>
          ))}
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
