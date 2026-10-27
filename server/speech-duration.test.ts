import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
test('real FFmpeg limits default recognition to 300 seconds; explicit full processes all 360 seconds',async(t)=>{
  if(spawnSync('ffmpeg',['-version'],{windowsHide:true}).status!==0){t.skip('FFmpeg not installed');return;}
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wanchuang-duration-'));
  const source=fs.readFileSync(new URL('./wanchuang-engine.cjs',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('async function runSpeechRecognition('),source.indexOf('async function resolveDouyin('));
  const input=path.join(directory,'six-minutes.wav');
  try{
    const generated=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=360','-ac','1','-ar','16000','-y',input],{windowsHide:true});
    assert.equal(generated.status,0,generated.stderr?.toString());
    for(const fullRecognition of [false,true]){
      let bytes=0;
      const run=vm.runInNewContext(code+';runSpeechRecognition',{
        fs,path,crypto:{randomUUID:()=> 'test'},settings:{outputDir:directory},running:new Map(),
        SPEECH_SAMPLE_RATE:16000,SPEECH_BYTES_PER_SECOND:32000,
        decryptSpeechCredentials:()=>({appId:'test',apiKey:'test',apiSecret:'test'}),ffmpegPath:()=> 'ffmpeg',
        probeMedia:async()=>({kind:'video',platformKey:'test',duration:360,title:'test',media:[{type:'video',url:'https://example.com/test.mp4'}]}),
        validateRemote:async()=>{},updateJob:(job:any,patch:any)=>Object.assign(job,patch),cleanFilename:(name:string)=>name,
        formatSrtTime:(seconds:number)=>String(seconds),recognizeContinuousPcmWithIflytek:()=>{},
        terminateProcessTree:(child:any)=>child?.kill(),
        // Replace only the remote input transport with the local fixture, retaining output options.
        spawn:(_binary:string,args:string[])=>spawn('ffmpeg',['-hide_banner','-loglevel','error','-i',input,...args.slice(args.indexOf('-i')+2)],{windowsHide:true,stdio:['pipe','pipe','pipe']}),
        require:(name:string)=>name==='./speech-parallel.cjs'?{recognizeSilenceParallel:async(stream:any)=>{
          for await(const part of stream)bytes+=part.length;
          return [{start:0,end:bytes/32000,text:'识别结果'}];
        }}:require(name),
      });
      const job:any={id:fullRecognition?'full':'preview',url:'https://example.com/test',fullRecognition};
      const files=await run(job);
      assert.equal(bytes/32000,fullRecognition?360:300);
      assert.equal(job.speechLimitSeconds,fullRecognition?0:300);
      assert.equal(files.length,2);
    }
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
