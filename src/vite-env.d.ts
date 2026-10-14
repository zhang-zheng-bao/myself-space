/// <reference types="vite/client" />

// pdf.js 的 worker 文件用 Vite 的 `?url` 引入成静态资源地址。
declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const src: string;
  export default src;
}
