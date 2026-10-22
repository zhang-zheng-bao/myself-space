import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type CoverPosition = { x: number; y: number };
export default function ImageCoverPicker({ file, onSelect }: { file: File; onSelect: (position: CoverPosition) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null), [position, setPosition] = useState({ x: .5, y: 0 });
  const [error, setError] = useState('');
  const random = () => onSelect({ x: Math.random(), y: Math.random() });
  useEffect(() => {
    dialog.current?.showModal(); let disposed = false; let image: ImageBitmap | undefined;
    createImageBitmap(file).then(value => { image=value; if(disposed)value.close();else setBitmap(value); }).catch(()=>setError('无法预览此图片，将保留原图作为封面。'));
    return ()=>{disposed=true;image?.close();};
  }, [file]);
  useEffect(()=>{
    if(!bitmap || !canvas.current)return;
    const w=Math.min(bitmap.width,bitmap.height*16/9), h=w*9/16;
    canvas.current.getContext('2d')?.drawImage(bitmap,(bitmap.width-w)*position.x,(bitmap.height-h)*position.y,w,h,0,0,640,360);
  },[bitmap,position]);
  return createPortal(<dialog ref={dialog} className="adm-modal cover-picker" onCancel={e=>{e.preventDefault();random();}} aria-label="选择16:9封面区域">
    <h2>选择封面区域 <span>16:9</span></h2><p>移动滑块选择截取位置，详情中的原图不会裁切。不选区域可随机生成。</p>
    <canvas ref={canvas} width={640} height={360} aria-label="封面区域预览"/>
    {error && <p role="alert">{error}</p>}
    {bitmap && <><label>上下位置<input type="range" min="0" max="100" value={position.y*100} disabled={bitmap.height<=bitmap.width*9/16} onChange={e=>setPosition(p=>({...p,y:Number(e.target.value)/100}))}/></label><label>左右位置<input type="range" min="0" max="100" value={position.x*100} disabled={bitmap.width<=bitmap.height*16/9} onChange={e=>setPosition(p=>({...p,x:Number(e.target.value)/100}))}/></label></>}
    <footer><button type="button" onClick={random}>不选区域，随机生成</button><button type="button" disabled={!bitmap} onClick={()=>onSelect(position)}>使用选定区域</button></footer>
  </dialog>,document.body);
}
