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
  switchMicrophone(deviceId: string): Promise<void>;
  setRecordingVolume(volume: number): void;
  publishLocalVideoStream(enabled: boolean): Promise<void>;
  setRemoteViewConfig(video: HTMLVideoElement, user: string, stream: number): void;
  destroy(): void;
};
type RtcSDK = { isSupported(): Promise<{ support: boolean }>; getInstance(): Rtc };
const sdkUrl = 'https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.1.9/aliyun-rtc-sdk.js';
const microphoneStorageKey = 'assistant-call-mic';
const microphoneGainStorageKey = 'assistant-call-mic-gain';
const microphoneGains = [100, 150, 200, 300] as const;
type MicrophoneGain = typeof microphoneGains[number];
type LocalMicrophoneTest = { stream: MediaStream; context: AudioContext; interval: number };
let sdkPromise: Promise<RtcSDK> | undefined;
function readStoredMicrophone() {
  if (typeof window === 'undefined') return '';
  try { return window.localStorage.getItem(microphoneStorageKey) || ''; }
  catch { return ''; }
}
function readStoredMicrophoneGain(): MicrophoneGain {
  if (typeof window === 'undefined') return 100;
  try {
    const gain = Number(window.localStorage.getItem(microphoneGainStorageKey));
    return microphoneGains.includes(gain as MicrophoneGain) ? gain as MicrophoneGain : 100;
  } catch { return 100; }
}
function displayMicrophoneLevel(rawLevel: number) {
  return Math.round(Math.sqrt(Math.max(0, Math.min(100, rawLevel)) / 100) * 100);
}
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
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'preview' | 'disabled' | 'error'>('checking');
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState(readStoredMicrophone);
  const [microphoneGain, setMicrophoneGain] = useState(readStoredMicrophoneGain);
  const [microphoneTestActive, setMicrophoneTestActive] = useState(false);
  const [silenceHint, setSilenceHint] = useState(false);
  const captionId = useRef(0);
  const captionBox = useRef<HTMLDivElement>(null);
  const microphoneIdRef = useRef(microphoneId);
  const microphoneGainRef = useRef(microphoneGain);
  const phaseRef = useRef(phase);
  const microphoneTest = useRef<LocalMicrophoneTest | null>(null);
  const microphoneTestRequest = useRef<Promise<MediaStream> | null>(null);
  const microphoneTestGeneration = useRef(0);
  const silenceTimer = useRef<number | null>(null);

  function saveMicrophoneId(deviceId: string) {
    microphoneIdRef.current = deviceId;
    setMicrophoneId(deviceId);
    try {
      if (deviceId) window.localStorage.setItem(microphoneStorageKey, deviceId);
      else window.localStorage.removeItem(microphoneStorageKey);
    } catch { /* storage may be unavailable */ }
  }
  function saveMicrophoneGain(gain: MicrophoneGain) {
    microphoneGainRef.current = gain;
    setMicrophoneGain(gain);
    try { window.localStorage.setItem(microphoneGainStorageKey, String(gain)); }
    catch { /* storage may be unavailable */ }
  }
  function resolveMicrophoneId(deviceId: string, devices = microphones) {
    if (deviceId) return deviceId;
    return devices.find(device => device.deviceId === 'default')?.deviceId || devices[0]?.deviceId || '';
  }
  function disposeMicrophoneTest() {
    microphoneTestGeneration.current++;
    const activeTest = microphoneTest.current;
    if (!activeTest) return;
    window.clearInterval(activeTest.interval);
    activeTest.stream.getTracks().forEach(track => track.stop());
    microphoneTest.current = null;
    if (activeTest.context.state !== 'closed') void activeTest.context.close().catch(() => {});
  }
  function stopMicrophoneTest() {
    disposeMicrophoneTest();
    setMicrophoneTestActive(false);
    setMicLevel(0);
  }
  async function refreshMicrophones() {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
      setMicrophones(devices);
      const selected = microphoneIdRef.current;
      if (selected && !devices.some(device => device.deviceId === selected)) {
        stopMicrophoneTest();
        saveMicrophoneId('');
        const engine = rtc.current;
        if (phaseRef.current === 'connected' && engine) {
          const fallback = resolveMicrophoneId('', devices);
          if (fallback) {
            try { await engine.switchMicrophone(fallback); }
            catch { if (rtc.current === engine) setMessage('切换麦克风失败，请重试。'); }
          } else setMessage('切换麦克风失败，请重试。');
        }
      }
      return devices;
    } catch { return []; }
  }
  async function selectMicrophone(deviceId: string) {
    stopMicrophoneTest();
    saveMicrophoneId(deviceId);
    const engine = rtc.current;
    if (phaseRef.current !== 'connected' || !engine) return;
    const targetId = resolveMicrophoneId(deviceId);
    if (!targetId) { setMessage('切换麦克风失败，请重试。'); return; }
    try { await engine.switchMicrophone(targetId); }
    catch { if (rtc.current === engine) setMessage('切换麦克风失败，请重试。'); }
  }
  async function selectMicrophoneGain(value: string) {
    const gain = Number(value);
    if (!microphoneGains.includes(gain as MicrophoneGain)) return;
    saveMicrophoneGain(gain as MicrophoneGain);
    const engine = rtc.current;
    if (phaseRef.current !== 'connected' || !engine) return;
    try { await engine.setRecordingVolume(gain); }
    catch { if (rtc.current === engine) setMessage('调整麦克风增益失败，请重试。'); }
  }
  async function toggleMicrophoneTest() {
    if (microphoneTestActive) { stopMicrophoneTest(); return; }
    const generation = ++microphoneTestGeneration.current;
    const selected = microphoneIdRef.current;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let captureRequest: Promise<MediaStream> | undefined;
    setMicrophoneTestActive(true);
    setMicLevel(0);
    setMessage('');
    try {
      captureRequest = navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selected ? { exact: selected } : undefined, echoCancellation: true },
      });
      microphoneTestRequest.current = captureRequest;
      stream = await captureRequest;
      if (microphoneTestRequest.current === captureRequest) microphoneTestRequest.current = null;
      if (generation !== microphoneTestGeneration.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      await refreshMicrophones();
      if (generation !== microphoneTestGeneration.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      context = new AudioContext();
      await context.resume();
      if (generation !== microphoneTestGeneration.current) {
        stream.getTracks().forEach(track => track.stop());
        if (context.state !== 'closed') void context.close().catch(() => {});
        return;
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const activeTest: LocalMicrophoneTest = { stream, context, interval: 0 };
      activeTest.interval = window.setInterval(() => {
        if (microphoneTest.current !== activeTest) return;
        analyser.getByteFrequencyData(samples);
        setMicLevel(Math.min(100, Math.round(samples.reduce((total, sample) => total + sample, 0) / samples.length)));
      }, 80);
      microphoneTest.current = activeTest;
    } catch (error) {
      if (microphoneTestRequest.current === captureRequest) microphoneTestRequest.current = null;
      stream?.getTracks().forEach(track => track.stop());
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      if (generation === microphoneTestGeneration.current) {
        setMicrophoneTestActive(false);
        setMessage(error instanceof Error ? error.message : '无法试用麦克风，请检查权限和设备。');
      }
    }
  }

  useEffect(() => {
    const box = captionBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [captions]);
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    const onDeviceChange = () => {
      stopMicrophoneTest();
      void refreshMicrophones();
    };
    void refreshMicrophones();
    mediaDevices?.addEventListener('devicechange', onDeviceChange);
    return () => {
      mediaDevices?.removeEventListener('devicechange', onDeviceChange);
      disposeMicrophoneTest();
    };
  }, []);
  useEffect(() => {
    if (phase !== 'connected' || muted || micLevel >= 2) {
      if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
      setSilenceHint(false);
    } else if (!silenceHint && silenceTimer.current === null) {
      silenceTimer.current = window.setTimeout(() => {
        silenceTimer.current = null;
        setSilenceHint(true);
      }, 6000);
    }
  }, [phase, muted, micLevel, silenceHint]);
  useEffect(() => () => {
    if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
  }, []);
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
        if (!controller.signal.aborted) {
          setAvailability(status.enabled === true ? 'ready' : 'disabled');
          setCaptionsEnabled(status.captions !== false);
        }
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
    const selectedMicrophoneId = microphoneIdRef.current;
    const selectedMicrophoneGain = microphoneGainRef.current;
    stopMicrophoneTest();
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
    phaseRef.current = 'connecting';
    setPhase('connecting'); setMessage(''); setMuted(false); setHasPicture(false); setCaptions([]); setMicLevel(0);
    const fail = (text: string) => { failure = text; controller.abort(); };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前页面无法使用麦克风，请用 HTTPS 或本地浏览器打开。');
      const pendingMicrophoneTest = microphoneTestRequest.current;
      if (pendingMicrophoneTest) await pendingMicrophoneTest.catch(() => {});
      signal.throwIfAborted();
      // Request permission before starting a billable session. The SDK owns the actual call track.
      const [sdk] = await Promise.all([
        loadSdk(),
        navigator.mediaDevices.getUserMedia({
          audio: { deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined, echoCancellation: true },
          video: false,
        }).then(async stream => {
          stream.getTracks().forEach(track => track.stop());
          await refreshMicrophones();
        }, error => {
          const name = (error as { name?: string } | null)?.name;
          if (name === 'OverconstrainedError' || name === 'NotFoundError') {
            saveMicrophoneId('');
            throw new Error('所选麦克风不可用，请重新选择。');
          }
          throw new Error('无法使用麦克风，请检查浏览器权限和输入设备。');
        }),
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
                if (selectedMicrophoneId) {
                  try { await engine.switchMicrophone(selectedMicrophoneId); }
                  catch { if (!signal.aborted) setMessage('切换麦克风失败，请重试。'); }
                }
                try { await engine.setRecordingVolume(selectedMicrophoneGain); }
                catch { if (!signal.aborted) setMessage('调整麦克风增益失败，请重试。'); }
                if (!signal.aborted) { phaseRef.current = 'connected'; setPhase('connected'); }
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
      if (mounted.current) { phaseRef.current = 'idle'; setPhase('idle'); setHasPicture(false); setCaptions([]); setMicLevel(0); if (failure) setMessage(failure); }
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
          ready: captionsEnabled ? '通话使用麦克风，双方说话会显示字幕。' : '语音视频通话，使用麦克风。',
          preview: '当前为管理员预览，请先登录后台。',
          disabled: '请在后台应用配置中启用数字人通话。',
          error: '暂时无法读取通话状态，请返回后重试。',
        }[availability]}</small>}
      </div>}
      {phase !== 'idle' && captions.length > 0 && <div ref={captionBox} className="assistant-video-call__captions" aria-live="polite">
        {captions.map(caption => <p key={caption.id} className="assistant-video-call__caption" data-role={caption.role}
          aria-label={caption.role === 'user' ? '你说' : '小柴说'}>
          {caption.text}
        </p>)}
      </div>}
    </div>
    {message && <p role="status" className="assistant-video-call__message">{message}</p>}
    <div className="assistant-video-call__controls">
      {phase !== 'connecting' && <div className="assistant-video-call__mic-settings">
        <label>
          <span>麦克风</span>
          <select value={microphoneId} onChange={event => void selectMicrophone(event.target.value)}>
            <option value="">系统默认</option>
            {microphones.map((device, index) => <option key={`${device.deviceId}-${index}`} value={device.deviceId}>
              {device.label || `麦克风 ${index + 1}`}
            </option>)}
          </select>
        </label>
        <label>
          <span>麦克风增益</span>
          <select value={microphoneGain} onChange={event => void selectMicrophoneGain(event.target.value)}>
            {microphoneGains.map(gain => <option key={gain} value={gain}>{gain}%</option>)}
          </select>
        </label>
        {phase === 'idle' && <button type="button" onClick={() => void toggleMicrophoneTest()}>
          {microphoneTestActive ? '停止试音' : '试一下麦克风'}
        </button>}
      </div>}
      {(phase === 'connected' || microphoneTestActive) && <div className="assistant-video-call__mic-meter">
        <div className="assistant-video-call__mic-level" role="meter" aria-label="麦克风"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayMicrophoneLevel(micLevel)}
          aria-valuetext={`${displayMicrophoneLevel(micLevel)}%`} data-raw-level={micLevel}>
          <span>麦克风</span>
          <span className="assistant-video-call__mic-level-track"><span style={{ width: `${displayMicrophoneLevel(micLevel)}%` }} /></span>
        </div>
        {phase === 'connected' && !muted && silenceHint && <small className="assistant-video-call__silence-hint">
          没有检测到麦克风声音，请检查系统输入音量，或换一个麦克风。
        </small>}
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
