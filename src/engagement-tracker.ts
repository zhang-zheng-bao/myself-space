import type { EngagementSnapshot, EngagementKind } from "./analytics-model";

type Span = { element: HTMLElement; data: EngagementSnapshot; mediaTime: number; mediaActive: boolean; ranges: [number, number][]; lastSent?: string };

function spanId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Union watched ranges: seeking to the end must not count as watching the whole video. */
export function addWatchedRange(ranges: [number, number][], start: number, end: number): [number, number][] {
  const merged: [number, number][] = [];
  for (const range of [...ranges, [start, end] as [number, number]].sort((a, b) => a[0] - b[0])) {
    const prev = merged.at(-1);
    if (prev && range[0] <= prev[1] + 0.15) prev[1] = Math.max(prev[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

export function observeEngagement(send: (snapshot: EngagementSnapshot) => void) {
  const spans = new Map<string, Span>();
  let lastTick = performance.now();
  let visible = document.visibilityState === "visible";
  let suspended = false;
  const emit = (span: Span) => {
    if (span.data.kind === "video" && !span.data.playCount) return;
    const signature = JSON.stringify(span.data);
    if (signature === span.lastSent) return;
    span.lastSent = signature;
    send({ ...span.data });
  };
  const path = () => location.pathname.slice(0, 300);
  const inViewport = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  };
  function sample() {
    const now = performance.now();
    // Do not charge long sleep / OS suspension gaps.
    const elapsed = Math.max(0, Math.min(now - lastTick, 2000));
    lastTick = now;
    const page = document.querySelector<HTMLElement>("[data-analytics-page]");
    const pageKey = page?.dataset.analyticsPage || "";
    const contents = [...document.querySelectorAll<HTMLElement>('[data-analytics-kind="work"]')];
    const topContent = contents.at(-1);
    const elements = [
      ...(page ? [page] : []),
      ...contents,
      ...document.querySelectorAll<HTMLElement>('video[data-analytics-key]'),
    ];
    const live = new Set<string>();
    for (const element of elements) {
      const kind: EngagementKind = element === page ? "page" : element.tagName === "VIDEO" ? "video" : "work";
      const contentKey = kind === "page" ? pageKey : element.dataset.analyticsKey || "";
      if (!contentKey) continue;
      const mapKey = `${kind}:${contentKey}`;
      live.add(mapKey);
      let span = spans.get(mapKey);
      if (!span || span.element !== element) {
        if (span) emit(span);
        span = {
          element, mediaTime: 0, mediaActive: false, ranges: [],
          data: { id: spanId(), kind, contentKey, title: element.dataset.analyticsTitle || contentKey,
            pageKey, path: path(), startedAt: new Date().toISOString(), dwellMs: 0, watchMs: 0,
            durationMs: 0, maxProgress: 0, completed: false, playCount: 0 },
        };
        spans.set(mapKey, span);
        // A new span begins now, not at the preceding sample's time.
        continue;
      }
      const engaged = visible && !suspended && !element.closest("[inert]") && inViewport(element);
      if (kind === "video") {
        const video = element as HTMLVideoElement;
        const current = video.currentTime;
        const advance = current - span.mediaTime;
        const validAdvance = advance > 0 && advance <= elapsed / 1000 * Math.max(1, video.playbackRate) + 0.5;
        if (engaged && span.mediaActive && !video.seeking && validAdvance) {
          span.data.watchMs += Math.round(Math.min(elapsed, advance / Math.max(0.1, video.playbackRate) * 1000));
          span.ranges = addWatchedRange(span.ranges, span.mediaTime, current);
          span.data.playCount = 1; // one actual playback per opened player; resume is not another play.
        }
        span.mediaTime = current;
        span.mediaActive = engaged && !video.paused && !video.ended && !video.seeking && video.readyState >= 3;
        if (Number.isFinite(video.duration) && video.duration > 0) {
          span.data.durationMs = Math.round(video.duration * 1000);
          span.data.maxProgress = Math.max(span.data.maxProgress, Math.min(100, current / video.duration * 100));
          const covered = span.ranges.reduce((sum, [a, b]) => sum + b - a, 0);
          span.data.completed ||= covered / video.duration >= 0.9;
        }
        if (engaged) span.data.dwellMs += Math.round(elapsed);
      } else if (engaged && (kind === "page" ? !topContent : element === topContent)) {
        span.data.dwellMs += Math.round(elapsed);
      }
    }
    for (const [key, span] of spans) {
      if (!live.has(key)) {
        emit(span);
        spans.delete(key);
      }
    }
  }
  function flush() {
    sample();
    for (const span of spans.values()) {
      emit(span);
    }
  }
  const onVisibility = () => {
    flush();
    visible = document.visibilityState === "visible";
    for (const span of spans.values()) span.mediaActive = false;
  };
  const onHide = () => { flush(); suspended = true; };
  const onShow = () => { suspended = false; lastTick = performance.now(); visible = document.visibilityState === "visible"; };
  const observer = new MutationObserver(() => sample());
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-analytics-page", "data-analytics-key", "inert"] });
  const timer = window.setInterval(sample, 1000);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  // Capture media events, including pause/seek/end, without changing existing controls.
  const mediaEvents = ["playing", "pause", "waiting", "seeking", "seeked", "ended", "ratechange"];
  for (const event of mediaEvents) document.addEventListener(event, sample, true);
  sample();
  return { flush, stop: () => {
    flush(); observer.disconnect(); clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHide); window.removeEventListener("pageshow", onShow);
    for (const event of mediaEvents) document.removeEventListener(event, sample, true);
  } };
}
