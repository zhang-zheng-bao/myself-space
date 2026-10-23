import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeRuntime,runtimeBinaries,validateMediaUrl} from '../server/wanchuang-runtime';
const url=validateMediaUrl(process.argv[2]);
const root=fs.mkdtempSync(path.resolve('.private/wanchuang-jobs/verify-'));
const engine=makeRuntime(root);
const speech=process.argv.includes('--speech');
const jobs=await engine.call('jobs:add',{type:speech?'speech':'download',mode:speech?'transcript':'video',items:[{url}]});
const id=jobs[0].id;
let last='';
const deadline=Date.now()+5*60000;
while(Date.now()<deadline){
 const job=engine.snapshot().jobs.find((j:any)=>j.id===id);
 const state=`${job.status} ${job.progress}%`;
 if(state!==last){console.log(state);last=state;}
 if(job.status==='失败')throw new Error(job.error);
 if(job.status==='已完成'){
   for(const file of job.outputs){
     console.log('FILE',path.basename(file),fs.statSync(file).size);
     if(speech){if(!fs.readFileSync(file,'utf8').trim())throw new Error('Empty transcript');continue;}
     const check=spawnSync(runtimeBinaries().ffmpeg,['-v','error','-i',file,'-t','2','-f','null','-'],{encoding:'utf8'});
     if(check.status!==0)throw new Error('Video decode failed: '+check.stderr);
   }
   console.log(speech?'TRANSCRIPTION_OK':'DOWNLOAD_AND_DECODE_OK');process.exit(0);
 }
 await new Promise(resolve=>setTimeout(resolve,2000));
}
throw new Error('Download verification timed out');
