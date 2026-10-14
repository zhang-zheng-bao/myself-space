import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize, Minimize, Pause, Play, X } from "lucide-react";
import type { SlideDeck } from "../types";

/** pptx-preview 的渲染宽度。按固定宽度渲染，再用 transform 缩放到舞台大小 —— 库只在初始化时算一次尺寸，窗口一变就重新解析太慢。 */
const RENDER_WIDTH = 1280;
const AUTOPLAY_OPTIONS = [3, 5, 8, 12];

type Previewer = {
  load: (file: ArrayBuffer) => Promise<{ width: number; height: number; slides: unknown[] }>;
  renderSingleSlide: (index: number) => void;
  destroy: () => void;
  slideCount: number;
};

/** 拿 pptx 原始字节。优先走同源代理（避开 COS 跨域）；代理不认的地址（本地 / 外链）再直连。 */
async function fetchDeck(url: string) {
  const proxied = await fetch(`/api/media/slides?url=${encodeURIComponent(url)}`);
  if (proxied.ok) return proxied.arrayBuffer();
  const direct = await fetch(url);
  if (!direct.ok) throw new Error(`文件读取失败（${direct.status}）`);
  return direct.arrayBuffer();
}

/**
 * 演示文稿播放器（全屏弹层）。
 *
 * 渲染交给 pptx-preview（纯前端解析 .pptx），这里只用它的 load + renderSingleSlide，
 * 翻页 / 键盘 / 全屏 / 自动播放这些交互自己做 —— 库自带的翻页按钮样式没法和站点统一。
 * 库按需动态 import，不进首屏包。
 */
export default function SlidePlayer({ deck, onClose }: { deck: SlideDeck; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const previewerRef = useRef<Previewer | null>(null);

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
    setStatus("loading");
    (async () => {
      try {
        const [{ init }, buffer] = await Promise.all([import("pptx-preview"), fetchDeck(deck.fileUrl)]);
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = "";
        const previewer = init(hostRef.current, { width: RENDER_WIDTH, mode: "list" }) as unknown as Previewer;
        const pptx = await previewer.load(buffer);
        if (cancelled) { previewer.destroy(); return; }
        previewerRef.current = previewer;
        if (pptx.width > 0 && pptx.height > 0) setAspect(pptx.height / pptx.width);
        const total = pptx.slides?.length || 0;
        setCount(total);
        if (total === 0) throw new Error("这份文稿里没有幻灯片。");
        previewer.renderSingleSlide(0);
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
      previewerRef.current?.destroy();
      previewerRef.current = null;
    };
  }, [deck.fileUrl]);

  // 渲染是 DOM 副作用，不能放进 setState 的 updater（StrictMode 会调两次），所以另用 ref 记当前页。
  const indexRef = useRef(0);
  const goTo = useCallback((next: number) => {
    const previewer = previewerRef.current;
    if (!previewer || count === 0) return;
    const target = Math.min(count - 1, Math.max(0, next));
    if (target === indexRef.current) return;
    previewer.renderSingleSlide(target);
    indexRef.current = target;
    setIndex(target);
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
          <a className="slide-player__btn" href={deck.fileUrl} download={deck.fileName || undefined} target="_blank" rel="noopener noreferrer" aria-label="下载原文件">
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
            <a href={deck.fileUrl} download={deck.fileName || undefined} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-600 px-3 py-1.5 text-xs text-zinc-100 hover:border-zinc-400" onClick={(event) => event.stopPropagation()}>
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
