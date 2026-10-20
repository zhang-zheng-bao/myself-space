import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Clock3, FileText, Film, Loader2, Route, Users } from "lucide-react";
import { contentIdentity, videoIdentity, durationLabel } from "../analytics-model";
import type { ContentMetric, EngagementKind, EngagementReport, JourneyReport } from "../analytics-model";
import { sectionCatalog, type AnalyticsRange, type PortfolioData } from "../types";

export function analyticsCatalog(data: PortfolioData) {
  const catalog = new Map<string, string>();
  for (const item of sectionCatalog) catalog.set(item.key, item.label);
  const add = (namespace: string, items: Array<{ id?: string; title?: string; imageUrl?: string }>) => {
    for (const item of items) catalog.set(contentIdentity(namespace, item), item.title || "珍藏图片");
  };
  add("works", data.works || []);
  add("ai", data.profile.pageCopy?.aiWorks || []);
  add("gallery", data.gallery || []);
  add("treasures", data.treasures || []);
  add("poems", data.profile.pageCopy?.poemList || []);
  for (const work of [...data.works || [], ...data.profile.pageCopy?.aiWorks || []]) {
    if (work.videoUrl) catalog.set(videoIdentity("works", work), work.title);
  }
  return catalog;
}
const kindNames = { page: "页面", work: "作品", video: "视频" };
const timeLabel = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
const control = "min-h-9 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40";

function MissingSchema() {
  return <div className="adm-note text-xs leading-6 text-zinc-400">
    内容监测尚未启用。请在 Supabase SQL Editor 执行 <code>supabase/engagement-analytics.sql</code> 后刷新。
    <br />历史访问记录保留；新版页面、作品和视频时长将从启用后开始记录。
  </div>;
}
function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 20));
  if (pages < 2) return null;
  return <nav className="flex items-center justify-end gap-3 pt-2" aria-label="内容统计分页">
    <span className="text-xs text-zinc-500">共 {total} 条 · {page} / {pages}</span>
    <button className={control} disabled={page === 1} onClick={() => onChange(page - 1)}>上一页</button>
    <button className={control} disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页</button>
  </nav>;
}
function useReport<T>(url: string, refresh: number) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({ data: null, loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: "" });
    fetch(url, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? "登录已过期，请重新登录。" : "读取失败，请点击刷新重试。");
      return response.json();
    }).then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: "" }); })
      .catch(error => { if (!controller.signal.aborted) setState({ data: null, loading: false, error: error.message }); });
    return () => controller.abort();
  }, [url, refresh]);
  return state;
}
function LoadStatus({ loading, error }: { loading: boolean; error: string }) {
  if (loading) return <p role="status" className="flex items-center gap-2 py-6 text-xs text-zinc-400"><Loader2 size={14} className="animate-spin" />正在读取内容表现…</p>;
  if (error) return <p role="alert" className="py-4 text-xs text-amber-200">{error}</p>;
  return null;
}

export function JourneyList({ range, humanOnly, visitorKey, contentKey, kind, refresh = 0, catalog }: {
  key?: string; range: AnalyticsRange; humanOnly: boolean; visitorKey?: string; contentKey?: string; kind?: EngagementKind; refresh?: number; catalog: Map<string, string>;
}) {
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ range, humanOnly: humanOnly ? "1" : "0", page: String(page) });
  if (visitorKey) params.set("visitorKey", visitorKey);
  if (contentKey) params.set("contentKey", contentKey);
  if (kind) params.set("kind", kind);
  const { data, loading, error } = useReport<JourneyReport>(`/api/admin/analytics/journey?${params}`, refresh);
  return <div className="space-y-2">
    <LoadStatus loading={loading} error={error} />
    {data && !data.configured && <MissingSchema />}
    {data?.configured && <>
      <p className="text-[11px] leading-5 text-zinc-500">按访问开始时间倒序 · 北京时间 · 每次打开独立记录，视频时间包含在作品阅读时间内。</p>
      {!data.rows.length && <p className="py-5 text-xs text-zinc-400">所选时间内暂无新版浏览轨迹。</p>}
      {data.rows.map(row => {
        const Icon = row.kind === "video" ? Film : row.kind === "page" ? Route : FileText;
        const currentTitle = catalog.get(row.contentKey);
        return <article key={row.id} className="border-l-2 border-zinc-700 py-2 pl-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Icon size={13} className="text-emerald-300" /><span className="text-zinc-500">{kindNames[row.kind]}</span>
            <strong className="text-zinc-200">{row.title}</strong>
            {row.kind !== "page" && !currentTitle && <span className="rounded bg-zinc-800 px-1.5 text-[10px] text-zinc-400">{row.kind === "video" ? "已删除或更换" : "已删除"} · 历史保留</span>}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-zinc-400">
            {row.kind === "video" ? `实际观看 ${durationLabel(row.watchMs)} · ${row.completed ? "已看完 ≥90%" : `最远进度 ${Math.round(row.maxProgress)}%`}` : `停留 ${durationLabel(row.dwellMs)}`}
            {currentTitle && currentTitle !== row.title ? ` · 现名：${currentTitle}` : ""}
          </p>
          <p className="text-[10px] leading-5 text-zinc-500">
            <time>{timeLabel(row.startedAt)}</time> · {catalog.get(row.pageKey) || row.pageKey || row.path}
            {!visitorKey && <span> · 访客 {row.visitorKey.slice(0, 8)}</span>}
            <span> · 访问 #{row.visitId ?? "历史"}</span>
          </p>
        </article>;
      })}
      <Pagination page={page} total={data.total} onChange={setPage} />
    </>}
  </div>;
}

export default function ContentAnalytics({ kind, range, humanOnly, refresh, catalog, visitorKey }: {
  key?: string; kind: EngagementKind; range: AnalyticsRange; humanOnly: boolean; refresh: number; catalog: Map<string, string>; visitorKey?: string;
}) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState("");
  const params = new URLSearchParams({ kind, range, humanOnly: humanOnly ? "1" : "0", page: String(page) });
  if (visitorKey) params.set("visitorKey", visitorKey);
  const { data, loading, error } = useReport<EngagementReport>(`/api/admin/analytics/content?${params}`, refresh);
  const video = kind === "video";
  const columns = video ? ["播放次数", "独立访客", "平均观看", "总观看", "完播率"] : ["打开次数", "独立访客", "平均停留", "总停留"];
  const values = (row: ContentMetric) => video
    ? [row.plays, row.visitors, durationLabel(row.avgWatchMs), durationLabel(row.watchMs), row.plays ? `${Math.round(row.completions / row.plays * 100)}%` : "—"]
    : [row.views, row.visitors, durationLabel(row.avgDwellMs), durationLabel(row.dwellMs)];
  return <section className="space-y-3" aria-label={`${kindNames[kind]}分析`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">{video ? <Film size={16} className="text-emerald-300" /> : <Clock3 size={16} className="text-emerald-300" />}{kindNames[kind]}内容表现</h3>
        <p className="mt-1 text-[11px] leading-5 text-zinc-400">{video
          ? "平均观看 = 实际播放总时长 ÷ 播放次数；完播需实际覆盖至少 90% 的视频。"
          : "平均停留 = 可见停留总时长 ÷ 打开次数；同一访客反复打开会计为多次。"}
          {kind === "page" && " 打开作品详情时暂停底层页面计时。"}</p>
      </div>
      <span className="shrink-0 text-[11px] text-zinc-500">{data?.total ?? "—"} 项</span>
    </div>
    <LoadStatus loading={loading} error={error} />
    {data && !data.configured && <MissingSchema />}
    {data?.configured && !data.items.length && <div className="adm-panel p-6 text-center">
      <Route size={24} className="mx-auto text-zinc-600" />
      <p className="mt-3 text-sm text-zinc-300">这段时间还没有{kindNames[kind]}浏览数据</p>
      <p className="mt-1 text-xs leading-6 text-zinc-500">新内容自动接入统计，有人浏览后就会出现。已删除内容的历史不会被清除。</p>
    </div>}
    {!!data?.items.length && <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-zinc-950 text-[11px] text-zinc-400"><tr><th className="px-3 py-3 font-medium">{kindNames[kind]}名称</th>{columns.map(label => <th key={label} className="px-3 py-3 text-right font-medium">{label}</th>)}</tr></thead>
        <tbody>{data.items.map(row => {
          const title = catalog.get(row.contentKey);
          const open = expanded === row.contentKey;
          return <ContentRows key={row.contentKey} row={row} title={title} open={open} columns={columns.length}
            values={values(row)} onToggle={() => setExpanded(open ? "" : row.contentKey)}>
            <JourneyList key={`${row.contentKey}:${range}:${humanOnly}`} kind={kind} contentKey={row.contentKey} visitorKey={visitorKey} range={range} humanOnly={humanOnly} refresh={refresh} catalog={catalog} />
          </ContentRows>;
        })}</tbody>
      </table>
    </div>}
    {data?.configured && <Pagination page={page} total={data.total} onChange={setPage} />}
  </section>;
}

function ContentRows({ row, title, open, columns, values, onToggle, children }: {
  key?: string; row: ContentMetric; title?: string; open: boolean; columns: number; values: (string | number)[]; onToggle: () => void; children: React.ReactNode;
}) {
  return <>
    <tr className="border-t border-zinc-800">
      <td className="max-w-[240px] px-3 py-3">
        <button onClick={onToggle} aria-expanded={open} className="flex min-h-9 w-full items-center gap-2 text-left text-zinc-200 hover:text-emerald-200">
          <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          <span className="truncate">{title || row.title}</span>
        </button>
        {row.kind !== "page" && !title && <span className="ml-5 text-[10px] text-zinc-500">{row.kind === "video" ? "已删除或更换" : "已删除"} · 历史数据保留</span>}
        {title && title !== row.title && <p className="ml-5 truncate text-[10px] text-zinc-500">访问时：{row.title}</p>}
      </td>
      {values.map((value, index) => <td key={index} className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${index === 2 ? "text-emerald-300" : "text-zinc-300"}`}>{value}</td>)}
    </tr>
    {open && <tr><td colSpan={columns + 1} className="border-t border-zinc-800 bg-zinc-950 px-5 py-4">{children}</td></tr>}
  </>;
}

export function VisitorEngagement({ visitorKey, range, humanOnly, refresh, data }: {
  visitorKey: string; range: AnalyticsRange; humanOnly: boolean; refresh: number; data: PortfolioData;
}) {
  const [view, setView] = useState<"journey" | EngagementKind>("journey");
  const catalog = useMemo(() => analyticsCatalog(data), [data]);
  return <section className="space-y-3 border-t border-zinc-800 pt-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><Users size={15} className="text-emerald-300" />这位访客看了什么</h3>
    <div className="flex flex-wrap gap-2">
      {([["journey", "浏览轨迹"], ["page", "页面停留"], ["work", "作品阅读"], ["video", "视频观看"]] as const).map(([key, label]) => <button key={key} onClick={() => setView(key)} aria-pressed={view === key} className={`${control} ${view === key ? "bg-zinc-800 text-emerald-200" : ""}`}>{label}</button>)}
    </div>
    {view === "journey" ? <JourneyList key={`${visitorKey}:${range}:${humanOnly}`} visitorKey={visitorKey} range={range} humanOnly={humanOnly} refresh={refresh} catalog={catalog} />
      : <ContentAnalytics key={`${view}:${range}:${humanOnly}`} visitorKey={visitorKey} kind={view} range={range} humanOnly={humanOnly} refresh={refresh} catalog={catalog} />}
  </section>;
}
