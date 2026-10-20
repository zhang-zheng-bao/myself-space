import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { contentIdentity, videoIdentity } from "../src/analytics-model";
import { addWatchedRange } from "../src/engagement-tracker";
import { qualifyingNotices, registerEngagementAnalytics, sanitizeEngagementEntries } from "./engagement-analytics";

test("content identity survives renaming, reordering and moving to AI; video replacement gets its own history", () => {
  const original = { id: "work-a", title: "旧标题", videoUrl: "https://cdn.example/video.mp4?signature=old" };
  const renamed = { ...original, title: "新标题", videoUrl: "https://cdn.example/video.mp4?signature=new" };
  assert.equal(contentIdentity("works", original), contentIdentity("ai", renamed));
  assert.equal(videoIdentity("works", original), videoIdentity("ai", renamed));
  assert.notEqual(videoIdentity("works", original), videoIdentity("works", { ...original, videoUrl: "https://cdn.example/new.mp4" }));
  assert.notEqual(contentIdentity("works", original), contentIdentity("works", { ...original, id: "new-work" }));
});

test("video coverage merges replayed ranges and does not turn a seek into completion", () => {
  let ranges = addWatchedRange([], 0, 10);
  ranges = addWatchedRange(ranges, 90, 100);
  ranges = addWatchedRange(ranges, 5, 15);
  assert.deepEqual(ranges, [[0, 15], [90, 100]]);
  assert.equal(ranges.reduce((total, [start, end]) => total + end - start, 0), 25);
});

test("ingestion caps payload, sanitizes path, requires ID/date/kind and finite counters", () => {
  const valid = { id: "00000000-0000-4000-8000-000000000001", kind: "work", contentKey: "work:a",
    title: "作品", startedAt: "2026-10-20T04:00:00Z", dwellMs: Infinity, watchMs: -10,
    playCount: 30, maxProgress: 300, path: "/?token=private", completed: "true" };
  const rows = sanitizeEngagementEntries([valid, { ...valid, id: "invalid" }, { ...valid, kind: "unknown" }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, "/");
  assert.equal(rows[0].dwellMs, 21_600_000);
  assert.equal(rows[0].watchMs, 0);
  assert.equal(rows[0].maxProgress, 100);
  assert.equal(rows[0].completed, false);
  assert.equal(sanitizeEngagementEntries(Array(100).fill(valid)).length, 24);
});

test("notices enforce strictly over two minutes, recent activity, human only and single-visit dwell", () => {
  const now = Date.parse("2026-10-20T04:00:00Z");
  const base = { id: 1, visitor_key: "visitor", dwell_ms: 120001, created_at: "2026-10-20T03:00:00Z",
    last_activity_at: "2026-10-20T03:59:00Z", traffic_type: "human", user_agent: "human", ip: "public" };
  const rows = [
    base,
    { ...base, id: 2, dwell_ms: 120000 },
    { ...base, id: 3, traffic_type: "bot" },
    { ...base, id: 4, ip: "local" },
    { ...base, id: 5, last_activity_at: "2026-10-20T03:29:59Z" },
    { ...base, id: 6, dwell_ms: 60000, total_dwell_ms: 600000 },
  ];
  assert.deepEqual(qualifyingNotices(rows, (_ua, ip) => ip === "local" ? "local" : "human", now).map(row => row.id), [1]);
});

test("analytics endpoints require authentication and ingestion requires visit-bound tokens", async () => {
  const app = express();
  app.use(express.json());
  let writes = 0;
  registerEngagementAnalytics(app, {
    supabase: { rpc: async () => { writes++; return { error: null }; } } as any,
    requireAdmin: (req, res, next) => req.headers["x-test-admin"] === "yes" ? next() : res.status(401).json({ error: "unauthorized" }),
    validToken: (token, visit, visitor, session) => token === "test-token" && visit === 1 && visitor === "v1" && session === "s1",
    allowed: () => true, classify: () => "human", range: () => ({ since: null, humanOnly: true }),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    for (const route of ["content", "journey", "recent-visits"]) {
      assert.equal((await fetch(`${origin}/api/admin/analytics/${route}`)).status, 401);
    }
    const body = { visitId: 1, visitorKey: "v1", sessionId: "s1", trackingToken: "wrong",
      entries: [{ id: "00000000-0000-4000-8000-000000000001", kind: "page", contentKey: "intro", startedAt: new Date().toISOString() }] };
    const post = () => fetch(`${origin}/api/track/engagement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post()).status, 403);
    assert.equal(writes, 0);
    body.trackingToken = "test-token";
    assert.equal((await post()).status, 200);
    assert.equal(writes, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
