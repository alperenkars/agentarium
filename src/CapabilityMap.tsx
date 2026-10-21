import { useEffect, useRef, useState } from "react";
import {
  filterCapabilities,
  statusLabel,
  groupCapabilities,
  readMapView,
} from "./capability-map.mjs";
import "./capability-map.css";
export type MapCard = {
  id: string;
  title: string;
  summary: string;
  tool: string;
  tools: string[];
  group: string;
  providers: { name: string; role: string }[];
  channels: string[];
  condition: string;
  sourceStatus: string;
  sourceRecord?: { at: string; commit: string; origin: string };
  development: { state: string; summary?: string; at?: string; url?: string };
  tests: { state: string; summary?: string; at?: string; scope?: string };
  live: { state: string; summary: string };
  evidence: {
    sha: string;
    file: string;
    line: number;
    supports: string[];
    url?: string;
  }[];
};
export type MapContext = {
  sourceAt: string;
  commit: string;
  branch: string;
  scope: string;
  deployment?: { label: string; url: string; at: string; scope: string };
  review?: { label: string; url: string; scope: string };
};
const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Istanbul",
      }).format(new Date(value))
    : "Tarih bilinmiyor";
const shortNames: Record<string, string> = {
  orders: "Sipariş bilgisi",
  shipping: "Kargo takibi",
  "online-invoice": "Online fatura",
  "invoice-status": "Fatura durumu",
  "store-invoice": "Mağaza faturası",
  "online-sms": "Online SMS",
  "store-sms": "Mağaza SMS",
  "return-status": "Online iade",
  "store-refund": "Mağaza iadesi",
  review: "Ürün incelemesi",
  catalog: "Ürün arama",
  bestsellers: "Çok satanlar",
  "size-guide": "Beden",
  cart: "Sepet",
  "store-stock": "Mağaza stoğu",
  "support-ticket": "Talep açma",
  "support-history": "Talep geçmişi",
  "human-handoff": "Canlı temsilci",
};
const icons: Record<string, string> = {
  Sipariş: "▣",
  Fatura: "▤",
  İade: "↶",
  Alışveriş: "◇",
  Destek: "☏",
};
function Providers({ providers }: { providers: MapCard["providers"] }) {
  const data = providers.filter((p) => p.name !== "Mobildev");
  const sms = providers.find((p) => p.name === "Mobildev");
  return (
    <div className="map-flow">
      {data.map((p, i) => (
        <span key={p.name} className="map-provider">
          <b>{p.name}</b>
          <small>{p.role}</small>
        </span>
      ))}
      {sms && (
        <>
          <span aria-hidden="true" className="map-arrow">
            →
          </span>
          <span className="map-provider">
            <b>{sms.name}</b>
            <small>{sms.role}</small>
          </span>
        </>
      )}
    </div>
  );
}
export function CapabilityMap({
  cards,
  context,
  identity,
  onRefresh,
  refreshing = false,
  refreshError,
}: {
  cards: MapCard[];
  context: MapContext;
  identity: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshError?: string;
}) {
  const viewKey = "agentarium.map-view.v1:" + encodeURIComponent(identity);
  const [initial] = useState(() => {
    try {
      return readMapView(sessionStorage, viewKey);
    } catch {
      return readMapView({ getItem: () => null }, viewKey);
    }
  });
  const [query, setQuery] = useState(initial.query);
  const [group, setGroup] = useState(initial.group);
  const [provider, setProvider] = useState(initial.provider);
  const [channel, setChannel] = useState(initial.channel);
  const [mode, setMode] = useState(initial.mode);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(initial.query || initial.provider || initial.channel),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    history.state?.agentariumCapabilityIdentity === identity &&
    cards.some((c) => c.id === history.state?.agentariumCapability)
      ? history.state.agentariumCapability
      : null,
  );
  const selected = cards.find((c) => c.id === selectedId) || null;
  const [changeNotice, setChangeNotice] = useState("");
  const [focusResults, setFocusResults] = useState(false);
  const results = useRef<HTMLDivElement>(null);
  const filterPanel = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const hadDialog = useRef(false);
  const groups = [...new Set(cards.map((c) => c.group))];
  const providers = [
    ...new Set(cards.flatMap((c) => c.providers.map((p) => p.name))),
  ];
  const channels = [...new Set(cards.flatMap((c) => c.channels))];
  const filtered = filterCapabilities(cards, {
    query,
    group,
    provider,
    channel,
  });
  const hasFilters = !!(query || group || provider || channel);
  const isOverview = mode === "overview" && !hasFilters && cards.length > 0;
  const rooms = groupCapabilities(cards) as {
    name: string;
    cards: MapCard[];
    providers: MapCard["providers"];
    hasMissingEvidence: boolean;
  }[];
  useEffect(() => {
    try {
      sessionStorage.setItem(
        viewKey,
        JSON.stringify({ query, group, provider, channel, mode }),
      );
    } catch {}
  }, [viewKey, query, group, provider, channel, mode]);
  useEffect(() => {
    if (focusResults && !isOverview) {
      results.current?.focus({ preventScroll: true });
      setFocusResults(false);
    }
  }, [focusResults, isOverview]);
  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(null);
      setChangeNotice(
        "Bu işlev yeni kaynak kaydında bulunamadı. Filtrelerin korundu.",
      );
      if (
        history.state?.agentariumCapabilityIdentity === identity &&
        history.state?.agentariumCapability === selectedId
      )
        history.back();
    }
  }, [selectedId, selected]);
  function clear() {
    setMode("cards");
    setQuery("");
    setGroup("");
    setProvider("");
    setChannel("");
    setChangeNotice("");
    setFiltersOpen(true);
    requestAnimationFrame(() => {
      if (filterPanel.current?.open) search.current?.focus();
    });
  }
  function close() {
    setSelectedId(null);
    if (
      selected &&
      history.state?.agentariumCapabilityIdentity === identity &&
      history.state?.agentariumCapability === selected.id
    )
      history.back();
  }
  useEffect(() => {
    const pop = () =>
      setSelectedId(
        history.state?.agentariumCapabilityIdentity === identity &&
          cards.some((c) => c.id === history.state?.agentariumCapability)
          ? history.state.agentariumCapability
          : null,
      );
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [cards, identity]);
  useEffect(() => {
    if (selected) {
      hadDialog.current = true;
      opener.current = cardButtons.current.get(selected.id) || opener.current;
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      if (opener.current?.isConnected)
        opener.current.focus({ preventScroll: false });
      else if (hadDialog.current) {
        setFiltersOpen(true);
        requestAnimationFrame(() =>
          search.current?.focus({ preventScroll: true }),
        );
      }
    }
  }, [selected?.id]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !selected
      ) {
        event.preventDefault();
        setFiltersOpen(true);
        requestAnimationFrame(() => search.current?.focus());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);
  return (
    <div className="capability-map">
      <div className="map-heading">
        <div>
          <h2>Yetenekler</h2>
          <p className="map-source">Kaynak kaydı · {date(context.sourceAt)}</p>
        </div>
        <span className="map-total" aria-live="polite">
          {filtered.length} / {cards.length} yetenek
        </span>
      </div>
      <div className="map-view-switch">
        <button
          aria-pressed={isOverview}
          onClick={() => {
            clear();
            setMode("overview");
            setFiltersOpen(false);
          }}
        >
          Özet
        </button>
        <button aria-pressed={!isOverview} onClick={() => setMode("cards")}>
          Tüm işlevleri göster
        </button>
        {onRefresh && (
          <button
            aria-label="Yerel kaydı yeniden oku"
            className="map-reread"
            onClick={onRefresh}
            disabled={refreshing}
            title="Kaydedilmiş kaynakları yeniden okur; test gözlem tarihlerini değiştirmez."
          >
            <span aria-hidden="true">↻</span>
          </button>
        )}
      </div>
      {changeNotice && (
        <p className="map-change-notice" role="status">
          {changeNotice}
        </p>
      )}
      <details
        className="map-filter-panel"
        ref={filterPanel}
        open={filtersOpen}
        onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
      >
        <summary>Filtrele</summary>
        <div className="map-search-row">
          <label className="map-search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={search}
              aria-label="Yetenek ara"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Fatura, SMS, Nebim…"
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
          <label className="map-channel-label">
            Kanal
            <select
              aria-label="Kanal filtresi"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="">Tüm kanallar</option>
              {channels.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {hasFilters && <button onClick={clear}>Temizle</button>}
        </div>
        {!isOverview && (
          <div className="map-filters" aria-label="Yetenek grupları">
            <button aria-pressed={!group} onClick={() => setGroup("")}>
              Tümü
            </button>
            {groups.map((g) => (
              <button
                key={g}
                aria-pressed={group === g}
                onClick={() => setGroup(group === g ? "" : g)}
              >
                <span aria-hidden="true">{icons[g]}</span> {g}
              </button>
            ))}
          </div>
        )}
        <div className="map-providers" aria-label="Sağlayıcı filtreleri">
          <span>Sağlayıcı</span>
          {providers.map((p) => (
            <button
              key={p}
              aria-pressed={provider === p}
              onClick={() => setProvider(provider === p ? "" : p)}
            >
              {p}
            </button>
          ))}
        </div>
      </details>
      {((provider && !providers.includes(provider)) ||
        (channel && !channels.includes(channel)) ||
        (group && !groups.includes(group))) && (
        <p className="map-change-notice" role="status">
          Korunan filtre yeni kaynak kaydında bulunmuyor. Temizle ile yeni
          kapsamı görebilirsin.
        </p>
      )}
      {isOverview ? (
        <>
          <p className="map-verification">
            {cards.every((c) => ["unknown", "not-run"].includes(c.live.state))
              ? "Canlı doğrulanmadı"
              : "Canlı durum işlev bazında"}
          </p>
          <div className="map-room-grid" aria-label="İşlev özeti">
            {rooms.map((room) => (
              <button
                key={room.name}
                className="map-room"
                aria-label={`${room.name} işlevlerini aç`}
                onClick={() => {
                  setGroup(room.name);
                  setMode("cards");
                  setFocusResults(true);
                }}
              >
                <span className="map-room-title">
                  <span aria-hidden="true" className="map-glyph">
                    {icons[room.name]}
                  </span>
                  <strong>{room.name}</strong>
                  <span>{room.cards.length} işlev</span>
                </span>
                <span className="map-room-functions">
                  {room.cards
                    .map((c: MapCard) => shortNames[c.id] || c.title)
                    .join(" · ")}
                </span>
                {room.cards.some((c) => c.tests.state === "failed") && (
                  <span className="map-failed">Başarısız test var</span>
                )}
                {room.cards.some(
                  (c) => c.sourceStatus === "stale-snapshot",
                ) && (
                  <span className="map-source-warning">Kaynak kaydı eski</span>
                )}
                {room.hasMissingEvidence && (
                  <span className="map-source-warning">
                    Kaynak kanıtı eksik
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div
          className="map-grid"
          ref={results}
          tabIndex={-1}
          aria-label="İşlev sonuçları"
        >
          {filtered.map((c: MapCard) => (
            <button
              key={c.id}
              ref={(node) => {
                if (node) cardButtons.current.set(c.id, node);
                else cardButtons.current.delete(c.id);
              }}
              className="map-card"
              aria-label={`${c.title} ayrıntısı`}
              onClick={(e) => {
                opener.current = e.currentTarget;
                history.pushState(
                  {
                    ...history.state,
                    agentariumCapability: c.id,
                    agentariumCapabilityIdentity: identity,
                  },
                  "",
                );
                setChangeNotice("");
                setSelectedId(c.id);
              }}
            >
              <span className="map-card-heading">
                <span className="map-glyph" aria-hidden="true">
                  {icons[c.group]}
                </span>
                <strong>{c.title}</strong>
                <span aria-hidden="true" className="map-open">
                  ↗
                </span>
              </span>

              <span className="map-card-channels">
                {c.channels.join(" · ") || "Kanal bilinmiyor"}
              </span>
              <span className="map-card-status">
                <span
                  className={c.tests.state === "failed" ? "map-failed" : ""}
                >
                  {c.tests.state === "reported"
                    ? "Test kaydı var"
                    : c.tests.state === "failed"
                      ? "Test başarısız"
                      : c.tests.state === "not-run"
                        ? "Test çalıştırılmadı"
                        : "Test kaydı yok"}
                </span>
                <span className={c.live.state === "failed" ? "map-failed" : ""}>
                  {c.live.state === "failed"
                    ? "Canlı test başarısız"
                    : ["unknown", "not-run"].includes(c.live.state)
                      ? "Canlı doğrulanmadı"
                      : "Canlı durum bilinmiyor"}
                </span>
              </span>
              {["unverified", "stale-snapshot"].includes(c.sourceStatus) && (
                <span className="map-source-warning">
                  {c.sourceStatus === "unverified"
                    ? "Kaynak uyuşmuyor"
                    : "Kaynak kaydı eski"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {!filtered.length && (
        <div className="map-empty">
          <p>
            {cards.length
              ? "Bu filtrelerle eşleşen yetenek yok."
              : "Bu kaynak kaydında işlev bulunmuyor; agentın yeteneksiz olduğu anlamına gelmez."}
          </p>
          <button onClick={clear}>Filtreleri temizle</button>
        </div>
      )}
      <details className="map-context">
        <summary>Kaynak ayrıntıları</summary>
        <p>
          GitHub · {context.branch}{" "}
          <code>{context.commit || "commit bilinmiyor"}</code>
        </p>
        <p>{context.scope}</p>
        {context.deployment && (
          <p>
            <a href={context.deployment.url} target="_blank" rel="noreferrer">
              {context.deployment.label}
            </a>{" "}
            · Okuma: {date(context.deployment.at)}
            <br />
            {context.deployment.scope}
          </p>
        )}
        {context.review && (
          <p>
            <a href={context.review.url} target="_blank" rel="noreferrer">
              {context.review.label}
            </a>
            <br />
            {context.review.scope}
          </p>
        )}
      </details>
      <dialog
        ref={dialog}
        className="map-dialog"
        aria-labelledby="capability-detail-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={close}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {selected && (
          <div className="map-detail">
            <div className="map-detail-heading">
              <div>
                <h2 id="capability-detail-title">{selected.title}</h2>
              </div>
              <button onClick={close} aria-label="Ayrıntıyı kapat">
                ×
              </button>
            </div>
            {refreshError && (
              <p className="map-refresh-notice" role="status">
                {refreshError} Son başarılı görünüm korunuyor.
              </p>
            )}
            <p>{selected.summary}</p>
            <p className="map-verification">
              {selected.live.state === "failed"
                ? "Canlı test başarısız"
                : "Canlı doğrulanmadı"}
              {selected.tests.state === "failed" ? " · Test başarısız" : ""}
            </p>
            {changeNotice && <p role="status">{changeNotice}</p>}
            <div className="map-detail-channels">
              {selected.channels.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <details className="map-detail-fold">
              <summary>Sağlayıcılar ve koşullar</summary>
              <Providers providers={selected.providers} />
              <div className="map-condition">
                <b>Koşul</b>
                <p>{selected.condition}</p>
                {selected.id === "review" && (
                  <p>
                    Webde güvenilir telefon doğrulaması yoksa telefon + ad-soyad
                    alternatifi kapalıdır; form veya doğrulanmış sipariş yolu
                    ayrıdır.
                  </p>
                )}
              </div>
            </details>
            <details className="map-detail-fold">
              <summary>Test ve canlı kanıtı</summary>
              <div className="map-detail-axes">
                <section>
                  <h3>
                    Geliştirme ·{" "}
                    {statusLabel("development", selected.development.state)}
                  </h3>
                  <p>{selected.development.summary}</p>
                  <small>{date(selected.development.at)}</small>
                </section>
                <section>
                  <h3>
                    Test kanıtı · {statusLabel("tests", selected.tests.state)}
                  </h3>
                  <p>{selected.tests.summary}</p>
                  <small>Test gözlemi: {date(selected.tests.at)}</small>
                  <p>{selected.tests.scope}</p>
                </section>
                <section>
                  <h3>
                    Canlı kanıtı · {statusLabel("live", selected.live.state)}
                  </h3>
                  <p>{selected.live.summary}</p>
                </section>
              </div>
            </details>
            <details className="map-tools">
              <summary>Tool ve kaynaklar</summary>
              <div className="map-tool-names">
                {selected.tools.map((t) => (
                  <code key={t}>{t}</code>
                ))}
              </div>
              <p>
                Kaynak okuması: {date(selected.sourceRecord?.at)} ·{" "}
                {selected.sourceRecord?.origin || "Kaynak belirtilmedi"}
              </p>
              {onRefresh && (
                <button onClick={onRefresh} disabled={refreshing}>
                  {refreshing ? "Kayıt okunuyor…" : "Yerel kaydı yeniden oku"}
                </button>
              )}
              <ul>
                {selected.evidence.map((e, i) => (
                  <li key={i}>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        {e.file.split("/").slice(-2).join("/")}:{e.line} ↗
                      </a>
                    ) : (
                      <code>
                        {e.file}:{e.line}
                      </code>
                    )}{" "}
                    <code>{e.sha.slice(0, 8)}</code>
                  </li>
                ))}
              </ul>
            </details>
            <button className="map-back" onClick={close}>
              Haritaya dön
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
