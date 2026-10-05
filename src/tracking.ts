/** Privacy-conscious first-party analytics for visits, engaged time, and UI actions. */

const VISITOR_KEY_STORAGE = "myspace_visitor_key";
const HEARTBEAT_MS = 15_000;
const EVENT_FLUSH_MS = 5_000;
const MAX_EVENT_BATCH = 20;

type NavigatorExtras = Navigator & {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgentData?: { platform?: string };
};

interface TrackedEvent {
  eventId: string;
  eventName: "ui_click";
  elementKey: string;
  elementLabel: string;
  elementType: string;
  path: string;
  occurredAt: string;
}

let started = false;
let memoryVisitorKey = "";

function randomHex(bytes = 16) {
  const buffer = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buffer);
  else for (let i = 0; i < buffer.length; i += 1) buffer[i] = Math.floor(Math.random() * 256);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getVisitorKey() {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY_STORAGE);
    if (existing) return existing;
    const created = randomHex();
    window.localStorage.setItem(VISITOR_KEY_STORAGE, created);
    return created;
  } catch {
    if (!memoryVisitorKey) memoryVisitorKey = randomHex();
    return memoryVisitorKey;
  }
}

function adoptVisitorKey(canonical: string) {
  if (!canonical) return;
  try {
    window.localStorage.setItem(VISITOR_KEY_STORAGE, canonical);
  } catch {
    memoryVisitorKey = canonical;
  }
}

function fingerprintOf(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function readGpu(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return String(debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 200);
  } catch {
    return "";
  }
}

function collectClient() {
  const nav = navigator as NavigatorExtras;
  const screenInfo = window.screen;
  const px = (value: number) => (Number.isFinite(value) ? value : null);
  return {
    // Query strings and hashes can contain sensitive values and are unnecessary for this dashboard.
    path: window.location.pathname.slice(0, 300),
    referrer: (() => {
      try {
        const url = new URL(document.referrer);
        return `${url.origin}${url.pathname}`.slice(0, 500);
      } catch {
        return "";
      }
    })(),
    screen: screenInfo ? `${screenInfo.width}x${screenInfo.height}` : "",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pixelRatio: px(window.devicePixelRatio),
    colorDepth: px(screenInfo?.colorDepth),
    timezone: (() => {
      try { return String(Intl.DateTimeFormat().resolvedOptions().timeZone || ""); } catch { return ""; }
    })(),
    timezoneOffset: px(new Date().getTimezoneOffset()),
    language: String(nav.language || ""),
    languages: String((nav.languages || []).join(",")).slice(0, 200),
    platform: String(nav.userAgentData?.platform || nav.platform || "").slice(0, 80),
    cpuCores: px(Number(nav.hardwareConcurrency)),
    deviceMemory: px(Number(nav.deviceMemory)),
    touchPoints: px(Number(nav.maxTouchPoints)),
    gpu: readGpu(),
    cookieEnabled: typeof nav.cookieEnabled === "boolean" ? nav.cookieEnabled : null,
    dnt: String(nav.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack ?? ""),
  };
}

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function eventFromClick(event: MouseEvent): TrackedEvent | null {
  if (!event.isTrusted) return null;
  const origin = event.target instanceof Element ? event.target : null;
  const element = origin?.closest<HTMLElement>("[data-track],button,a,[role='button']");
  if (!element || element.closest("[data-track-ignore]")) return null;

  const label = normalizeLabel(
    element.dataset.trackLabel || element.getAttribute("aria-label") || element.getAttribute("title") || element.innerText || "",
  );
  const section = element.closest<HTMLElement>("[data-section],section[id]");
  const context = section?.dataset.section || section?.id || "page";
  const explicit = normalizeLabel(element.dataset.track || element.id || "");
  const elementType = element.tagName.toLowerCase() === "a" ? "link" : "button";
  const elementKey = normalizeLabel(explicit || `${context}:${elementType}:${label || "unlabelled"}`);

  return {
    eventId: randomHex(16),
    eventName: "ui_click",
    elementKey,
    elementLabel: label || "未命名控件",
    elementType,
    path: window.location.pathname.slice(0, 300),
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Starts one tracker for the lifetime of this page. The module singleton is safe under
 * React StrictMode's mount/unmount/remount probe. Development is disabled unless explicitly
 * enabled with VITE_ENABLE_ANALYTICS=true, so local tests do not pollute production data.
 */
export function startVisitTracking(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined" || started) return () => {};
  const viteEnv = (import.meta as ImportMeta & { env?: { PROD?: boolean; VITE_ENABLE_ANALYTICS?: string } }).env;
  if (!viteEnv?.PROD && viteEnv?.VITE_ENABLE_ANALYTICS !== "true") return () => {};
  // Even a production build opened on this machine (localhost:3002, AI preview browsers)
  // is not a visitor. Automation drivers announce themselves through navigator.webdriver.
  const localHost = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i.test(window.location.hostname);
  if ((localHost && viteEnv?.VITE_ENABLE_ANALYTICS !== "true") || navigator.webdriver) return () => {};
  started = true;

  const client = collectClient();
  const sessionId = randomHex(8);
  let visitorKey = getVisitorKey();
  let visitId: number | null = null;
  let trackingToken = "";
  let visibleAccumMs = 0;
  let visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  let reportedMs = 0;
  let eventQueue: TrackedEvent[] = [];
  let eventFlushInFlight = false;
  let dwellFlushInFlight = false;
  let visitSettled = false;
  let trackingDisabled = false;

  const visibleNow = () => visibleAccumMs + (visibleSince ? Date.now() - visibleSince : 0);
  const beacon = (url: string, body: unknown) => {
    const payload = JSON.stringify(body);
    try {
      return typeof navigator.sendBeacon === "function"
        && navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    } catch {
      return false;
    }
  };

  const flushEvents = (useBeacon = false) => {
    if (trackingDisabled) {
      eventQueue = [];
      return;
    }
    // Wait for canonical visitor/visit IDs so a slow initial request cannot orphan clicks.
    if (!visitSettled || !eventQueue.length || eventFlushInFlight) return;
    const events = eventQueue.splice(0, MAX_EVENT_BATCH);
    const body = { visitId, visitorKey, sessionId, trackingToken, events };
    if (useBeacon) {
      if (!beacon("/api/track/events", body)) eventQueue = [...events, ...eventQueue];
      return;
    }
    eventFlushInFlight = true;
    void fetch("/api/track/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then((response) => { if (!response.ok) throw new Error("event upload failed"); })
      .catch(() => { eventQueue = [...events, ...eventQueue]; })
      .finally(() => {
        eventFlushInFlight = false;
        if (eventQueue.length >= MAX_EVENT_BATCH) flushEvents();
      });
  };

  const flushDwell = (useBeacon = false) => {
    if (visitId == null || dwellFlushInFlight) return;
    const total = visibleNow();
    const delta = total - reportedMs;
    if (delta < 1000) return;
    const body = { visitId, visitorKey, sessionId, trackingToken, dwellMs: Math.round(delta) };
    if (useBeacon) {
      if (beacon("/api/track/dwell", body)) reportedMs = total;
      return;
    }
    dwellFlushInFlight = true;
    void fetch("/api/track/dwell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) throw new Error("dwell upload failed");
        reportedMs = Math.max(reportedMs, total);
      })
      .catch(() => {})
      .finally(() => { dwellFlushInFlight = false; });
  };

  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      visitorKey,
      sessionId,
      fingerprint: fingerprintOf(Object.values(client).join("|") + navigator.userAgent),
      client,
    }),
    keepalive: true,
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => {
      if (!json || json.ignored || json.ok === false) {
        trackingDisabled = true;
        eventQueue = [];
        return;
      }
      if (Number.isFinite(json.visitId)) visitId = Number(json.visitId);
      if (typeof json.trackingToken === "string") trackingToken = json.trackingToken;
      if (typeof json.visitorKey === "string") {
        visitorKey = json.visitorKey;
        adoptVisitorKey(visitorKey);
      }
      if (visitId == null || !trackingToken) {
        trackingDisabled = true;
        eventQueue = [];
        return;
      }
      visitSettled = true;
      flushEvents();
    })
    .catch(() => {
      trackingDisabled = true;
      eventQueue = [];
    });

  const onClick = (event: MouseEvent) => {
    if (trackingDisabled) return;
    const tracked = eventFromClick(event);
    if (!tracked) return;
    eventQueue.push(tracked);
    if (eventQueue.length >= MAX_EVENT_BATCH) flushEvents();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (visibleSince) {
        visibleAccumMs += Date.now() - visibleSince;
        visibleSince = 0;
      }
      flushDwell(true);
      flushEvents(true);
    } else if (!visibleSince) {
      visibleSince = Date.now();
    }
  };
  const onPageHide = () => {
    flushDwell(true);
    flushEvents(true);
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.setInterval(() => flushDwell(), HEARTBEAT_MS);
  window.setInterval(() => flushEvents(), EVENT_FLUSH_MS);

  // The tracker intentionally lives for the page lifetime; see StrictMode note above.
  return () => {};
}
