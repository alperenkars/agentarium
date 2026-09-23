# Agentarium development handoff

Checkpoint: September 23, 2026. Branch: `agentarium-foundation`.

## Product decisions

- **Agentarium — Watch your agents grow.**
- **GitHub records how code changed. Agentarium explains how an agent evolved.**
- A visual layer above Git, not a replacement for it.
- Full-screen game-like town first; understandable agent updates before technical evidence.
- Keep interface text and controls on an explicit whitelist. No promotional paragraphs, decorative tags, neon effects or invented status indicators.
- One agent maps to one exact folder. Branches are evidence, not separate agents or deployment status.
- Human review decides which generated updates enter the agent's history.

The full identity and visual principles are in [AGENTARIUM_IDENTITY.md](../AGENTARIUM_IDENTITY.md).

## Completed

### Town and agent workspace

- Full-window seaside village with moving, selectable residents, pause and reduced-motion support.
- Eight residents per area, mobile panning and resident shortcuts.
- Agent profiles, agent map/list, Journal, name search, manual milestones and workspace JSON export.
- Random initial avatars with persistent manual selection. Seven avatar definitions: five bundled Styloo characters and two optional local Huberthart characters.
- Artist-made idle/walking sprites; missing artwork fallback. No generated artwork or copied Bombom assets.
- Removed promotional copy, redundant tags and unsupported status indicators from the interface.
- Fictional initial workspace; real user profiles and selections remain in local browser storage.

### Local Git archive

- Allowlisted local repositories and exact agent-folder selection.
- Manual sync across locally available branches and remote-tracking refs, without checking out branches or fetching.
- Inclusive UTC date ranges, SHA deduplication, scoped filenames and branch membership at scan time.
- Durable transactional SQLite archive; old evidence survives branch deletion and subsequent scans.
- Folder backup/restore, validation, conflict rejection and unverified labels for restored evidence.
- Reload archived history after reconnecting an agent; bounded browser cache instead of storing the complete archive there.
- Loopback/same-origin checks and blocked serving of private configuration/database files.

### Reviewed evolution

- Local before/after source comparison with a narrow, explicit rule whitelist.
- Draft cards with short titles, explanations and Approve / Edit / Dismiss controls.
- Collapsed evidence, review records and raw Git details.
- Approved updates appear in the profile chronology, map/list, Journal and yard thought bubbles alongside manual milestones.
- SQLite-backed review decisions, stale-edit protection and preserved decisions on reanalysis.
- Parser regressions fixed for concatenated tool descriptions, internal-only parameter changes and moved tool declarations.
- Local pilot inspected with 136 archived commits, 52 eligible analyzed commits and five pending proposals. No pilot proposals were approved on the user's behalf. These are checkpoint counts, not seeded application data.

## Architecture and files

| Area | Main files | Responsibility |
| --- | --- | --- |
| Workspace | `src/main.tsx`, `src/model.ts`, `src/history.mjs` | Profiles, persistence and combined manual/approved chronology |
| Game view | `src/World.tsx`, `src/villageScene.ts`, `src/game-ui.css` | Scene, residents and game panels |
| Characters | `src/Avatar.tsx`, `src/AvatarPicker.tsx`, `src/avatars.mjs` | Selection, rendering and migration |
| Tracking UI | `src/Tracking.tsx` | Exact-folder connection, sync and archive recovery |
| Review UI | `src/Evolution.tsx` | Proposals, editing, review and evidence |
| Local connector | `server/tracking.mjs`, `vite.config.mjs` | Read-only Git access and local HTTP boundaries |
| Archive | `server/history-store.mjs` | SQLite history, scan observations and evolution ledger |
| Analyzer | `server/evolution.mjs` | Bounded source reads, parsing and deterministic proposals |
| Artwork setup | `scripts/`, `THIRD_PARTY_ASSETS.md` | Optional import, sprite rendering and provenance |

Flow: exact folder → manual Git scan → SQLite archive → requested local analysis → draft review → approved agent history.

The connector exposes repository discovery plus scan, history, export, restore, evolution, analyze and review operations under `/api/tracking/`. It runs in the local Vite development server only. A static build is not a hosted Git connector.

### Storage boundaries

- Browser `agentarium.workspace.v1`: profiles, avatars, manual milestones and display caches.
- Ignored `.agentarium.local.json`: repository allowlist and absolute local paths.
- Ignored `.agentarium/history.sqlite`: canonical imported history, scan observations and review ledger, including narrow evidence excerpts.
- Folder JSON backup: Git archive only, not a complete workspace/review backup.
- For a complete archive/review backup, stop the server and copy the SQLite database. Keep a separate workspace export for browser-owned data. Full workspace JSON import is not implemented.

Never commit private configuration, database files, evidence exports or real customer screenshots. This checkpoint publishes application code and synthetic fixtures, not the local pilot data.

## Deliberate limits

- No LLM calls, external code uploads, GitHub ingestion, background monitoring, accounts, collaboration or deployment/health verification.
- The analyzer is not general semantic understanding. It recognizes a small set of tool declarations, business parameters and three instruction patterns. Unknown changes are left unsummarized.
- Analysis checks at most 200 eligible non-merge verified commits with recorded branch membership; source reads are bounded to 256 KB per file. The review record shows coverage.
- Evidence redaction is limited, not a comprehensive secret scanner. Local evidence remains private.
- Scans exclude uncommitted edits, detached-only commits, unfetched branches, siblings and shared runtime code. Folder moves are not automatically followed.
- Source evidence does not prove deployment or production behavior. Approval is a history-review decision.
- Five Styloo CC0 sprite sets are bundled. Huberthart artwork and source asset archives stay local pending redistribution permission. Local builds containing those files must not be published without a rights review.
- The owner still needs to select the project's software license. Public source alone does not establish an open-source license.

## Verification

Run from the repository with Node.js 22.13+:

```sh
npm install
npm run build
npm test
npx playwright install chromium
npm run test:e2e -- --workers=1
git diff --check
```

Checkpoint suite: 19 unit/integration tests and 16 browser tests. Coverage includes exact-folder and branch isolation, archive recovery, malformed backup rejection, review persistence, parser abstention/regressions, avatar fallback, mobile layout and approved-update visibility. Browser tests use synthetic fixtures, not approval actions on the real pilot.

Local Huberthart files are required for browser assertions that explicitly test those two optional characters; the app itself supports their absence. SQLite may print an experimental warning on the currently used Node version.

Build/test success is local validation, not a CI run or deployment. This checkpoint does not add a deployment or hosted backend.

## Resume next session

1. Start with `npm run dev`; use the same browser origin to retain the local workspace. Open the connected pilot agent's Updates.
2. Review the five pending drafts against evidence. Decide which deserve approval and refine wording/rules where needed. Keep approval manual.
3. Agree on the next implementation slice. Recommended: reliable workspace/review backup and recovery before expanding ingestion.
4. For broader semantic analysis, first choose a provider/account, permitted source data and spending limit. Build a small human-labeled benchmark before adding an LLM judge. Do not send private code externally by default.
5. Later, add an explicitly authorized read-only GitHub connection with repository/folder selection, verified webhooks and deduplicated ingestion; preserve local mode.
6. Expand agent-folder mappings deliberately, then revisit town mechanics. Do not add tags, health bars, XP or other features without a concrete need.
7. Resolve the software license and remaining artwork rights before a public release/build.

These are proposed next steps, not background jobs or already implemented features.
