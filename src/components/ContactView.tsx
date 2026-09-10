import React, { useState } from "react";
import { 
  Mail, 
  MessageCircle, 
  User, 
  Phone, 
  Github, 
  Copy, 
  Check, 
  ExternalLink,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { PortfolioData } from "../types";

interface ContactViewProps {
  data: PortfolioData;
}

export default function ContactView({ data }: ContactViewProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const contactData = data.contact || {
    wechat: "linmo_ink",
    qq: "384952011",
    email: "linmo@inkstudio.com",
    phone: "138-0000-8888",
    github: "https://github.com/linmo-ink"
  };

  const handleCopy = async (value: string, name: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(name);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("无法复制文本", err);
    }
  };

  return (
    <div id="contact-view-container" className="space-y-8 select-none">
      
      {/* Header with aesthetic context */}
      <div>
        <span className="text-xs uppercase font-mono tracking-widest text-zinc-400 block mb-1">
          有缘相识，留笔通信 / INK STATION CONTACT
        </span>
        <h2 className="text-2xl md:text-3xl font-serif text-white tracking-tight">
          与我取得联系
        </h2>
        <p className="text-sm text-zinc-400 mt-2 font-sans font-light leading-relaxed">
          世俗喧浮，唯愿与同道中人留墨相逢。不论是业务合作、自媒体探讨，还是仅仅一段关于人生起底与诗章逆袭的倾听，我都在这里期待你的来信。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        
        {/* WeChat Contact Card */}
        <div 
          id="contact-card-wechat" 
          className="group relative bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 rounded-xl p-5 hover:bg-zinc-950 transition-all duration-300 flex flex-col justify-between space-y-4"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
              <span className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-emerald-400 group-hover:scale-105 transition-transform duration-300">
                <MessageCircle size={18} />
              </span>
              <div>
                <h4 className="text-sm font-serif font-bold text-white tracking-wider">微信 / WeChat</h4>
                <p className="text-[10px] font-mono text-zinc-500 uppercase mt-0.5">Instant Messaging</p>
              </div>
            </div>
            
            <button
              onClick={() => handleCopy(contactData.wechat, "wechat")}
              className="p-1.5 px-2.5 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {copiedField === "wechat" ? (
                <>
                  <Check size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 font-sans">已复制 😊</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span>COPY</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-2">
            <span className="text-xs text-zinc-500 block uppercase font-mono">首选联系账号</span>
            <span className="text-base font-mono text-white font-medium select-text tracking-wide mt-1 block">
              {contactData.wechat}
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-sans font-light leading-relaxed border-t border-zinc-900/60 pt-3">
            添加微信时，请注明「姓名/企业-合作意向」，我将在二十四小时内处理。
          </p>
        </div>

        {/* QQ Contact Card */}
        <div 
          id="contact-card-qq" 
          className="group relative bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 rounded-xl p-5 hover:bg-zinc-950 transition-all duration-300 flex flex-col justify-between space-y-4"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
              <span className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-blue-400 group-hover:scale-105 transition-transform duration-300">
                <MessageSquare size={18} />
              </span>
              <div>
                <h4 className="text-sm font-serif font-bold text-white tracking-wider">腾讯 QQ</h4>
                <p className="text-[10px] font-mono text-zinc-500 uppercase mt-0.5">Classic Chat</p>
              </div>
            </div>
            
            <button
              onClick={() => handleCopy(contactData.qq, "qq")}
              className="p-1.5 px-2.5 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {copiedField === "qq" ? (
                <>
                  <Check size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 font-sans">已复制 ☕</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span>COPY</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-2">
            <span className="text-xs text-zinc-500 block uppercase font-mono">经典沟通号码</span>
            <span className="text-base font-mono text-white font-medium select-text tracking-wide mt-1 block">
              {contactData.qq}
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-sans font-light leading-relaxed border-t border-zinc-900/60 pt-3">
            若微信不常在线，可以通过 QQ 建立首期备用会话。
          </p>
        </div>

        {/* Email Contact Card */}
        <div 
          id="contact-card-email" 
          className="group relative bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 rounded-xl p-5 hover:bg-zinc-950 transition-all duration-300 flex flex-col justify-between space-y-4"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
              <span className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400 group-hover:scale-105 transition-transform duration-300">
                <Mail size={18} />
              </span>
              <div>
                <h4 className="text-sm font-serif font-bold text-white tracking-wider">电子邮箱 / Email</h4>
                <p className="text-[10px] font-mono text-zinc-500 uppercase mt-0.5">Official Inquiries</p>
              </div>
            </div>
            
            <button
              onClick={() => handleCopy(contactData.email, "email")}
              className="p-1.5 px-2.5 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {copiedField === "email" ? (
                <>
                  <Check size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 font-sans">已复制 ✉️</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span>COPY</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-2">
            <span className="text-xs text-zinc-500 block uppercase font-mono">业务与媒体联络</span>
            <span className="text-base font-mono text-white font-medium select-text tracking-wide mt-1 block">
              {contactData.email}
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-sans font-light leading-relaxed border-t border-zinc-900/60 pt-3">
            适合投递长篇立项书、创意纲要、自媒体策划及各种详实的商务提议。
          </p>
        </div>

        {/* Phone Contact Card */}
        <div 
          id="contact-card-phone" 
          className="group relative bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 rounded-xl p-5 hover:bg-zinc-950 transition-all duration-300 flex flex-col justify-between space-y-4"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
              <span className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-rose-400 group-hover:scale-105 transition-transform duration-300">
                <Phone size={18} />
              </span>
              <div>
                <h4 className="text-sm font-serif font-bold text-white tracking-wider">手机号码 / Phone</h4>
                <p className="text-[10px] font-mono text-zinc-500 uppercase mt-0.5">Direct Call</p>
              </div>
            </div>
            
            {contactData.phone && (
              <button
                onClick={() => handleCopy(contactData.phone || "", "phone")}
                className="p-1.5 px-2.5 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {copiedField === "phone" ? (
                  <>
                    <Check size={11} className="text-emerald-400" />
                    <span className="text-emerald-400 font-sans">已复制 📱</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} />
                    <span>COPY</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="pt-2">
            <span className="text-xs text-zinc-500 block uppercase font-mono">即时通话联络</span>
            <span className="text-base font-mono text-white font-medium select-text tracking-wide mt-1 block">
              {contactData.phone || "暂无公开"}
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-sans font-light leading-relaxed border-t border-zinc-900/60 pt-3">
            若有紧急项目或是工作邀约，可以直接通过电话拨打与我进行直达沟通。
          </p>
        </div>

        {/* GitHub & Phone Card */}
        <div 
          id="contact-card-others" 
          className="group relative bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 rounded-xl p-5 hover:bg-zinc-950 transition-all duration-300 flex flex-col justify-between space-y-4"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
              <span className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 group-hover:scale-105 transition-transform duration-300">
                <Github size={18} />
              </span>
              <div>
                <h4 className="text-sm font-serif font-bold text-white tracking-wider">技术星海 / GitHub</h4>
                <p className="text-[10px] font-mono text-zinc-500 uppercase mt-0.5">Open Source Track</p>
              </div>
            </div>
            
            <a
              href={contactData.github}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 px-2.5 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink size={11} />
              <span>VISIT</span>
            </a>
          </div>

          <div className="pt-2">
            <span className="text-xs text-zinc-500 block uppercase font-mono">开源行迹宿地</span>
            <span className="text-base font-mono text-white font-medium select-text tracking-wide mt-1 block">
              github.com/linmo-ink
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-sans font-light leading-relaxed border-t border-zinc-900/60 pt-3">
            若你对墨痕编辑器架构感兴趣，可在开源代码树中留下贡献行迹。
          </p>
        </div>

      </div>

      {/* Aesthetic Bottom Quote Frame */}
      <div className="p-6 bg-zinc-950/40 border border-zinc-900/60 rounded-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-4 mt-8">
        <div className="flex items-center space-x-3">
          <span className="p-2 rounded bg-zinc-950 text-amber-500 border border-zinc-900 shrink-0">
            <Sparkles size={14} />
          </span>
          <p className="text-xs md:text-sm text-zinc-300 font-serif leading-relaxed">
            “大风大浪，无非给轻狂约期，画上个句点，重归清明。”
          </p>
        </div>
        <div className="text-right text-[10px] font-mono text-zinc-500 select-none shrink-0 border-t md:border-t-0 md:border-l border-zinc-900/80 pt-2 md:pt-0 md:pl-4">
          Dear970 • 听风共鸣
        </div>
      </div>

    </div>
  );
}
