import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';

type Rtc = {
  on(name: string, handler: (...args: any[]) => void): void;
  setChannelProfile(profile: string): void | Promise<void>;
  setDefaultSubscribeAllRemoteAudioStreams(enabled: boolean): void;
  setDefaultSubscribeAllRemoteVideoStreams(enabled: boolean): void;
  enableAudioVolumeIndication(interval: number): void;
  joinChannel(token: string, name: string): Promise<void>;
  leaveChannel(): Promise<void>;
  publishLocalAudioStream(enabled: boolean): Promise<void>;
  publishLocalVideoStream(enabled: boolean): Promise<void>;
  setRemoteViewConfig(video: HTMLVideoElement, user: string, stream: number): void;
  destroy(): void;
};
type RtcSDK = { isSupported(): Promise<{ support: boolean }>; getInstance(): Rtc };
const sdkUrl = 'https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.1.9/aliyun-rtc-sdk.js';
let sdkPromise: Promise<RtcSDK> | undefined;
function loadSdk() {
  const sdk = () => (window as Window & { AliRtcEngine?: RtcSDK }).AliRtcEngine;
  if (sdk()) return Promise.resolve(sdk()!);
  return sdkPromise ??= new Promise<RtcSDK>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timer); script.remove(); sdkPromise = undefined;
      reject(new Error('无法加载通话组件，请检查网络后重试。'));
    };
    const timer = window.setTimeout(fail, 12_000);
    script.src = sdkUrl;
    script.onload = () => { const loaded = sdk(); if (!loaded) return fail(); clearTimeout(timer); resolve(loaded); };
    script.onerror = fail;
    document.head.appendChild(script);
  });
}

export default function AssistantVideoCall({ close }: { close(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const active = useRef<AbortController | null>(null);
  const rtc = useRef<Rtc | null>(null);
  const mounted = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [muted, setMuted] = useState(false);
  const [message, setMessage] = useState('');
  const [hasPicture, setHasPicture] = useState(false);
  const [audioControlBusy, setAudioControlBusy] = useState(false);
  const [captions, setCaptions] = useState<{ id: number; role: 'user' | 'assistant'; text: string }[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'preview' | 'disabled' | 'error'>('checking');
  const captionId = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    async function checkAvailability() {
      try {
        const response = await fetch('/api/assistant/call/status', { signal: controller.signal });
        if (response.status === 401) {
          setAvailability('preview');
          return;
        }
        if (!response.ok) throw new Error('读取通话状态失败');
        const status = await response.json();
        if (!controller.signal.aborted) setAvailability(status.enabled === true ? 'ready' : 'disabled');
      } catch {
        if (!controller.signal.aborted) setAvailability('error');
      }
    }
    void checkAvailability();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    mounted.current = true;
    const leave = () => active.current?.abort();
    window.addEventListener('pagehide', leave);
    return () => { mounted.current = false; window.removeEventListener('pagehide', leave); leave(); };
  }, []);

  async function connect() {
    if (active.current || availability !== 'ready') return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    let engine: Rtc | undefined;
    let setup: Promise<void> | undefined;
    let failure = '';
    let remoteEnd = false;
    let mediaTimeout: number | undefined;
    const element = video.current;
    const clearMediaTimeout = () => window.clearTimeout(mediaTimeout);
    element?.addEventListener('playing', clearMediaTimeout);
    setPhase('connecting'); setMessage(''); setMuted(false); setHasPicture(false); setCaptions([]); setMicLevel(0);
    const fail = (text: string) => { failure = text; controller.abort(); };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前页面无法使用麦克风，请用 HTTPS 或本地浏览器打开。');
      // Request permission before starting a billable session. The SDK owns the actual call track.
      const [sdk] = await Promise.all([
        loadSdk(),
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false }).then(stream => {
          stream.getTracks().forEach(track => track.stop());
        }, () => { throw new Error('无法使用麦克风，请检查浏览器权限和输入设备。'); }),
      ]);
      signal.throwIfAborted();
      if (!(await sdk.isSupported()).support) throw new Error('当前浏览器不支持音视频通话，请用 Chrome 或 Edge 重试。');
      signal.throwIfAborted();
      const response = await fetch('/api/assistant/call', { method: 'POST', signal });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error || '无法发起通话。');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let pending = '';
      try {
        while (!signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          pending += chunk.value;
          const frames = pending.split('\n\n');
          pending = frames.pop() || '';
          for (const frame of frames) {
            if (!frame.startsWith('data: ')) continue;
            const { type, data } = JSON.parse(frame.slice(6));
            if (type === 'error') { failure = data; remoteEnd = true; setCaptions([]); break; }
            if (type === 'end') {
              remoteEnd = true;
              setCaptions([]);
              if (data === 'time_limit') setMessage('本次通话已到时长上限。');
              else setMessage('本次通话已结束。');
              break;
            }
            if (type === 'caption') {
              if ((data.role === 'user' || data.role === 'assistant') && typeof data.text === 'string') {
                const caption = { id: ++captionId.current, role: data.role, text: data.text };
                setCaptions(previous => [...previous, caption].slice(-4));
              }
              continue;
            }
            if (type === 'ready' && !setup) {
              mediaTimeout = window.setTimeout(() => fail('接收通话画面超时，请稍后重试。'), 25_000);
              setup = (async () => {
                engine = sdk.getInstance();
                rtc.current = engine;
                engine.on('videoSubscribeStateChanged', (userId: string, _previous: number, next: number) => {
                  const element = video.current;
                  if (signal.aborted || !element || !engine) return;
                  if (next === 3) {
                    engine.setRemoteViewConfig(element, userId, 1);
                    void element.play().catch(() => {});
                  } else if (next === 1) setHasPicture(false);
                });
                engine.on('bye', () => { if (!signal.aborted) fail('音视频连接已断开。'); });
                engine.on('audioVolume', (speakers: { userId: string; volume: number }[]) => {
                  const local = speakers.find(speaker => speaker.userId === '');
                  if (!signal.aborted && local && Number.isFinite(local.volume)) setMicLevel(Math.max(0, Math.min(100, local.volume)));
                });
                await engine.setChannelProfile('communication');
                signal.throwIfAborted();
                // AliRTC 7.1.9 has no setDefaultPublish* methods; publish flags set before join become the defaults.
                await engine.publishLocalVideoStream(false);
                signal.throwIfAborted();
                engine.setDefaultSubscribeAllRemoteAudioStreams(true);
                engine.setDefaultSubscribeAllRemoteVideoStreams(true);
                engine.enableAudioVolumeIndication(200);
                await engine.joinChannel(data.token, data.userId);
                signal.throwIfAborted();
                await engine.publishLocalAudioStream(true);
                if (!signal.aborted) setPhase('connected');
              })().catch(() => { if (!signal.aborted) fail('无法加入音视频通话，请检查网络和麦克风权限。'); });
            }
          }
          if (remoteEnd) break;
        }
      } finally { void reader.cancel().catch(() => {}); }
      if (!remoteEnd && !signal.aborted) failure = '通话连接已断开。';
    } catch (error) {
      if (!signal.aborted) failure = error instanceof Error && error.name !== 'TypeError' ? error.message : '通话连接已断开，请稍后重试。';
    } finally {
      controller.abort();
      window.clearTimeout(mediaTimeout);
      element?.removeEventListener('playing', clearMediaTimeout);
      // Destroy the SDK instance even if joinChannel did not settle.
      if (engine) {
        const closing = engine;
        try {
          await Promise.race([Promise.resolve(closing.leaveChannel()).catch(() => {}), new Promise(resolve => window.setTimeout(resolve, 1000))]);
        } catch { /* already disconnected */ }
        try { closing.destroy(); } catch { /* already disposed */ }
      }
      rtc.current = null;
      active.current = null;
      if (mounted.current) { setPhase('idle'); setHasPicture(false); setCaptions([]); setMicLevel(0); if (failure) setMessage(failure); }
    }
  }

  async function toggleMute() {
    const engine = rtc.current;
    if (!engine || audioControlBusy) return;
    setAudioControlBusy(true);
    try {
      await engine.publishLocalAudioStream(muted);
      if (rtc.current === engine) setMuted(!muted);
    } catch { if (rtc.current === engine) setMessage('切换麦克风失败，请重试。'); }
    finally { setAudioControlBusy(false); }
  }
  return <div className="assistant-video-call">
    <div className="assistant-video-call__stage">
      <video ref={video} autoPlay playsInline muted
        onPlaying={() => { if (active.current && !active.current.signal.aborted) setHasPicture(true); }}
        style={{ visibility: hasPicture ? 'visible' : 'hidden' }} />
      {!hasPicture && <div role="status" className="assistant-video-call__state">
        <img src="/assistant-shiba.webp" alt="" />
        <strong>{phase === 'idle' ? '数字人通话' : '正在连接画面…'}</strong>
        {phase === 'idle' && <small>{{
          checking: '正在检查通话状态…',
          ready: '通话使用麦克风，双方说话会显示字幕。',
          preview: '当前为管理员预览，请先登录后台。',
          disabled: '请在后台应用配置中启用数字人通话。',
          error: '暂时无法读取通话状态，请返回后重试。',
        }[availability]}</small>}
      </div>}
      {phase !== 'idle' && captions.length > 0 && <div className="assistant-video-call__captions" aria-live="polite">
        {captions.map(caption => <p key={caption.id} className="assistant-video-call__caption" data-role={caption.role}>
          <strong>{caption.role === 'user' ? '你：' : '小柴：'}</strong>{caption.text}
        </p>)}
      </div>}
    </div>
    {message && <p role="status" className="assistant-video-call__message">{message}</p>}
    <div className="assistant-video-call__controls">
      {phase === 'connected' && <div className="assistant-video-call__mic-level" role="meter" aria-label="麦克风"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={micLevel} aria-valuetext={`${micLevel}%`}>
        <span>麦克风</span>
        <span className="assistant-video-call__mic-level-track"><span style={{ width: `${micLevel}%` }} /></span>
      </div>}
      {phase === 'connected' && <button type="button" onClick={() => void toggleMute()} disabled={audioControlBusy} aria-pressed={muted}>
        {muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? '取消静音' : '静音'}
      </button>}
      {phase === 'idle'
        ? <button type="button" data-primary disabled={availability !== 'ready'} onClick={() => void connect()}><Phone size={16} />开始通话</button>
        : <button type="button" data-danger onClick={() => active.current?.abort()}><PhoneOff size={16} />{phase === 'connecting' ? '取消' : '挂断'}</button>}
      <button type="button" onClick={close}>返回聊天</button>
    </div>
  </div>;
}
