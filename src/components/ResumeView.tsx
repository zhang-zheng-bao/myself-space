import React from "react";
import { FileText, Contact, BookOpen, Layers, Sparkles, Award } from "lucide-react";
import { PortfolioData } from "../types";

interface ResumeViewProps {
  data: PortfolioData;
}

export default function ResumeView({ data }: ResumeViewProps) {
  const { profile, experiences } = data;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 select-none">
      {/* Header with Print Control */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-5">
        <div>
          <span className="text-xs uppercase font-mono tracking-widest text-zinc-400 block mb-1">
            简历展示 / DIGITAL CURRICULUM VITAE
          </span>
          <h2 className="text-2xl md:text-3xl font-serif text-white tracking-tight">
            关于「{profile.name.split("/")[0].trim()}」的真迹履历
          </h2>
        </div>
        <button
          onClick={handlePrint}
          className="self-start md:self-auto flex items-center space-x-2 px-5 py-2.5 bg-zinc-950 hover:bg-zinc-900 hover:text-white border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-lg text-xs font-mono transition-colors cursor-pointer"
        >
          <FileText size={14} className="text-zinc-400" />
          <span>PRINT / 保存PDF</span>
        </button>
      </div>

      {/* Main Resume Paper */}
      <div className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 rounded-xl p-6 md:p-10 text-zinc-300 space-y-10 shadow-xl transition-all duration-500 relative overflow-hidden print:bg-white print:text-black print:p-0 print:border-none print:shadow-none">
        
        {/* Subtle decorative elements for that high-end feeling */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-zinc-900/10 to-transparent pointer-events-none" />

        {/* Paper Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-zinc-900/80 pb-6 print:border-black/20">
          <div className="flex items-center space-x-4 md:space-x-5">
            <img
              src={profile.avatar}
              alt={profile.name}
              className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border border-zinc-800 print:border-black"
              referrerPolicy="no-referrer"
            />
            <div>
              <h1 className="text-2xl md:text-3xl font-serif text-white print:text-black tracking-tight leading-none mb-2">
                {profile.name}
              </h1>
              <p className="text-sm md:text-base font-sans tracking-wide text-zinc-300 print:text-black/70 font-medium">
                新媒体运营 | AIGC多模态内容创作者 | 独立产品经理
              </p>
              <div className="flex flex-wrap gap-2.5 mt-2.5 text-xs font-mono text-zinc-500 print:text-black/50">
                <span>EMAIL: {data.contact?.email || "dear970@163.com"}</span>
                <span>•</span>
                <span>PHONE: {data.contact?.phone || "18755571310"}</span>
                <span>•</span>
                <span>LOCATION: 安徽 • 合肥</span>
              </div>
            </div>
          </div>
        </div>

        {/* Resume Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          
          {/* Column Left (Metadata & Skills) */}
          <div className="md:col-span-1 space-y-8">
            {/* Biography */}
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-mono tracking-widest text-zinc-400 print:text-black/80 flex items-center space-x-2 border-b border-zinc-900 pb-2 print:border-black/15">
                <Contact size={12} className="text-zinc-500" />
                <span>自我评价 / Biography</span>
              </h3>
              <p className="text-sm leading-relaxed text-zinc-300 print:text-black/80 font-normal font-sans">
                {profile.intro}
              </p>
            </div>

            {/* Core Capability & Skills */}
            <div className="space-y-4">
              <h3 className="text-xs uppercase font-mono tracking-widest text-zinc-400 print:text-black/80 flex items-center space-x-2 border-b border-zinc-900 pb-2 print:border-black/15">
                <Layers size={12} className="text-zinc-500" />
                <span>端上技能 / Skill Matrices</span>
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {([] as string[]).map((skill, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-zinc-300 print:text-black">{skill}</span>
                      <span className="text-zinc-500 print:text-black/60 font-semibold text-[10px]">熟练度 • FULL</span>
                    </div>
                    <div className="h-1 bg-zinc-900 rounded-full overflow-hidden print:bg-black/10">
                      <div className="h-full bg-zinc-400 w-[90%] rounded-full print:bg-black" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Aesthetic Education */}
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-mono tracking-widest text-zinc-400 print:text-black/80 flex items-center space-x-2 border-b border-zinc-900 pb-2 print:border-black/15">
                <BookOpen size={12} className="text-zinc-500" />
                <span>教育背景 / Education</span>
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-serif text-white print:text-black">
                    网络与新媒体专业 (本科)
                  </h4>
                  <p className="text-xs font-mono text-zinc-500 print:text-black/60 mt-1">
                    安徽艺术学院 • 传媒学院
                  </p>
                  <p className="text-xs text-zinc-400 print:text-black/50 font-sans mt-0.5">
                    2023.09 - 2027.06
                  </p>
                </div>
              </div>
            </div>

            {/* Awards Section */}
            {false && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs uppercase font-mono tracking-widest text-zinc-400 print:text-black/80 flex items-center space-x-2 border-b border-zinc-900 pb-2 print:border-black/15">
                  <Award size={12} className="text-zinc-500" />
                  <span>获奖情况 / Honors & Awards</span>
                </h3>
                <div className="space-y-3">
                  {([] as any[]).map((award, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <span className="text-[10px] font-mono text-zinc-500 print:text-black/50 block">{award.period}</span>
                      <h4 className="text-xs font-sans text-zinc-300 print:text-black leading-relaxed">
                        {award.title}
                      </h4>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Column Right (Experiences & Accomplishments) */}
          <div className="md:col-span-2 space-y-8">
            <div className="space-y-5">
              <h3 className="text-xs uppercase font-mono tracking-widest text-zinc-400 print:text-black/80 flex items-center space-x-2 border-b border-zinc-900 pb-2 print:border-black/15">
                <Award size={13} className="text-zinc-500" />
                <span>行迹与重构 / Work Experiences</span>
              </h3>

              {/* Vertical timeline inside CV */}
              <div className="space-y-6 md:space-y-8 relative before:absolute before:inset-y-1 before:left-2.5 before:w-[1px] before:bg-zinc-900 print:before:bg-black/10">
                {experiences.map((exp) => (
                  <div key={exp.id} className="relative pl-7 group">
                    {/* Timeline Node */}
                    <div className="absolute left-1.5 top-1.5 w-2 h-2 rounded-full bg-zinc-700 border border-zinc-950 group-hover:bg-zinc-100 transition-colors print:bg-black print:border-white" />

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-1.5">
                      <div>
                        <h4 className="text-base font-serif font-semibold text-white print:text-black group-hover:text-zinc-100">
                          {exp.role}
                        </h4>
                        <p className="text-xs md:text-sm text-zinc-400 print:text-black/70">
                          {exp.company}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-zinc-400 border border-zinc-900 bg-zinc-950/20 px-2 py-0.5 rounded print:text-black print:border-black/10">
                        {exp.period}
                      </span>
                    </div>

                    <p className="text-sm font-sans font-light leading-relaxed text-zinc-300 print:text-black/80">
                      {exp.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Growth Creed Inspired by BTTH */}
            <div className="p-4 bg-zinc-900/10 border border-zinc-900 rounded-lg print:border-black/20 print:p-4">
              <span className="text-xs font-mono uppercase tracking-widest text-zinc-500 block mb-2 print:text-black/60">
                行者信念 / Wanderer Creed
              </span>
              <p className="text-sm font-serif italic text-zinc-300 print:text-black/90 leading-relaxed">
                这些年最大的收获，绝非名利与吹嘘的头衔，而是逆境中结伴同行的那些形形色色的人。他们让我明白，所谓的“三年之约”或者一时低谷，只过是年少负气时设立的一枚坐标，旨在用这段岁月的汗水，给过去的骄傲或者稚气，画上个无比圆满的句号。
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
