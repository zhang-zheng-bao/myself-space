import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowUp, Menu, Move, RotateCcw, Square, X } from "lucide-react";
import { getVisitorKey } from "../tracking";

/**
 * 右下角的柴犬小助手。上下文由 Dify 按 conversation_id 保存，前台只记这个 ID；
 * 所有请求走 /api/assistant/*，Dify 的 Key 不进浏览器。
 */

type Message = { role: "user" | "assistant"; content: string; error?: boolean };
type Config = { enabled: boolean; opening?: string; suggestions?: string[] };

const CONVERSATION_STORAGE = "myspace_assistant_conversation";
const AVATAR = "/assistant-shiba.webp";
const MAX_QUERY = 800;
const DOCK_STORAGE = "myspace_assistant_dock";
const GREETED_STORAGE = "myspace_assistant_greeted";
// 进站后多久冒出招呼气泡、气泡停留多久。
const GREETING_DELAY = 2500;
const GREETING_DURATION = 12000;
// 按下后移动超过这个距离才算拖动，否则当作点击。
const DRAG_THRESHOLD = 5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readDock = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DOCK_STORAGE) || "null");
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return { x: saved.x as number, y: saved.y as number };
  } catch { /* 读不到就用默认位置 */ }
  return { x: 0, y: 0 };
};
const writeDock = (dock: { x: number; y: number }) => {
  try {
    if (dock.x || dock.y) window.localStorage.setItem(DOCK_STORAGE, JSON.stringify(dock));
    else window.localStorage.removeItem(DOCK_STORAGE);
  } catch { /* 隐私模式下只在本次浏览里记位置 */ }
};

const readConversation = () => {
  try { return window.localStorage.getItem(CONVERSATION_STORAGE) || ""; } catch { return ""; }
};
const writeConversation = (id: string) => {
  try {
    if (id) window.localStorage.setItem(CONVERSATION_STORAGE, id);
    else window.localStorage.removeItem(CONVERSATION_STORAGE);
  } catch { /* 隐私模式下只在内存里续聊 */ }
};

/** 推理模型（如 DeepSeek）会把 <think>…</think> 推理过程混在回答里，不给访客看；还没闭合时整段先藏起来。 */
const stripThinking = (text: string) => text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s+/, "");

/** 只认加粗、行内代码、链接三种行内标记；不拼 HTML，避免知识库内容带进脚本。 */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const token = match[0];
    if (token.startsWith("**")) parts.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={index}>{token.slice(1, -1)}</code>);
    else parts.push(<a key={index} href={match[2]} target="_blank" rel="noreferrer noopener">{token.slice(1, token.indexOf("]"))}</a>);
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** 轻量 Markdown：段落、无序/有序列表、标题当加粗段落处理。 */
function MessageBody({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={blocks.length}>{list.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.、)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet || numbered)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(<p key={blocks.length}>{heading ? <strong>{renderInline(heading[1])}</strong> : renderInline(line)}</p>);
  }
  flush();
  return <Fragment>{blocks}</Fragment>;
}

export default function ShibaAssistant({ ready = true }: { ready?: boolean }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const conversationRef = useRef(readConversation());
  const abortRef = useRef<AbortController | null>(null);
  const historyLoaded = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // 面板相对默认位置（右下角）的偏移，按住顶栏拖动；关掉再打开保留上次位置。
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // 悬浮球（连同面板）相对右下角的偏移，记在 localStorage 里，下次进站还在原处。
  const [dock, setDock] = useState(readDock);
  const [greeting, setGreeting] = useState(false);
  const [greetingSide, setGreetingSide] = useState<"left" | "right">("left");
  const draggedRef = useRef(false);
  // 面板贴着球打开：球在上半屏就往下开，在左半屏就与球左对齐。面板是 fixed 定位，不挤动球的位置。
  const [placement, setPlacement] = useState<CSSProperties>({});

  const updatePlacement = () => {
    const box = launcherRef.current?.getBoundingClientRect();
    if (!box) return;
    const below = box.top + box.height / 2 < window.innerHeight / 2;
    const alignLeft = box.left + box.width / 2 < window.innerWidth / 2;
    setPlacement({
      "--panel-top": below ? `${box.bottom + 12}px` : "auto",
      "--panel-bottom": below ? "auto" : `${window.innerHeight - box.top + 12}px`,
      "--panel-left": alignLeft ? `${box.left}px` : "auto",
      "--panel-right": alignLeft ? "auto" : `${window.innerWidth - box.right}px`,
      "--panel-origin": `${below ? "top" : "bottom"} ${alignLeft ? "left" : "right"}`,
      // 球在半中间时，面板高度收到剩余空间以内，不压住球。
      "--panel-space": `${Math.max(320, below ? window.innerHeight - box.bottom - 20 : box.top - 20)}px`,
    } as CSSProperties);
  };

  const openPanel = () => {
    updatePlacement();
    setOpen(true);
  };

  const startLauncherDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const launcher = launcherRef.current;
    if (!launcher) return;
    draggedRef.current = false;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = dock;
    const box = launcher.getBoundingClientRect();
    const minX = base.x - (box.left - 8);
    const maxX = base.x + (window.innerWidth - 8 - box.right);
    const minY = base.y - (box.top - 8);
    const maxY = base.y + (window.innerHeight - 8 - box.bottom);
    let latest = base;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!draggedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!draggedRef.current) {
        draggedRef.current = true;
        launcher.setAttribute("data-dragging", "");
        setGreeting(false);
      }
      latest = { x: clamp(base.x + dx, minX, maxX), y: clamp(base.y + dy, minY, maxY) };
      setDock(latest);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      launcher.removeAttribute("data-dragging");
      if (draggedRef.current) {
        writeDock(latest);
        // 球换了位置，面板跟着换开的方向，之前单独拖面板的偏移作废。
        updatePlacement();
        setOffset({ x: 0, y: 0 });
        requestAnimationFrame(fitPanel);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const fitPanel = () => setOffset(current => {
    const box = panelRef.current?.getBoundingClientRect();
    if (!box) return current;
    const dx = box.left < 8 ? 8 - box.left : box.right > window.innerWidth - 8 ? window.innerWidth - 8 - box.right : 0;
    const dy = box.top < 8 ? 8 - box.top : box.bottom > window.innerHeight - 8 ? window.innerHeight - 8 - box.bottom : 0;
    return dx || dy ? { x: current.x + dx, y: current.y + dy } : current;
  });

  // 窗口缩小或上次存的位置已经在屏幕外时，把悬浮球拉回可视区。
  useEffect(() => {
    const fit = () => setDock(current => {
      const box = launcherRef.current?.getBoundingClientRect();
      if (!box) return current;
      const dx = box.left < 8 ? 8 - box.left : box.right > window.innerWidth - 8 ? window.innerWidth - 8 - box.right : 0;
      const dy = box.top < 8 ? 8 - box.top : box.bottom > window.innerHeight - 8 ? window.innerHeight - 8 - box.bottom : 0;
      return dx || dy ? { x: current.x + dx, y: current.y + dy } : current;
    });
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [config]);

  // 入场动画结束后主动打个招呼；每次浏览只冒一次，几秒后自己收起。
  useEffect(() => {
    if (!ready || !config || open) return;
    try { if (window.sessionStorage.getItem(GREETED_STORAGE)) return; } catch { /* 读不到就照常打招呼 */ }
    const show = window.setTimeout(() => {
      try { window.sessionStorage.setItem(GREETED_STORAGE, "1"); } catch { /* 忽略 */ }
      // 球被拖到屏幕左半边时，气泡改往右边冒，免得出屏。
      const box = launcherRef.current?.getBoundingClientRect();
      setGreetingSide(box && box.left < window.innerWidth / 2 ? "right" : "left");
      setGreeting(true);
    }, GREETING_DELAY);
    return () => window.clearTimeout(show);
  }, [ready, config, open]);

  useEffect(() => {
    if (!greeting) return;
    const hide = window.setTimeout(() => setGreeting(false), GREETING_DURATION);
    return () => window.clearTimeout(hide);
  }, [greeting]);

  useEffect(() => { if (open) setGreeting(false); }, [open]);

  const startDrag =(event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    // 手机上面板是全屏的，不需要拖。
    if (window.matchMedia("(max-width: 640px)").matches) return;
    const panel = panelRef.current;
    if (!panel) return;
    event.preventDefault();
    // 监听挂在 window 上：拖得快、指针移出顶栏也不会断。
    const header = window;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = offset;
    const box = panel.getBoundingClientRect();
    // 限制在视口内，至少留 8px，免得拖出屏幕找不回来。
    const minX = base.x - (box.left - 8);
    const maxX = base.x + (window.innerWidth - 8 - box.right);
    const minY = base.y - (box.top - 8);
    const maxY = base.y + (window.innerHeight - 8 - box.bottom);
    const move = (e: PointerEvent) => setOffset({
      x: clamp(base.x + e.clientX - startX, minX, maxX),
      y: clamp(base.y + e.clientY - startY, minY, maxY),
    });
    const end = () => {
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", end);
      header.removeEventListener("pointercancel", end);
      panel.removeAttribute("data-dragging");
    };
    panel.setAttribute("data-dragging", "");
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", end);
    header.addEventListener("pointercancel", end);
  };

  // 窗口缩小时把面板拉回可视区。
  useEffect(() => {
    if (!open) return;
    fitPanel();
    const onResize = () => { updatePlacement(); requestAnimationFrame(fitPanel); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    fetch("/api/assistant/config").then(r => r.json()).then(setConfig).catch(() => setConfig({ enabled: false }));
  }, []);

  // 第一次打开时把上次没聊完的对话拉回来。
  useEffect(() => {
    if (!open || historyLoaded.current) return;
    historyLoaded.current = true;
    const id = conversationRef.current;
    if (!id) return;
    const params = new URLSearchParams({ conversationId: id, visitorKey: getVisitorKey() });
    fetch(`/api/assistant/messages?${params}`).then(r => r.json()).then((data: { messages?: Message[]; expired?: boolean }) => {
      if (data.expired) { conversationRef.current = ""; writeConversation(""); return; }
      if (data.messages?.length) setMessages(current => current.length ? current : data.messages!.filter(m => stripThinking(m.content)));
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Esc 先收菜单，再关面板。
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, menuOpen]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  const patchLast = (update: (message: Message) => Message) =>
    setMessages(current => current.length ? [...current.slice(0, -1), update(current[current.length - 1])] : current);

  const send = async (text: string, retried = false) => {
    const query = text.trim().slice(0, MAX_QUERY);
    if (!query || streaming) return;
    setInput("");
    if (!retried) setMessages(current => [...current, { role: "user", content: query }, { role: "assistant", content: "" }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, conversationId: conversationRef.current, visitorKey: getVisitorKey() }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        if (data.expired && !retried) {
          // 旧会话在 Dify 那边没了：丢掉 ID，同一句话自动在新对话里重发一次。
          conversationRef.current = "";
          writeConversation("");
          setStreaming(false);
          return send(query, true);
        }
        patchLast(m => ({ ...m, content: data.error || "小助手暂时开小差了，稍后再试。", error: true }));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const block of events) {
          const line = block.split("\n").find(l => l.startsWith("data:"));
          if (!line) continue;
          let event: Record<string, any>;
          try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (event.conversation_id && event.conversation_id !== conversationRef.current) {
            conversationRef.current = event.conversation_id;
            writeConversation(event.conversation_id);
          }
          if ((event.event === "message" || event.event === "agent_message") && event.answer) {
            patchLast(m => ({ ...m, content: m.content + event.answer }));
          } else if (event.event === "message_replace") {
            patchLast(m => ({ ...m, content: String(event.answer || "") }));
          } else if (event.event === "error") {
            patchLast(m => stripThinking(m.content) ? m : { ...m, content: "小助手暂时开小差了，稍后再试。", error: true });
          }
        }
      }
      patchLast(m => stripThinking(m.content) ? m : { ...m, content: "这个问题我暂时答不上来，换个问法试试？", error: true });
    } catch {
      if (controller.signal.aborted) patchLast(m => stripThinking(m.content) ? m : { ...m, content: "已停止回答。", error: true });
      else patchLast(m => stripThinking(m.content) ? m : { ...m, content: "网络好像断了，稍后再试。", error: true });
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const resetConversation = () => {
    abortRef.current?.abort();
    conversationRef.current = "";
    writeConversation("");
    setMessages([]);
    inputRef.current?.focus();
  };

  // 生产环境没配 Key 就整个不出现；开发时照常显示，方便调样式。
  const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  if (!config || (!config.enabled && !isDev)) return null;

  const opening = config.opening || "汪～我是小柴，可以问我关于小主人的经历、作品和技能。";
  const suggestions = config.suggestions?.length ? config.suggestions : ["你做过哪些项目？", "擅长哪些技能？", "怎么联系你？"];
  const lastIndex = messages.length - 1;

  return (
    <div className="shiba-assistant" data-open={open || undefined}>
      {open && <section ref={panelRef} id="shiba-assistant-panel" className="shiba-assistant__panel" role="dialog" aria-label="小柴助手"
        style={{ ...placement, "--drag-x": `${offset.x}px`, "--drag-y": `${offset.y}px` } as CSSProperties}
        onPointerDown={event => { if (menuOpen && !(event.target as Element).closest(".shiba-assistant__menu, .shiba-assistant__header > button")) setMenuOpen(false); }}>
        <header className="shiba-assistant__header" onPointerDown={startDrag}>
          <button type="button" data-track="assistant:menu" onClick={() => setMenuOpen(value => !value)} aria-label="菜单" aria-expanded={menuOpen} title="菜单"><Menu size={18} /></button>
          <strong>小柴</strong>
          <button type="button" data-track="assistant:close" onClick={close} aria-label="关闭小助手" title="关闭"><X size={18} /></button>
          {menuOpen && <div className="shiba-assistant__menu" role="menu">
            <button type="button" role="menuitem" data-track="assistant:reset" onClick={() => { setMenuOpen(false); resetConversation(); }} disabled={!messages.length}><RotateCcw size={14} />新对话</button>
            <button type="button" role="menuitem" data-track="assistant:recenter" onClick={() => { setMenuOpen(false); setOffset({ x: 0, y: 0 }); setDock({ x: 0, y: 0 }); writeDock({ x: 0, y: 0 }); }} disabled={!offset.x && !offset.y && !dock.x && !dock.y}><Move size={14} />回到右下角</button>
          </div>}
        </header>
        <div ref={listRef} className="shiba-assistant__messages" aria-live="polite">
          <div className="shiba-assistant__message" data-role="assistant">
            <img src={AVATAR} alt="" aria-hidden="true" />
            <div className="shiba-assistant__bubble"><MessageBody text={opening} /></div>
          </div>
          {!messages.length && <div className="shiba-assistant__suggestions">
            {suggestions.map(question => <button key={question} type="button" data-track="assistant:suggestion" onClick={() => send(question)}>{question}</button>)}
          </div>}
          {messages.map((message, index) => {
            const content = message.role === "assistant" ? stripThinking(message.content) : message.content;
            return (
              <div key={index} className="shiba-assistant__message" data-role={message.role} data-error={message.error || undefined}>
                {message.role === "assistant" && <img src={AVATAR} alt="" aria-hidden="true" />}
                <div className="shiba-assistant__bubble">
                  {content ? <MessageBody text={content} /> : <span className="shiba-assistant__typing" aria-label="正在思考"><i /><i /><i /></span>}
                  {streaming && index === lastIndex && content && <span className="shiba-assistant__caret" aria-hidden="true" />}
                </div>
              </div>
            );
          })}
        </div>
        <form className="shiba-assistant__composer" onSubmit={event => { event.preventDefault(); send(input); }}>
          <textarea ref={inputRef} value={input} rows={2} maxLength={MAX_QUERY} placeholder={config.enabled ? "输入问题" : "开发模式：未配置 DIFY_API_KEY"}
            aria-label="输入问题" onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              // 中文输入法选词时的回车不算发送。
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(input); }
            }} />
          {streaming
            ? <button type="button" data-track="assistant:stop" onClick={() => abortRef.current?.abort()} aria-label="停止回答" title="停止"><Square size={14} className="fill-current" /></button>
            : <button type="submit" data-track="assistant:send" disabled={!input.trim()} aria-label="发送" title="发送（Enter）"><ArrowUp size={18} /></button>}
        </form>
      </section>}
      <div className="shiba-assistant__dock" style={{ "--dock-x": `${dock.x}px`, "--dock-y": `${dock.y}px` } as CSSProperties}>
        {greeting && !open && <div className="shiba-assistant__greeting" data-side={greetingSide} role="status">
          <button type="button" className="shiba-assistant__greeting-text" data-track="assistant:greeting" onClick={openPanel}>
            你好，我是小柴～如果想快速了解我的小主人，可以直接问我哦！
          </button>
          <button type="button" className="shiba-assistant__greeting-close" data-track="assistant:greeting-close" onClick={() => setGreeting(false)} aria-label="收起招呼" title="收起"><X size={12} /></button>
        </div>}
        <button ref={launcherRef} type="button" data-track="assistant:toggle" className="shiba-assistant__launcher"
          aria-label={open ? "收起小柴" : "打开小柴助手"} aria-expanded={open} aria-controls="shiba-assistant-panel"
          title="点击打开，按住可拖动" onPointerDown={startLauncherDrag}
          onClick={() => {
            // 刚拖完松手也会触发 click，这一下不算打开。
            if (draggedRef.current) { draggedRef.current = false; return; }
            if (open) close(); else openPanel();
          }}>
          {open ? <X size={22} /> : <img src={AVATAR} alt="" draggable={false} />}
        </button>
      </div>
    </div>
  );
}
