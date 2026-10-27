import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Readable} from 'node:stream';
import {formatTranscript} from './transcript-format.cjs';

test('transcript joins delayed punctuation and groups complete sentences', () => {
  assert.equal(formatTranscript([{text:'第一句'}, {text:'，继续说明'}, {text:'。第二句。'}]), '第一句，继续说明。第二句。');
});

test('realtime final packet retains last sentence and finishes without waiting for socket close', async () => {
  const source = fs.readFileSync(new URL('./wanchuang-engine.cjs', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function recognizeContinuousPcmWithIflytek('), source.indexOf('function recognizePcmWithIflytek('));
  let socket:any;
  class Socket {
    onopen:any; onmessage:any; onclose:any; onerror:any;
    constructor() { socket=this; queueMicrotask(() => {this.onopen();this.onmessage({data:JSON.stringify({msg_type:'action',data:{sessionId:'test-session'}})});}); }
    on() {}
    close() {}
    send(frame:any) {
      if (typeof frame !== 'string') return;
      assert.equal(JSON.parse(frame).sessionId, 'test-session');
      queueMicrotask(() => this.onmessage({data:JSON.stringify({msg_type:'result',res_type:'asr',data:{seg_id:0,ls:true,cn:{st:{bg:0,ed:500,type:'0',rt:[{ws:[{cw:[{w:'完整尾句。'}]}]}]}}}})}));
    }
  }
  const recognize = vm.runInNewContext(code+';recognizeContinuousPcmWithIflytek', {WebSocket:Socket,iflytekRealtimeWebSocketUrl:()=>'',Buffer,setTimeout,clearTimeout,Date,sleep:async()=>{},SPEECH_BYTES_PER_SECOND:32000});
  const result=await recognize(Readable.from([Buffer.alloc(1280)]),{},{});
  assert.equal(result[0].text,'完整尾句。'); assert.ok(socket);
});
