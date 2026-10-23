import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import recognizeStream from './speech-stream.cjs';
import {publicToolCopy} from './public-tool-copy';
test('standard recognition splits long streams into bounded sessions with ordered subtitles',async()=>{
  const sizes:number[]=[];let progress=0;
  const segments=await recognizeStream(Readable.from([Buffer.alloc(32000*97)]),{}, {onProgress:(n:number)=>progress=n},async(pcm:Buffer)=>{sizes.push(pcm.length);return `片段${sizes.length}`;});
  assert.deepEqual(sizes,[32000*45,32000*45,32000*7]);
  assert.deepEqual(segments.map((s:any)=>[s.start,s.end]),[[0,45000],[45000,90000],[90000,97000]]);
  assert.equal(progress,32000*97);
  await assert.rejects(recognizeStream(Readable.from([Buffer.alloc(100)]),{},{isCancelled:()=>true},async()=>''),/取消/);
});
test('provider errors and statuses use public feature names',()=>{
  for(const copy of ['MiniMax 返回失败','MINMAX 请求失败','科大讯飞识别错误','iflytek 连接异常','讯飞实时转写失败：illegal access|no appid info']){
    assert.doesNotMatch(publicToolCopy(copy),/minimax|minmax|讯飞|iflytek/i);
  }
});
