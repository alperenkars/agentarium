export function chronological(events) {
  return [...events].sort((a, b) => b.date.localeCompare(a.date));
}
export function approvedHistory(agent) {
  const updates =
    agent.updates &&
    agent.tracking &&
    agent.updates?.repositoryId === agent.tracking?.repositoryId &&
    agent.updates?.folder === agent.tracking?.folder
      ? agent.updates.proposals
      : [];
  return [
    ...agent.milestones,
    ...updates
      .filter((p) => p.status === "approved")
      .map((p) => ({
        id: `review:${p.id}`,
        date: p.date,
        kind: p.kind,
        title: p.title,
        description: p.description,
        changeEvidence: p.evidence,
      })),
  ];
}
// SQLite owns complete Git history. Keep a bounded offline browser copy only.
export function cacheWorkspace(agents) {
  return agents.map((agent) => {
    const tracking = agent.tracking;
    if (!tracking?.archiveVersion || tracking.changes.length <= 20)
      return agent;
    return {
      ...agent,
      tracking: {
        ...tracking,
        cached: true,
        totalCount: tracking.totalCount ?? tracking.changes.length,
        changes: tracking.changes.slice(0, 20),
      },
    };
  });
}
export function filterAgents(agents, query, tag) {
  const text = query.trim().toLocaleLowerCase();
  return agents.filter(
    (a) =>
      (!tag || a.tags.includes(tag)) &&
      [a.name, a.role, ...a.tags].join(" ").toLocaleLowerCase().includes(text),
  );
}
export function safeEvidence(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
