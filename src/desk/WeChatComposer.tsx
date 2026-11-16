import { useEffect, useRef, useState } from 'react';
import { CirclePlus, Keyboard, Mic, Smile } from 'lucide-react';

export type LocalMessage = { kind: 'text' | 'voice' | 'image'; content: string };
export default function WeChatComposer({ onMessage, onMore, disabled = false, media = true }: {
 onMessage(message: LocalMessage): void; onMore?(): void; disabled?: boolean; media?: boolean;
}) {
 const [text, setText] = useState('');
 const [emoji, setEmoji] = useState(false);
 const [voice, setVoice] = useState(false);
 const [recording, setRecording] = useState(false);
 const [error, setError] = useState('');
 const input = useRef<HTMLInputElement>(null);
 const file = useRef<HTMLInputElement>(null);
 const active = useRef(false);
 const mounted = useRef(true);
 const recorder = useRef<MediaRecorder | null>(null);
 const stream = useRef<MediaStream | null>(null);
 const cancel = useRef(false);
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const started = useRef(0);
 function finish(discard = false) {
  active.current = false; cancel.current = discard;
  if (timer.current) clearTimeout(timer.current);
  if (recorder.current?.state === 'recording') recorder.current.stop();
  stream.current?.getTracks().forEach(t => t.stop());
  if (mounted.current) setRecording(false);
 }
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; finish(true); }; }, []);
 async function begin() {
  if (active.current || disabled) return;
  setError(''); active.current = true; cancel.current = false;
  try {
   if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('unsupported');
   const source = await navigator.mediaDevices.getUserMedia({ audio: true });
   if (!active.current || !mounted.current) { source.getTracks().forEach(t => t.stop()); return; }
   stream.current = source;
   const rec = new MediaRecorder(source); recorder.current = rec;
   const chunks: Blob[] = [];
   rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
   rec.onstop = () => {
    if (!cancel.current && mounted.current) {
     if (Date.now() - started.current < 500 || !chunks.length) setError('说话时间太短，请再试一次');
     else onMessage({ kind: 'voice', content: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })) });
    }
    source.getTracks().forEach(t => t.stop());
   };
   rec.start(); started.current = Date.now(); setRecording(true);
   timer.current = setTimeout(() => finish(), 60000);
  } catch (e) {
   finish(true);
   if (mounted.current) setError(e instanceof Error && e.message === 'unsupported' ? '当前浏览器不支持录音，请使用 HTTPS 或本机地址打开' : '无法使用麦克风，请在浏览器中允许麦克风权限');
  }
 }
 function send() { if (!text.trim() || disabled) return; onMessage({ kind: 'text', content: text.trim() }); setText(''); }
 return <div className="wx-composer">
  {error && <p role="status" className="wx-composer__status">{error}</p>}
  {recording && <p role="status" className="wx-composer__status">正在录音 · 松开发送，移出取消</p>}
  <form className="desk-wx__input" onSubmit={e => { e.preventDefault(); send(); }}>
   <button type="button" aria-label={voice ? '切换文字输入' : '切换语音输入'} onClick={() => { if (!media) { setError('小柴暂未接入语音消息'); return; } setVoice(!voice); setEmoji(false); }}>{voice ? <Keyboard size={25}/> : <Mic size={25}/>}</button>
   {voice ? <button type="button" className="wx-composer__hold" disabled={disabled} onContextMenu={e => e.preventDefault()} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void begin(); }} onPointerUp={e => { const r = e.currentTarget.getBoundingClientRect(); finish(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom); }} onPointerCancel={() => finish(true)} onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void begin(); } }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); finish(); } }}>{recording ? '松开 发送' : '按住 说话'}</button> : <input ref={input} value={text} disabled={disabled} maxLength={800} aria-label="消息输入" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}/ >}
   <button type="button" aria-label="表情" aria-expanded={emoji} onClick={() => { setEmoji(!emoji); setVoice(false); }}><Smile size={27}/></button>
   {text.trim() && !voice ? <button className="wx-composer__send" type="submit" disabled={disabled}>发送</button> : onMore && <button type="button" aria-label="更多聊天功能" onClick={onMore}><CirclePlus size={27}/></button>}
  </form>
  {emoji && <div className="wx-composer__emoji" aria-label="表情面板">{Array.from('😀😁😂😊😍🥰😘😎🤔😭😅😴😡🥳👍👏🙏❤️🎉🌹☀️').filter(c => c !== '\ufe0f').map((c, i) => <button type="button" key={i} aria-label={c} onClick={() => { const el = input.current; const a = el?.selectionStart ?? text.length; const b = el?.selectionEnd ?? a; setText(text.slice(0,a) + c + text.slice(b)); requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a+c.length,a+c.length); }); }}>{c}</button>)}{media && <button type="button" className="wx-composer__image" onClick={() => file.current?.click()}>添加表情图片</button>}</div>}
  <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 8*1024*1024) setError('图片需小于 8 MB'); else if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) onMessage({kind:'image',content:URL.createObjectURL(f)}); } e.target.value=''; }}/>
 </div>;
}
