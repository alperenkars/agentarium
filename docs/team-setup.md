# Team setup and PR work-link handoff

Agentarium stays separate from the backend. Its existing Özet screen reads exact
mapped Jira/PR records. It is not the Slack notification sender and does not infer
completed/live work from closed or terminal records.

## Per-teammate setup

1. Clone the team's approved Agentarium revision with your own authorized account.
   Use Node 22.13+, then `npm ci`.
2. Copy `.agentarium.local.example.json` to ignored `.agentarium.local.json`.
   Choose your own repository ID and absolute local backend checkout path. The
   example path is a placeholder; no developer's Mac path is required.
3. Use the backend's approved `prepare-pr-description.js` workflow to prepare a
   source-backed PR description. It keeps one existing Jira ticket per work item,
   exact agent identity, checks and separate main/live claims. After an actual PR
   exists it can export the ID-only `work-link.json` contract below.
4. Preview the association import from the Agentarium repository:

```sh
node scripts/import-work-link.mjs --input ../backend/.pr-drafts/work-link.json --repository-id my-backend
```

The input path and repository ID are yours. The importer verifies the exact local
allowlisted folder and its GitHub origin against the handoff; it makes no network
call. The default dry run does not create a manifest or change any file. After
reviewing the displayed IDs, repeat with `--write` to update only ignored
`.agentarium/capabilities.json`.

5. Run `npm run dev`, open the printed local address and select **Özet**. The
   association alone is not status evidence. Existing process credentials may
   provide bounded GET reads. Without existing access, live reads stay missing or
   unknown; dated authorized saved reads remain dated. Do not copy another person's
   API token, auth.json, browser session or saved customer data. No credential,
   permission or provider account is created by setup/import.

## Minimal transfer contract

The schemaVersion 1 JSON contains only these fields (all values here are synthetic):

```json
{
  "schemaVersion": 1,
  "repository": "example/backend",
  "agentUID": "example",
  "folder": "src/agents/example",
  "jira": { "site": "https://example.atlassian.net", "issueKey": "VAG-123" },
  "pullRequest": { "number": 99, "url": "https://github.com/example/backend/pull/99" }
}
```

Do not import this example as live work. The backend exports actual supplied or
created PR URLs. An import never creates another Jira ticket, writes GitHub/Slack,
copies customer content or imports a deployment/completion status. The same agent
can aggregate several work items; each imported work-link has one primary Jira
source. Conflicting primary Jira links for the same PR are rejected. Exact repeats
do not rewrite the file. Existing capabilities, evidence, snapshots and other agents
are preserved; limits/conflicts fail without silently dropping prior records.

Shared/multi-agent PRs need an explicit reviewed mapping; no brand-name guessing
or automatic fan-out is provided. Private local config, manifests, SQLite archive,
source snapshots and credentials remain ignored. Exporting mappings is separate
from workspace exports and does not change browser-owned avatars/history.

## Verify locally

```sh
node --test tests/work-link.test.mjs
npm test
npm run build
git diff --check
```

Importer tests use temporary local Git fixtures with synthetic IDs and no network.
The existing browser suite covers the unchanged Özet screen. Distribution uses
the two existing repositories after review/approval, not a new service or framework.
