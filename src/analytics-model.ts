/** Stable content identity is independent of titles, categories and display order. */
export type EngagementKind = "page" | "work" | "video";
export interface EngagementSnapshot {
  id: string;
  kind: EngagementKind;
  contentKey: string;
  title: string;
  pageKey: string;
  path: string;
  startedAt: string;
  dwellMs: number;
  watchMs: number;
  durationMs: number;
  maxProgress: number;
  completed: boolean;
  playCount: number;
}
export interface ContentMetric {
  kind: EngagementKind;
  contentKey: string;
  title: string;
  views: number;
  visitors: number;
  dwellMs: number;
  avgDwellMs: number;
  watchMs: number;
  avgWatchMs: number;
  plays: number;
  completions: number;
  lastSeen: string;
  published?: boolean;
}
export interface EngagementReport {
  configured: boolean;
  reason?: string;
  items: ContentMetric[];
  total: number;
  page: number;
  pageSize: number;
}
export interface JourneyRow extends EngagementSnapshot {
  visitId: number | null;
  visitorKey: string;
  lastSeen: string;
  published?: boolean;
}
export interface JourneyReport {
  configured: boolean;
  rows: JourneyRow[];
  total: number;
  page: number;
  pageSize: number;
}
export const RECENT_VISIT_WINDOW_MS = 30 * 60_000;
export const QUALIFIED_DWELL_MS = 120_000;
export interface VisitNotice {
  id: number;
  visitorKey: string;
  createdAt: string;
  lastSeen: string;
  dwellMs: number;
  location: string;
  device: string;
}

/** Legacy records without an ID get a deterministic fallback; new saved items get IDs. */
export function contentIdentity(namespace: string, item: { id?: string; title?: string; imageUrl?: string; videoUrl?: string; images?: string[] }) {
  // Moving between ordinary and AI works preserves the same global work ID.
  if (namespace === "works" || namespace === "ai") namespace = "work";
  if (item.id) return `${namespace}:${item.id}`;
  const source = (item.videoUrl || item.imageUrl || item.images?.[0] || item.title || "untitled").split(/[?#]/)[0];
  let hash = 2166136261;
  for (const char of source) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${namespace}:legacy-${(hash >>> 0).toString(16)}`;
}

/** Replacing a work's video starts a new media history; signed URL refreshes do not. */
export function videoIdentity(namespace: string, item: { id?: string; title?: string; videoUrl?: string }) {
  let hash = 2166136261;
  for (const char of (item.videoUrl || "").split(/[?#]/)[0]) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${contentIdentity(namespace, item)}:video-${(hash >>> 0).toString(16)}`;
}

export function durationLabel(ms: number) {
  if (!ms) return "0 秒";
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
