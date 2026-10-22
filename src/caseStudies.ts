import type { Work } from "./types";

// Only seed sites that have never configured cases; an explicitly empty list stays empty.
export const defaultCaseWorks: Work[] = [{
  id: "jiuyang-storyboard",
  category: "视频案例",
  title: "九阳豆浆｜视频分镜与 Prompt 分析",
  description: "从画面、对白到人物与道具资产，解析提示词从初稿到终稿的设计过程。仅用于学习参考，分镜资产和提示词为二创，非官方原版。",
  images: [],
  tags: ["分镜分析", "Prompt 设计"],
  pageUrl: "/cases/jiuyang/index.html",
}];

export function casePageUrl(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
