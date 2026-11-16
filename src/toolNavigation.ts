/** Keep the source URL even when the tool is refreshed or opened in another tab. */
export function toolUrl(target: string, tab?: string): string {
  const source = new URL(window.location.href);
  if (tab) source.searchParams.set("tab", tab);
  const tool = new URL(target, source.origin);
  tool.searchParams.set("returnTo", source.pathname + source.search + source.hash);
  return tool.pathname + tool.search + tool.hash;
}

export function isReturningFromTool(): boolean {
  try {
    return sessionStorage.getItem("tool-return-to") === window.location.pathname + window.location.search + window.location.hash;
  } catch { return false; }
}
