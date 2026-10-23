import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

test("real SQL: idempotency, averages, traffic filtering, ownership and durable content history", { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE!).href);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table portfolio_visitors(visitor_key text primary key, total_dwell_ms bigint default 0);
      create table portfolio_visits(id bigint primary key, visitor_key text, session_id text, traffic_type text,
        created_at timestamptz default now() - interval '20 minutes', dwell_ms bigint);
      create table portfolio_works(id text primary key, title text);
      insert into portfolio_works values ('a', '旧标题');
      insert into portfolio_visitors values ('v1', 0), ('v2', 0), ('local', 0);
      insert into portfolio_visits(id,visitor_key,session_id,traffic_type) values
        (1,'v1','s1','human'),(2,'v1','s2','human'),(3,'v2','s3','human'),(4,'local','s4','local');
    `);
    const sql = await readFile(new URL("../supabase/engagement-analytics.sql", import.meta.url), "utf8");
    await db.exec(sql);
    await db.exec(sql); // Repeatable installation must not erase history.
    const entry = (id: number, dwellMs: number, extra = {}) => ({
      id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      kind: "work", contentKey: "work:a", title: "旧标题", pageKey: "works", path: "/",
      startedAt: new Date(Date.now() - 600_000).toISOString(), dwellMs,
      watchMs: 0, durationMs: 0, maxProgress: 0, playCount: 0, completed: false, ...extra,
    });
    const write = (visit: number, visitor: string, rows: any[]) => db.query(
      "select record_portfolio_engagements($1,$2,$3,$4::jsonb)", [visit, visitor, `s${visit}`, JSON.stringify(rows)]);
    const report = async (kind = "work", humanOnly = true) => (await db.query(
      "select portfolio_content_report(p_kind => $1, p_human_only => $2) as report", [kind, humanOnly])).rows[0].report;
    await write(1, "v1", [entry(1, 12000)]);
    await write(1, "v1", [entry(1, 12000)]); // same payload delivered twice
    await write(1, "v1", [entry(1, 5000)]); // older heartbeat arrives late
    await write(2, "v1", [entry(2, 18000)]);
    await write(3, "v2", [entry(3, 30000)]);
    await write(4, "local", [entry(4, 90000)]);
    let result = await report();
    assert.equal(result.items[0].views, 3);
    assert.equal(result.items[0].visitors, 2);
    assert.equal(result.items[0].dwellMs, 60000);
    assert.equal(result.items[0].avgDwellMs, 20000);
    assert.equal((await report("work", false)).items[0].views, 4);

    // A different visit cannot overwrite someone else's span.
    await write(3, "v2", [entry(1, 99999)]);
    assert.equal((await report()).items[0].dwellMs, 60000);
    await assert.rejects(write(1, "v2", [entry(5, 1000)]));
    await write(1, "v1", [entry(6, 20000, { kind: "video", watchMs: 10000, playCount: 1, completed: true }),
      entry(7, 20000, { kind: "video", watchMs: 20000, playCount: 1 })]);
    const video = (await report("video")).items[0];
    assert.equal(video.plays, 2);
    assert.equal(video.avgWatchMs, 15000);
    assert.equal(video.completions, 1);

    await db.query("select sync_portfolio_dwell(1,'v1',130000)");
    await db.query("select sync_portfolio_dwell(1,'v1',130000)");
    await db.query("select sync_portfolio_dwell(1,'v1',90000)");
    assert.equal(Number((await db.query("select dwell_ms from portfolio_visits where id=1")).rows[0].dwell_ms), 130000);
    assert.equal(Number((await db.query("select total_dwell_ms from portfolio_visitors where visitor_key='v1'")).rows[0].total_dwell_ms), 130000);

    await db.exec("update portfolio_works set title='新标题' where id='a'; delete from portfolio_works where id='a'");
    result = await report();
    assert.equal(result.items[0].views, 3);
    assert.equal(result.items[0].title, "旧标题");
    await db.exec("delete from portfolio_visits where id=1; delete from portfolio_visitors where visitor_key='v1'");
    assert.equal((await report()).items[0].dwellMs, 60000);
    assert.equal((await db.query("select visit_id from portfolio_engagements where id='00000000-0000-4000-8000-000000000001'")).rows[0].visit_id, null);
    // History remains directly queryable by anonymous visitor key after deleting overview rows.
    assert.equal(Number((await db.query("select count(*) as n from portfolio_engagements where visitor_key='v1'")).rows[0].n), 4);
  } finally { await db.close(); }
});
