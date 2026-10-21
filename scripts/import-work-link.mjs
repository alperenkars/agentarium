// ID-only local association import. No network, ticket creation or provider writes.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { configuredRepositories } from "../server/tracking.mjs";
const execute = promisify(execFile);
function fields(value, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error(
      "Invalid work-link fields; credentials and customer text are not accepted.",
    );
}
export function validateWorkLink(link) {
  fields(link, [
    "schemaVersion",
    "repository",
    "agentUID",
    "folder",
    "jira",
    "pullRequest",
  ]);
  fields(link.jira, ["site", "issueKey"]);
  fields(link.pullRequest, ["number", "url"]);
  if (
    link.schemaVersion !== 1 ||
    typeof link.repository !== "string" ||
    !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(
      link.repository,
    ) ||
    typeof link.agentUID !== "string" ||
    !/^[a-z0-9]+$/.test(link.agentUID) ||
    ["shared", "tests"].includes(link.agentUID) ||
    link.folder !== `src/agents/${link.agentUID}` ||
    !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(link.jira.issueKey || "") ||
    !Number.isSafeInteger(link.pullRequest.number) ||
    link.pullRequest.number < 1 ||
    link.pullRequest.url !==
      `https://github.com/${link.repository}/pull/${link.pullRequest.number}`
  )
    throw new Error("Invalid exact agent/Jira/PR association.");
  const site = new URL(link.jira.site);
  if (
    site.protocol !== "https:" ||
    site.origin !== link.jira.site ||
    site.username ||
    site.password
  )
    throw new Error("Jira site must be an HTTPS origin without credentials.");
  return link;
}
export function mergeWorkLink(manifest, input, repositoryId) {
  const link = validateWorkLink(input);
  if (
    !/^[a-z0-9-]+$/.test(repositoryId || "") ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.agents)
  )
    throw new Error(
      "Choose an exact configured repository ID and a schemaVersion 1 manifest.",
    );
  const matches = manifest.agents.filter(
    (agent) =>
      agent.repositoryId === repositoryId && agent.folder === link.folder,
  );
  if (matches.length > 1)
    throw new Error("Conflicting mappings; do not choose one silently.");
  const previous = matches[0];
  if (
    previous &&
    (previous.agentKey !== link.agentUID ||
      (previous.github && previous.github.repository !== link.repository) ||
      (previous.jira && previous.jira.site !== link.jira.site))
  )
    throw new Error(
      "Existing mapping belongs to another agent, repository or Jira site.",
    );
  const entry = previous || {
    repositoryId,
    folder: link.folder,
    agentKey: link.agentUID,
    capabilities: [],
  };
  if (
    (entry.jira &&
      (!Array.isArray(entry.jira.issueKeys) ||
        entry.jira.issueKeys.some(
          (key) => !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(key),
        ))) ||
    (entry.github &&
      (!Array.isArray(entry.github.pullNumbers) ||
        entry.github.pullNumbers.some(
          (number) => !Number.isSafeInteger(number) || number < 1,
        )))
  )
    throw new Error(
      "Existing mapped IDs are malformed; review before importing.",
    );
  const workLinks = entry.workLinks || [];
  if (
    !Array.isArray(workLinks) ||
    workLinks.some(
      (value) =>
        !Number.isSafeInteger(value.pullNumber) ||
        !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(value.jiraKey || ""),
    )
  )
    throw new Error("Invalid saved work associations.");
  if (
    workLinks.some(
      (value) =>
        value.pullNumber === link.pullRequest.number &&
        value.jiraKey !== link.jira.issueKey,
    )
  )
    throw new Error("This PR already has another primary Jira association.");
  const knownLink = workLinks.some(
    (value) =>
      value.pullNumber === link.pullRequest.number &&
      value.jiraKey === link.jira.issueKey,
  );
  const issues = [
    ...new Set([...(entry.jira?.issueKeys || []), link.jira.issueKey]),
  ];
  const pulls = [
    ...new Set([...(entry.github?.pullNumbers || []), link.pullRequest.number]),
  ];
  if (issues.length > 10 || pulls.length > 10)
    throw new Error(
      "Mapped-record limit reached; review the mapping without silently dropping work.",
    );
  if (
    previous &&
    knownLink &&
    issues.length === (entry.jira?.issueKeys?.length || 0) &&
    pulls.length === (entry.github?.pullNumbers?.length || 0)
  )
    return manifest;
  const updated = {
    ...entry,
    jira: { ...entry.jira, site: link.jira.site, issueKeys: issues },
    github: {
      ...entry.github,
      repository: link.repository,
      pullNumbers: pulls,
    },
    workLinks: knownLink
      ? workLinks
      : [
          ...workLinks,
          { jiraKey: link.jira.issueKey, pullNumber: link.pullRequest.number },
        ],
  };
  return {
    ...manifest,
    agents: previous
      ? manifest.agents.map((agent) => (agent === previous ? updated : agent))
      : [...manifest.agents, updated],
  };
}
function remoteRepository(value) {
  const ssh = /^git@github\.com:([^\s]+?)(?:\.git)?$/.exec(value.trim());
  if (ssh) return ssh[1];
  const url = new URL(value.trim());
  if (
    url.hostname !== "github.com" ||
    !["https:", "ssh:"].includes(url.protocol) ||
    url.password ||
    (url.username && url.username !== "git") ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Configured source must use its own GitHub remote without embedded credentials.",
    );
  return url.pathname.slice(1).replace(/\.git$/, "");
}
async function jsonFile(file, limit) {
  const raw = await fs.readFile(file, "utf8");
  if (Buffer.byteLength(raw) > limit)
    throw new Error("Local input exceeds its supported bound.");
  return { raw, value: JSON.parse(raw) };
}
export async function importWorkLink(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (
      options[flag] ||
      ![
        "--input",
        "--manifest",
        "--local-config",
        "--repository-id",
        "--write",
      ].includes(flag)
    )
      throw new Error("Unknown or duplicate import option.");
    if (flag === "--write") options[flag] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error("Missing import option value.");
      options[flag] = args[++i];
    }
  }
  if (!options["--input"] || !options["--repository-id"])
    throw new Error(
      "Pass --input and your local --repository-id; dry run is the default.",
    );
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifestPath =
    options["--manifest"] || path.join(root, ".agentarium/capabilities.json");
  const localConfig =
    options["--local-config"] || path.join(root, ".agentarium.local.json");
  const link = validateWorkLink(
    (await jsonFile(options["--input"], 8192)).value,
  );
  const repositories = await configuredRepositories(localConfig);
  const repository = repositories.find(
    (item) =>
      item.id === options["--repository-id"] &&
      item.folders.includes(link.folder),
  );
  if (!repository)
    throw new Error(
      "The exact repository ID and agent folder must be in your local allowlist.",
    );
  const { stdout } = await execute(
    "git",
    ["-C", repository.root, "remote", "get-url", "origin"],
    {
      encoding: "utf8",
      timeout: 8000,
      maxBuffer: 8192,
      env: {
        PATH: process.env.PATH,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
    },
  );
  if (remoteRepository(stdout) !== link.repository)
    throw new Error(
      "Work-link repository differs from the allowlisted checkout remote.",
    );
  let before = { raw: null, value: { schemaVersion: 1, agents: [] } };
  try {
    if ((await fs.lstat(manifestPath)).isSymbolicLink())
      throw new Error("Use a regular private manifest file.");
    before = await jsonFile(manifestPath, 1024 * 1024);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const next = mergeWorkLink(before.value, link, options["--repository-id"]);
  const changed = next !== before.value;
  if (options["--write"] && changed) {
    let current = null;
    try {
      current = await fs.readFile(manifestPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current !== before.raw)
      throw new Error(
        "Manifest changed during import; reread before applying.",
      );
    await fs.mkdir(path.dirname(manifestPath), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = `${manifestPath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(next, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      await fs.rename(temporary, manifestPath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  return {
    dryRun: !options["--write"],
    changed,
    repositoryId: options["--repository-id"],
    agentUID: link.agentUID,
    jiraKey: link.jira.issueKey,
    pullNumber: link.pullRequest.number,
    statusImported: false,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  importWorkLink(process.argv.slice(2))
    .then((value) => console.log(JSON.stringify(value, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
