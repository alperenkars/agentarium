export function filterCapabilities(
  cards,
  { query = "", group = "", provider = "", channel = "" } = {},
) {
  const normalize = (text) =>
    String(text || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return cards.filter(
    (card) =>
      (!group || card.group === group) &&
      (!provider || card.providers.some((p) => p.name === provider)) &&
      (!channel || card.channels.includes(channel)) &&
      terms.every((term) =>
        normalize(
          [
            card.title,
            card.summary,
            card.tool,
            ...card.tools,
            ...card.providers.map((p) => p.name),
            ...card.channels,
          ].join(" "),
        ).includes(term),
      ),
  );
}
export function statusLabel(axis, state) {
  return (
    {
      development: {
        main: "main kaydı",
        branch: "dalda",
        unknown: "bilinmiyor",
      },
      tests: {
        reported: "test kaydı",
        unknown: "kayıt yok",
        "not-run": "çalıştırılmadı",
        failed: "başarısız",
      },
      live: {
        unknown: "kanıt yok",
        failed: "başarısız",
        "not-run": "doğrulanmadı",
      },
    }[axis]?.[state] || "bilinmiyor"
  );
}

export function groupCapabilities(cards) {
  const groups = new Map();
  for (const card of cards) {
    if (!groups.has(card.group))
      groups.set(card.group, {
        name: card.group,
        cards: [],
        providers: [],
        hasMissingEvidence: false,
      });
    const group = groups.get(card.group);
    group.cards.push(card);
    for (const provider of card.providers)
      if (!group.providers.some((p) => p.name === provider.name))
        group.providers.push(provider);
    group.hasMissingEvidence ||= card.sourceStatus === "unverified";
  }
  return [...groups.values()];
}
export function readMapView(storage, key) {
  const empty = {
    query: "",
    group: "",
    provider: "",
    channel: "",
    mode: "overview",
  };
  try {
    const saved = JSON.parse(storage.getItem(key) || "null");
    if (
      !saved ||
      !["query", "group", "provider", "channel"].every(
        (k) => typeof saved[k] === "string" && saved[k].length <= 240,
      ) ||
      !["overview", "cards"].includes(saved.mode)
    )
      return empty;
    return {
      query: saved.query,
      group: saved.group,
      provider: saved.provider,
      channel: saved.channel,
      mode: saved.mode,
    };
  } catch {
    return empty;
  }
}
