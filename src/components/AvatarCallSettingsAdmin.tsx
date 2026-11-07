import { useEffect, useState } from 'react';
import type { AvatarCallSettings } from '../../server/avatar-call';

type Config = AvatarCallSettings & { configured: boolean };
type VoiceOption = { voice: string; provider: string; shared: boolean };
type AvatarOption = { id: string; name: string; imageUrl: string; status: string; createdAt: string };
const route = '/api/admin/assistant/call';
const input = 'mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100';
const button = 'rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 disabled:opacity-50';
async function request(path: string, init?: RequestInit) {
  const response = await fetch(route + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败，请稍后再试。');
  return data;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function AvatarCallSettingsAdmin() {
  const [config, setConfig] = useState<Config | null>(null);
  const [baseline, setBaseline] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    request('/settings', { signal: controller.signal })
      .then(data => { setConfig(data); setBaseline(JSON.stringify(data)); })
      .catch(error => { if (!controller.signal.aborted) setStatus(error.message); });
    return () => controller.abort();
  }, []);
  const update = <K extends keyof Config>(key: K, value: Config[K]) => setConfig(previous => previous && ({ ...previous, [key]: value }));
  async function perform(operation: () => Promise<void>) {
    setBusy(true); setStatus('');
    try { await operation(); }
    catch (error) { setStatus(error instanceof Error ? error.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }
  const dirty = Boolean(apiKey) || JSON.stringify(config) !== baseline;
  const group = 'rounded-xl border border-zinc-700 bg-zinc-950/40';
  const title = 'cursor-pointer rounded-xl px-4 py-3 text-sm font-medium';
  const fields = 'grid gap-4 border-t border-zinc-800 p-4 sm:grid-cols-2';
  return <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100">
    <h2 className="text-lg font-semibold">数字人通话 · 应用配置</h2>
    <p className="mt-2 text-sm leading-6 text-zinc-400">启用后，管理员可在官网的小柴窗口发起通话。设置在下一通生效。</p>
    {status && <p role="status" className="adm-note my-4 text-sm leading-6">{status}</p>}
    {!config && !status && <p className="mt-4 text-sm text-zinc-400">正在读取配置…</p>}
    {config && <form className="mt-5" onInvalidCapture={event => {
      const panel = (event.target as HTMLElement).closest('details'); if (panel) panel.open = true;
    }} onSubmit={event => {
      event.preventDefault();
      void perform(async () => {
        const data = await request('/settings', json('PUT', { ...config, apiKey }));
        setConfig(data); setBaseline(JSON.stringify(data)); if (apiKey) { setVoices([]); setAvatars([]); } setApiKey(''); setStatus('已保存。');
      });
    }}>
      <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
        <div className={`${group} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={config.enabled} onChange={e => update('enabled', e.target.checked)} />启用数字人通话（管理员预览）</label>
          <span className="flex flex-wrap gap-3 text-xs">{([
            ['API Key', config.configured || Boolean(apiKey)],
            ['人设', Boolean(config.persona.trim())],
            ['形象', Boolean(config.avatarId.trim() || config.imageUrl.trim())],
          ] as const).map(([name, ok]) => <span key={name} className={ok ? 'text-emerald-400' : 'text-amber-400'}>{ok ? '已填' : '未填'} {name}</span>)}</span>
        </div>
        <details className={group}>
          <summary className={title}>服务凭证与通话设置 · {config.enabled ? '已启用' : '未启用'}</summary>
          <div className={fields}>
            <label className="sm:col-span-2 text-sm">API Key · {config.configured ? '已配置' : '未配置'}
              <input type="password" autoComplete="new-password" className={input} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="留空保留原值" />
            </label>
            <label className="text-sm">通话模型<select className={input} value={config.model} onChange={e => update('model', e.target.value as Config['model'])}><option value="vidu-s2">S2</option><option value="vidu-s1">S1</option></select></label>
            <label className="text-sm">无输入挂断（秒）<input type="number" min={10} max={Math.min(300, config.maxSeconds)} required className={input} value={config.idleSeconds} onChange={e => update('idleSeconds', Number(e.target.value))} /></label>
            <label className="text-sm">单通上限（秒）<input type="number" min={Math.max(30, config.idleSeconds)} max={600} required className={input} value={config.maxSeconds} onChange={e => update('maxSeconds', Number(e.target.value))} /></label>
            <label className="text-sm">打断方式<select className={input} value={config.interruption} onChange={e => update('interruption', e.target.value as Config['interruption'])}><option value="semantic">开口打断</option><option value="server">过滤附和与背景音</option></select></label>
            <label className="text-sm">判定停顿（毫秒）<input type="number" min={200} max={1500} required className={input} value={config.silenceMs} onChange={e => update('silenceMs', Number(e.target.value))} /></label>
          </div>
        </details>
        <details className={group}>
          <summary className={title}>人设与话术 · {config.persona ? '已填写' : '未填写'}</summary>
          <div className={fields}>
            <label className="sm:col-span-2 text-sm">系统提示词<textarea rows={7} maxLength={8000} className={input} value={config.persona} onChange={e => update('persona', e.target.value)} /></label>
            <label className="sm:col-span-2 text-sm">导入原人设 TXT
              <input type="file" className={input} accept=".txt,text/plain" onChange={async e => {
                const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
                if (!file) return;
                try {
                  if (file.size > 32_000) throw new Error('人设文件过长。');
                  const text = (await file.text()).trim();
                  if (text.length > 8000) throw new Error('系统提示词最多 8000 字符。');
                  update('persona', text);
                  setStatus('已导入人设，请保存。');
                } catch (error) { setStatus(error instanceof Error ? error.message : '无法读取人设文件。'); }
              }} />
            </label>
            <label className="text-sm">开场白<textarea rows={2} maxLength={1000} className={input} value={config.greeting} onChange={e => update('greeting', e.target.value)} /></label>
            <label className="text-sm">表达创意度<input type="number" min={0} max={1.5} step={.05} required className={input} value={config.temperature} onChange={e => update('temperature', Number(e.target.value))} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.personaEnhance} onChange={e => update('personaEnhance', e.target.checked)} />启用人设扩写</label>
          </div>
        </details>
        <details className={group}>
          <summary className={title}>形象与声音 · {config.voice || '默认音色'}</summary>
          <div className={fields}>
            <div className="sm:col-span-2 flex items-end gap-2">
              <label className="min-w-0 flex-1 text-sm">原云端形象 ID<input maxLength={160} className={input} value={config.avatarId} placeholder="点右侧按钮从账号里选" onChange={e => update('avatarId', e.target.value)} /></label>
              <button className={`${button} shrink-0`} type="button" disabled={!config.configured} onClick={() => void perform(async () => {
                const data = await request('/avatars');
                setAvatars(data.avatars);
                setStatus(data.avatars.length ? `已读取 ${data.avatars.length} 个形象，点击即可选用，记得保存。` : '当前账号没有形象。');
              })}>读取账号形象</button>
            </div>
            {avatars.length > 0 && <div className="sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {avatars.map(avatar => {
                  const name = avatar.name || `形象 ${avatar.id.slice(-4)}`;
                  const selected = config.avatarId === avatar.id;
                  return <button key={avatar.id} type="button" aria-pressed={selected} onClick={() => update('avatarId', avatar.id)}
                    className={`overflow-hidden rounded-lg border bg-zinc-950 text-left transition hover:bg-zinc-900 ${selected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-zinc-700'}`}>
                    {avatar.imageUrl && <img className="h-32 w-full object-cover" src={avatar.imageUrl} alt={name} loading="lazy" referrerPolicy="no-referrer" />}
                    <span className="block p-3">
                      <span className="block text-sm text-zinc-100">{name}</span>
                      <span className="mt-1 block text-xs text-zinc-400">{avatar.status}</span>
                      <span className="mt-1 block font-mono text-xs text-zinc-500">{avatar.id}</span>
                    </span>
                  </button>;
                })}
              </div>
            </div>}
            <label className="sm:col-span-2 text-sm">形象图片 HTTPS 链接<input type="url" maxLength={2048} className={input} value={config.imageUrl} placeholder="未填形象 ID 时使用" onChange={e => update('imageUrl', e.target.value)} /></label>
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1 text-sm">音色名<input maxLength={128} className={input} list="assistant-avatar-voices" value={config.voice} onChange={e => {
              const voice = e.target.value;
              update('voice', voice);
              const match = voices.find(item => item.voice === voice);
              if (match?.provider === 'qwen_omni' || match?.provider === 'doubao') update('voiceProvider', match.provider);
            }} /></label>
              <button className={`${button} shrink-0`} type="button" disabled={!config.configured} onClick={() => void perform(async () => {
              const data = await request('/voices');
              setVoices(data.voices);
              const clones = data.voices.filter((voice: VoiceOption) => !voice.shared).length;
              const shared = data.voices.filter((voice: VoiceOption) => voice.shared).length;
              setStatus(data.voices.length ? `已读取 ${data.voices.length} 个音色（克隆 ${clones} 个，公共 ${shared} 个），可在音色名中选择。` : '当前账号没有可用音色。');
            })}>读取已有音色</button>
            </div>
            {config.model === 'vidu-s2' && <label className="text-sm">原音色所属服务<select className={input} value={config.voiceProvider} onChange={e => update('voiceProvider', e.target.value as Config['voiceProvider'])}><option value="qwen_omni">Qwen Omni（默认）</option><option value="doubao">豆包</option></select></label>}
            <datalist id="assistant-avatar-voices">{voices.map(voice => <option key={voice.voice} value={voice.voice} label={`${voice.shared ? '公共' : '克隆'} · ${voice.provider}`} />)}</datalist>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.idleAction} onChange={e => update('idleAction', e.target.checked)} />待机时播放自然动作</label>
          </div>
        </details>
        <details className={group}>
          <summary className={title}>音色克隆</summary>
          <div className={fields}>
            <p className="sm:col-span-2 text-sm text-zinc-400">使用有授权的参考音频。已有音色可直接选择，无需重复克隆。</p>
            <label className="text-sm">参考音频 HTTPS 链接<input className={input} value={audioUrl} onChange={e => setAudioUrl(e.target.value)} placeholder="推荐 10–20 秒清晰人声" /></label>
            <label className="text-sm">新音色名<input className={input} maxLength={64} value={voiceName} onChange={e => setVoiceName(e.target.value)} placeholder="字母、数字、下划线" /></label>
            <label className="sm:col-span-2 text-sm">参考音频原文（可选）<textarea className={input} rows={2} maxLength={4096} value={transcript} onChange={e => setTranscript(e.target.value)} /></label>
            <div><button className={button} type="button" disabled={!config.configured || !audioUrl.trim() || !voiceName.trim()} onClick={() => void perform(async () => {
              const provider = config.model === 'vidu-s1' ? 'qwen_omni' : config.voiceProvider;
              const result = await request('/voices', json('POST', { audioUrl: audioUrl.trim(), name: voiceName.trim(), transcript, voiceProvider: provider }));
              setVoices(previous => [...previous.filter(voice => voice.voice !== result.voice), { voice: result.voice, provider, shared: false }]); update('voice', result.voice);
              setAudioUrl(''); setVoiceName(''); setTranscript(''); setStatus('音色已克隆并选中，请保存通话设置。');
            })}>克隆音色（可能消耗额度）</button></div>
          </div>
        </details>
        {dirty && <div className="flex justify-end"><button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white" type="submit">{busy ? '处理中…' : '保存配置'}</button></div>}
      </fieldset>
    </form>}
  </section>;
}
