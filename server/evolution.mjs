import ts from "typescript";
import { createHash } from "node:crypto";

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const excerpt = (s) =>
  s
    .replace(
      /https?:\/\/\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:sk-|ghp_|github_pat_)[\w-]+/gi,
      "[redacted]",
    )
    .slice(0, 1800);
const plain = (s) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const property = (node, name) =>
  node?.properties?.find((p) => p.name?.getText().replace(/["']/g, "") === name)
    ?.initializer;
const text = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : "";
const names = {
  transfer_call_to_human: "Human handoff",
  get_magaza_listesi: "Store lookup",
  get_order_status: "Order-status lookup",
  lookup_order: "Order lookup",
};
function toolsIn(source) {
  const result = new Map();
  const tree = ts.createSourceFile(
    "agent.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const obj = node.initializer;
      if (
        property(obj, "parameters") &&
        property(obj, "execute") &&
        property(obj, "description")
      ) {
        const parameters = property(property(obj, "parameters"), "properties");
        result.set(node.name.getText(tree), {
          description: plain(text(property(obj, "description"))),
          fields:
            parameters?.properties
              ?.map((p) => p.name?.getText(tree).replace(/["']/g, ""))
              .sort() || [],
          line:
            tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

// Explicit pilot rubric. These detect instructions, not successful behavior or deployment.
const instructions = [
  {
    key: "transfer-consent",
    title: "Ask permission before transferring a caller",
    description:
      "Handoff instructions now require explicit permission after the transfer offer.",
    test: (s) =>
      /transfer_call_to_human/.test(s) &&
      /sonraki tur|next turn/.test(s) &&
      /acik.*onay|explicit.*consent/.test(s),
  },
  {
    key: "transfer-hours",
    title: "Keep human transfers within service hours",
    description: "Handoff instructions specify the 09:00–18:00 service window.",
    test: (s) =>
      /temsilci|representative/.test(s) &&
      /mesai|service hours/.test(s) &&
      /09[.:]00/.test(s) &&
      /18[.:]00/.test(s),
  },
  {
    key: "partner-returns",
    title: "Clarify returns for partner-sold items",
    description:
      "Return instructions distinguish partner-sold items from items returnable in stores.",
    test: (s) =>
      /is ortaklarimizdan/.test(s) && /iadesi magaza.*yapilamamaktadir/.test(s),
  },
];

export function detectChanges(before, after, file) {
  if (
    !/\.[cm]?[jt]sx?$/.test(file) ||
    /(?:^|\/)(?:__tests__|test|tests)\/|\.(?:test|spec)\./.test(file)
  )
    return [];
  const proposals = [];
  const oldTools = toolsIn(before),
    newTools = toolsIn(after);
  for (const name of new Set([...oldTools.keys(), ...newTools.keys()])) {
    // Unknown names need a future configured vocabulary, not invented human meaning.
    if (!names[name]) continue;
    const old = oldTools.get(name),
      next = newTools.get(name);
    if ((!old && before.includes(name)) || (!next && after.includes(name)))
      continue;
    const action = !old
      ? "added"
      : !next
        ? "removed"
        : JSON.stringify(old.fields) !== JSON.stringify(next.fields)
          ? "inputs changed"
          : null;
    if (!action) continue;
    const businessFields = new Set([
      "city",
      "sehir",
      "brand",
      "marka_adi",
      "area",
      "konum",
      "order_id",
      "orderId",
    ]);
    const fieldChanges = [
      ...(old?.fields || []),
      ...(next?.fields || []),
    ].filter(
      (field) =>
        !(old?.fields || []).includes(field) ||
        !(next?.fields || []).includes(field),
    );
    if (
      action === "inputs changed" &&
      !fieldChanges.some((field) => businessFields.has(field))
    )
      continue;
    proposals.push({
      key: `tool:${name}:${hash([old?.fields ?? null, next?.fields ?? null])}`,
      toolName: name,
      changeType: action,
      title: `${names[name]} ${action}`,
      description:
        action === "added"
          ? `Introduced a tool for ${names[name].toLowerCase()}.`
          : action === "removed"
            ? `Removed the tool for ${names[name].toLowerCase()}.`
            : `Changed the information accepted by ${names[name].toLowerCase()}.`,
      kind: "Capability",
      file,
      beforeLine: old?.line,
      afterLine: next?.line,
      before: old
        ? `${names[name]} defined; inputs: ${old.fields.join(", ") || "none"}`
        : "Not defined in this file",
      after: next
        ? `${names[name]} defined; inputs: ${next.fields.join(", ") || "none"}`
        : "Not defined in this file",
    });
  }
  // Inspect literal text only. Comments, test fixtures and function names are not instructions.
  const literals = (source) => {
    const tree = ts.createSourceFile(
      "agent.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const found = [];
    function visit(node) {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      )
        node.text.split("\n").forEach((line, offset) =>
          found.push({
            text: plain(line),
            original: excerpt(line.trim()),
            line:
              tree.getLineAndCharacterOfPosition(node.getStart(tree)).line +
              1 +
              offset,
          }),
        );
      ts.forEachChild(node, visit);
    }
    visit(tree);
    return found;
  };
  if (/agentConfig\.[jt]s$|prompt\.[jt]s$/i.test(file)) {
    const previous = literals(before),
      current = literals(after);
    for (const rule of instructions) {
      const next = current.find((line) => rule.test(line.text));
      if (next && !previous.some((line) => rule.test(line.text)))
        proposals.push({
          key: `instruction:${rule.key}`,
          title: rule.title,
          description: rule.description,
          kind: "Improvement",
          file,
          afterLine: next.line,
          before: "This explicit instruction was not detected",
          after: next.original,
        });
    }
  }
  return proposals;
}

export async function analyzeHistory(repository, history, git) {
  if (!history || history.shallow)
    throw new Error("Import full local history first.");
  const eligible = history.changes.filter(
    (c) => !c.merge && !c.unverified && c.refs?.length,
  );
  const changes = eligible.slice(0, 200);
  const groups = new Map();
  const cache = new Map();
  async function source(revision, file) {
    if (!revision) return "";
    const key = `${revision}:${file}`;
    if (cache.has(key)) return cache.get(key);
    const entry = await git(repository.root, [
      "ls-tree",
      "-z",
      revision,
      "--",
      `:(literal)${file}`,
    ]);
    if (!entry) return "";
    const [mode, type, oid] = entry.split("\t")[0].split(" ");
    if (type !== "blob" || mode === "120000" || !/^[a-f0-9]{40,64}$/.test(oid))
      return "";
    const size = Number(
      (await git(repository.root, ["cat-file", "-s", oid])).trim(),
    );
    if (size > 256 * 1024)
      throw new Error("A source file exceeds the analysis limit.");
    const content = await git(repository.root, ["cat-file", "blob", oid]);
    cache.set(key, content);
    return content;
  }
  for (const commit of changes) {
    const findings = [];
    for (const file of commit.files) {
      if (
        !file.startsWith(history.folder + "/") ||
        !/\.[cm]?[jt]sx?$/.test(file) ||
        /\.(test|spec)\./.test(file)
      )
        continue;
      const before = await source(commit.parents?.[0], file),
        after = await source(commit.sha, file);
      findings.push(...detectChanges(before, after, file));
    }
    for (const finding of findings) {
      if (
        finding.toolName &&
        findings.some(
          (other) =>
            other.toolName === finding.toolName &&
            ((finding.changeType === "added" &&
              other.changeType === "removed") ||
              (finding.changeType === "removed" &&
                other.changeType === "added")),
        )
      )
        continue;
      // Only collapse exact changes. Different branches may carry different versions.
      const id = hash([
        repository.id,
        history.folder,
        finding.key,
        finding.before,
        finding.after,
      ]);
      const evidence = {
        sha: commit.sha,
        date: commit.date,
        file: finding.file,
        beforeLine: finding.beforeLine,
        afterLine: finding.afterLine,
        before: finding.before,
        after: finding.after,
      };
      const group = groups.get(id) || {
        id,
        title: finding.title,
        description: finding.description,
        kind: finding.kind,
        date: commit.date.slice(0, 10),
        status: "proposed",
        evidence: [],
      };
      if (
        !group.evidence.some(
          (e) => e.sha === evidence.sha && e.file === finding.file,
        )
      )
        group.evidence.push(evidence);
      if (commit.date.slice(0, 10) < group.date)
        group.date = commit.date.slice(0, 10);
      groups.set(id, group);
    }
  }
  return {
    proposals: [...groups.values()],
    analyzed: changes.length,
    eligible: eligible.length,
    at: new Date().toISOString(),
    checkedShas: changes.map((c) => c.sha),
    detector: "local-rules-v2",
  };
}
