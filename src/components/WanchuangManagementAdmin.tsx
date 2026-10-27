import { useEffect, useState } from 'react';
import { Download, Eye, EyeOff, RefreshCw } from 'lucide-react';

const base = '/api/admin/tools/wanchuang';
const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-600 disabled:opacity-50';
const input = 'min-h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100';
const group = 'group rounded-xl border border-zinc-700 bg-zinc-950/40';
const summary = 'flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden';
type Voice = { id: string; name: string; type: string; hidden: boolean };
type Entry = { id: string; owner: string; kind: string; title: string; status: string; createdAt: number; voiceId?: string; text?: string; error?: string; files: { name: string; url: string }[] };
const kindNames: Record<string, string> = { voice: '声音生成', speech: '语音转写', download: '素材下载' };
const typeNames: Record<string, string> = { system: '系统音色', clone: '克隆音色', generated: '设计音色' };
async function request(url: string, options: RequestInit = {}) {
  const response = await fetch(base + url, { credentials: 'same-origin', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '请求失败，请重试');
  return body;
}
function GroupTitle({ title, description }: { title: string; description: string }) {
  return <><span aria-hidden="true" className="text-zinc-400 transition-transform group-open:rotate-90">›</span><span className="min-w-0 flex-1"><strong className="block text-sm font-medium">{title}</strong><span className="mt-1 block text-xs text-zinc-400">{description}</span></span></>;
}
function VoiceManagement() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ configured: boolean; models: Voice[] } | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [visibility, setVisibility] = useState('all');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController(); setLoading(true); setMessage('');
    request('/voices', { signal: abort.signal }).then(setData).catch(error => { if (!abort.signal.aborted) setMessage(error.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [open]);
  const hiddenCount = (data?.models || []).filter(voice => voice.hidden).length;
  const models = (data?.models || []).filter(voice => (type === 'all' || voice.type === type) && (visibility === 'all' || (visibility === 'hidden' ? voice.hidden : !voice.hidden)) && `${voice.name} ${voice.id}`.toLowerCase().includes(query.toLowerCase()));
  async function refresh() {
    setBusy('refresh'); setMessage('正在读取 MiniMax 账号音色…');
    try { const result = await request('/voices/refresh', { method: 'POST' }); setData(result); setMessage(`已同步 ${result.models.length} 个音色。`); }
    catch (error) { setMessage(error instanceof Error ? error.message : '刷新失败'); }
    finally { setBusy(''); }
  }
  async function toggle(voice: Voice) {
    setBusy(voice.id); setMessage('');
    try {
      setData(await request('/voices/visibility', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: voice.id, hidden: !voice.hidden }) }));
      setMessage(voice.hidden ? '已恢复，前台可选择此音色。' : '已从前台隐藏，后台仍保留此音色，可随时恢复显示。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(''); }
  }
  return <details className={group} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={summary}><GroupTitle title="音色管理" description="隐藏仅影响前台，后台保留全部音色并可随时恢复" />{data && <span className="text-xs text-zinc-400">{data.models.length} 个音色 · {hiddenCount} 个已隐藏</span>}</summary>
    {open && <div className="space-y-4 border-t border-zinc-800 p-4">
      <div className="flex flex-wrap gap-3">
        <input className={`${input} min-w-0 flex-1`} aria-label="搜索音色" placeholder="搜索音色名称" value={query} onChange={event => setQuery(event.target.value)} />
        <select className={input} aria-label="音色类型" value={type} onChange={event => setType(event.target.value)}><option value="all">全部类型</option>{Object.entries(typeNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select className={input} aria-label="音色显示状态" value={visibility} onChange={event => setVisibility(event.target.value)}><option value="all">全部音色</option><option value="visible">前台可用</option><option value="hidden">已隐藏</option></select>
        <button type="button" className={button} disabled={!!busy || loading || !data?.configured} onClick={() => void refresh()}><RefreshCw size={14} className={busy === 'refresh' ? 'animate-spin' : ''} />刷新账号音色</button>
      </div>
      {!loading && data && !data.configured && <p className="adm-note text-xs">请先在上方 MiniMax 配置中填写并保存 API Key。</p>}
      {loading && <p role="status" className="text-xs text-zinc-400">正在读取音色…</p>}
      {data?.configured && !loading && !models.length && <p className="py-4 text-sm text-zinc-400">{data.models.length ? '没有匹配的音色。' : '尚未同步音色，请点击“刷新账号音色”。'}</p>}
      <div className="max-h-[520px] space-y-2 overflow-auto">{models.map(voice => <div key={voice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 p-3">
        <div className="min-w-0"><p className="text-sm text-zinc-100">{voice.name && voice.name!==voice.id ? voice.name : '未命名音色'}<span className="ml-2 text-xs text-zinc-500">{voice.hidden ? '已隐藏' : '前台可用'}</span></p><p className="mt-1 text-xs text-zinc-500">{typeNames[voice.type] || voice.type}</p></div>
        <button type="button" className={button} aria-label={`${voice.hidden ? '恢复' : '隐藏'}音色 ${voice.name || voice.id}`} disabled={!!busy} onClick={() => void toggle(voice)}>{voice.hidden ? <Eye size={14} /> : <EyeOff size={14} />}{voice.hidden ? '恢复显示' : '隐藏音色'}</button>
      </div>)}</div>
      <p role="status" className="text-xs text-emerald-200">{message}</p>
    </div>}
  </details>;
}
function HistoryManagement() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ rows: Entry[]; total: number; unreadable: number } | null>(null);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController(); setLoading(true); setMessage('');
    const params = new URLSearchParams({ kind, q: query, page: String(page) });
    request('/history?' + params, { signal: abort.signal }).then(setData).catch(error => { if (!abort.signal.aborted) setMessage(error.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [open, kind, query, page, refresh]);
  async function remove(entry: Entry) {
    setBusy(true);
    try { await request(`/history/${entry.owner}/${entry.kind}/${encodeURIComponent(entry.id)}`, { method: 'DELETE' }); setConfirm(''); setPage(1); setRefresh(value => value + 1); }
    catch (error) { setMessage(error instanceof Error ? error.message : '移除失败'); }
    finally { setBusy(false); }
  }
  return <details className={group} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={summary}><GroupTitle title="历史记录" description="按声音生成、语音转写、素材下载分类查看全部浏览器任务" />{data && <span className="text-xs text-zinc-400">{data.total} 条</span>}</summary>
    {open && <div className="space-y-4 border-t border-zinc-800 p-4">
      <div className="flex flex-wrap gap-3">
        <select aria-label="历史记录分类" className={input} value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}><option value="all">全部记录</option>{Object.entries(kindNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
        <input className={`${input} min-w-0 flex-1`} aria-label="搜索历史记录" placeholder="搜索文案、链接、音色或任务状态" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
        <button type="button" className={button} disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} />刷新记录</button>
      </div>
      <p className="text-xs leading-6 text-zinc-500">展示仍在文件保留期内的任务。可查看生成文案和下载结果；移除记录后，关联文件按原保留期限清理。</p>
      {loading && <p role="status" className="text-xs text-zinc-400">正在读取记录…</p>}
      {!loading && data?.total === 0 && <p className="py-4 text-sm text-zinc-400">暂无匹配记录。</p>}
      {data && data.unreadable > 0 && <p className="adm-note text-xs">有 {data.unreadable} 组历史暂时无法读取，请检查服务器记录文件。</p>}
      <div className="space-y-3" aria-busy={loading}>{data?.rows.map(entry => {
        const key = `${entry.owner}:${entry.kind}:${entry.id}`;
        return <article key={key} className="space-y-3 rounded-lg border border-zinc-800 p-3">
          <div className="flex flex-wrap justify-between gap-2"><span className="text-xs text-emerald-200">{kindNames[entry.kind] || entry.kind} · {entry.status}</span><time className="text-xs text-zinc-500">{entry.createdAt ? new Date(entry.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '历史记录'}</time></div>
          <p className="break-words text-sm text-zinc-200">{entry.title.slice(0, 180)}</p>
          <p className="text-xs text-zinc-500">来源 {entry.owner.slice(0, 8)}{entry.voiceId ? ` · 音色 ${entry.voiceId}` : ''}</p>
          {entry.error && <p className="text-xs text-rose-300">{entry.error}</p>}
          {entry.text && <details className="text-xs text-zinc-400"><summary className="cursor-pointer">查看完整文案</summary><p className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap leading-6">{entry.text}</p></details>}
          <div className="flex flex-wrap items-center gap-2">{entry.files.map(file => <a className={button} key={file.url} href={file.url} download><Download size={13} />{file.name}</a>)}
            {['已完成', '失败', '已取消'].includes(entry.status) && <button type="button" className={button} onClick={() => setConfirm(key)}>移除记录</button>}
          </div>
          {confirm === key && <div className="adm-note flex flex-wrap items-center gap-3 text-xs"><span>移除此条历史记录？关联文件将按原期限清理。</span><button type="button" className={button} disabled={busy} onClick={() => void remove(entry)}>确认移除</button><button type="button" className={button} disabled={busy} onClick={() => setConfirm('')}>取消</button></div>}
        </article>;
      })}</div>
      {data && data.total > 30 && <div className="flex items-center justify-end gap-3 text-xs text-zinc-400"><button type="button" className={button} disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>上一页</button><span>{page} / {Math.ceil(data.total / 30)}</span><button type="button" className={button} disabled={page * 30 >= data.total || loading} onClick={() => setPage(value => value + 1)}>下一页</button></div>}
      <p role="status" className="text-xs text-rose-200">{message}</p>
    </div>}
  </details>;
}
function OperationManagement() {
  const [open,setOpen]=useState(false);
  const [page,setPage]=useState(1);
  const [query,setQuery]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [message,setMessage]=useState('');
  const [data,setData]=useState<{total:number;rows:{id:string;createdAt:number;actor:string;operation:string;status:string;durationMs:number;error:string;reference:string}[]}>();
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setMessage('正在读取…');
    request('/operations?'+new URLSearchParams({page:String(page),q:query}),{signal:controller.signal}).then(result=>{setData(result);setMessage('');}).catch(error=>{if(!controller.signal.aborted)setMessage(error.message);});
    return ()=>controller.abort();
  },[open,page,query,refresh]);
  const names:Record<string,string>={parseMedia:'解析链接',addJobs:'提交任务',cloneVoice:'克隆音色',generateVoice:'生成语音','/audio':'上传参考音频','download:result':'下载结果','speech:result':'转写结果','generateVoice:result':'语音生成结果',cancelJob:'取消任务',retryJob:'重试任务'};
  return <details className={group} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className={summary}><GroupTitle title="操作记录" description="记录解析、上传、克隆、下载及后台操作；独立保存，不随临时文件到期清除" />{data&&<span className="text-xs text-zinc-400">{data.total} 条</span>}</summary>
    {open&&<div className="space-y-4 border-t border-zinc-800 p-4">
      <div className="flex gap-3"><input className={`${input} min-w-0 flex-1`} aria-label="搜索操作记录" placeholder="搜索操作、结果或错误" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/><button className={button} type="button" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={14}/>刷新</button></div>
      <div className="max-h-[560px] space-y-2 overflow-auto">{data?.rows.map(row=><div key={row.id} className="rounded-lg border border-zinc-800 p-3 text-xs">
        <div className="flex flex-wrap justify-between gap-2"><strong>{names[row.operation]||row.operation} · <span className={['失败','已取消'].includes(row.status)?'text-rose-300':'text-emerald-300'}>{row.status}</span></strong><span className="text-zinc-400">{new Date(row.createdAt).toLocaleString()} · {(row.durationMs/1000).toFixed(1)} 秒</span></div>
        {row.reference&&<p className="mt-2 break-all text-zinc-400">{row.reference}</p>}{row.error&&<p className="mt-2 whitespace-pre-wrap break-all text-rose-300">{row.error}</p>}<p className="mt-2 text-zinc-500">会话 {row.actor}</p>
      </div>)}</div>
      {data&&!data.total&&<p className="text-sm text-zinc-400">暂无记录。更新前未记录的操作无法补回。</p>}
      {data&&data.total>30&&<div className="flex justify-end gap-3"><button className={button} disabled={page<=1} onClick={()=>setPage(n=>n-1)}>上一页</button><span>{page} / {Math.ceil(data.total/30)}</span><button className={button} disabled={page*30>=data.total} onClick={()=>setPage(n=>n+1)}>下一页</button></div>}
      <p role="status" className="text-sm text-rose-300">{message}</p>
    </div>}
  </details>;
}
export default function WanchuangManagementAdmin() {
  return <div className="mt-5 space-y-3"><VoiceManagement /><OperationManagement /><HistoryManagement /></div>;
}
