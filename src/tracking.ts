/**
 * 站点检测 —— 前台上报端。
 *
 * 职责只有两件事：
 *   1. 页面加载时收集一份「此刻能拿到的访客环境快照」，POST 给 /api/track；
 *   2. 页面离开时把停留时长用 sendBeacon 补交，避免拖慢导航。
 *
 * 与 server.ts 的 /api/track 契约对齐，字段名与 Supabase 表的列一一对应。
 *
 * 设计原则：**全链路 best-effort**。统计是附加功能，任何一步失败（localStorage
 * 被禁、WebGL 拿不到、接口 500、网络断了）都必须静默吞掉 —— 访客浏览不受影响。
 * 所以这里没有任何一处会向上抛异常。
 */

/** visitorKey 落在 localStorage：同一个浏览器 = 同一位访客。 */
const VISITOR_KEY_STORAGE = "myspace_visitor_key";

/**
 * StrictMode 双挂载守卫。**故意用模块级变量，不用 sessionStorage。**
 *
 * React 严格模式下 effect 会跑两次（挂载 → 卸载 → 再挂载），不拦会记两条。
 * 但守卫的寿命必须正好等于「这一次页面加载」：
 *   - 用 sessionStorage 会**跨刷新存活**（同一个标签页刷新时 sessionStorage 保留），
 *     于是访客按 F5 就再也不上报了 —— 刷新明明是一次新的页面加载，却被吞掉。
 *   - 模块级变量在每次页面加载时重新求值（刷新 = 新模块实例），正好覆盖
 *     StrictMode 的两次 effect，又不会拦掉真实的刷新。
 */
let markedThisPageLoad = false;

function randomHex(bytes = 16) {
  const buffer = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) buffer[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 读/建本机访客标识。
 * localStorage 不可用（无痕模式、Cookie 被禁）时退化成模块内内存值：至少本次
 * 会话内的多次上报是自洽的，只是关掉页面后就认不出是同一个人了 —— 这比抛异常好。
 */
let memoryVisitorKey = "";
function getVisitorKey() {
  try {
    const hit = window.localStorage.getItem(VISITOR_KEY_STORAGE);
    if (hit) return hit;
    const created = randomHex();
    window.localStorage.setItem(VISITOR_KEY_STORAGE, created);
    return created;
  } catch {
    if (!memoryVisitorKey) memoryVisitorKey = randomHex();
    return memoryVisitorKey;
  }
}

/** FNV-1a 32 位 → 8 位十六进制。只用来给「设备」一个稳定短指纹，不追求抗碰撞。 */
function fingerprintOf(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 显卡型号。这是指纹里区分度最高的一项（同一款手机/同一批机器往往一致，
 * 不同机器差别明显），也正是浏览器指纹的常规来源。拿不到就返回空串。
 */
function readGpu(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const value = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return String(value || "").slice(0, 200);
  } catch {
    return "";
  }
}

type NavigatorExtras = Navigator & {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgentData?: { platform?: string };
  connection?: { effectiveType?: string };
};

function collectClient() {
  const nav = navigator as NavigatorExtras;
  const screenInfo = window.screen;
  const px = (value: number) => (Number.isFinite(value) ? value : null);

  return {
    path: (window.location.pathname + window.location.search + window.location.hash).slice(0, 300),
    referrer: String(document.referrer || "").slice(0, 500),
    screen: screenInfo ? `${screenInfo.width}×${screenInfo.height}` : "",
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    pixelRatio: px(window.devicePixelRatio),
    colorDepth: px(screenInfo?.colorDepth),
    timezone: (() => {
      try {
        return String(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
      } catch {
        return "";
      }
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

type ClientSnapshot = ReturnType<typeof collectClient>;

function fingerprintSeed(client: ClientSnapshot) {
  return [
    client.screen,
    client.viewport,
    client.pixelRatio,
    client.colorDepth,
    client.timezone,
    client.language,
    client.languages,
    client.platform,
    client.cpuCores,
    client.deviceMemory,
    client.touchPoints,
    client.gpu,
    navigator.userAgent,
  ].join("|");
}

/**
 * 开始采集。返回清理函数（React useEffect 直接返回即可）。
 * 在 /admin 下不会被调用 —— App.tsx 对 /admin 走了提前 return 的分支。
 */
export function startVisitTracking(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let visitId: number | null = null;
  let reportedMs = 0;

  // 停留时长只累计「页面前台可见」的时间：切到别的标签页/锁屏期间不算，
  // 否则挂了半天的后台标签会记出几小时的假停留。
  let visibleAccumMs = 0;
  let visibleSince = document.visibilityState === "visible" ? Date.now() : 0;

  const visibleNow = () => visibleAccumMs + (visibleSince ? Date.now() - visibleSince : 0);

  const client = collectClient();
  const visitorKey = getVisitorKey();

  // 同一次页面加载只记一条：React 严格模式下 effect 会跑两次（见 markedThisPageLoad）。
  if (markedThisPageLoad) return () => {};
  markedThisPageLoad = true;

  const sessionId = randomHex(8);

  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorKey,
        sessionId,
        fingerprint: fingerprintOf(fingerprintSeed(client)),
        client,
      }),
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && Number.isFinite(json.visitId)) visitId = Number(json.visitId);
      })
      .catch(() => {});
  } catch {
    /* fetch 本身就抛（极少见）：记录失败不影响浏览 */
  }

  /** 交一次「上次交过之后又新增的可见时长」。增量上报，服务端是累加的。 */
  const flushDwell = () => {
    if (visitId == null) return;
    const total = visibleNow();
    const delta = total - reportedMs;
    if (delta < 1000) return; // 不足 1 秒不值得写一次
    reportedMs = total;

    const payload = JSON.stringify({ visitId, visitorKey, dwellMs: delta });
    try {
      if (typeof navigator.sendBeacon === "function") {
        // sendBeacon 是离开页面时唯一可靠的通道：不占连接、不阻塞卸载。
        navigator.sendBeacon("/api/track/dwell", new Blob([payload], { type: "application/json" }));
        return;
      }
    } catch {
      /* 落到下面的 fetch 兜底 */
    }
    try {
      void fetch("/api/track/dwell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    } catch {
      /* 忽略 */
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      // 先把当前这段可见时长结账，再上报。
      if (visibleSince) {
        visibleAccumMs += Date.now() - visibleSince;
        visibleSince = 0;
      }
      flushDwell();
    } else if (!visibleSince) {
      visibleSince = Date.now();
    }
  };

  window.addEventListener("pagehide", flushDwell);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("pagehide", flushDwell);
    document.removeEventListener("visibilitychange", onVisibility);
    flushDwell();
  };
}
