/**
 * 演示文稿的 PDF 渲染工具（前台播放器与后台自动封面共用）。
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
  loadingTask: ReturnType<typeof import("pdfjs-dist")["getDocument"]>;
  destroy: () => Promise<void>;
}

export async function openPdf(data: ArrayBuffer): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await loadingTask.promise;
  return { doc, loadingTask, destroy: () => loadingTask.destroy() };
}

/**
 * 把第 pageNumber 页（从 1 起）画到 canvas 上，宽度按 cssWidth 适配，按设备像素比渲染保证清晰。
 * 返回页面宽高比（高 / 宽）。
 */
export async function renderPdfPage(doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 canvas 渲染");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return base.height / base.width;
}

/** 生成 PDF 第一页的封面图（webp，宽 1280），给后台「未上传封面时自动用第一页」用。 */
export async function pdfFirstPageCover(file: File): Promise<File> {
  const { doc, destroy } = await openPdf(await file.arrayBuffer());
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
