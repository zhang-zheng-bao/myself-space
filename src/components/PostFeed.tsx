import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import "./post-grid.css";
import { contentIdentity } from "../analytics-model";

type Post = { id: string; title: string; text: string; images: string[]; coverUrl?: string; tags?: string[]; date?: string };

export default function PostFeed({ items }: { items: Post[]; onZoom?: (images: string[], index: number) => void }) {
  const [selected, setSelected] = useState<Post | null>(null);
  return <>
    <div className="notes-grid">{items.map(post => <button type="button" className="notes-card" key={post.id} onClick={() => setSelected(post)} aria-label={`查看${post.title || "图文"}`}>
      {(post.coverUrl || post.images?.[0]) && <div className="notes-cover"><img src={post.coverUrl || post.images[0]} alt={post.title} loading="lazy" referrerPolicy="no-referrer" /><span>{post.images?.length || 0} 张</span></div>}
      <div className="notes-summary"><h3>{post.title || "图文随记"}</h3><p>{post.text}</p><small>{post.date}</small></div>
    </button>)}</div>
    {selected && <PostReader post={selected} onClose={() => setSelected(null)} />}
  </>;
}

function PostReader({ post, onClose }: { post: Post; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [original, setOriginal] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 800, height: 500 });
  const [zoom, setZoom] = useState(100);
  const images = post.images.filter(Boolean);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport({ width: element.clientWidth - 32, height: element.clientHeight - 32 }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { scroll.current?.scrollTo(0, 0); setOriginal(false); setSize({ width: 0, height: 0 }); setZoom(100); }, [index]);
  const isLong = size.height > size.width * 2;
  const fittedWidth = size.width ? (isLong
    ? Math.min(viewport.width, 760, size.width * 2)
    : Math.min(viewport.width, viewport.height * size.width / size.height, size.width)) : viewport.width;
  const displayWidth = Math.max(1, (original ? size.width : fittedWidth) * zoom / 100);
  return createPortal(<dialog ref={dialog} className="notes-dialog" aria-label={post.title || "图文详情"} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="notes-reader" data-analytics-kind="work" data-analytics-key={contentIdentity("posts", post)} data-analytics-title={post.title || "图文"}>
      <header><h2>{post.title || "图文详情"}</h2><button type="button" onClick={onClose} aria-label="关闭图文"><X size={21} /></button></header>
      <div className="notes-controls"><button type="button" disabled={index === 0} onClick={() => setIndex(i => i - 1)} aria-label="上一张"><ChevronLeft /></button><span aria-live="polite">{images.length ? index + 1 : 0} / {images.length}</span><button type="button" disabled={index >= images.length - 1} onClick={() => setIndex(i => i + 1)} aria-label="下一张"><ChevronRight /></button><button type="button" onClick={() => { setOriginal(v => !v); setZoom(100); }} aria-pressed={original}><ZoomIn size={17} />{original ? "适应阅读" : "原始尺寸"}</button><label className="notes-zoom">缩放 <input aria-label="图片缩放" type="range" min="50" max="200" step="10" value={zoom} onChange={e => setZoom(Number(e.target.value))} />{zoom}%</label><small>{size.width ? `${size.width} × ${size.height} px${isLong ? ' · 长图可上下滚动' : ''}` : '加载原图…'}</small></div>
      <div ref={scroll} className="notes-image-scroll" tabIndex={0} aria-label="图片阅读区，可滚动">{images[index] ? <img key={images[index]} style={{ width: displayWidth, maxWidth: 'none', height: 'auto', visibility: size.width ? 'visible' : 'hidden' }} onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} src={images[index]} alt={`${post.title} 第${index + 1}张`} referrerPolicy="no-referrer" /> : <p>暂无图片</p>}</div>
      {images.length > 1 && <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 18px", flexShrink: 0 }} aria-label="选择图片">{images.map((url, i) => <button key={`${url}-${i}`} type="button" onClick={() => setIndex(i)} aria-label={`查看第${i + 1}张`} aria-pressed={i === index} style={{ flexShrink: 0, borderColor: i === index ? "#79cbb5" : undefined }}><img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: 54, height: 40, objectFit: "contain" }} /><small>{i + 1}</small></button>)}</div>}
      {(post.text || post.tags?.length) && <div className="notes-description"><p>{post.text}</p><small>{post.tags?.map(t => `#${t}`).join(" ")}</small></div>}
    </div>
  </dialog>, document.body);
}
