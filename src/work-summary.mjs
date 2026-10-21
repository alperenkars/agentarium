const normalize = (value = "") =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase();
export function summarizeWork(connections) {
  const rows = ["jira", "github"]
    .flatMap((kind) => {
      const connection = connections[kind];
      return connection.items.map((item) => {
        const status = normalize(item.status);
        const terminal =
          kind === "github"
            ? ["merged", "closed"].includes(status)
            : item.category === "done" ||
              [
                "done",
                "closed",
                "resolved",
                "cancelled",
                "canceled",
                "tamamlandi",
                "iptal",
              ].includes(status);
        const pendingReview =
          !terminal &&
          !item.draft &&
          (kind === "github"
            ? item.review === "requested"
            : /review|inceleme/.test(status));
        const blocked =
          !terminal &&
          (item.ci?.state === "failure" ||
            item.review === "changes-requested" ||
            /blocked|engell/.test(status));
        return {
          ...item,
          kind,
          terminal,
          pendingReview,
          blocked,
          saved: connection.state !== "connected",
        };
      });
    })
    .sort(
      (a, b) =>
        (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) ||
        a.id.localeCompare(b.id),
    );
  const open = rows.filter((r) => !r.terminal);
  const blocked = open.filter((r) => r.blocked);
  const reviews = open.filter((r) => r.pendingReview);
  const ci = open.filter((r) => ["failure", "pending"].includes(r.ci?.state));
  const target =
    open.find((r) => r.ci?.state === "failure") ||
    blocked[0] ||
    open.find((r) => r.draft) ||
    reviews[0] ||
    open[0];
  let action =
    "Bağlı kayıtlarda açık iş görünmüyor. Diğer işler bu kapsama dahil olmayabilir.";
  if (target)
    action =
      target.ci?.state === "failure"
        ? "Başarısız CI kontrolünü incele."
        : target.review === "changes-requested"
          ? "İncelemede istenen değişiklikleri ele al."
          : target.blocked
            ? "İşi engelleyen durumu netleştir."
            : target.draft
              ? "Taslak PR’yi tamamla ve incelemeye hazırla."
              : target.pendingReview
                ? "Bekleyen incelemeyi takip et."
                : target.ci?.state === "pending"
                  ? "Devam eden CI kontrolünü takip et."
                  : "İşin sonraki adımını Jira / PR üzerinden netleştir.";
  return { rows, open, blocked, reviews, ci, next: { target, action } };
}

export function safeWorkUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "github.com" ||
        /^[a-z0-9-]+\.atlassian\.net$/.test(url.hostname))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
