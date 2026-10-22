import { pdfFirstPageCover } from './pdfDeck';

/** Read the embedded first-slide preview, or render slide one when it is missing. */
export async function slideFirstPageCover(file: File): Promise<File> {
  if (/\.pdf$/i.test(file.name)) return pdfFirstPageCover(file);
  const { default: JSZip } = await import('jszip');
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const thumbnail = archive.file(/^docProps\/thumbnail\.(png|jpe?g)$/i)[0];
  if (thumbnail) {
    const blob = await thumbnail.async('blob');
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(1280, bitmap.width); canvas.height = Math.round(canvas.width * bitmap.height / bitmap.width);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = await new Promise<Blob | null>(resolve=>canvas.toBlob(resolve,'image/webp',.9));
      if(image)return new File([image],file.name.replace(/\.pptx$/i,'-cover.webp'),{type:'image/webp'});
    } finally { bitmap.close(); }
  }
  const [{ init }, { toBlob }] = await Promise.all([import('pptx-preview'), import('html-to-image')]);
  const host = document.createElement('div');
  host.style.cssText='position:fixed;left:-10000px;top:0;width:1280px;background:white;pointer-events:none;';
  document.body.append(host);
  const previewer = init(host,{width:1280,mode:'list'});
  try {
    const deck = await previewer.load(await file.arrayBuffer());
    if(!deck.slides?.length)throw new Error('PPT 中没有页面');
    previewer.renderSingleSlide(0);
    await document.fonts.ready;
    await Promise.all(Array.from(host.querySelectorAll('img')).map(img=>img.decode().catch(()=>{})));
    const page = host.firstElementChild as HTMLElement | null;
    if(!page)throw new Error('无法渲染 PPT 首页');
    const blob = await toBlob(page,{pixelRatio:1,skipFonts:true,backgroundColor:'#ffffff'});
    if(!blob)throw new Error('无法生成 PPT 首页图片');
    return new File([blob],file.name.replace(/\.pptx$/i,'-cover.png'),{type:'image/png'});
  } finally {previewer.destroy();host.remove();}
}
