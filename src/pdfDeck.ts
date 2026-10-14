/**
 * 演示文稿的 PDF 渲染工具（前台播放器、后台自动封面共用）。
 *
 * pdf.js 体积不小，统一走动态 import，只有真的打开演示 / 上传 PDF 时才加载。
 * worker 用 Vite 的 `?url` 引入，打包后是一个独立的静态文件，不会被内联进主包。
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((error) => {
      pdfjsPromise = null;
      throw error;
    });
  }
  return pdfjsPromise;
}

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

function wrap(task: { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<void> }): Promise<OpenedPdf> {
  return task.promise.then((doc) => ({ doc, destroy: () => task.destroy() }));
}

/** 同源代理地址。签名过期、CORS 被拦时用它兜底 —— 代理用服务器自己的密钥取对象，不依赖签名。 */
export function slidesProxyUrl(url: string) {
  return `/api/media/slides?url=${encodeURIComponent(url)}`;
}

/**
 * 打开一份 PDF，让 pdf.js 自己按 Range 分块取。
 *
 * 为什么不是「先整个下回来再喂给 pdf.js」：演示文稿动辄几 MB，整份下完才能画第一页，
 * 用户要盯着加载页等；分块加载只要拿到文件头和第一页那几个对象就能出画面，通常
 * 几十到几百 KB，首屏快一个数量级。
 *
 * 先直连 COS 的签名地址（少一跳）。直连失败（签名过期、被 CORS/网络策略拦掉）再走
 * 同源代理，代理同样支持 Range。
 */
export async function openPdfUrl(
  directUrl: string,
  onProgress?: (ratio: number) => void,
): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs();
  const options = {
    rangeChunkSize: 262144,
    /*
     * 关掉「后台把整份悄悄下完」。
     *
     * 开着的话 pdf.js 会在首屏之后继续把几 MB 全拉下来 —— 首屏看着快了，但用户
     * 的带宽被占满，真正需要的下一页反而要排队；关掉之后取哪页拿哪页，首屏只要
     * 文件头 + 第一页那几个对象（通常几百 KB，整份动辄几 MB）。
     */
    disableAutoFetch: true,
    onProgress: ({ loaded, total }: { loaded: number; total: number }) => onProgress?.(total ? loaded / total : 0),
  };

  const attempt = (url: string) => wrap(pdfjs.getDocument({ url, ...options }) as any);

  try {
    return await attempt(directUrl);
  } catch (error) {
    const proxy = slidesProxyUrl(directUrl);
    if (proxy === directUrl) throw error;
    return attempt(proxy);
  }
}

/** 直接从内存里的字节打开（后台拿本地 File 生成封面时用）。 */
export async function openPdfBytes(data: ArrayBuffer): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs();
  return wrap(pdfjs.getDocument({ data: new Uint8Array(data) }) as any);
}

/** 整份取回：优先同源代理，代理不认的地址（本地 / 外链）再直连。 */
async function fetchWholeFile(url: string) {
  const proxied = await fetch(slidesProxyUrl(url));
  if (proxied.ok) return proxied.arrayBuffer();
  const direct = await fetch(url);
  if (!direct.ok) throw new Error(`文件读取失败（${direct.status}）`);
  return direct.arrayBuffer();
}

/** 整份取回再解析 —— 慢，但对外部条件没有任何要求，作为兜底路径。 */
export async function openPdfWhole(url: string): Promise<OpenedPdf> {
  return openPdfBytes(await fetchWholeFile(url));
}

/** 分块加载的等待预算。超了就说明这条路上某一段不配合（网关拦了 Range、连接太差…）。 */
const RANGE_BUDGET_MS = 12000;

/**
 * 打开演示文稿的推荐入口：先用分块加载（快），超预算就退回整份取回。
 *
 * 为什么要有这条兜底：分块加载依赖「浏览器能读到 Content-Range」等一串外部条件，
 * 少一个环节就可能既不报错也一直不出画面。有道超时兜底，最坏情况也只是退回原来
 * 那条慢但不坏的路径，不会让用户对着加载页干等。
 */
export async function openPdfSmart(url: string, onProgress?: (ratio: number) => void): Promise<OpenedPdf> {
  const rangeAttempt = openPdfUrl(url, onProgress);
  let timer = 0;
  try {
    return await Promise.race([
      rangeAttempt,
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error("range-timeout")), RANGE_BUDGET_MS); }),
    ]);
  } catch {
    // 丢掉这次没跑完的分块加载，改用整份取回 —— 别让它和后面的请求抢带宽。
    void rangeAttempt.then((opened) => opened.destroy()).catch(() => undefined);
    return openPdfWhole(url);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 把第 pageNumber 页（从 1 起）画到 canvas 上，按 cssWidth 适配显示宽度，
 * 并乘设备像素比保证清晰。返回页面宽高比（高 / 宽）。
 *
 * 画布分辨率封顶在 1920px 宽：再高肉眼看不出来，渲染耗时却成倍涨 ——
 * 翻页时那点延迟主要就出在这里。
 */
export async function renderPdfPage(doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.min(cssWidth * dpr, 1920);
  const viewport = page.getViewport({ scale: backingWidth / base.width });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 canvas 渲染");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return base.height / base.width;
}

/** 生成 PDF 第一页的封面图（webp，宽 1280），给后台「未上传封面时自动用第一页」用。 */
export async function pdfFirstPageCover(file: File): Promise<File> {
  const { doc, destroy } = await openPdfBytes(await file.arrayBuffer());
  try {
    const canvas = document.createElement("canvas");
    await renderPdfPage(doc, 1, canvas, 1280 / Math.min(window.devicePixelRatio || 1, 2));
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) throw new Error("封面生成失败");
    const name = file.name.replace(/\.pdf$/i, "") + "-cover.webp";
    return new File([blob], name, { type: "image/webp" });
  } finally {
    void destroy();
  }
}
