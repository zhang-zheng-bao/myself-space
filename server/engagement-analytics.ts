import type { Express, Request, RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QUALIFIED_DWELL_MS, RECENT_VISIT_WINDOW_MS } from "../src/analytics-model";
import type { EngagementSnapshot, VisitNotice } from "../src/analytics-model";

export function sanitizeEngagementEntries(input: unknown): EngagementSnapshot[] {
  if (!Array.isArray(input)) return [];
  const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
  const number = (value: unknown, max: number) => Math.round(Math.max(0, Math.min(max, Number(value) || 0)));
  return input.slice(0, 24).flatMap((entry) => {
    if (!entry || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(entry.id)
      || !["page", "work", "video"].includes(entry.kind) || !entry.contentKey
      || !Number.isFinite(Date.parse(entry.startedAt))) return [];
    return [{
      id: entry.id, kind: entry.kind, contentKey: text(entry.contentKey, 180), title: text(entry.title, 200),
      pageKey: text(entry.pageKey, 100), path: text(entry.path, 300).split(/[?#]/)[0],
      startedAt: new Date(entry.startedAt).toISOString(), dwellMs: number(entry.dwellMs, 21_600_000),
      watchMs: number(entry.watchMs, 21_600_000), durationMs: number(entry.durationMs, 86_400_000),
      maxProgress: number(entry.maxProgress, 100), playCount: number(entry.playCount, 1), completed: entry.completed === true,
    }];
  });
}

export function qualifyingNotices(rows: any[], classify: (ua: string, ip: string) => string, now = Date.now()): VisitNotice[] {
  return rows.filter(row => {
    const seen = Date.parse(row.last_activity_at || row.created_at);
    return Number(row.dwell_ms) > QUALIFIED_DWELL_MS && seen >= now - RECENT_VISIT_WINDOW_MS && seen <= now
      && classify(row.user_agent, row.ip) === "human" && (!row.traffic_type || row.traffic_type === "human");
  }).map(row => ({
    id: row.id, visitorKey: row.visitor_key, createdAt: row.created_at,
    lastSeen: row.last_activity_at || row.created_at, dwellMs: row.dwell_ms,
    location: [row.region, row.city].filter(Boolean).join(" · ") || row.country || "地区未知",
    device: [row.os, row.browser].filter(Boolean).join(" / "),
  }));
}

export function registerEngagementAnalytics(app: Express, deps: {
  supabase: SupabaseClient | null; requireAdmin: RequestHandler;
  validToken: (token: unknown, visitId: number, visitorKey: string, sessionId: string) => boolean;
  allowed: (req: Request) => boolean;
  classify: (ua: string, ip: string) => string;
  range: (req: Request) => { since: string | null; humanOnly: boolean };
}) {
  const { supabase, requireAdmin } = deps;
  const missing = (error: any) => /could not find|does not exist|schema cache/i.test(error?.message || "");
  const pageOf = (req: Request) => Math.min(100_000, Math.max(1, Math.floor(Number(req.query.page) || 1)));
  const base = (req: Request) => {
    const { since, humanOnly } = deps.range(req);
    return { since, humanOnly, until: new Date().toISOString(), page: pageOf(req), pageSize: 20 };
  };
  app.post("/api/track/engagement", async (req, res) => {
    try {
      if (!supabase) return res.json({ ok: false, reason: "engagement-not-configured" });
      if (!deps.allowed(req)) return res.status(429).json({ ok: false });
      const { visitId, visitorKey, sessionId, trackingToken } = req.body || {};
      if (!Number.isSafeInteger(visitId) || typeof visitorKey !== "string" || typeof sessionId !== "string"
        || !deps.validToken(trackingToken, visitId, visitorKey, sessionId)) return res.status(403).json({ error: "invalid tracking context" });
      const entries = sanitizeEngagementEntries(req.body.entries);
      if (!entries.length) return res.status(400).json({ error: "valid entries required" });
      const { error } = await supabase.rpc("record_portfolio_engagements", {
        p_visit_id: visitId, p_visitor_key: visitorKey, p_session_id: sessionId, p_entries: entries,
      });
      if (error) {
        if (missing(error)) return res.json({ ok: false, reason: "engagement-not-configured" });
        return res.status(500).json({ error: "记录内容浏览失败" });
      }
      res.json({ ok: true });
    } catch { res.status(500).json({ error: "记录内容浏览失败" }); }
  });
  app.get("/api/admin/analytics/content", requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { since, until, humanOnly, page, pageSize } = base(req);
    const empty = { configured: false, items: [], total: 0, page, pageSize };
    if (!supabase) return res.json(empty);
    try {
      const { data, error } = await supabase.rpc("portfolio_content_report", {
        p_since: since, p_until: until, p_human_only: humanOnly,
        p_kind: ["page", "work", "video"].includes(String(req.query.kind)) ? String(req.query.kind) : "page",
        p_visitor_key: String(req.query.visitorKey || "").slice(0, 80) || null,
        p_content_key: String(req.query.contentKey || "").slice(0, 180) || null,
        p_page: page, p_size: pageSize,
      });
      if (error) {
        if (missing(error)) return res.json({ ...empty, reason: "migration-required" });
        throw error;
      }
      res.json(data);
    } catch { res.status(500).json({ error: "读取内容分析失败，请重试" }); }
  });
  app.get("/api/admin/analytics/journey", requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { since, until, humanOnly, page, pageSize } = base(req);
    const empty = { configured: false, rows: [], total: 0, page, pageSize };
    if (!supabase) return res.json(empty);
    try {
      const visitorKey = String(req.query.visitorKey || "").slice(0, 80);
      const contentKey = String(req.query.contentKey || "").slice(0, 180);
      if (!visitorKey && !contentKey) return res.status(400).json({ error: "请选择访客或内容" });
      let query = supabase.from("portfolio_engagements").select("*", { count: "exact" })
        .lte("started_at", until).order("started_at", { ascending: false }).order("id", { ascending: false });
      if (since) query = query.gte("started_at", since);
      if (humanOnly) query = query.eq("traffic_type", "human");
      if (visitorKey) query = query.eq("visitor_key", visitorKey);
      if (contentKey) query = query.eq("content_key", contentKey);
      if (["page", "work", "video"].includes(String(req.query.kind))) query = query.eq("kind", String(req.query.kind));
      const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
      if (error) {
        if (missing(error)) return res.json(empty);
        throw error;
      }
      res.json({ configured: true, total: count || 0, page, pageSize, rows: (data || []).map(row => ({
        id: row.id, visitId: row.visit_id, visitorKey: row.visitor_key, kind: row.kind, contentKey: row.content_key,
        title: row.title, pageKey: row.page_key, path: row.path, startedAt: row.started_at, lastSeen: row.last_seen,
        dwellMs: row.dwell_ms, watchMs: row.watch_ms, durationMs: row.duration_ms, maxProgress: row.max_progress,
        completed: row.completed, playCount: row.play_count,
      })) });
    } catch { res.status(500).json({ error: "读取浏览轨迹失败，请重试" }); }
  });
  app.get("/api/admin/analytics/recent-visits", requireAdmin, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!supabase) return res.json({ visits: [] });
    try {
      const since = new Date(Date.now() - RECENT_VISIT_WINDOW_MS).toISOString();
      const build = (field: string) => supabase.from("portfolio_visits").select("*").gt("dwell_ms", QUALIFIED_DWELL_MS)
        .gte(field, since).order(field, { ascending: false }).limit(100);
      let result = await build("last_activity_at");
      if (result.error && missing(result.error)) result = await build("created_at");
      if (result.error) throw result.error;
      res.json({ visits: qualifyingNotices(result.data || [], deps.classify) });
    } catch { res.status(500).json({ error: "读取访问提醒失败" }); }
  });
}
