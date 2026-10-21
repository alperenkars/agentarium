// Exact source identities, never a display-name/brand match. Existing data wins.
export function markExamples(agents, seed) {
  return agents.map((agent) => {
    if (agent.demo && agent.tracking) return { ...agent, demo: false };
    const example = seed.find((s) => s.id === agent.id);
    const unchanged =
      example &&
      !agent.tracking &&
      !agent.updates &&
      ["name", "role", "shape", "color", "tags", "milestones"].every(
        (field) =>
          JSON.stringify(agent[field]) === JSON.stringify(example[field]),
      );
    return unchanged && agent.demo === undefined
      ? { ...agent, demo: true }
      : agent;
  });
}
export function mergeSourceAgents(agents, sources) {
  const result = [...agents];
  for (const source of sources) {
    if (
      result.some(
        (a) =>
          a.tracking?.repositoryId === source.repositoryId &&
          a.tracking?.folder === source.folder,
      )
    )
      continue;
    const id = `source:${source.repositoryId}:${source.folder}`;
    if (result.some((a) => a.id === id)) continue;
    result.push({
      id,
      name: source.name,
      role: `Local source · ${source.agentKey}`,
      shape: 0,
      color: "#b9cbb0",
      avatarId: `styloo-${["student", "knight", "merchant", "archer", "ninja"][Array.from(id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5]}`,
      tags: [],
      milestones: [],
      localSource: true,
      tracking: {
        repositoryId: source.repositoryId,
        repositoryName: source.repositoryName,
        folder: source.folder,
        branchMode: "all-local-and-remote-tracking",
        lastSyncedAt: "",
        branchCount: 0,
        truncated: false,
        limit: 5000,
        changes: [],
      },
    });
  }
  return result.length === agents.length ? agents : result;
}
