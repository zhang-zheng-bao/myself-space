import { useEffect, useState } from 'react';
const groups = [
  { id: 'runtime', title: '运行参数', description: '任务并发与文件保留时间', fields: [] },
  { id: 'iflytek', title: '讯飞语音', description: 'App ID、API Key、API Secret', fields: [['iflytekApiKey', 'API Key'], ['iflytekApiSecret', 'API Secret']] },
  { id: 'minimax', title: 'MiniMax 声音生成', description: '语音生成服务凭证', fields: [['minimaxApiKey', 'API Key']] },
  { id: 'cookies', title: '平台 Cookie', description: '抖音、B站、小红书', fields: [['douyinCookie', '抖音 Cookie'], ['bilibiliCookie', 'B站 Cookie'], ['xiaohongshuCookie', '小红书 Cookie']] },
];
type Config = { concurrency: number; retentionHours: number; iflytekAppId: string; configured: Record<string, boolean> };
export default function ToolSettingsAdmin() {
  const [config, setConfig] = useState<Config | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [clearSecrets, setClearSecrets] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [runtime, setRuntime] = useState<{ tools: Record<string, boolean> } | null>(null);
  const [runtimeError, setRuntimeError] = useState('');
  async function checkRuntime() {
    try { const response = await fetch('/api/admin/tools/wanchuang/status'); const body = await response.json(); if (!response.ok) throw new Error(body.error); setRuntime(body); setRuntimeError(''); }
    catch (error) { setRuntimeError(error instanceof Error ? error.message : '读取服务状态失败'); }
  }
  useEffect(() => {
    void checkRuntime();
    const abort = new AbortController();
    fetch('/api/admin/tools/wanchuang/settings', { signal: abort.signal }).then(async res => {
      const body = await res.json(); if (!res.ok) throw new Error(body.error); setConfig(body);
    }).catch(error => { if (error.name !== 'AbortError') setMessage(error.message || '读取失败'); });
    return () => abort.abort();
  }, []);
  const input = 'mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100';
  return <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100">
    <h2 className="text-lg font-semibold">万创核心 · 应用配置</h2>
    <p className="mt-2 text-sm leading-6 text-zinc-400">敏感字段加密保存，仅管理员可维护。留空保留原值，不向前台返回密钥。</p>
    <div className="adm-note my-4 text-sm leading-6">
      <p>{runtimeError || (runtime ? '网页版执行服务已连接。配置保存后由服务端直接读取。' : '正在检查执行服务…')}</p>
      {runtime && <p>{Object.entries(runtime.tools).map(([key,ready]) => `${({ytDlp:'视频下载',ffmpeg:'音频处理',browser:'平台解析'} as Record<string,string>)[key]}：${ready ? '就绪' : '服务器未安装'}`).join(' · ')}</p>}
      <p>“已配置”代表凭证已保存，平台是否接受凭证以实际执行结果为准。</p>
      <button type="button" className="mt-2 text-emerald-300" onClick={() => void checkRuntime()}>刷新服务状态</button>
    </div>
    {config && <form onInvalidCapture={e => {
      const panel = (e.target as HTMLElement).closest('details');
      if (panel) panel.open = true;
    }} onSubmit={async e => {
      e.preventDefault(); setSaving(true); setMessage('');
      try {
        const res = await fetch('/api/admin/tools/wanchuang/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, secrets, clearSecrets }) });
        const body = await res.json(); if (!res.ok) throw new Error(body.error);
        setConfig(body); setSecrets({}); setClearSecrets([]); setMessage('已加密保存，后续任务将使用最新配置。'); void checkRuntime();
      } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); } finally { setSaving(false); }
    }}><fieldset disabled={saving} className="space-y-5 disabled:opacity-60">
      <div className="space-y-3">{groups.map(group => {
        const configuredCount = group.fields.filter(([key]) => config.configured[key]).length + (group.id === 'iflytek' && config.iflytekAppId ? 1 : 0);
        const total = group.fields.length + (group.id === 'iflytek' ? 1 : 0);
        const pending = group.fields.some(([key]) => secrets[key] || clearSecrets.includes(key));
        return <details key={group.id} className="group rounded-xl border border-zinc-700 bg-zinc-950/40">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
            <span className="min-w-0 flex-1"><strong className="block text-sm font-medium">{group.title}</strong><span className="mt-1 block text-xs text-zinc-400">{group.description}</span></span>
            <span className="text-xs text-zinc-400">{group.id === 'runtime' ? `${config.concurrency} 并发 · ${config.retentionHours} 小时` : pending ? '待保存' : `已填写 ${configuredCount}/${total}`}</span>
          </summary>
          <div className="space-y-4 border-t border-zinc-800 p-4">
            {group.id === 'runtime' && <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">最大并发任务<input className={input} type="number" min="1" max="3" required value={config.concurrency} onChange={e => setConfig({ ...config, concurrency: Number(e.target.value) })} /></label>
              <label className="block text-sm">文件保留时间（小时）<input className={input} type="number" min="1" max="24" required value={config.retentionHours} onChange={e => setConfig({ ...config, retentionHours: Number(e.target.value) })} /></label>
            </div>}
            {group.id === 'iflytek' && <label className="block text-sm">App ID<input className={input} maxLength={100} pattern="[a-zA-Z0-9_-]*" value={config.iflytekAppId} onChange={e => setConfig({ ...config, iflytekAppId: e.target.value })} /></label>}
            {group.fields.map(([key, label]) => <div key={key}><label className="block text-sm">{label}<span className="ml-2 text-xs text-zinc-400">{config.configured[key] ? '已配置' : '未配置'}</span><input className={input} type="password" autoComplete="new-password" maxLength={16000} disabled={clearSecrets.includes(key)} placeholder="留空保留原值" value={secrets[key] || ''} onChange={e => setSecrets({ ...secrets, [key]: e.target.value })} /></label>{config.configured[key] && <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={clearSecrets.includes(key)} onChange={e => setClearSecrets(e.target.checked ? [...clearSecrets, key] : clearSecrets.filter(item => item !== key))} />保存时清除该项</label>}</div>)}
          </div>
        </details>;
      })}</div>
      <button className="rounded-lg bg-emerald-400 px-5 py-2 text-sm font-semibold text-zinc-950" type="submit">{saving ? '正在保存…' : '保存应用配置'}</button>
    </fieldset></form>}
    <p role="status" className="mt-4 text-sm text-emerald-200">{message || (!config ? '正在读取配置…' : '')}</p>
  </section>;
}
