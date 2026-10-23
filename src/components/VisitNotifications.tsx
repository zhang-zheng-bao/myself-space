import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { durationLabel, type VisitNotice } from "../analytics-model";

const STORAGE = "portfolio:visit-notices:v1";
export default function VisitNotifications({ onView }: { onView: (key: string) => void }) {
  const [notices, setNotices] = useState<VisitNotice[]>([]);
  useEffect(() => {
    let stopped = false;
    let busy = false;
    let unauthorized = false;
    const memory = new Set<string>();
    const controller = new AbortController();
    const readSeen = (): string[] => {
      try { const parsed = JSON.parse(localStorage.getItem(STORAGE) || "[]"); return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string").slice(-1000) : []; }
      catch { return []; }
    };
    const check = async () => {
      if (busy || stopped || unauthorized || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const response = await fetch("/api/admin/analytics/recent-visits", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { unauthorized = true; return; }
        if (!response.ok) return;
        const data = await response.json();
        if (stopped || !Array.isArray(data.visits)) return;
        const seen = new Set([...readSeen(), ...memory]);
        const fresh = (data.visits as VisitNotice[]).filter(row => !seen.has(`${row.id}:${row.createdAt}`));
        if (!fresh.length) return;
        for (const row of fresh) { const key = `${row.id}:${row.createdAt}`; seen.add(key); memory.add(key); }
        try { localStorage.setItem(STORAGE, JSON.stringify([...seen].slice(-1000))); } catch { /* per-mount memory still deduplicates */ }
        setNotices(current => [...fresh, ...current].slice(0, 100));
      } catch { /* Temporary network errors retry on the next poll. */ }
      finally { busy = false; }
    };
    void check();
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => { stopped = true; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, []);
  if (!notices.length) return null;
  const latest = notices[0];
  return <aside aria-label="有效访问提醒" className="fixed bottom-5 right-5 z-[90] w-[min(360px,calc(100vw-40px))] rounded-xl border border-emerald-800 bg-[#101b17] p-4 shadow-xl shadow-black/40">
    <div className="flex items-start gap-3">
      <BellRing size={20} className="mt-0.5 shrink-0 text-emerald-300" />
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        <p className="text-sm font-semibold text-emerald-100">有访客认真逛过你的网站</p>
        <p className="mt-1 text-xs leading-5 text-zinc-300">{latest.location} · 停留 {durationLabel(latest.dwellMs)}</p>
        <p className="text-[11px] leading-5 text-zinc-400">{notices.length > 1 ? `共 ${notices.length} 次新访问符合条件` : latest.device || "单次访问超过 2 分钟"}</p>
      </div>
      <button onClick={() => setNotices([])} aria-label="关闭访问提醒" className="rounded p-1 text-zinc-400 hover:text-white"><X size={16} /></button>
    </div>
    <div className="mt-3 flex items-center justify-between gap-2">
      <span className="text-[10px] text-zinc-500">最近 30 分钟活跃 · 已过滤爬虫和本机</span>
      <button onClick={() => { onView(latest.visitorKey); setNotices([]); }} className="shrink-0 text-xs text-emerald-300 hover:text-emerald-100">查看访客 →</button>
    </div>
  </aside>;
}
