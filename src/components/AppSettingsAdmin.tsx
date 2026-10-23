import { useState } from 'react';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';
import ToolSettingsAdmin from './ToolSettingsAdmin';

// Each application owns its form and authenticated API; add entries here as apps are integrated.
const applications = [{
  id: 'wanchuang', name: '万创核心', category: '媒体创作',
  description: '素材采集、语音转写、声音生成',
  icon: '/tools/wanchuang/assets/clipharbor-logo.png',
  settings: ToolSettingsAdmin,
}];

export default function AppSettingsAdmin() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = applications.find(app => app.id === selectedId);
  if (selected) {
    const Settings = selected.settings;
    return <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => setSelectedId(null)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-zinc-300 hover:bg-zinc-800 focus-visible:outline-emerald-400"><ArrowLeft size={16} />全部应用</button>
        <span className="text-zinc-600">/</span><span className="text-zinc-100">{selected.name}</span>
      </div>
      <Settings key={selected.id} />
    </div>;
  }
  return <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100">
    <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">应用配置</h2><span className="text-xs text-zinc-400">{applications.length} 个应用</span></div>
    <p className="mt-2 text-sm leading-6 text-zinc-400">选择应用，管理它的服务凭证和运行参数。每个应用的配置独立维护。</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      {applications.map(app => <button key={app.id} type="button" onClick={() => setSelectedId(app.id)} className="flex min-h-28 items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-left transition-colors hover:border-emerald-700 focus-visible:outline-emerald-400">
        <img src={app.icon} alt="" width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm">{app.name}</strong><span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">{app.category}</span></span><span className="mt-2 block text-xs leading-5 text-zinc-400">{app.description}</span><span className="mt-2 block text-xs text-emerald-300">管理配置</span></span>
        <ChevronRight size={16} className="shrink-0 text-zinc-500" />
      </button>)}
    </div>
    <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-zinc-500"><Plus size={14} />后续应用接入后，会在这里展示各自的配置入口。</p>
  </section>;
}
