import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { Express, Request, RequestHandler } from 'express';
import { limited, makeRuntime, runtimeBinaries, safeFile, validateMediaUrl } from './wanchuang-runtime';
import {recordOperation,operationHistory} from './wanchuang-audit';
import {publicToolCopy} from './public-tool-copy';
import { readToolSettings, writeToolSettings } from './tool-settings';

const root=path.resolve(process.env.WANCHUANG_DATA_DIR || '.private/wanchuang-jobs');
const cookieName='wanchuang_session';
type Session={id:string;directory:string;engine:ReturnType<typeof makeRuntime>;touched:number;requests:number;window:number;pending:number};
const sessions=new Map<string,Session>();
const ipLimits=new Map<string,{time:number;count:number}>();
const finished=new Set(['已完成','失败','已取消']);
const channels:Record<string,string>={getState:'state:get',parseMedia:'media:parse',addJobs:'jobs:add',cancelJob:'jobs:cancel',retryJob:'jobs:retry',clearFinished:'jobs:clear-finished',refreshMinimaxModels:'minimax:refresh',saveMinimaxFavorites:'minimax:favorites',generateVoice:'minimax:generate',cloneVoice:'minimax:clone',readVoiceHistoryAudio:'voice-history:audio'};
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
  return publicToolCopy(message.replace(/https?:\/\/\S+/g,'[平台地址]').replaceAll(root,'[任务目录]').slice(0,400));
}
function files(session:{directory:string;engine?:ReturnType<typeof makeRuntime>},kind:string,id:string,record?:any) {
  const state=record?null:session.engine!.snapshot();
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
    else if(key==='message' && typeof item==='string')out[key]=publicToolCopy(item);
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
function saveVoiceCatalog(models:any[]) {
  const config=readToolSettings();
  if(!config.secrets.minimaxApiKey)return;
  config.voiceModels=models.map(item=>({id:String(item.id),name:String(item.name||item.id),type:String(item.type||'system'),createdAt:String(item.createdAt||'')}));
  config.voiceModelsAccount=crypto.createHash('sha256').update(config.secrets.minimaxApiKey).digest('hex');
  writeToolSettings(config);
}
function voiceCatalog() {
  const c=readToolSettings();
  const account=c.secrets.minimaxApiKey?crypto.createHash('sha256').update(c.secrets.minimaxApiKey).digest('hex'):'';
  return {configured:!!account,models:(c.voiceModelsAccount===account?c.voiceModels||[]:[]).map(model=>({...model,hidden:(c.hiddenVoices||[]).includes(model.id)}))};
}
function historyOwners() {
  return fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory() && /^[a-f0-9]{48}$/.test(entry.name)).map(entry=>({id:entry.name,key:crypto.createHash('sha256').update(entry.name).digest('hex').slice(0,24),directory:path.join(root,entry.name)}));
}
function historySnapshot(owner:{id:string;directory:string}) {
  const live=sessions.get(owner.id);
  if(live)return live.engine.snapshot();
  const file=path.join(owner.directory,'history.json');
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{jobs:[],voiceHistory:[]};
}
function historyRecord(owner:any,kind:string,id:string) {
  const history=historySnapshot(owner);
  return kind==='voice'?(history.voiceHistory||[]).find((row:any)=>row.id===id):(history.jobs||[]).find((row:any)=>row.id===id && (row.type||'download')===kind);
}
export function registerWanchuang(app:Express,requireAdmin:RequestHandler) {
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const adminBase='/api/admin/tools/wanchuang';
  app.get(adminBase+'/operations',requireAdmin,(req,res)=>{
    try{res.json(operationHistory(Math.max(1,Number(req.query.page)||1),String(req.query.q||'').slice(0,200)));}catch{res.status(500).json({error:'读取操作记录失败'});}
  });
  app.use(['/api/tools/wanchuang',adminBase],(req,res,next)=>{
    if(['GET','HEAD','OPTIONS'].includes(req.method) && !(req.method==='GET'&&req.path.includes('/files/'))){next();return;}
    const started=Date.now();
    const method=String(req.body?.method||req.path).slice(0,80);
    let failure='';
    const original=res.json.bind(res);
    res.json=((body:any)=>{
      const failures=Array.isArray(body)?body.filter(x=>x?.ok===false).map(x=>x.error):[];
      if(body?.error || failures.length)failure=scrub(new Error(String(body?.error || failures.join('；'))));
      return original(body);
    }) as typeof res.json;
    res.on('finish',()=>{
      failure ||= res.locals.auditError || '';
      const raw=String(req.body?.payload?.voiceId || (method==='parseMedia'?req.body?.payload:'') || req.body?.payload?.urls || '');
      const reference=(raw.match(/https?:\/\/[^\s，。]+/)?.[0]?.split('?')[0] || (method==='cloneVoice'?raw:'')).slice(0,200);
      try{recordOperation({actor:crypto.createHash('sha256').update(sessionId(req)||'admin').digest('hex').slice(0,16),operation:method,status:res.statusCode>=400||failure?'失败':'成功',durationMs:Date.now()-started,error:failure||(res.statusCode>=400?`HTTP ${res.statusCode}`:''),reference});}catch(error){console.error('WanChuang audit write failed',error instanceof Error?error.message:'write error');}
    });
    next();
  });
  app.use(adminBase,(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(req.method) && req.headers['sec-fetch-site']==='cross-site'){res.status(403).json({error:'不允许跨站操作'});return;}
    next();
  });
  app.get(adminBase+'/voices',requireAdmin,(_req,res)=>{
    try{res.json(voiceCatalog());}catch(error){res.status(503).json({error:scrub(error)});}
  });
  let managementEngine:ReturnType<typeof makeRuntime>;
  app.post(adminBase+'/voices/refresh',requireAdmin,async(_req,res)=>{
    try{
      managementEngine ||= makeRuntime(path.join(root,'.management'));
      const profile=await limited(()=>managementEngine.call('minimax:refresh'));
      saveVoiceCatalog(profile.models);res.json(voiceCatalog());
    }catch(error){res.status(400).json({error:scrub(error)});}
  });
  app.put(adminBase+'/voices/visibility',requireAdmin,(req,res)=>{
    const {id,hidden}=req.body||{};
    if(typeof id!=='string'||!id||id.length>200||typeof hidden!=='boolean'){res.status(400).json({error:'音色设置格式错误'});return;}
    try{
      const config=readToolSettings(),known=voiceCatalog().models.some(model=>model.id===id);
      if(!known){res.status(404).json({error:'音色不存在，请先刷新账号音色'});return;}
      const values=new Set(config.hiddenVoices||[]);if(hidden)values.add(id);else values.delete(id);
      config.hiddenVoices=[...values];writeToolSettings(config);res.json(voiceCatalog());
    }catch(error){res.status(500).json({error:scrub(error)});}
  });
  app.get(adminBase+'/history',requireAdmin,(req,res)=>{
    try{
      const kind=String(req.query.kind||'all'),query=String(req.query.q||'').trim().toLowerCase();
      const page=Math.max(1,Math.floor(Number(req.query.page)||1));
      const rows:any[]=[];let unreadable=0;
      for(const owner of historyOwners()){
        try{
          const data=historySnapshot(owner);
          for(const record of [...(data.jobs||[]),...(data.voiceHistory||[])]){
            const recordKind=record.voiceId?'voice':record.type||'download';
            const title=String(record.text||record.title||record.url||record.voiceId||'未命名任务');
            if(kind!=='all'&&kind!==recordKind)continue;
            if(query&&!`${title} ${record.status} ${record.voiceId||''}`.toLowerCase().includes(query))continue;
            const available=files(owner,recordKind,record.id,record);
            rows.push({id:record.id,owner:owner.key,kind:recordKind,title,status:record.status,createdAt:record.createdAt,finishedAt:record.finishedAt,voiceId:record.voiceId,error:record.error?scrub(new Error(record.error)):'',text:record.transcriptText||record.text||'',files:available.map((file,index)=>({name:path.basename(file),url:`${adminBase}/history/${owner.key}/${recordKind}/${encodeURIComponent(record.id)}/files/${index}`}))});
          }
        }catch{unreadable++;}
      }
      rows.sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));
      res.json({rows:rows.slice((page-1)*30,page*30),page,total:rows.length,unreadable});
    }catch(error){res.status(500).json({error:scrub(error)});}
  });
  app.get(adminBase+'/history/:owner/:kind/:id/files/:index',requireAdmin,(req,res)=>{
    try{
      const owner=historyOwners().find(item=>item.key===req.params.owner);
      if(!owner)throw new Error('记录不存在');
      const record=historyRecord(owner,String(req.params.kind),String(req.params.id));
      if(!record)throw new Error('记录不存在');
      const list=files(owner,String(req.params.kind),String(req.params.id),record),index=Number(req.params.index);
      if(!Number.isInteger(index)||!list[index])throw new Error('文件已过期');
      res.download(list[index],path.basename(list[index]));
    }catch{res.status(404).json({error:'文件不存在或已过期'});}
  });
  app.delete(adminBase+'/history/:owner/:kind/:id',requireAdmin,async(req,res)=>{
    try{
      const owner=historyOwners().find(item=>item.key===req.params.owner),kind=String(req.params.kind),id=String(req.params.id);
      if(!owner)throw new Error('记录不存在');
      const record=historyRecord(owner,kind,id);
      if(!record)throw new Error('记录不存在');
      if(!finished.has(record.status)){res.status(409).json({error:'任务仍在进行，完成后才能移除记录'});return;}
      const live=sessions.get(owner.id);
      if(live)await live.engine.call('history:remove',{kind,id});
      else{
        const history=historySnapshot(owner);
        if(kind==='voice')history.voiceHistory=(history.voiceHistory||[]).filter((item:any)=>item.id!==id);
        else history.jobs=(history.jobs||[]).filter((item:any)=>item.id!==id||(item.type||'download')!==kind);
        const file=path.join(owner.directory,'history.json'),temporary=file+'.admin.tmp';
        fs.writeFileSync(temporary,JSON.stringify(history));fs.renameSync(temporary,file);
      }
      res.json({ok:true});
    }catch(error){res.status(400).json({error:scrub(error)});}
  });
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
  app.post('/api/tools/wanchuang/client-errors',(req,res)=>{
    const messages:Record<string,string>={'minimax-unconfigured':'MiniMax 尚未配置，创建音色未提交','audio-too-large':'参考音频超过 20MB，上传未提交','operation-failed':'前端显示操作失败，请结合相邻接口记录查看原因'};
    if(!messages[req.body?.code]){res.status(400).json({error:'不支持的错误类型'});return;}
    res.locals.auditError=messages[req.body.code];
    res.status(204).end();
  });
  const upload=multer({storage:multer.diskStorage({destination:(_req,res,done)=>done(null,root),filename:(_req,file,done)=>done(null,'upload-'+crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:20*1024*1024,files:1},fileFilter:(_req,file,done)=>done(null,/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.originalname))}).single('audio');
  app.post('/api/tools/wanchuang/audio',(req,res)=>{
    const s:Session=res.locals.wanchuang;
    if(readToolSettings().voiceCloneEnabled===false){res.status(403).json({error:'管理员已关闭音色克隆'});return;}
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
    if(method==='cloneVoice' && readToolSettings().voiceCloneEnabled===false){res.status(403).json({error:'管理员已关闭音色克隆'});return;}
    if(!channels[method]){res.status(400).json({error:'不支持的操作'});return;}
    if(Date.now()-s.window>3600000){s.window=Date.now();s.requests=0;}
    if(costly.has(method) && (++s.requests>30 || s.pending>=2)){res.status(429).json({error:'操作较多，请等待当前任务完成或稍后重试'});return;}
    s.pending++;
    try {
      if(['addJobs','generateVoice','cloneVoice','retryJob'].includes(method) && storageBytes(root)>2*1024*1024*1024)throw new Error('临时文件空间已满，请等待到期清理后重试');
      if(method==='saveMinimaxFavorites' && (!Array.isArray(payload)||payload.length>300||payload.some(x=>typeof x!=='string'||x.length>100)))throw new Error('音色收藏格式错误');
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
      const run=()=>s.engine.call(channels[method],payload);
      if(method==='refreshMinimaxModels'){res.json(present(s,s.engine.snapshot().settings.minimax));return;}
      const result=await (['parseMedia','generateVoice','cloneVoice','refreshMinimaxModels'].includes(method)?limited(run):run());
      if(method==='cloneVoice'&&result.profile?.models)saveVoiceCatalog(result.profile.models);
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
