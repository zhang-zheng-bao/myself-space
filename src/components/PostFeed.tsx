import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, Download, Images } from "lucide-react";
import "./post-grid.css";
import { contentIdentity } from "../analytics-model";

type Post = { id: string; title: string; text: string; images: string[]; previews?: { source: string; url: string }[]; coverUrl?: string; tags?: string[]; date?: string };
const identity = (url: string) => { try { const u = new URL(url, location.origin); return u.origin + u.pathname; } catch { return url; } };
const previewFor = (post: Post, url: string) => post.previews?.find(p => identity(p.source) === identity(url))?.url || url;

export default function PostFeed({ items }: { items: Post[]; onZoom?: (images: string[], index: number) => void }) {
  const [selected, setSelected] = useState<Post | null>(null);
  return <>
    <div className="work-grid grid grid-cols-1 gap-4 pt-2 md:grid-cols-2 xl:grid-cols-3">{items.map(post => <button type="button" className="work-card group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-zinc-900 bg-zinc-950/60 text-left transition-all duration-500 hover:border-zinc-700 hover:bg-zinc-950" key={post.id} onClick={() => setSelected(post)} aria-label={`查看${post.title || "图文"}`}>
      <div className="work-card__media relative aspect-video w-full overflow-hidden bg-zinc-950/60 shadow-inner">
        {(post.coverUrl || post.images?.[0]) ? <img className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" src={post.coverUrl || previewFor(post, post.images[0])} alt={post.title} loading="lazy" decoding="async" referrerPolicy="no-referrer"/> : <div className="flex h-full items-center justify-center text-xs text-zinc-500">暂无封面</div>}
        <span className="work-card__category absolute left-2.5 top-2.5 rounded border border-white/15 bg-black/65 px-2 py-1 text-[10px] text-zinc-100">图文</span><span className="absolute right-2.5 top-2.5 rounded border border-white/15 bg-black/65 px-2 py-1 text-[10px] text-zinc-200">{post.images?.length || 0} 图</span>
        <span className="work-card__tags absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap gap-1.5">{post.tags?.slice(0,3).map(tag=><span key={tag} className="rounded border border-white/15 bg-black/65 px-2 py-0.5 text-[10px] text-zinc-200">{tag}</span>)}</span>
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100"><span className="rounded border border-white/20 bg-black/75 px-3 py-1.5 text-[11px] text-zinc-100">查看详情</span></span>
      </div>
      <div className="flex flex-1 flex-col p-4"><h3 className="portfolio-card__title">{post.title || "图文随记"}</h3><p className="portfolio-card__description">{post.text}</p></div>
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
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [retry, setRetry] = useState(0);
  const [downloading, setDownloading] = useState(false), [fullscreen, setFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; distance: number } | null>(null);
  const anchor = useRef<{ x: number; y: number; left: number; top: number; width: number } | null>(null);
  const live = useRef({ zoom: 100, width: 1 });
  const ownsFullscreen = useRef(false);
  const images = post.images.filter(Boolean);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { document.body.style.overflow = overflow; previous?.focus(); if(ownsFullscreen.current && document.fullscreenElement)void document.exitFullscreen().catch(()=>{}); };
  }, []);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport({ width: element.clientWidth - 32, height: element.clientHeight - 32 }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function select(next: number) {
    if (next < 0 || next >= images.length || next === index) return;
    setIndex(next); scroll.current?.scrollTo(0, 0); setOriginal(false); setSize({ width: 0, height: 0 }); setZoom(100); setError(''); setMessage(''); anchor.current = null;
  }
  const isLong = size.height > size.width * 2;
  const fittedWidth = size.width ? (isLong
    ? Math.min(viewport.width, size.width)
    : Math.min(viewport.width, viewport.height * size.width / size.height, size.width)) : viewport.width;
  const displayWidth = Math.max(1, (original ? size.width : fittedWidth) * zoom / 100);
  live.current = { zoom, width: displayWidth };
  function changeZoom(next: number, x?: number, y?: number) {
    const el = scroll.current; if (!el || !size.width) return;
    const rect = el.getBoundingClientRect();
    anchor.current = { x: x === undefined ? el.clientWidth / 2 : x - rect.left, y: y === undefined ? el.clientHeight / 2 : y - rect.top, left: el.scrollLeft, top: el.scrollTop, width: live.current.width };
    setZoom(Math.min(400, Math.max(25, next)));
  }
  useLayoutEffect(() => {
    const el = scroll.current, a = anchor.current;
    if (el && a) {
      const oldMargin = Math.max(16, (el.clientWidth - a.width) / 2), newMargin = Math.max(16, (el.clientWidth - displayWidth) / 2);
      el.scrollLeft = (a.left + a.x - oldMargin) * displayWidth / a.width + newMargin - a.x;
      el.scrollTop = (a.top + a.y - 16) * displayWidth / a.width + 16 - a.y;
      anchor.current = null;
    }
  }, [displayWidth]);
  useEffect(() => {
    const el = scroll.current!;
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); changeZoom(live.current.zoom * Math.exp(-e.deltaY * .003), e.clientX, e.clientY); } };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [size.width]);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update); return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  function pointer(e: PointerEvent<HTMLDivElement>) {
    if (e.type === 'pointerdown') { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
    else if (e.type === 'pointermove') { if (!pointers.current.has(e.pointerId)) return; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
    else { pointers.current.delete(e.pointerId); gesture.current = null; return; }
    const points = [...pointers.current.values()], x = points.reduce((s,p)=>s+p.x,0)/points.length, y = points.reduce((s,p)=>s+p.y,0)/points.length;
    const distance = points.length>1 ? Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y) : 0, last = gesture.current;
    if (last && e.type === 'pointermove') {
      if (distance && last.distance) changeZoom(live.current.zoom * distance / last.distance,x,y);
      else if (!distance) { e.currentTarget.scrollLeft -= x-last.x; e.currentTarget.scrollTop -= y-last.y; }
    }
    gesture.current = { x,y,distance };
  }
  async function download() {
    setDownloading(true); setMessage('');
    try {
      let response: Response;
      try { response = await fetch(`/api/media/image-download?url=${encodeURIComponent(images[index])}`, { signal: AbortSignal.timeout(45000) }); if (!response.ok) throw new Error(); }
      catch { response = await fetch(images[index], { referrerPolicy:'no-referrer', signal: AbortSignal.timeout(15000) }); }
      if (!response.ok) throw new Error();
      const blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `${post.title || '图片'}-${index+1}.${blob.type.split('/')[1]?.replace('jpeg','jpg') || 'png'}`; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch { setMessage('浏览器无法直接下载，请打开原图后另存为。'); } finally { setDownloading(false); }
  }
  return createPortal(<dialog ref={dialog} className={`notes-dialog${fullscreen ? ' notes-fullscreen' : ''}`} aria-label={post.title || "图文详情"} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }} onKeyDown={e=>{ if ((e.target as HTMLElement).matches('input,textarea,select')) return; if(e.key==='ArrowLeft'){e.preventDefault();select(index-1);} if(e.key==='ArrowRight'){e.preventDefault();select(index+1);} if(e.key==='+'||e.key==='=')changeZoom(zoom*1.25); if(e.key==='-')changeZoom(zoom/1.25); }}>
    <div className="notes-reader" data-analytics-kind="work" data-analytics-key={contentIdentity("posts", post)} data-analytics-title={post.title || "图文"}>
      <header>
        <h2>{post.title || '图文详情'}</h2>
        <div className="notes-header-actions">
          <select className="notes-zoom-select" aria-label="图片缩放" value={original?'original':String(Math.round(zoom))} onChange={e=>{if(e.target.value==='original'){setOriginal(true);setZoom(100);}else{setOriginal(false);changeZoom(Number(e.target.value));}}}>
            {Array.from(new Set([25,50,75,100,125,150,200,300,400,Math.round(zoom)])).sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n}%</option>)}
            <option value="original">原始尺寸</option>
          </select>
          <button type="button" disabled={downloading} onClick={()=>void download()} aria-label={downloading?'正在下载图片':'下载图片'} title="下载原图"><Download size={19}/></button>
          <button type="button" onClick={onClose} aria-label="关闭图文" title="关闭"><X size={21}/></button>
        </div>
      </header>
      {message && <p className="notes-reader-message" role="status">{message}</p>}
      <div ref={scroll} className="notes-image-scroll" tabIndex={0} aria-label="图片阅读区，可滚动" onPointerDown={pointer} onPointerMove={pointer} onPointerUp={pointer} onPointerCancel={pointer} onLostPointerCapture={e=>{pointers.current.delete(e.pointerId);gesture.current=null;}} onDoubleClick={e=>changeZoom(zoom>100?100:200,e.clientX,e.clientY)}>
        {!size.width && !error && images[index] && <p role="status">正在加载高清图片…</p>}
        {error ? <div role="alert"><p>{error}</p><button onClick={()=>{setError('');setRetry(n=>n+1);}}>重新加载</button></div> : images[index] ? <img key={`${images[index]}-${retry}`} draggable={false} decoding="async" style={{width:displayWidth,maxWidth:'none',height:'auto',display:size.width?'block':'none'}} onLoad={e=>setSize({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} onError={()=>setError('图片加载失败，请重试或查看原图。')} src={images[index]} alt={`${post.title} 第${index+1}张`} referrerPolicy="no-referrer"/> : <p>暂无图片</p>}
      </div>
      {images.length>1 && showThumbnails && <div className="notes-thumbnails" aria-label="选择图片">{images.map((url,i)=><button key={`${url}-${i}`} onClick={()=>select(i)} aria-label={`查看第${i+1}张`} aria-pressed={i===index}><img src={previewFor(post,url)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/></button>)}</div>}
      <footer className="notes-controls">
        <div className="notes-paging">{images.length>1 ? <><button disabled={index===0} onClick={()=>select(index-1)} aria-label="上一张"><ChevronLeft size={18}/></button><span aria-live="polite">{index+1} / {images.length}</span><button disabled={index>=images.length-1} onClick={()=>select(index+1)} aria-label="下一张"><ChevronRight size={18}/></button></> : <span>1 / 1</span>}</div>
        <span className="notes-image-dimensions">{size.width ? `${size.width} × ${size.height}` : ''}</span>
        <div className="notes-footer-end">{images.length>1 && <button aria-label="显示缩略图" title="缩略图" aria-pressed={showThumbnails} onClick={()=>setShowThumbnails(v=>!v)}><Images size={18}/></button>}</div>
      </footer>
    </div>
  </dialog>, document.body);
}
