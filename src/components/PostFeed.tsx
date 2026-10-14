import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ZoomIn } from "lucide-react";
import type { ImagePost } from "../types";

/**
 * 「图文」栏目：小红书式竖滑卡片流。
 *
 * - 外层是一个自带高度的竖向 scroll-snap 容器，一条图文占满一屏，滚轮 / 触摸 / ↑↓ 键切换。
 * - 卡内图片是横向 scroll-snap 轮播，左右滑或点箭头翻图，底部圆点 + 计数。
 *
 * 两层都用原生滚动 + snap 而不是自己算位移：触摸惯性、触控板、键盘滚动都是浏览器给的，
 * 手感最接近原生 App，也不需要手势库。
 */
export default function PostFeed({ items, onZoom }: {
  items: ImagePost[];
  /** 点图放大：交给上层复用全站统一的大图灯箱。 */
  onZoom: (images: string[], index: number) => void;
}) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState(0);

  // 按滚动位置推算当前是第几条；snap 停稳后 scrollTop 恰好是整数倍。
  const onScroll = () => {
    const el = feedRef.current;
    if (!el || el.clientHeight === 0) return;
    setCurrent(Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / el.clientHeight))));
  };

  const goTo = (index: number) => {
    const el = feedRef.current;
    if (!el) return;
    const next = Math.min(items.length - 1, Math.max(0, index));
    el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" });
  };

  // 条目数变化（后台删了几条）时别停在越界的位置。
  useEffect(() => {
    if (current > items.length - 1) setCurrent(Math.max(0, items.length - 1));
  }, [items.length, current]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "PageDown") { event.preventDefault(); goTo(current + 1); }
    if (event.key === "ArrowUp" || event.key === "PageUp") { event.preventDefault(); goTo(current - 1); }
  };

  return (
    <div className="post-feed">
      <div
        ref={feedRef}
        className="post-feed__track"
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="region"
        aria-roledescription="图文卡片流"
        aria-label={`图文，第 ${current + 1} / ${items.length} 条，上下键切换`}
      >
        {items.map((post, index) => (
          <PostCard key={post.id || index} post={post} index={index} total={items.length} onZoom={onZoom} />
        ))}
      </div>

      {items.length > 1 && (
        <div className="post-feed__rail" aria-label="切换图文">
          <button type="button" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="上一条">
            <ChevronUp size={18} />
          </button>
          <span className="font-mono text-[11px] text-zinc-400" aria-live="polite">
            {current + 1}<br />—<br />{items.length}
          </span>
          <button type="button" onClick={() => goTo(current + 1)} disabled={current >= items.length - 1} aria-label="下一条">
            <ChevronDown size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, index, total, onZoom }: {
  key?: string | number;
  post: ImagePost;
  index: number;
  total: number;
  onZoom: (images: string[], index: number) => void;
}) {
  const images = (post.images || []).filter(Boolean);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [slide, setSlide] = useState(0);

  const onScroll = () => {
    const el = stripRef.current;
    if (!el || el.clientWidth === 0) return;
    setSlide(Math.min(images.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  };

  const goTo = (next: number) => {
    const el = stripRef.current;
    if (!el) return;
    const target = Math.min(images.length - 1, Math.max(0, next));
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    // 只吃左右键，上下键冒泡给外层卡片流。
    if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); goTo(slide + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); event.stopPropagation(); goTo(slide - 1); }
  };

  const tags = (post.tags || []).map((tag) => tag.trim()).filter(Boolean);

  return (
    <article className="post-card" aria-label={`第 ${index + 1} / ${total} 条：${post.title || "图文"}`}>
      <div className="post-card__media">
        {images.length > 0 ? (
          <>
            <div
              ref={stripRef}
              className="post-card__strip"
              onScroll={onScroll}
              onKeyDown={onKeyDown}
              tabIndex={0}
              aria-roledescription="图片轮播"
              aria-label={`图片 ${slide + 1} / ${images.length}，左右键翻页`}
            >
              {images.map((url, i) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  className="post-card__slide"
                  onClick={() => onZoom(images, i)}
                  aria-label={`放大第 ${i + 1} 张`}
                  tabIndex={-1}
                >
                  <img src={url} alt={post.title ? `${post.title} 第 ${i + 1} 张` : `第 ${i + 1} 张`} loading={i === 0 ? "eager" : "lazy"} referrerPolicy="no-referrer" draggable={false} />
                </button>
              ))}
            </div>
            {images.length > 1 && (
              <>
                <button type="button" className="post-card__arrow post-card__arrow--prev" onClick={() => goTo(slide - 1)} disabled={slide === 0} aria-label="上一张">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" className="post-card__arrow post-card__arrow--next" onClick={() => goTo(slide + 1)} disabled={slide >= images.length - 1} aria-label="下一张">
                  <ChevronRight size={18} />
                </button>
                <span className="post-card__count">{slide + 1}/{images.length}</span>
                <div className="post-card__dots" aria-hidden="true">
                  {images.map((_, i) => <i key={i} data-active={i === slide || undefined} />)}
                </div>
              </>
            )}
            <span className="post-card__zoom" aria-hidden="true"><ZoomIn size={13} /> 点图放大</span>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">这条图文还没有图片</div>
        )}
      </div>

      <div className="post-card__body">
        {post.title ? <h3 className="font-serif text-xl font-bold leading-snug tracking-wide text-white">{post.title}</h3> : null}
        {post.text ? <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-zinc-300">{post.text}</p> : null}
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1">
            {tags.map((tag) => <span key={tag} className="text-sm text-sky-300/90">#{tag.replace(/^#/, "")}</span>)}
          </div>
        )}
        {post.date ? <p className="mt-5 font-mono text-[11px] text-zinc-500">{post.date}</p> : null}
      </div>
    </article>
  );
}
