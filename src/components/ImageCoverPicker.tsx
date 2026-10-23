import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type CoverPosition = { x: number; y: number; zoom?: number };
const clamp = (n: number, min=0, max=1) => Math.min(max,Math.max(min,n));
export default function ImageCoverPicker({ file, onSelect }: { file: File; onSelect: (position: CoverPosition) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null), [position, setPosition] = useState({ x: .5, y: 0, zoom: 1 });
  const drag = useRef<{x:number;y:number;position:typeof position}|null>(null);
  const zoom = (factor:number) => setPosition(p=>({...p,zoom:clamp(p.zoom*factor,1,5)}));
  const [error, setError] = useState('');
  const random = () => onSelect({ x: Math.random(), y: Math.random() });
  useEffect(() => {
    dialog.current?.showModal(); let disposed = false; let image: ImageBitmap | undefined;
    createImageBitmap(file).then(value => { image=value; if(disposed)value.close();else setBitmap(value); }).catch(()=>setError('无法预览此图片，将保留原图作为封面。'));
    return ()=>{disposed=true;image?.close();};
  }, [file]);
  useEffect(()=>{
    if(!bitmap || !canvas.current)return;
    const w=Math.min(bitmap.width,bitmap.height*16/9)/position.zoom, h=w*9/16;
    canvas.current.getContext('2d')?.drawImage(bitmap,(bitmap.width-w)*position.x,(bitmap.height-h)*position.y,w,h,0,0,640,360);
  },[bitmap,position]);
  return createPortal(<dialog ref={dialog} className="adm-modal cover-picker" onCancel={e=>{e.preventDefault();random();}} aria-label="选择16:9封面区域">
    <h2>调整独立封面 <span>16:9</span></h2><p>直接拖动画面调整范围，滚轮或按钮缩放。正文图片始终保留原图。</p>
    <canvas ref={canvas} width={640} height={360} aria-label="封面区域预览" tabIndex={0} style={{touchAction:'none',cursor:'grab'}}
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,position};}}
      onPointerMove={e=>{if(!drag.current||!bitmap)return;const start=drag.current,w=Math.min(bitmap.width,bitmap.height*16/9)/start.position.zoom,ratio=w/e.currentTarget.getBoundingClientRect().width;setPosition({...start.position,x:clamp(start.position.x-(e.clientX-start.x)*ratio/Math.max(1,bitmap.width-w)),y:clamp(start.position.y-(e.clientY-start.y)*ratio/Math.max(1,bitmap.height-w*9/16))});}}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
      onWheel={e=>{e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1);}}
      onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setPosition(p=>({...p,x:clamp(p.x+(e.key==='ArrowLeft'?-.05:e.key==='ArrowRight'?.05:0)),y:clamp(p.y+(e.key==='ArrowUp'?-.05:e.key==='ArrowDown'?.05:0))}));}}}/>
    {error && <p role="alert">{error}</p>}
    <div className="cover-zoom"><button type="button" aria-label="缩小封面" onClick={()=>zoom(1/1.2)} disabled={position.zoom<=1}>−</button><span>{Math.round(position.zoom*100)}%</span><button type="button" aria-label="放大封面" onClick={()=>zoom(1.2)} disabled={position.zoom>=5}>+</button><button type="button" onClick={()=>setPosition({x:.5,y:0,zoom:1})}>重置</button></div>
    <footer><button type="button" onClick={random}>不选区域，随机生成</button><button type="button" disabled={!bitmap} onClick={()=>onSelect(position)}>使用选定区域</button></footer>
  </dialog>,document.body);
}
