// Normalize only metadata from the explicitly mapped PR's current head.
export function reviewSignal(reviews, pull) {
  if (!Array.isArray(reviews) || reviews.length >= 100) return "unknown";
  const latest = new Map();
  for (const review of reviews) {
    if (!review.user?.login || review.state === "COMMENTED") continue;
    latest.set(review.user.login, review);
  }
  const current = [...latest.values()].filter(
    (r) => r.commit_id === pull.head?.sha,
  );
  if (current.some((r) => r.state === "CHANGES_REQUESTED"))
    return "changes-requested";
  if (current.some((r) => r.state === "APPROVED")) return "approved";
  return pull.requested_reviewers?.length || pull.requested_teams?.length
    ? "requested"
    : "unknown";
}

export function ciSignal(checks, statuses, pullUrl) {
  const runs = Array.isArray(checks?.check_runs) ? checks.check_runs : [];
  const commits = Array.isArray(statuses?.statuses) ? statuses.statuses : [];
  const items = [
    ...runs.map((r) => ({
      name: String(r.name || "Check").slice(0, 180),
      state:
        r.status !== "completed"
          ? "pending"
          : [
                "failure",
                "timed_out",
                "cancelled",
                "action_required",
                "startup_failure",
                "stale",
              ].includes(r.conclusion)
            ? "failure"
            : ["success", "neutral", "skipped"].includes(r.conclusion)
              ? "success"
              : "unknown",
      // Provider URLs may point to arbitrary hosts. Link to the PR's checks instead.
      url: `${pullUrl}/checks`,
    })),
    ...commits.map((s) => ({
      name: String(s.context || "Status").slice(0, 180),
      state: ["failure", "error"].includes(s.state)
        ? "failure"
        : s.state === "success"
          ? "success"
          : s.state === "pending"
            ? "pending"
            : "unknown",
      url: `${pullUrl}/checks`,
    })),
  ];
  const complete =
    Array.isArray(checks?.check_runs) &&
    Array.isArray(statuses?.statuses) &&
    checks.total_count <= 100 &&
    statuses.total_count <= 100;
  return {
    state: items.some((i) => i.state === "failure")
      ? "failure"
      : items.some((i) => i.state === "pending")
        ? "pending"
        : complete && items.length && items.every((i) => i.state === "success")
          ? "success"
          : "unknown",
    complete,
    items,
  };
}

export async function readPullSignals(pull, repository, read) {
  const unknown = {
    review: "unknown",
    ci: { state: "unknown", complete: false, items: [] },
  };
  if (!/^[a-f0-9]{40}$/.test(pull.head?.sha || "")) return unknown;
  const base = `https://api.github.com/repos/${repository}`;
  const results = await Promise.allSettled([
    read(`${base}/pulls/${pull.number}/reviews?per_page=100`),
    read(
      `${base}/commits/${pull.head.sha}/check-runs?filter=latest&per_page=100`,
    ),
    read(`${base}/commits/${pull.head.sha}/status?per_page=100`),
  ]);
  const value = (i) =>
    results[i].status === "fulfilled" ? results[i].value : null;
  return {
    review: reviewSignal(value(0), pull),
    ci: ciSignal(
      value(1),
      value(2),
      `https://github.com/${repository}/pull/${pull.number}`,
    ),
  };
}
