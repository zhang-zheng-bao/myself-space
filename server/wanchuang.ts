import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { Express, Request, RequestHandler } from 'express';
import { limited, makeRuntime, runtimeBinaries, safeFile, validateMediaUrl } from './wanchuang-runtime';
import { readToolSettings } from './tool-settings';

const root=path.resolve(process.env.WANCHUANG_DATA_DIR || '.private/wanchuang-jobs');
const cookieName='wanchuang_session';
type Session={id:string;directory:string;engine:ReturnType<typeof makeRuntime>;touched:number;requests:number;window:number;pending:number};
const sessions=new Map<string,Session>();
const ipLimits=new Map<string,{time:number;count:number}>();
const finished=new Set(['已完成','失败','已取消']);
const channels:Record<string,string>={getState:'state:get',parseMedia:'media:parse',addJobs:'jobs:add',cancelJob:'jobs:cancel',retryJob:'jobs:retry',clearFinished:'jobs:clear-finished',refreshMinimaxModels:'minimax:refresh',saveMinimaxFavorites:'minimax:favorites',setMinimaxVoiceHidden:'minimax:visibility',generateVoice:'minimax:generate',cloneVoice:'minimax:clone',readVoiceHistoryAudio:'voice-history:audio',removeHistoryRecord:'history:remove'};
const costly=new Set(['parseMedia','generateVoice','cloneVoice','refreshMinimaxModels','addJobs','retryJob']);
function storageBytes(directory:string):number {
  return fs.readdirSync(directory,{withFileTypes:true}).reduce((total,entry)=>{
    if(entry.isSymbolicLink())return total;
    const target=path.join(directory,entry.name);
    try{return total+(entry.isDirectory()?storageBytes(target):fs.statSync(target).size);}catch{return total;}
  },0);
}
function sessionId(req:Request) { return req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1) || ''; }
function scrub(error:unknown) {
  let message=error instanceof Error?error.message:'应用服务暂不可用';
  try {for(const secret of Object.values(readToolSettings().secrets)) if(secret)message=message.split(secret).join('[已隐藏]');}catch{}
  return message.replace(/https?:\/\/\S+/g,'[平台地址]').replaceAll(root,'[任务目录]').slice(0,400);
}
function files(session:Session,kind:string,id:string,record?:any) {
  const state=record?null:session.engine.snapshot();
  const item=record || (kind==='voice'?state.voiceHistory.find((x:any)=>x.id===id):state.jobs.find((x:any)=>x.id===id && (x.type||'download')===kind));
  const candidates=kind==='voice'?[item?.outputPath]:item?.outputs || [];
  return candidates.filter((p:any)=>typeof p==='string' && p).flatMap((p:string)=>{try{return [safeFile(session.directory,p)];}catch{return [];}});
}
function present(session:Session,value:any):any {
  if(Array.isArray(value))return value.map(item=>present(session,item));
  if(!value || typeof value!=='object')return value;
  const out:any={};
  for(const [key,item] of Object.entries(value)) {
    if(key==='resolved')continue;
    if(key==='error')out[key]=item?scrub(new Error(String(item))):'';
    else if(key==='outputDir')out[key]='完成后可下载文件';
    else if(key==='outputPath' || key==='outputs')continue;
    else out[key]=present(session,item);
  }
  if(value.id && (value.outputs || value.outputPath)) {
    const kind=value.voiceId?'voice':value.type || 'download';
    out.files=files(session,kind,value.id,value).map((p:string,index:number)=>({name:path.basename(p),url:`/api/tools/wanchuang/files/${kind}/${encodeURIComponent(value.id)}/${index}`}));
    out.downloadUrl=out.files[0]?.url || '';
    out.outputPath=out.downloadUrl;
  }
  return out;
}
export function registerWanchuang(app:Express,requireAdmin:RequestHandler) {
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  app.get('/api/admin/tools/wanchuang/status',requireAdmin,(_req,res)=>{
    try{const c=readToolSettings(),b=runtimeBinaries();res.json({connected:true,tools:{ytDlp:!!b.ytDlp,ffmpeg:!!b.ffmpeg,browser:!!b.browser},configured:{cookies:['douyin','bilibili','xiaohongshu'].filter(k=>!!c.secrets[k+'Cookie']),speech:!!(c.iflytekAppId&&c.secrets.iflytekApiKey&&c.secrets.iflytekApiSecret),minimax:!!c.secrets.minimaxApiKey}});}catch(error){res.status(503).json({error:scrub(error)});}
  });
  app.use('/api/tools/wanchuang',(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)){res.status(403).json({error:'请从本站打开应用'});return;}
    try {
      let id=sessionId(req);
      const valid=/^[a-f0-9]{48}$/.test(id);
      if(!valid || (!sessions.has(id) && !fs.existsSync(path.join(root,id)))) {
        if(req.method!=='GET' || req.path!=='/state'){res.status(401).json({error:'请刷新应用后重试'});return;}
        const ip=req.ip||req.socket.remoteAddress||'unknown',now=Date.now();
        let limit=ipLimits.get(ip);if(!limit || now-limit.time>3600000){limit={time:now,count:0};ipLimits.set(ip,limit);}
        if(++limit.count>10){res.status(429).json({error:'创建会话过于频繁，请稍后再试'});return;}
        id=crypto.randomBytes(24).toString('hex');
        res.cookie(cookieName,id,{httpOnly:true,sameSite:'strict',secure:req.secure,maxAge:7*86400000,path:'/api/tools/wanchuang'});
      }
      let s=sessions.get(id);
      if(!s) {
        if(sessions.size>=20){res.status(503).json({error:'当前使用人数较多，请稍后再试'});return;}
        const directory=path.join(root,id);
        s={id,directory,engine:makeRuntime(directory),touched:Date.now(),requests:0,window:Date.now(),pending:0};sessions.set(id,s);
      }
      s.touched=Date.now();fs.utimesSync(s.directory,new Date(),new Date());res.locals.wanchuang=s;next();
    }catch(error){res.status(503).json({error:scrub(error)});}
  });
  app.get('/api/tools/wanchuang/state',(_req,res)=>{try{res.json(present(res.locals.wanchuang,res.locals.wanchuang.engine.snapshot()));}catch(error){res.status(503).json({error:scrub(error)});}});
  const upload=multer({storage:multer.diskStorage({destination:(_req,res,done)=>done(null,root),filename:(_req,file,done)=>done(null,'upload-'+crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:20*1024*1024,files:1},fileFilter:(_req,file,done)=>done(null,/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.originalname))}).single('audio');
  app.post('/api/tools/wanchuang/audio',(req,res)=>{
    const s:Session=res.locals.wanchuang;
    if(fs.readdirSync(s.directory).filter(n=>n.startsWith('reference-')).length>=3){res.status(429).json({error:'最多保留 3 份参考音频，请复用已有音频'});return;}
    upload(req,res,error=>{
      if(error || !req.file){res.status(400).json({error:'请选择不超过 20MB 的 MP3、WAV、M4A、AAC 或 OGG 音频'});return;}
      const name='reference-'+crypto.randomUUID()+path.extname(req.file.filename);
      fs.renameSync(req.file.path,path.join(s.directory,name));res.json({refPath:name});
    });
  });
  app.post('/api/tools/wanchuang/action',async(req,res)=>{
    const s:Session=res.locals.wanchuang;
    const method=String(req.body?.method||'');let payload=req.body?.payload;
    if(!channels[method] && method!=='clearHistory'){res.status(400).json({error:'不支持的操作'});return;}
    if(Date.now()-s.window>3600000){s.window=Date.now();s.requests=0;}
    if(costly.has(method) && (++s.requests>30 || s.pending>=2)){res.status(429).json({error:'操作较多，请等待当前任务完成或稍后重试'});return;}
    s.pending++;
    try {
      if(['addJobs','generateVoice','cloneVoice','retryJob'].includes(method) && storageBytes(root)>2*1024*1024*1024)throw new Error('临时文件空间已满，请等待到期清理后重试');
      if(method==='saveMinimaxFavorites' && (!Array.isArray(payload)||payload.length>300||payload.some(x=>typeof x!=='string'||x.length>100)))throw new Error('音色收藏格式错误');
      if(method==='setMinimaxVoiceHidden' && (!payload || typeof payload.id!=='string' || payload.id.length>100 || typeof payload.hidden!=='boolean'))throw new Error('音色设置格式错误');
      if(method==='generateVoice' && (!payload || typeof payload.text!=='string' || payload.text.length>1000 || typeof payload.voiceId!=='string'))throw new Error('请填写音色与不超过 1000 字的文案');
      if(method==='parseMedia') {
        const urls=String(payload||'').match(/https?:\/\/[^\s，。！？、]+/gi)||[];
        if(!urls.length || urls.length>5)throw new Error('每次解析 1–5 个作品链接');
        payload=urls.map(u=>validateMediaUrl(u.replace(/[)\]}>"']+$/g,''))).join('\n');
      }
      if(method==='addJobs') {
        if(!payload || !['download','speech'].includes(payload.type||'download') || !['video','cover','both','transcript'].includes(payload.mode||'video'))throw new Error('任务类型有误');
        const items=payload.items || String(payload.urls||'').split(/\r?\n/).filter(Boolean).map(url=>({url}));
        if(!Array.isArray(items) || !items.length || items.length>5)throw new Error('每次提交 1–5 个任务');
        if(s.engine.snapshot().jobs.filter((x:any)=>!finished.has(x.status)).length+items.length>10)throw new Error('请等待现有任务完成');
        // Resolve media server-side. Never trust client-supplied media URLs or file paths.
        payload={type:payload.type||'download',mode:payload.mode||'video',items:items.map((item:any)=>({url:validateMediaUrl(String(item.url)),selectedMedia:Array.isArray(item.selectedMedia)?item.selectedMedia.filter((n:any)=>Number.isInteger(n)&&n>=0).slice(0,100):[]}))};
      }
      if(method==='cloneVoice') {
        if(!payload || !/^reference-[a-f0-9-]+\.(mp3|wav|m4a|aac|ogg)$/.test(payload.refPath||''))throw new Error('请先上传参考音频');
        payload={voiceId:payload.voiceId,noise:!!payload.noise,refPath:safeFile(s.directory,path.join(s.directory,payload.refPath))};
      }
      if(method==='clearHistory') {
        if(!['voice','speech','download'].includes(payload))throw new Error('无效的历史分类');
        res.json(present(s,s.engine.clearHistory(payload)));return;
      }
      const run=()=>s.engine.call(channels[method],payload);
      const result=await (['parseMedia','generateVoice','cloneVoice','refreshMinimaxModels'].includes(method)?limited(run):run());
      res.json(present(s,result));
    }catch(error){res.status(400).json({error:scrub(error)});}finally{s.pending--;}
  });
  app.get('/api/tools/wanchuang/files/:kind/:id/:index',(req,res)=>{
    try{const s:Session=res.locals.wanchuang,index=Number(req.params.index);const list=files(s,String(req.params.kind),String(req.params.id));if(!Number.isInteger(index)||!list[index])throw new Error('文件不存在或已过期');res.download(list[index],path.basename(list[index]));}catch{res.status(404).json({error:'文件不存在或已过期'});}
  });
  const cleanup=setInterval(()=>{
    let cutoff:number;try{cutoff=Date.now()-readToolSettings().retentionHours*3600000;}catch{return;}
    for(const [ip,item] of ipLimits)if(item.time<Date.now()-3600000)ipLimits.delete(ip);
    if(!fs.existsSync(root))return;
    for(const entry of fs.readdirSync(root,{withFileTypes:true})) {
      if(!entry.isDirectory() || !/^[a-f0-9]{48}$/.test(entry.name))continue;
      const s=sessions.get(entry.name),directory=path.join(root,entry.name);
      if(s?.pending || s?.engine.busy())continue;
      if(fs.statSync(directory).mtimeMs<cutoff){sessions.delete(entry.name);fs.rmSync(directory,{recursive:true,force:true});}
    }
  },60000);cleanup.unref();
}
