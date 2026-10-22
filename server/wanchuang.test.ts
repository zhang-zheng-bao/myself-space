import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import express from 'express';
import createEngine from './wanchuang-engine.cjs';
import {validateMediaUrl,validateRemote,safeFile} from './wanchuang-runtime';

test('media URL and local file boundaries',async()=>{
  assert.equal(validateMediaUrl('https://www.bilibili.com/video/BV1xx411c7mD'),'https://www.bilibili.com/video/BV1xx411c7mD');
  for(const url of ['http://127.0.0.1','https://bilibili.com.evil.test','file:///etc/passwd','https://user@bilibili.com'])assert.throws(()=>validateMediaUrl(url));
  for(const url of ['http://127.0.0.1','http://10.0.0.1','http://[::1]','http://[::ffff:127.0.0.1]','http://169.254.169.254'])await assert.rejects(validateRemote(url));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wanchuang-files-'));
  try{fs.writeFileSync(path.join(directory,'ok.txt'),'ok');assert.equal(safeFile(directory,path.join(directory,'ok.txt')),fs.realpathSync(path.join(directory,'ok.txt')));assert.throws(()=>safeFile(directory,process.execPath));}finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('desktop engine reads current server Cookie and KEY, persists history without credentials',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wanchuang-engine-'));
  const config={concurrency:1,retentionHours:6,iflytekAppId:'',secrets:{bilibiliCookie:'SESSDATA=test-session; bili_jct=test-csrf',minimaxApiKey:'test-server-key'}};
  let cookieUsed='',authorization='';
  const options:any={root,readConfig:()=>config,binaries:{ytDlp:process.execPath,ffmpeg:process.execPath,browser:''},chromium:{},validateRemote:async()=>{},acquire:async()=>()=>{},
    spawn:(_command:string,args:string[])=>{
      const child:any=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
      const cookie=args[args.indexOf('--cookies')+1];cookieUsed=fs.readFileSync(cookie,'utf8');
      setImmediate(()=>{
        if(args.includes('--dump-single-json'))child.stdout.emit('data',JSON.stringify({title:'测试作品',formats:[],duration:5}));
        else {const output=args[args.indexOf('-o')+1].replace(/%\([^)]*\)(?:\d+)?s/g,'test');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,'downloaded');}
        child.emit('close',0);
      });return child;
    },
    fetch:async(_url:string,options:any)=>{authorization=options.headers.Authorization;return new Response(JSON.stringify({base_resp:{status_code:0},data:{audio:'494433'},extra_info:{audio_length:100}}),{headers:{'Content-Type':'application/json'}});},
  };
  try{
    const engine=createEngine(options);
    const state=engine.snapshot();assert.equal(state.settings.cookieProfiles.find((c:any)=>c.platform==='bilibili').configured,true);assert.equal(JSON.stringify(state).includes('test-session'),false);
    const parsed=await engine.call('media:parse','https://www.bilibili.com/video/BV1xx411c7mD');assert.equal(parsed[0].ok,true);assert.match(cookieUsed,/test-session/);assert.equal(fs.readdirSync(root).some(f=>f.endsWith('.cookies.txt')),false);
    await engine.call('jobs:add',{items:[{url:'https://www.bilibili.com/video/BV1xx411c7mD'}],mode:'cover'});
    for(let i=0;i<20 && engine.busy();i++)await new Promise(r=>setTimeout(r,10));
    const job=engine.snapshot().jobs[0];assert.equal(job.status,'已完成');assert.equal(job.outputs.length,1);assert.equal(fs.readFileSync(job.outputs[0],'utf8'),'downloaded');
    config.secrets.minimaxApiKey='updated-server-key';
    const voice=await engine.call('minimax:generate',{text:'测试',voiceId:'testvoice123'});assert.equal(authorization,'Bearer updated-server-key');assert.equal(voice.audioBase64,'SUQz');assert.ok(fs.existsSync(voice.outputPath));
    const reloaded=createEngine(options);assert.equal(reloaded.snapshot().voiceHistory[0].status,'已完成');
    for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.json')))assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/test-session|updated-server-key/);
    await assert.rejects(engine.call('settings:save',{outputDir:'elsewhere'}));
  }finally{await new Promise(r=>setTimeout(r,300));fs.rmSync(root,{recursive:true,force:true});}
});

test('HTTP sessions isolate history/downloads; invalid actions never execute',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wanchuang-http-'));
  process.env.WANCHUANG_DATA_DIR=path.join(directory,'jobs');process.env.TOOL_SETTINGS_FILE=path.join(directory,'settings.enc');
  const {registerWanchuang}=await import('./wanchuang');
  const app=express();app.use(express.json());registerWanchuang(app,(_req,res)=>{res.status(401).end();});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const address=server.address() as any,base=`http://127.0.0.1:${address.port}/api/tools/wanchuang`;
  try {
    const first=await fetch(base+'/state');assert.equal(first.status,200);const cookie=first.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await first.json()).settings.minimax.configured,false);
    const second=await fetch(base+'/state');const other=second.headers.get('set-cookie')!.split(';')[0];assert.notEqual(cookie,other);
    const action=(method:string,payload:any)=>fetch(base+'/action',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({method,payload})});
    assert.equal((await action('parseMedia','http://127.0.0.1')).status,400);
    assert.equal((await action('cloneVoice',{refPath:'../../etc/passwd'})).status,400);
    assert.equal((await action('saveSettings',{})).status,400);
    assert.equal((await fetch(base+'/action',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const id=cookie.split('=')[1],ownerRoot=path.join(process.env.WANCHUANG_DATA_DIR!,id);
    const output=path.join(ownerRoot,'outputs','example.txt');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,'test result');
    // A newly restored session reads its own persisted engine history.
    const thirdId=crypto.randomBytes(24).toString('hex'),thirdRoot=path.join(process.env.WANCHUANG_DATA_DIR!,thirdId);fs.mkdirSync(thirdRoot);
    const ownOutput=path.join(thirdRoot,'test.txt');fs.writeFileSync(ownOutput,'private result');
    fs.writeFileSync(path.join(thirdRoot,'history.json'),JSON.stringify({jobs:[{id:'test-record',type:'download',status:'已完成',outputs:[output]},{id:'own-record',type:'download',status:'已完成',outputs:[ownOutput]}],voiceHistory:[]}));
    const cross=await fetch(base+'/files/download/test-record/0',{headers:{Cookie:'wanchuang_session='+thirdId}});assert.equal(cross.status,404);
    const own=await fetch(base+'/files/download/own-record/0',{headers:{Cookie:'wanchuang_session='+thirdId}});assert.equal(own.status,200);assert.equal(await own.text(),'private result');
    assert.equal((await fetch(base+'/files/download/own-record/0',{headers:{Cookie:other}})).status,404);
    assert.equal((await fetch(base+'/files/download/test-record/0',{headers:{Cookie:other}})).status,404);
    const state=await (await fetch(base+'/state',{headers:{Cookie:cookie}})).text();assert.equal(state.includes(ownerRoot),false);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));fs.rmSync(directory,{recursive:true,force:true});}
});
