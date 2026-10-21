import { CapabilityMap, type MapCard, type MapContext } from "./CapabilityMap";
import { useEffect, useState, useRef } from "react";
import type { TrackingSnapshot } from "./model";
type Connection = {
  state: string;
  liveState?: string;
  checkedAt?: string;
  source?: string;
  items: { id: string; title: string; status: string; url: string }[];
};
type Snapshot = {
  state: string;
  presentation?: string;
  context?: MapContext;
  agentKey?: string;
  capabilities: {
    id: string;
    title: string;
    tool: string;
    provider: string | null;
    channels: string[];
    sourceStatus: string;
    runtimeStatus: string;
    sourceCheckedAt: string;
    runtimeVerifiedAt: null;
    evidence: { sha: string; file: string; line: number; supports: string[] }[];
  }[];
  connections: { jira: Connection; github: Connection };
};
const states: Record<string, string> = {
  connected: "Connected",
  snapshot: "Saved read",
  stale: "Stale saved read",
  "missing-config": "Missing config",
  unavailable: "Unavailable",
  source: "Source only",
  historical: "Historical source",
  unverified: "Unverified source",
};
export function Capabilities({ tracking }: { tracking?: TrackingSnapshot }) {
  const [savedSnapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotScope, setSnapshotScope] = useState("");
  const requestedScope = tracking
    ? `${tracking.repositoryId}:${tracking.folder}`
    : "";
  const snapshot = snapshotScope === requestedScope ? savedSnapshot : null;
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scopeRef = useRef("");
  useEffect(() => {
    const scope = tracking ? `${tracking.repositoryId}:${tracking.folder}` : "";
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      setSnapshot(null);
    }
    setError("");
    if (!tracking) {
      setRefreshing(false);
      return;
    }
    const abort = new AbortController();
    setRefreshing(true);
    fetch(
      "/api/capabilities?" +
        new URLSearchParams({
          repositoryId: tracking.repositoryId,
          folder: tracking.folder,
        }),
      { signal: abort.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (
          !response.ok ||
          !Array.isArray(body.capabilities) ||
          !body.connections?.jira ||
          !body.connections?.github ||
          !Array.isArray(body.connections?.jira?.items) ||
          !Array.isArray(body.connections?.github?.items)
        )
          throw new Error();
        if (
          body.presentation === "avva-map" &&
          (!body.context ||
            !body.capabilities.every(
              (c: any) =>
                Array.isArray(c.providers) &&
                Array.isArray(c.tools) &&
                Array.isArray(c.channels) &&
                Array.isArray(c.evidence) &&
                c.development &&
                c.tests &&
                c.live,
            ))
        )
          throw new Error();
        return body;
      })
      .then((body) => {
        if (!abort.signal.aborted) {
          setSnapshot(body);
          setSnapshotScope(scope);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted && e.name !== "AbortError")
          setError("Kaynak kaydı okunamadı.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setRefreshing(false);
      });
    return () => abort.abort();
  }, [tracking?.repositoryId, tracking?.folder, revision]);
  if (snapshot?.presentation === "avva-map" && snapshot.context)
    return (
      <section className="capabilities" aria-label="Capabilities">
        {error && (
          <p className="map-refresh-notice" role="status">
            {error} Son başarılı görünüm korunuyor.
          </p>
        )}
        <CapabilityMap
          cards={snapshot.capabilities as unknown as MapCard[]}
          context={snapshot.context}
          identity={
            tracking
              ? `${tracking.repositoryId}:${tracking.folder}`
              : `agent:${snapshot.agentKey}`
          }
          onRefresh={() => setRevision((v) => v + 1)}
          refreshing={refreshing}
          refreshError={error}
        />
        <details className="capability-work">
          <summary>
            Jira / GitHub ·{" "}
            {Object.values(snapshot.connections).some(
              (c) => c.state === "stale",
            )
              ? "Eski kayıt"
              : Object.values(snapshot.connections).some(
                    (c) => c.state === "snapshot",
                  )
                ? "Tarihli kayıt"
                : Object.values(snapshot.connections).every(
                      (c) => c.state === "connected",
                    )
                  ? "Bağlı"
                  : "Bağlantı eksik"}
          </summary>
          {(["jira", "github"] as const).map((kind) => {
            const c = snapshot.connections[kind];
            return (
              <div key={kind}>
                <h3>
                  {kind === "jira" ? "Jira" : "GitHub"} ·{" "}
                  {c.state === "snapshot"
                    ? "Tarihli kayıt"
                    : c.state === "stale"
                      ? "Eski kayıt"
                      : states[c.state]}
                </h3>
                <p>
                  Okuma:{" "}
                  {c.checkedAt
                    ? new Date(c.checkedAt).toLocaleString("tr-TR", {
                        timeZone: "Europe/Istanbul",
                      })
                    : "Bilinmiyor"}{" "}
                  · Canlı bağlantı:{" "}
                  {c.liveState === "missing-config"
                    ? "yapılandırılmadı"
                    : c.liveState === "unavailable"
                      ? "erişilemiyor"
                      : c.state === "connected"
                        ? "anlık okuma"
                        : "kurulu değil"}
                </p>
                <ul>
                  {c.items.map((item) => (
                    <li key={item.id}>
                      <a href={item.url} target="_blank" rel="noreferrer">
                        {item.id} · {item.title}
                      </a>{" "}
                      · {item.status}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </details>
      </section>
    );
  return (
    <section className="capabilities" aria-label="Capabilities">
      {error && snapshot && (
        <p className="map-refresh-notice" role="status">
          {error} Son başarılı görünüm korunuyor.
        </p>
      )}
      <div className="section-title">
        <h2>Capabilities</h2>
        {tracking && (
          <button onClick={() => setRevision((r) => r + 1)}>Refresh</button>
        )}
      </div>
      {!tracking ? (
        <p>Connect an agent folder to see its capabilities.</p>
      ) : error && !snapshot ? (
        <p role="status">{error}</p>
      ) : !snapshot ? (
        <p>Reading sources…</p>
      ) : (
        <>
          {snapshot.state === "missing-config" && (
            <p>No capability mapping for this folder.</p>
          )}
          <div className="capability-grid">
            {snapshot.capabilities.map((c) => (
              <article key={c.id} className="capability-card">
                <h3>◇ {c.title}</h3>
                <p className="capability-status">Live verification unknown</p>
                <details>
                  <summary>Evidence</summary>
                  <p>{states[c.sourceStatus]}</p>
                  <div className="capability-chain">
                    <span>{c.tool}</span>
                    <span aria-hidden="true">→</span>
                    <span>{c.provider || "Provider unknown"}</span>
                  </div>
                  <div className="capability-channels">
                    {c.channels.length ? (
                      c.channels.map((channel) => (
                        <span key={channel}>◈ {channel}</span>
                      ))
                    ) : (
                      <span>Channel unknown</span>
                    )}
                  </div>
                  <p>Agent: {snapshot.agentKey}</p>
                  <p>
                    Source checked:{" "}
                    {new Date(c.sourceCheckedAt).toLocaleString()}
                  </p>
                  <p>Last live verification: unknown</p>
                  {c.evidence.map((e, i) => (
                    <p key={i}>
                      <code>
                        {e.file}:{e.line}
                      </code>
                      <br />
                      <code>{e.sha.slice(0, 12)}</code> ·{" "}
                      {e.supports.join(", ")}
                    </p>
                  ))}
                </details>
              </article>
            ))}
          </div>
          <details className="capability-work">
            <summary>Related work · Jira / GitHub</summary>
            {(["jira", "github"] as const).map((kind) => {
              const c = snapshot.connections[kind];
              return (
                <div key={kind}>
                  <h3>
                    {kind === "jira" ? "Jira" : "GitHub"} ·{" "}
                    {states[c.state] || c.state}
                  </h3>
                  {c.checkedAt && (
                    <p>Read: {new Date(c.checkedAt).toLocaleString()}</p>
                  )}
                  {c.liveState && <p>Live connection: {states[c.liveState]}</p>}
                  <ul>
                    {c.items.map((item) => (
                      <li key={item.id}>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.id} · {item.title}
                        </a>{" "}
                        · {item.status}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </details>
        </>
      )}
    </section>
  );
}
