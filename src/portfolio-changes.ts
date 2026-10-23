export type PortfolioChange = { path: string[]; before: unknown; value: unknown; remove?: boolean };
const roots = new Set(['profile', 'experiences', 'prospects', 'works', 'gallery', 'treasures', 'musicTracks', 'contact']);
const ignored = new Set(['page_copy', 'resume_pdf_url', 'music_autoplay', 'updated_at', 'created_at']);
const object = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function comparable(value: any): string {
  function clean(v: any): any {
    if (Array.isArray(v)) return v.map(clean);
    if (object(v)) return Object.fromEntries(Object.keys(v).filter(k => !ignored.has(k)).sort().map(k => [k, clean(v[k])]));
    if (typeof v === 'string' && /^https?:\/\//.test(v)) {
      try { const url = new URL(v); if (url.searchParams.has('q-sign-algorithm')) { for (const key of [...url.searchParams.keys()]) if (key.startsWith('q-')) url.searchParams.delete(key); return url.href; } } catch { /* Plain text. */ }
    }
    return v ?? null;
  }
  return JSON.stringify(clean(value));
}
export function portfolioChanges(before: any, next: any): PortfolioChange[] {
  const changes: PortfolioChange[] = [];
  function walk(a: any, b: any, path: string[]) {
    if (comparable(a) === comparable(b)) return;
    if (object(a) && object(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (!ignored.has(key)) walk(a[key], b[key], [...path, key]);
    } else changes.push({ path, before: a ?? null, value: b ?? null, ...(b === undefined ? { remove: true } : {}) });
  }
  for (const root of roots) walk(before[root], next[root], [root]);
  return changes;
}
export function mergePortfolioChanges(current: any, changes: PortfolioChange[]) {
  if (!Array.isArray(changes) || changes.length > 500) throw new Error('修改内容格式错误');
  const next = structuredClone(current), sections = new Set<string>();
  for (const change of changes) {
    if (!change || !Array.isArray(change.path) || !change.path.length || change.path.length > 8 || !roots.has(change.path[0]) || change.path.some(k => typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('修改字段不受支持');
    let parent = next;
    for (const key of change.path.slice(0, -1)) { if (parent[key] === undefined) parent[key] = {}; if (!object(parent[key])) throw new Error('修改路径无效'); parent = parent[key]; }
    const key = change.path.at(-1)!;
    // Missing fields may have UI defaults. Existing edits must not be overwritten.
    if (parent[key] !== undefined && comparable(parent[key]) !== comparable(change.before) && comparable(parent[key]) !== comparable(change.value)) {
      const error = new Error('此栏目已被其他页面修改，请刷新后核对再保存。'); Object.assign(error, { status: 409 }); throw error;
    }
    if (change.remove) delete parent[key]; else parent[key] = change.value;
    sections.add(change.path[0]);
  }
  return { next, sections };
}

// Retain edits made during a save, while accepting unrelated changes from the server.
export function rebasePortfolioDraft<T>(saved: T, submitted: T, draft: T): T {
  const edits = portfolioChanges(submitted, draft).map(change => ({ ...change, before: change.path.reduce((value: any, key) => value?.[key], saved) ?? null }));
  return mergePortfolioChanges(saved, edits).next;
}
