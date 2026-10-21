import { useEffect, useState } from "react";
import type { Agent } from "./model";
import { approvedHistory, chronological } from "./history.mjs";
import { safeWorkUrl, summarizeWork } from "./work-summary.mjs";
import "./work-summary.css";

type Item = {
  id: string;
  title: string;
  status: string;
  url: string;
  updatedAt?: string;
  category?: string;
  assignee?: string;
  draft?: boolean;
  review?: string;
  ci?: {
    state: string;
    complete?: boolean;
    items: { name: string; state: string; url: string }[];
  };
};
type Row = Item & {
  kind: string;
  terminal: boolean;
  pendingReview: boolean;
  blocked: boolean;
  saved: boolean;
};
type Work = {
  rows: Row[];
  open: Row[];
  blocked: Row[];
  reviews: Row[];
  ci: Row[];
  next: { target?: Row; action: string };
};
type Connection = {
  state: string;
  checkedAt?: string;
  liveState?: string;
  items: Item[];
};
type Snapshot = { connections: { jira: Connection; github: Connection } };
const readState: Record<string, string> = {
  connected: "Anlık okuma",
  snapshot: "Tarihli kayıt",
  stale: "Eski kayıt",
  "missing-config": "Bağlantı yok",
  unavailable: "Erişilemiyor",
};
const reviewState: Record<string, string> = {
  unknown: "İnceleme bilinmiyor",
  approved: "Mevcut sürüme onay var",
  requested: "İnceleme bekliyor",
  "changes-requested": "Değişiklik istendi",
};
const ciState: Record<string, string> = {
  unknown: "CI bilinmiyor",
  failure: "CI sorunu",
  pending: "CI sürüyor",
  success: "Okunan kontroller başarılı",
};
const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("tr-TR", {
        timeZone: "Europe/Istanbul",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Bilinmiyor";
function WorkLink({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  const safe = safeWorkUrl(url);
  return safe ? (
    <a href={safe} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  ) : (
    <span>{children}</span>
  );
}
function validSnapshot(body: any): body is Snapshot {
  return ["jira", "github"].every((kind) => {
    const c = body?.connections?.[kind];
    return (
      typeof c?.state === "string" &&
      Array.isArray(c.items) &&
      c.items.every(
        (item: any) =>
          [item.id, item.title, item.status, item.url].every(
            (s) => typeof s === "string",
          ) &&
          (!item.ci ||
            (typeof item.ci.state === "string" &&
              Array.isArray(item.ci.items) &&
              item.ci.items.every((i: any) =>
                [i.name, i.state, i.url].every((s) => typeof s === "string"),
              ))),
      )
    );
  });
}
export function WorkSummary({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const agent = agents.find((a) => a.id === selectedId) || agents[0];
  const tracking = agent?.tracking;
  const scope = tracking ? `${tracking.repositoryId}:${tracking.folder}` : "";
  const [saved, setSaved] = useState<{ scope: string; data: Snapshot } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const snapshot = saved?.scope === scope ? saved.data : null;
  useEffect(() => {
    setFilter("open");
    setQuery("");
  }, [scope, agent?.id]);
  useEffect(() => {
    setError("");
    if (!tracking) {
      setRefreshing(false);
      return;
    }
    const abort = new AbortController();
    setRefreshing(true);
    fetch(
      "/api/work-summary?" +
        new URLSearchParams({
          repositoryId: tracking.repositoryId,
          folder: tracking.folder,
        }),
      { signal: abort.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !validSnapshot(body)) throw new Error();
        return body;
      })
      .then((data) => {
        if (!abort.signal.aborted) setSaved({ scope, data });
      })
      .catch(() => {
        if (!abort.signal.aborted) setError("İş bilgileri okunamadı.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setRefreshing(false);
      });
    return () => abort.abort();
  }, [scope, revision]);
  const work = snapshot ? (summarizeWork(snapshot.connections) as Work) : null;
  const history = agent
    ? chronological(approvedHistory(agent)).slice(0, 3)
    : [];
  const rows = (
    work
      ? filter === "open"
        ? work.open
        : filter === "review"
          ? work.reviews
          : filter === "ci"
            ? work.ci
            : work.rows
      : []
  ).filter((item) =>
    `${item.id} ${item.title} ${item.status}`
      .toLocaleLowerCase("tr")
      .includes(query.toLocaleLowerCase("tr")),
  );
  const hasReads =
    snapshot &&
    Object.values(snapshot.connections).some((c) =>
      ["connected", "snapshot", "stale"].includes(c.state),
    );
  return (
    <section className="work-summary" aria-label="Agent iş özeti">
      <div className="page-heading">
        <h1>Agent özeti</h1>
        <button
          disabled={!tracking || refreshing}
          onClick={() => setRevision((r) => r + 1)}
        >
          {refreshing ? "Okunuyor…" : "Yenile"}
        </button>
      </div>
      <label className="work-agent">
        Agent
        <select
          aria-label="Özeti gösterilecek agent"
          value={agent?.id || ""}
          onChange={(event) => onSelect(event.target.value)}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {!agent ? (
        <p>Özet için önce bir agent ekle.</p>
      ) : !tracking ? (
        <p>
          Bu agent için kaynak klasörü bağlı değil. Bağlantıyı agent profilinden
          ekleyebilirsin.
        </p>
      ) : (
        <>
          {error && (
            <p role="status">
              {error}
              {snapshot
                ? " Son başarılı okuma korunuyor; aşağıdaki durumlar güncel olmayabilir."
                : " Yerel bağlantının çalıştığını kontrol edip yeniden dene."}
            </p>
          )}
          {!snapshot && !error && <p role="status">İş bilgileri okunuyor…</p>}
          {snapshot && (
            <>
              <div className="work-sources">
                {(["jira", "github"] as const).map((kind) => {
                  const c = snapshot.connections[kind];
                  return (
                    <div key={kind}>
                      <strong>{kind === "jira" ? "Jira" : "GitHub"}</strong>
                      <span>{readState[c.state] || "Bilinmiyor"}</span>
                      <small>Son okuma: {date(c.checkedAt)}</small>
                      {c.state !== "connected" && c.checkedAt && (
                        <small>
                          Canlı bağlantı:{" "}
                          {c.liveState === "unavailable"
                            ? "erişilemiyor"
                            : "kurulu değil"}
                        </small>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="work-scope">
                Yalnızca bu agent’a bağlanmış Jira ve PR kayıtları. Tüm
                backlog’u veya Slack mesajlarını kapsamaz.
              </p>
              {hasReads &&
                Object.values(snapshot.connections).some((c) =>
                  ["missing-config", "unavailable"].includes(c.state),
                ) && (
                  <p role="status">
                    Bazı kaynaklar okunamıyor; iş sayıları eksik olabilir.
                  </p>
                )}
              {!hasReads ? (
                <p>
                  Bu agent’ın Jira / PR bilgileri henüz okunamıyor. Bağlantı
                  eksikken açık iş sayısı bilinmiyor.
                </p>
              ) : (
                <>
                  <div className="work-next">
                    <h2>Sıradaki adım</h2>
                    <p>{work!.next.action}</p>
                    {work!.next.target && (
                      <WorkLink url={work!.next.target.url}>
                        {work!.next.target.id} · {work!.next.target.title}
                      </WorkLink>
                    )}
                    {work!.next.target?.saved && (
                      <small>
                        Tarihli kayda dayanıyor; adımı uygulamadan önce
                        kaynaktaki son durumu kontrol et.
                      </small>
                    )}
                  </div>
                  <div
                    className="work-filters"
                    role="group"
                    aria-label="İş filtresi"
                  >
                    {[
                      ["open", "Açık işler", work!.open.length],
                      ["review", "İnceleme bekleyen", work!.reviews.length],
                      ["ci", "CI takibi", work!.ci.length],
                      ["all", "Tüm kayıtlar", work!.rows.length],
                    ].map(([id, label, count]) => (
                      <button
                        key={id}
                        aria-pressed={filter === id}
                        onClick={() => setFilter(String(id))}
                      >
                        {label} <span>{count}</span>
                      </button>
                    ))}
                  </div>
                  {work!.open.some(
                    (item) =>
                      item.kind === "github" &&
                      (!item.ci ||
                        item.ci.state === "unknown" ||
                        !item.ci.complete),
                  ) && (
                    <p className="work-scope">
                      Bazı açık PR’lerin CI bilgisi eksik. CI takibindeki sayı
                      yalnızca okunan sorunları ve süren kontrolleri kapsar.
                    </p>
                  )}
                  <label className="work-search">
                    Kayıtlarda ara
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Jira, PR veya başlık"
                    />
                  </label>
                  <ul className="work-items">
                    {rows.map((item) => (
                      <li key={`${item.kind}:${item.id}`}>
                        <div className="work-item-heading">
                          <WorkLink url={item.url}>
                            {item.id} · {item.title}
                          </WorkLink>
                          <span>
                            {item.status}
                            {item.draft ? " · Taslak" : ""}
                          </span>
                        </div>
                        <small>
                          {item.kind === "jira" ? "Jira" : "GitHub"} · Son
                          güncelleme: {date(item.updatedAt)}
                          {item.assignee ? ` · ${item.assignee}` : ""}
                        </small>
                        {item.kind === "github" && (
                          <p>
                            {reviewState[item.review || "unknown"]} ·{" "}
                            {ciState[item.ci?.state || "unknown"]}
                          </p>
                        )}
                        {item.ci?.items
                          .filter((i) => i.state !== "success")
                          .map((check, index) => (
                            <p className="work-check" key={index}>
                              <WorkLink url={check.url}>{check.name}</WorkLink>{" "}
                              ·{" "}
                              {check.state === "failure"
                                ? "Sorun var"
                                : check.state === "pending"
                                  ? "Devam ediyor"
                                  : "Bilinmiyor"}
                            </p>
                          ))}
                      </li>
                    ))}
                  </ul>
                  {!rows.length && <p>Bu filtrede bağlı kayıt yok.</p>}
                  <div className="work-changes">
                    <h2>Son güncellenen kayıtlar</h2>
                    <p>
                      Güncelleme zamanı gösterilir; değişen alanlar bu okumada
                      bilinmiyor.
                    </p>
                    <ul>
                      {work!.rows
                        .filter((i) => i.updatedAt)
                        .slice(0, 5)
                        .map((item) => (
                          <li key={`${item.kind}:${item.id}`}>
                            <WorkLink url={item.url}>
                              {item.id} · {item.title}
                            </WorkLink>
                            <small>{date(item.updatedAt)}</small>
                          </li>
                        ))}
                    </ul>
                    {!work!.rows.some((i) => i.updatedAt) && (
                      <p>Kayıtların güncelleme zamanı bilinmiyor.</p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
      <div className="work-changes">
        <h2>Onaylanan gelişmeler</h2>
        {history.length ? (
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <small>{item.date}</small>
                <p>{item.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>Henüz onaylanmış gelişme yok.</p>
        )}
      </div>
    </section>
  );
}
