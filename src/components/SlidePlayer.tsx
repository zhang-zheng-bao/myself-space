import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize, Minimize, Pause, Play, X } from "lucide-react";
import type { SlideDeck } from "../types";
import { openPdf, renderPdfPage } from "../pdfDeck";

/** 舞台的逻辑渲染宽度。按固定宽度渲染，再用 transform 缩放到舞台大小。 */
const RENDER_WIDTH = 1280;
const AUTOPLAY_OPTIONS = [3, 5, 8, 12];

/**
 * 统一两种渲染后端的最小接口：
 * - pdf：pdf.js 画到 canvas，排版与导出时完全一致（首选）；
 * - pptx：pptx-preview 现场解析，只给还没传 PDF 的老条目兜底。
 */
type Renderer = {
  count: number;
  aspect: number;
  show: (index: number) => Promise<void> | void;
  destroy: () => void;
};

type PptxPreviewer = {
  load: (file: ArrayBuffer) => Promise<{ width: number; height: number; slides: unknown[] }>;
  renderSingleSlide: (index: number) => void;
  destroy: () => void;
};

/** 拿文件原始字节。优先走同源代理（避开 COS 跨域）；代理不认的地址（本地 / 外链）再直连。 */
async function fetchDeck(url: string) {
  const proxied = await fetch(`/api/media/slides?url=${encodeURIComponent(url)}`);
  if (proxied.ok) return proxied.arrayBuffer();
  const direct = await fetch(url);
  if (!direct.ok) throw new Error(`文件读取失败（${direct.status}）`);
  return direct.arrayBuffer();
}

async function createPdfRenderer(host: HTMLDivElement, url: string): Promise<Renderer> {
  const { doc, destroy } = await openPdf(await fetchDeck(url));
  const canvas = document.createElement("canvas");
  canvas.className = "slide-player__page";
  host.replaceChildren(canvas);
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  // 翻页时先画到离屏 canvas 再整张换上，避免翻页瞬间出现半张白屏。
  let token = 0;
  return {
    count: doc.numPages,
    aspect: base.height / base.width,
    async show(index) {
      const mine = ++token;
      const buffer = document.createElement("canvas");
      await renderPdfPage(doc, index + 1, buffer, RENDER_WIDTH);
      if (mine !== token) return;
      canvas.width = buffer.width;
      canvas.height = buffer.height;
      canvas.getContext("2d")?.drawImage(buffer, 0, 0);
    },
    destroy() { token++; void destroy(); },
  };
}

async function createPptxRenderer(host: HTMLDivElement, url: string): Promise<Renderer> {
  const [{ init }, buffer] = await Promise.all([import("pptx-preview"), fetchDeck(url)]);
  host.innerHTML = "";
  const previewer = init(host, { width: RENDER_WIDTH, mode: "list" }) as unknown as PptxPreviewer;
  const pptx = await previewer.load(buffer);
  let current = -1;
  return {
    count: pptx.slides?.length || 0,
    aspect: pptx.width > 0 && pptx.height > 0 ? pptx.height / pptx.width : 9 / 16,
    show(index) {
      if (index === current) return;
      previewer.renderSingleSlide(index);
      current = index;
    },
    destroy() { previewer.destroy(); },
  };
}

/**
 * 演示文稿播放器（全屏弹层）。
 *
 * 有 PDF 就用 PDF（排版完全还原、翻页快）；只有 pptx 的老条目才退回 pptx-preview。
 * 翻页 / 键盘 / 全屏 / 自动播放这些交互两种后端共用。渲染库都按需动态 import，不进首屏包。
 */
export default function SlidePlayer({ deck, onClose }: { deck: SlideDeck; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const sourceUrl = deck.pdfUrl || deck.fileUrl;
  const downloadUrl = deck.fileUrl || deck.pdfUrl || "";

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [aspect, setAspect] = useState(9 / 16);
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [interval, setIntervalSec] = useState(5);

  // 加载 + 解析。
  useEffect(() => {
    let cancelled = false;
    let renderer: Renderer | null = null;
    setStatus("loading");
    (async () => {
      try {
        if (!sourceUrl) throw new Error("还没有上传文件。");
        if (!hostRef.current) return;
        const isPdf = Boolean(deck.pdfUrl) || /\.pdf(?:$|[?#])/i.test(sourceUrl);
        renderer = await (isPdf ? createPdfRenderer : createPptxRenderer)(hostRef.current, sourceUrl);
        if (cancelled) { renderer.destroy(); return; }
        if (renderer.count === 0) throw new Error("这份文稿里没有页面。");
        rendererRef.current = renderer;
        setAspect(renderer.aspect);
        setCount(renderer.count);
        await renderer.show(0);
        if (cancelled) return;
        indexRef.current = 0;
        setIndex(0);
        setStatus("ready");
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "解析失败");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, [sourceUrl, deck.pdfUrl]);

  // 渲染是 DOM 副作用，不能放进 setState 的 updater（StrictMode 会调两次），所以另用 ref 记当前页。
  const indexRef = useRef(0);
  const goTo = useCallback((next: number) => {
    const renderer = rendererRef.current;
    if (!renderer || count === 0) return;
    const target = Math.min(count - 1, Math.max(0, next));
    if (target === indexRef.current) return;
    indexRef.current = target;
    setIndex(target);
    void renderer.show(target);
  }, [count]);

  // 按舞台大小缩放。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const { clientWidth: w, clientHeight: h } = stage;
      if (!w || !h) return;
      setScale(Math.min(w / RENDER_WIDTH, h / (RENDER_WIDTH * aspect)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [aspect]);

  // 自动播放：到最后一页自动停。
  useEffect(() => {
    if (!autoplay || status !== "ready") return;
    if (index >= count - 1) { setAutoplay(false); return; }
    const timer = window.setTimeout(() => goTo(index + 1), interval * 1000);
    return () => window.clearTimeout(timer);
  }, [autoplay, index, count, interval, status, goTo]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement) return;
      switch (event.key) {
        case "ArrowRight": case "ArrowDown": case "PageDown": case " ": case "Enter":
          event.preventDefault(); goTo(index + 1); break;
        case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace":
          event.preventDefault(); goTo(index - 1); break;
        case "Home": event.preventDefault(); goTo(0); break;
        case "End": event.preventDefault(); goTo(count - 1); break;
        case "f": case "F": toggleFullscreen(); break;
        // 全屏时 Esc 由浏览器先拿去退全屏，不会走到这里。
        case "Escape": event.stopPropagation(); onClose(); break;
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [goTo, index, count, toggleFullscreen, onClose]);

  // 弹层期间锁住页面滚动。
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  // 点舞台左侧三分之一 = 上一页，其余 = 下一页（演示时最顺手的操作）。
  const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (status !== "ready") return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX - rect.left < rect.width / 3) goTo(index - 1);
    else goTo(index + 1);
  };

  const progress = count > 0 ? ((index + 1) / count) * 100 : 0;

  return createPortal(
    <div ref={rootRef} className="slide-player" data-fullscreen={fullscreen || undefined} role="dialog" aria-modal="true" aria-label={`演示：${deck.title || "演示文稿"}`}>
      <header className="slide-player__bar">
        <div className="min-w-0">
          <p className="truncate font-serif text-base font-bold text-white">{deck.title || "演示文稿"}</p>
          <p className="font-mono text-[11px] text-zinc-500">
            {status === "ready" ? `第 ${index + 1} / ${count} 页 · ←/→ 翻页 · F 全屏` : status === "loading" ? "正在解析文稿…" : "无法播放"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status === "ready" && (
            <>
              <select
                value={interval}
                onChange={(event) => setIntervalSec(Number(event.target.value))}
                className="slide-player__select"
                aria-label="自动播放间隔"
              >
                {AUTOPLAY_OPTIONS.map((sec) => <option key={sec} value={sec}>{sec} 秒/页</option>)}
              </select>
              <button type="button" className="slide-player__btn" onClick={() => setAutoplay((on) => !on)} aria-pressed={autoplay} aria-label={autoplay ? "暂停自动播放" : "自动播放"}>
                {autoplay ? <Pause size={15} /> : <Play size={15} />}
                <span className="hidden sm:inline">{autoplay ? "暂停" : "自动播放"}</span>
              </button>
              <button type="button" className="slide-player__btn" onClick={toggleFullscreen} aria-label={fullscreen ? "退出全屏" : "全屏"}>
                {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
              </button>
            </>
          )}
          <a className="slide-player__btn" href={downloadUrl} download={deck.fileName || undefined} target="_blank" rel="noopener noreferrer" aria-label="下载原文件">
            <Download size={15} />
          </a>
          <button type="button" className="slide-player__btn" onClick={onClose} aria-label="关闭演示">
            <X size={15} />
          </button>
        </div>
      </header>

      <div ref={stageRef} className="slide-player__stage" onClick={onStageClick}>
        <div
          className="slide-player__canvas"
          style={{ width: RENDER_WIDTH, height: RENDER_WIDTH * aspect, transform: `translate(-50%, -50%) scale(${scale})`, visibility: status === "ready" ? "visible" : "hidden" }}
        >
          <div ref={hostRef} />
        </div>
        {status === "loading" && (
          <div className="slide-player__overlay"><Loader2 size={22} className="animate-spin text-emerald-300" /><span>正在加载演示文稿…</span></div>
        )}
        {status === "error" && (
          <div className="slide-player__overlay">
            <p className="text-sm text-amber-200">这份文稿无法在浏览器里播放：{error}</p>
            <a href={downloadUrl} download={deck.fileName || undefined} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-600 px-3 py-1.5 text-xs text-zinc-100 hover:border-zinc-400" onClick={(event) => event.stopPropagation()}>
              <Download size={14} /> 下载原文件
            </a>
          </div>
        )}
      </div>

      {status === "ready" && (
        <footer className="slide-player__foot">
          <button type="button" className="slide-player__btn" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="上一页"><ChevronLeft size={16} /></button>
          <div className="slide-player__progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
          <span className="w-16 text-center font-mono text-xs text-zinc-300" aria-live="polite">{index + 1} / {count}</span>
          <button type="button" className="slide-player__btn" onClick={() => goTo(index + 1)} disabled={index >= count - 1} aria-label="下一页"><ChevronRight size={16} /></button>
        </footer>
      )}
    </div>,
    document.body,
  );
}
