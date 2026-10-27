import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import fs from 'node:fs';
import {silenceChunks, recognizeSilenceParallel} from './speech-parallel.cjs';

function audio() {
  const voice = Buffer.alloc(6400);
  for (let i=0;i<voice.length;i+=2) voice.writeInt16LE(i%4 ? 4000 : -4000,i);
  return Buffer.concat([voice,Buffer.alloc(1920),voice,Buffer.alloc(1920),voice]);
}
const split = {minSeconds:0.2,silenceMs:40};
const pause = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));

test('silence cuts preserve all samples and original offsets across arbitrary pipe boundaries', async()=>{
  const pcm=audio(),pieces=[];
  for(let i=0;i<pcm.length;i+=777)pieces.push(pcm.subarray(i,i+777));
  const chunks=[];
  for await(const chunk of silenceChunks(Readable.from(pieces),split))chunks.push(chunk);
  assert.equal(chunks.length,3);
  assert.deepEqual(Buffer.concat(chunks.map(chunk=>chunk.pcm)),pcm);
  let bytes=0;
  for(const chunk of chunks){assert.equal(chunk.offset,bytes/32000);bytes+=chunk.pcm.length;}
  // Both sides of every interior boundary are silent, not arbitrary speech cuts.
  for(let i=0;i<chunks.length-1;i++){
    assert.equal(chunks[i].pcm.readInt16LE(chunks[i].pcm.length-2),0);
    assert.equal(chunks[i+1].pcm.readInt16LE(0),0);
  }
});

test('two jobs share two connections; out-of-order results restore subtitle offsets and ordered text',async()=>{
  let active=0,peak=0;
  const run=async()=>{
    let index=0,progress=0;
    return recognizeSilenceParallel(Readable.from([audio()]),{},async(stream:any,_credentials:any,options:any)=>{
      const part=index++;active++;peak=Math.max(peak,active);
      try {
        let bytes=0;for await(const frame of stream)bytes+=frame.length;
        await pause(part===0?25:2);
        const rows=[{start:0,end:0.1,text:String(part)}];
        options.onProgress(bytes);options.onResult(rows);return rows;
      }finally{active--;}
    },{split,onProgress:(bytes:number)=>{assert.ok(bytes>=progress);progress=bytes;}});
  };
  const rows=await Promise.all([run(),run()]);
  assert.equal(peak,2);assert.equal(active,0);
  for(const result of rows){
    assert.deepEqual(result.map((row:any)=>row.text),['0','1','2']);
    assert.ok(result[1].start>0.2);assert.ok(result[2].start>result[1].start);
    assert.ok(Math.abs(result[1].end-result[1].start-0.1)<1e-9);
  }
});

test('one failed segment cancels sibling connections and retains published text',async()=>{
  let index=0,cancelled=0,partial='';
  const recognize=async(_stream:any,_credentials:any,options:any)=>{
    const part=index++;
    if(part===0){await pause(10);throw new Error('test recognition failure');}
    return new Promise((_resolve,reject)=>{
      options.onResult([{start:0,end:0.1,text:'已识别'}]);
      options.registerTask({cancel:()=>{cancelled++;reject(new Error('cancelled sibling'));}});
    });
  };
  await assert.rejects(recognizeSilenceParallel(Readable.from([audio()]),{},recognize,{split,onResult:(rows:any[])=>partial=rows.map(row=>row.text).join('')}),/test recognition failure/);
  assert.equal(cancelled,1);assert.equal(partial,'已识别');
});

test('user cancellation cleans up connections and stops scheduling further chunks',async()=>{
  let cancel:any,started=0;
  const pending=recognizeSilenceParallel(Readable.from([audio()]),{},async(_stream:any,_credentials:any,options:any)=>{
    started++;
    return new Promise((_resolve,reject)=>options.registerTask({cancel:()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'}))}));
  },{split,registerTask:(task:any)=>{cancel=task.cancel;return()=>{};}});
  await pause(5);cancel();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(started,2);
});

test('unbroken speech remains complete and spills to disk instead of failing at buffer limit',async()=>{
  const pcm=Buffer.alloc(32000);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(4000,i);
  const chunks=[];for await(const chunk of silenceChunks(Readable.from([pcm]),split))chunks.push(chunk);
  assert.equal(chunks.length,1);assert.deepEqual(chunks[0].pcm,pcm);
  let tempFile='';
  const rows=await recognizeSilenceParallel(Readable.from([pcm]),{},async(stream:any)=>{
    tempFile=stream.path;assert.ok(tempFile);assert.ok(fs.existsSync(tempFile));
    const parts=[];for await(const part of stream)parts.push(part);
    assert.deepEqual(Buffer.concat(parts),pcm);
    return [{start:0,end:1,text:'完整音频'}];
  },{split:{...split,bufferSeconds:0.5}});
  assert.equal(rows[0].text,'完整音频');assert.equal(fs.existsSync(tempFile),false);
});

test('spilled audio also cuts safely at later silence without dropping the tail',async()=>{
  const pcm=audio(),parts:Buffer[]=[];
  await recognizeSilenceParallel(Readable.from([pcm]),{},async(stream:any)=>{
    const index=parts.length;parts.push(Buffer.alloc(0));
    const chunks=[];for await(const chunk of stream)chunks.push(chunk);
    parts[index]=Buffer.concat(chunks);return [];
  },{split:{...split,bufferSeconds:0.1}});
  assert.deepEqual(Buffer.concat(parts),pcm);
});
