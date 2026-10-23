import { useEffect, useState, type CSSProperties } from 'react';
import WanchuangManagementAdmin from './WanchuangManagementAdmin';
const groups = [
  { id: 'runtime', title: '运行参数', description: '任务并发与文件保留时间', fields: [] },
  { id: 'iflytek', title: '讯飞语音', description: 'App ID、API Key、API Secret', fields: [['iflytekApiKey', 'API Key'], ['iflytekApiSecret', 'API Secret']] },
  { id: 'minimax', title: 'MiniMax 语音服务', description: '服务凭证与音色克隆权限', fields: [['minimaxApiKey', 'API Key']] },
  { id: 'cookies', title: '平台 Cookie', description: '抖音、B站、小红书', fields: [['douyinCookie', '抖音 Cookie'], ['bilibiliCookie', 'B站 Cookie'], ['xiaohongshuCookie', '小红书 Cookie']] },
];
type Config = { concurrency: number; retentionHours: number; iflytekAppId: string; voiceCloneEnabled: boolean; configured: Record<string, boolean> };
export default function ToolSettingsAdmin() {
  const [config, setConfig] = useState<Config | null>(null);
  const [baseline, setBaseline] = useState('');
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [clearSecrets, setClearSecrets] = useState<string[]>([]);
  const [visibleCookies, setVisibleCookies] = useState<Record<string, boolean>>({});
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
      const body = await res.json(); if (!res.ok) throw new Error(body.error); setConfig(body); setBaseline(JSON.stringify(body));
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
        setConfig(body); setBaseline(JSON.stringify(body)); setSecrets({}); setVisibleCookies({}); setClearSecrets([]); setMessage('已加密保存，后续任务将使用最新配置。'); void checkRuntime();
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
            {group.id === 'minimax' && <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4">
              <div><strong className="text-sm font-medium">允许前台克隆音色</strong><p className="mt-1 text-xs leading-5 text-zinc-400">关闭后禁止上传克隆样本和创建音色，已有音色仍可生成语音。修改后点击保存生效。</p></div>
              <button type="button" role="switch" aria-label="允许前台克隆音色" aria-checked={config.voiceCloneEnabled} onClick={() => setConfig({...config,voiceCloneEnabled:!config.voiceCloneEnabled})} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-emerald-400 ${config.voiceCloneEnabled?'bg-emerald-600':'bg-zinc-700'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${config.voiceCloneEnabled?'left-6':'left-1'}`} /></button>
            </div>}
            {group.id === 'runtime' && <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">最大并发任务<input className={input} type="number" min="1" max="3" required value={config.concurrency} onChange={e => setConfig({ ...config, concurrency: Number(e.target.value) })} /></label>
              <label className="block text-sm">文件保留时间（小时）<input className={input} type="number" min="1" max="24" required value={config.retentionHours} onChange={e => setConfig({ ...config, retentionHours: Number(e.target.value) })} /></label>
            </div>}
            {group.id === 'iflytek' && <label className="block text-sm">App ID<input className={input} maxLength={100} pattern="[a-zA-Z0-9_-]*" value={config.iflytekAppId} onChange={e => setConfig({ ...config, iflytekAppId: e.target.value })} /></label>}
            {group.fields.map(([key, label]) => <div key={key}>
              <label className="block text-sm">{label}<span className="ml-2 text-xs text-zinc-400">{config.configured[key] ? '已配置' : '未配置'}</span>
                {key.endsWith('Cookie') ? <textarea className={`${input} resize-y font-mono`} rows={4} autoComplete="off" spellCheck={false} maxLength={1024 * 1024} disabled={clearSecrets.includes(key)} placeholder="粘贴 Cookie、插件 JSON 或 cookies.txt 内容；保存时自动清洗，留空保留原值" value={secrets[key] || ''} style={{ WebkitTextSecurity: visibleCookies[key] ? 'none' : 'disc' } as CSSProperties} onChange={e => setSecrets(previous => ({ ...previous, [key]: e.target.value }))} />
                  : <input className={input} type="password" autoComplete="new-password" maxLength={16000} disabled={clearSecrets.includes(key)} placeholder="留空保留原值" value={secrets[key] || ''} onChange={e => setSecrets(previous => ({ ...previous, [key]: e.target.value }))} />}
              </label>
              {key.endsWith('Cookie') && <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <label className={clearSecrets.includes(key) ? 'opacity-50' : 'cursor-pointer text-emerald-300'}>导入 JSON / TXT 文件<input type="file" className="sr-only" aria-label={`导入${label}文件`} accept=".json,.txt,application/json,text/plain" disabled={clearSecrets.includes(key)} onChange={async e => {
                  const file = e.target.files?.[0]; e.target.value = '';
                  if (!file) return;
                  try {
                    if (file.size > 1024 * 1024) throw new Error('Cookie 文件不能超过 1MB，请缩小导出范围。');
                    const value = (await file.text()).trim();
                    if (!value || value.length > 1024 * 1024) throw new Error('Cookie 文件为空或超过 1MB。');
                    setSecrets(previous => ({ ...previous, [key]: value }));
                    setMessage(`${label}文件已读取；保存时将按平台过滤、去重并加密保存有效字段。`);
                  } catch (error) { setMessage(error instanceof Error ? error.message : '读取 Cookie 文件失败'); }
                }} /></label>
                <button type="button" onClick={() => setVisibleCookies(previous => ({ ...previous, [key]: !previous[key] }))}>{visibleCookies[key] ? '隐藏内容' : '显示内容'}</button>
                <span>支持 JSON 数组、cookies 包装结构和 Netscape cookies.txt</span>
              </div>}
              {config.configured[key] && <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={clearSecrets.includes(key)} onChange={e => setClearSecrets(e.target.checked ? [...clearSecrets, key] : clearSecrets.filter(item => item !== key))} />保存时清除该项</label>}
            </div>)}
          </div>
        </details>;
      })}</div>
      {(JSON.stringify(config)!==baseline || Object.values(secrets).some(v=>String(v).trim()) || clearSecrets.length>0) && <div className="adm-save-actions"><span>{saving?'正在保存':'未保存'}</span><button className="adm-save-button" type="submit">{saving ? '保存中…' : '保存'}</button></div>}
    </fieldset></form>}
    <p role="status" className="mt-4 text-sm text-emerald-200">{message || (!config ? '正在读取配置…' : '')}</p>
    {config && <WanchuangManagementAdmin />}
  </section>;
}
