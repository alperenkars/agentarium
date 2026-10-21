export type Kind =
  "Capability" | "Integration" | "Knowledge" | "Improvement" | "Safety";
export type Milestone = {
  changeEvidence?: ChangeEvidence[];
  id: string;
  date: string;
  kind: Kind;
  title: string;
  description: string;
  evidence?: string;
};
export type Agent = {
  demo?: boolean;
  localSource?: boolean;
  id: string;
  name: string;
  role: string;
  shape: number;
  color: string;
  avatarId?: string;
  tags: string[];
  milestones: Milestone[];
  tracking?: TrackingSnapshot;
  updates?: EvolutionState;
};
export type ChangeEvidence = {
  sha: string;
  date: string;
  file: string;
  beforeLine?: number;
  afterLine?: number;
  before: string;
  after: string;
};
export type UpdateProposal = {
  id: string;
  title: string;
  description: string;
  date: string;
  kind: Kind;
  status: "proposed" | "approved" | "dismissed";
  version: number;
  evidence: ChangeEvidence[];
};
export type EvolutionState = {
  repositoryId: string;
  folder: string;
  proposals: UpdateProposal[];
  analyzed?: number;
  eligible?: number;
  at?: string;
};
export type TrackingSnapshot = {
  cached?: boolean;
  totalCount?: number;
  archiveVersion?: number;
  storedAt?: string;
  restored?: boolean;
  range?: { from: string; to: string };
  shallow?: boolean;
  refs?: { name: string; tip: string }[];
  imports?: {
    id: string;
    at: string;
    range: { from: string; to: string };
    count: number;
    shallow: boolean;
    restored?: boolean;
  }[];
  repositoryId: string;
  repositoryName: string;
  folder: string;
  branchMode: "all-local-and-remote-tracking";
  lastSyncedAt: string;
  branchCount: number;
  truncated: boolean;
  limit: number;
  changes: {
    sha: string;
    date: string;
    files: string[];
    branches: string[];
    merge: boolean;
    refs?: string[];
    parents?: string[];
    lastSeenRefs?: string[];
    lastSeenAt?: string;
    membershipAt?: string;
    unverified?: boolean;
  }[];
};
export const kinds: Kind[] = [
  "Capability",
  "Integration",
  "Knowledge",
  "Improvement",
  "Safety",
];
