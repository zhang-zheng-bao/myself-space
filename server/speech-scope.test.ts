import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('speech form defaults to five minutes; only explicit full choice enables complete recognition',async()=>{
  const source=fs.readFileSync(new URL('../public/tools/wanchuang/renderer.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf("$('#speechStartButton').addEventListener('click'"),source.indexOf("$('#clearSpeechTextButton').addEventListener"));
  for(const [duration,choice,full,prompts] of [[299,'full',false,0],[300,'full',false,0],[301,'full',true,1],[301,'preview',false,1],[301,'',false,1],[0,'full',true,1]] as const){
    let click:any,close:any,promptCount=0,submitted:any;
    const nodes=new Map();
    const url='https://www.douyin.com/video/123';
    const $=(id:string)=>{
      if(!nodes.has(id))nodes.set(id,{value:id==='#speechInput'?url:'',className:'',textContent:'',disabled:false,returnValue:'',
        addEventListener:(event:string,fn:any)=>{if(event==='click')click=fn;else if(event==='close')close=fn;},
        showModal:()=>{promptCount++;queueMicrotask(()=>{nodes.get('#speechLengthDialog').returnValue=choice;close();});},
      });return nodes.get(id);
    };
    vm.runInNewContext(code,{$,state:{settings:{speech:{configured:true}},tools:{ffmpeg:true},jobs:[]},speechSubmitting:false,
      window:{clipHarbor:{parseMedia:async()=>[{url,ok:true,duration,title:'视频'}],addJobs:async(payload:any)=>{submitted=payload;return [];}}},
      renderJobs:()=>{},errorMessage:(error:any)=>error.message,
    });
    await click();
    assert.equal(promptCount,prompts,`duration ${duration}, choice ${choice}`);
    assert.equal(submitted.items[0].fullRecognition,full);
    assert.equal($('#speechStartButton').disabled,false);
  }
});
