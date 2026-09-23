import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Avatar } from "./Avatar";
import { AvatarPicker } from "./AvatarPicker";
import { Tracking } from "./Tracking";
import { Evolution, ChangeEvidenceView } from "./Evolution";
import { GameMenu } from "./GameMenu";
import { assignMissingAvatars, randomAvatar } from "./avatars.mjs";
import { Yard } from "./World";
import { seed } from "./data";
import { kinds, type Agent, type Kind } from "./model";
import {
  chronological,
  safeEvidence,
  cacheWorkspace,
  approvedHistory,
} from "./history.mjs";
import "./style.css";
import "./game-ui.css";

const KEY = "agentarium.workspace.v1";
function load(): Agent[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      Array.isArray(value) &&
      value.every(
        (a) =>
          typeof a.id === "string" &&
          typeof a.name === "string" &&
          typeof a.role === "string" &&
          typeof a.shape === "number" &&
          typeof a.color === "string" &&
          Array.isArray(a.tags) &&
          a.tags.every((t: unknown) => typeof t === "string") &&
          Array.isArray(a.milestones) &&
          a.milestones.every(
            (e: Record<string, unknown>) =>
              typeof e.id === "string" &&
              typeof e.date === "string" &&
              typeof e.title === "string" &&
              typeof e.description === "string" &&
              kinds.includes(e.kind as Kind),
          ),
      )
    )
      return assignMissingAvatars(value);
  } catch {}
  return assignMissingAvatars(seed);
}
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
function App() {
  const [agents, setAgents] = useState<Agent[]>(load);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"yard" | "map" | "activity">("yard");
  const [modal, setModal] = useState<"agent" | "event" | "avatar" | null>(null);
  const [avatarId, setAvatarId] = useState(randomAvatar);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const active = agents.find((a) => a.id === selected);
  const visible = agents.filter((agent) =>
    agent.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cacheWorkspace(agents)));
    } catch {
      setNotice(
        "Browser storage is unavailable. Export your workspace to keep your changes.",
      );
    }
  }, [agents]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (notice !== "Saved") return;
    const timer = setTimeout(() => setNotice(""), 2000);
    return () => clearTimeout(timer);
  }, [notice]);
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal === "avatar" && active) {
      setAgents(
        agents.map((agent) =>
          agent.id === active.id ? { ...agent, avatarId } : agent,
        ),
      );
      setModal(null);
      setNotice("Saved");
      return;
    }
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    if (!title) return;
    if (modal === "agent") {
      const id = crypto.randomUUID();
      setAgents([
        ...agents,
        {
          id,
          name: title,
          role: String(data.get("role") || "").trim(),
          shape: 0,
          color: "#b9cbb0",
          avatarId,
          tags: [],
          milestones: [],
        },
      ]);
      setSelected(id);
    } else if (active) {
      const evidence = String(data.get("evidence") || "").trim();
      if (evidence && !safeEvidence(evidence)) {
        setNotice("Use an http or https evidence link.");
        return;
      }
      setAgents(
        agents.map((a) =>
          a.id === active.id
            ? {
                ...a,
                milestones: [
                  ...a.milestones,
                  {
                    id: crypto.randomUUID(),
                    title,
                    date: String(data.get("date")),
                    kind: data.get("kind") as Kind,
                    description: String(data.get("description") || "").trim(),
                    ...(evidence ? { evidence } : {}),
                  },
                ],
              }
            : a,
        ),
      );
    }
    setModal(null);
    setNotice("Saved");
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ schemaVersion: 1, agents }, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "agentarium-workspace.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  function timeline(agent: Agent) {
    return chronological(approvedHistory(agent)).map((event) => (
      <li className="event" key={event.id}>
        <div className="event-date">{dateLabel(event.date)}</div>
        <div className="event-body">
          <span className="event-kind">{event.kind}</span>
          <h3>{event.title}</h3>
          <p>{event.description}</p>
          {event.changeEvidence && (
            <ChangeEvidenceView
              evidence={event.changeEvidence}
              tracking={agent.tracking}
            />
          )}
          {event.evidence && safeEvidence(event.evidence) && (
            <a
              target="_blank"
              rel="noreferrer"
              href={safeEvidence(event.evidence)!}
            >
              View evidence ↗
            </a>
          )}
        </div>
      </li>
    ));
  }
  return (
    <div className={view === "yard" && !active ? "app-world" : "app-workspace"}>
      <aside className="sidebar">
        <button
          aria-label="The yard"
          className={"nav " + (view === "yard" ? "current" : "")}
          onClick={() => {
            setView("yard");
            setSelected(null);
          }}
        >
          ▧ <span>Yard</span>
        </button>
        <button
          aria-label="Agent map"
          className={"nav " + (view === "map" ? "current" : "")}
          onClick={() => {
            setView("map");
            setSelected(null);
          }}
        >
          ▦ <span>Agents</span>
        </button>
        <button
          aria-label="Recent evolution"
          className={"nav " + (view === "activity" ? "current" : "")}
          onClick={() => {
            setView("activity");
            setSelected(null);
          }}
        >
          ◷ <span>Journal</span>
        </button>
        <GameMenu onExport={exportData} />
      </aside>
      <main>
        <div className="content">
          {active ? (
            <>
              <button className="back" onClick={() => setSelected(null)}>
                <span aria-hidden="true">←</span> <span>All agents</span>
              </button>
              <div className="detail-heading">
                <div className="profile-avatar">
                  <Avatar avatarId={active.avatarId} size={112} />
                  <button
                    className="change-avatar"
                    aria-label="Change avatar"
                    onClick={() => {
                      setAvatarId(active.avatarId!);
                      setModal("avatar");
                    }}
                  >
                    Avatar
                  </button>
                </div>
                <div>
                  <h1>{active.name}</h1>
                  <p>{active.role}</p>
                </div>
                <button
                  className="primary"
                  aria-label="Record a milestone"
                  onClick={() => setModal("event")}
                >
                  + Milestone
                </button>
              </div>
              {active.tracking?.archiveVersion && (
                <Evolution
                  key={
                    active.id +
                    active.tracking.repositoryId +
                    active.tracking.folder
                  }
                  agent={active}
                  onSave={(updates) =>
                    setAgents((current) =>
                      current.map((agent) =>
                        agent.id === active.id ? { ...agent, updates } : agent,
                      ),
                    )
                  }
                />
              )}
              <div className="section-title">
                <h2>History</h2>
                <span>{approvedHistory(active).length}</span>
              </div>
              {approvedHistory(active).length ? (
                <ol className="timeline">{timeline(active)}</ol>
              ) : (
                <div className="empty">
                  <h3>
                    {active.updates?.proposals.length
                      ? "Nothing approved yet"
                      : "No milestones"}
                  </h3>
                </div>
              )}
              <Tracking
                key={active.id}
                value={active.tracking}
                onSave={(tracking) =>
                  setAgents((current) =>
                    current.map((agent) =>
                      agent.id === active.id ? { ...agent, tracking } : agent,
                    ),
                  )
                }
              />
            </>
          ) : view === "yard" ? (
            <Yard
              agents={visible}
              onSelect={setSelected}
              onMap={() => setView("map")}
              onActivity={() => setView("activity")}
              onAdd={() => {
                setAvatarId(randomAvatar());
                setModal("agent");
              }}
              onExport={exportData}
              query={query}
              onQuery={setQuery}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <h1>{view === "map" ? "Agents" : "Journal"}</h1>
                </div>
                <button
                  className="primary"
                  aria-label="Add an agent"
                  onClick={() => {
                    setAvatarId(randomAvatar());
                    setModal("agent");
                  }}
                >
                  + Add
                </button>
              </div>
              <div className="toolbar">
                <label className="search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label="Search agents"
                    placeholder="Search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span className="count">
                  {visible.length} {visible.length === 1 ? "agent" : "agents"}
                </span>
              </div>
              {visible.length === 0 ? (
                <div className="empty">
                  <h3>No agents</h3>
                  <button
                    onClick={() => {
                      setQuery("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : view === "map" ? (
                <div className="agent-grid">
                  {visible.map((agent) => {
                    const latest = chronological(approvedHistory(agent))[0];
                    return (
                      <button
                        key={agent.id}
                        className="agent-card"
                        onClick={() => setSelected(agent.id)}
                      >
                        <div className="portrait">
                          <Avatar avatarId={agent.avatarId} size={100} />
                        </div>
                        <h2>{agent.name}</h2>
                        {latest && (
                          <div className="latest">
                            <p>{latest.title}</p>
                            <small>{dateLabel(latest.date)}</small>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="activity-list">
                  {visible.every(
                    (agent) => approvedHistory(agent).length === 0,
                  ) && (
                    <div className="empty">
                      <h3>No milestones</h3>
                    </div>
                  )}
                  {visible
                    .flatMap((a) =>
                      approvedHistory(a).map((e) => ({ ...e, agent: a })),
                    )
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((e) => (
                      <button
                        className="activity-row"
                        key={e.agent.id + e.id}
                        onClick={() => setSelected(e.agent.id)}
                      >
                        <Avatar avatarId={e.agent.avatarId} size={50} />
                        <div>
                          <small>
                            {e.agent.name} · {e.kind}
                          </small>
                          <h3>{e.title}</h3>
                        </div>
                        <time>{dateLabel(e.date)}</time>
                        <span>→</span>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <dialog
        ref={dialog}
        aria-labelledby="dialog-title"
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
      >
        <form key={modal} onSubmit={save}>
          <div className="modal-heading">
            <h2 id="dialog-title">
              {modal === "avatar"
                ? "Change avatar"
                : modal === "agent"
                  ? "New agent"
                  : "New milestone"}
            </h2>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              ×
            </button>
          </div>
          {modal === "avatar" ? (
            <>
              <AvatarPicker value={avatarId} onChange={setAvatarId} />
            </>
          ) : modal === "agent" ? (
            <>
              <label>
                Name
                <input
                  autoFocus
                  name="title"
                  required
                  maxLength={60}
                  placeholder="e.g. Milo"
                />
              </label>
              <label>
                Role
                <input
                  name="role"
                  aria-label="What does this agent do?"
                  required
                  maxLength={100}
                  placeholder="e.g. Customer care"
                />
              </label>
              <AvatarPicker value={avatarId} onChange={setAvatarId} />
            </>
          ) : (
            <>
              <label>
                Title
                <input
                  autoFocus
                  name="title"
                  aria-label="What changed?"
                  required
                  maxLength={120}
                  placeholder="e.g. Can now look up orders"
                />
              </label>
              <div className="form-row">
                <label>
                  Date
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={new Date().toLocaleDateString("en-CA")}
                  />
                </label>
                <label>
                  Type
                  <select name="kind">
                    {kinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Description
                <textarea
                  name="description"
                  aria-label="Short description"
                  required
                  maxLength={1000}
                  rows={3}
                />
              </label>
              <label>
                Evidence link <small>(optional)</small>
                <input
                  type="url"
                  name="evidence"
                  placeholder="https://github.com/…"
                />
              </label>
            </>
          )}
          <button className="primary" type="submit">
            {modal === "avatar"
              ? "Save avatar"
              : modal === "agent"
                ? "Add agent"
                : "Save milestone"}
          </button>
        </form>
      </dialog>
      <div className="notice" role="status">
        {notice && (
          <>
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </>
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
