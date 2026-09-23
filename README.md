# Agentarium

Watch your agents grow.

GitHub records how code changed. Agentarium explains how an agent evolved.

A simple, visual home for agents and their meaningful changes, sitting above GitHub and other development systems.

## Run locally

Requires Node.js 22.13+ and npm (built-in SQLite support).

```sh
npm install
npm run dev
```

Open the local address printed by Vite. `npm run build` checks types and builds the app. `npm test` checks chronology, filtering, and evidence links.

Optional: download and extract Huberthart's free character pack, then run
`node scripts/import-huberthart.mjs "/path/to/extracted/Free"` for local use.
See [artwork setup and distribution restrictions](THIRD_PARTY_ASSETS.md).
Huberthart artwork is intentionally excluded from Git pending redistribution permission.
The five Styloo CC0 characters are included as pre-rendered sprites and need no import.

For browser tests, run `npx playwright install chromium` once, then `npm run test:e2e`. These cover creation, milestones, persistence, filtering, export, and the mobile layout. `npm run format` formats the source.

## First working version

- A full-window pixel-art village as the home page, with a floating navigation dock, gentle character movement, and clickable histories. Movement can be paused and respects reduced-motion preferences. Larger rosters use additional areas of up to eight residents. On narrow screens, pan horizontally or use the resident shortcuts.
- Seven artist-made avatar choices: Huberthart's Monk and Hood, plus Styloo's Ninja, Knight, Merchant, Archer and Student. The same artwork appears in the world, map, profiles, activity, and avatar picker. Walking frames animate in the yard; pausing movement or reduced-motion preferences show the idle frame.
- Agent list and yard with name search. Tags are not shown, edited or used for search. Previously saved tags remain in exports for compatibility; new agents start without tags.
- Agent profiles with chronological milestones and optional evidence links.
- Recent evolution across the workspace.
- Each new agent receives a random avatar by default. Existing agents without one are assigned an avatar once, preserving their history. Use **Avatar** in an agent's profile to choose another; choices persist in browser storage and JSON exports.
- Browser storage and JSON export from the menu. Artwork credits are in the same menu.

The starting workspace contains fictional agents and invented milestones. It contains no Voxpera customer data. Agent profiles, avatars and manual milestones stay in this browser and origin; clearing browser data removes them. Export a workspace copy before clearing storage. Full workspace JSON import is not implemented yet. Imported Git history is separate: it is stored in a local database and supports folder-level backup and recovery.

GitHub remote ingestion, LLM analysis, authentication, collaboration, deployments, and health metrics are not implemented. Local rule-based proposals are available for a small explicit pilot rubric. A code change never implies that a capability is deployed or working in production.

## Agent evolution and review

An archived agent's profile leads with **Updates**, followed by approved **History**.
**Find updates** compares committed before/after source locally and creates drafts.
Each draft has a plain-language title, one short explanation, and **Approve / Edit /
Dismiss**. Only approved updates appear in the timeline, agent list, yard thought
bubbles and Journal. Existing manual milestones are preserved. **Review record →
Review again** reverses an approval or dismissal; rerunning analysis preserves your
decisions and edits. Reviews are saved in SQLite, with a browser copy for display.
Approval records agreement with a historical update, not deployment approval.

**Evidence** holds commit/file/line references, before/after evidence and branch
context at the last scan. The raw commit archive and connection controls are under
collapsed **Technical details**, below the human-readable history.

This is not a general semantic analyzer or LLM judge. The pilot whitelist detects
local JavaScript/TypeScript tool declarations for store lookup, human transfer and
order lookup, supported business-option changes, and three explicit English/Turkish
instruction patterns (transfer consent, service hours, partner returns). Unknown
changes do not receive invented summaries. Comments, tests, formatting, merge-only
copies and unverified backup records do not generate updates. Exact equivalent
findings are grouped with their evidence; different variants stay separate.

Analysis covers the latest 200 eligible non-merge, verified, branch-reachable
archived commits. Its coverage is recorded under **Review record**. Missing Git
objects or oversized files fail without replacing saved proposals. Source files
are bounded to 256 KB each, parsed as data, and never executed. Narrow instruction
excerpts may be saved as evidence; common URLs, email addresses, IP addresses and
provider-token patterns are redacted. This is not a comprehensive secrets scanner.
Nothing is sent to an external model or network service. Private evidence and
workspace exports must remain private. Folder **Backup** currently backs up Git
history only; preserve review decisions with a full, stopped-server SQLite backup.

## Local folder tracking (pilot)

One agent connects to one exact folder, regardless of company tags or similar
folder names. Open its profile → **Technical details → Connect folder**, choose a repository
and folder, then **Connect and sync**. Existing milestones and avatars are unchanged.
Choose **From / To** (inclusive UTC commit dates), then **Sync now**. New connections
default to the last 90 days. Each import merges into a durable local archive;
there is no background monitor. All stored commits remain visible regardless of
the next import's date range. The range controls import, not display filtering.

To enable the local connector, create `.agentarium.local.json` using
[the example](.agentarium.local.example.json), specifying your repository's absolute
root and the parent directory of its agent folders. Restart `npm run dev` when
first enabling the connector. This private configuration is Git-ignored and
blocked from Vite file serving. Never publish local repository paths or customer data.

- Scans all local branches and remote-tracking refs already available in that
  repository, including branches checked out in linked worktrees. No checkout,
  fetch, Git config changes, hook execution, external diff tools or repo writes.
- Unfetched remote changes, detached-only commits and uncommitted working-tree
  edits are not included. Remote-tracking refs can be stale; fetching remains the
  user's separate workflow. Previously imported commits survive branch deletion,
  but commits never imported before becoming unreachable cannot be recovered.
- Filters paths before returning metadata. A mixed-agent commit produces only
  the selected folder's filenames; sibling folders and shared runtime files are
  excluded. Renames are treated as deletion/addition within the exact scope;
  the connection does not follow an agent into a renamed folder automatically.
- The same commit ID appears once across branches. Cherry-picks and rebases have
  new IDs and are not semantically deduplicated. Merges are compared with their
  first parent and can repeat changes; these are evidence, not milestones.
- Date-range imports replace the old 20-candidate window. An import exceeding
  5,000 matching candidates is rejected without saving a partial result: choose
  smaller intervals. Empty first-parent merge diffs are skipped. Shallow clones
  are explicitly marked incomplete.
- Ref names and tips are pinned once. Membership is calculated from that fixed
  commit graph, including commits imported earlier. **Branch at scan** filters
  the archive; local and remote refs retain separate identities. A commit absent
  from the pinned branches keeps its last-seen evidence. Branch containment is
  neither branch of origin nor proof of a deployed or currently working capability.
- Folder sync returns only commit IDs, parent IDs, commit dates, scoped filenames
  and branch evidence. It reads no source text or whole-commit messages. The
  separately requested **Find updates** operation reads scoped historical source
  locally and stores narrow evidence excerpts as described above.
  Archive files and backups contain private repository metadata and should not
  be committed or shared publicly.
- Technical details is collapsed by default. Detected commits live inside it, separate from History.
  History combines manual milestones and approved update proposals. Failed scans keep the last
  successful snapshot and timestamp intact.

### Storage and recovery

The canonical Git archive is `.agentarium/history.sqlite`, not browser storage.
The browser retains at most 20 cached commits per archived folder; opening an
agent reloads the complete archive. Offline copies are labeled with their saved
total. Workspace exports may contain these partial caches; use folder **Backup**
for full Git history.
It is Git-ignored and denied by Vite file serving. SQLite transactions keep an
entire import atomic. The database stores the merged history and original scan
observations. A repository ID is bound to its configured root; reusing it for a
different location fails instead of combining unrelated repositories.

- **Backup** downloads the selected folder's accumulated commit evidence, pinned
  refs and import records. It does not include absolute repository paths, source
  code, avatars or manual milestones. Keep workspace exports separately.
- **Restore** merges a matching folder backup without deleting existing evidence.
  Conflicting evidence or malformed backups leave the archive unchanged. Newly
  restored records are marked unverified until Git reads them again in a selected
  import period. Restoring a backup is not a claim that its branches still exist.
- If browser storage is cleared, recreate the agent, select the same repository
  and exact folder, and choose **Load saved history**. This requires the configured
  local repository/folder to remain available but does not run a new scan.
- Folder backups contain the current archive view and import records, not every
  prior scan's membership observation. For a full database backup, stop the dev
  server and copy `.agentarium/history.sqlite`. Do not delete or replace the live
  database. Folder JSON restores accept up to 15 MB through the interface.

The connector is loopback/same-origin only, with server-side repository and folder
allowlists. It runs only in the local Vite development server, not in a static
build or `npm run preview`. Static builds can display saved snapshots, but cannot
read Git or open the archive. Do not expose the development server through a public tunnel.

## Design

Read [the product identity](AGENTARIUM_IDENTITY.md). Prefer plain language, familiar controls, restrained color, and purposeful visuals. Shapes and names identify agents; appearance does not imply health or production readiness.

The identity document contains the explicit screen whitelist. Only approved controls
and real agent content are rendered: no promotional copy, tutorial paragraphs,
decorative status labels or empty thought bubbles. Navigation is a small game dock;
secondary screens use matching game-style panels. Technical explanations stay here,
not in the scene.

The village uses a canvas background. Characters use Huberthart's original sprite sheets and renders of Styloo's original 3D models, with smooth rendering on a separate layer. Bombom is a reference for the full-screen town experience; no Bombom artwork is included. The current home is 2D, not a 3D engine. Interactive town buildings and further game mechanics are not implemented.

## Project status

Early development. An open-source license still needs to be selected by the project owner.

See [the development handoff](docs/HANDOFF.md) for completed work, validation, limitations and the next-session plan.
