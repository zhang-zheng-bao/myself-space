const {Readable} = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Shared across browser sessions: splitting files must not multiply account connections.
const connectionLimit = Math.max(1, Math.min(3, Number(process.env.WANCHUANG_SPEECH_CONCURRENCY) || 2));
let active = 0;
const waiters = [];
function cancelled() { return Object.assign(new Error('语音识别已取消'), {name: 'AbortError'}); }
function acquire(signal) {
  return new Promise((resolve, reject) => {
    const waiter = {start: () => {
      signal.removeEventListener('abort', abort);
      active++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true; active--;
        waiters.shift()?.start();
      });
    }};
    const abort = () => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(cancelled());
    };
    if (signal.aborted) return reject(cancelled());
    signal.addEventListener('abort', abort, {once:true});
    if (active < connectionLimit) waiter.start(); else waiters.push(waiter);
  });
}

// 16 kHz mono signed 16-bit PCM. Every sample is retained exactly once.
// Split at the middle of >=400 ms of low energy, after at least 20 seconds.
async function* silenceChunks(stream, {minSeconds = 20, silenceMs = 400, thresholdDb = -40, bufferSeconds = 300, directory} = {}) {
  const rate = 32000, frameBytes = 640;
  const threshold = 32768 * Math.pow(10, thresholdDb / 20);
  let carry = Buffer.alloc(0), frames = [], bytes = 0, silence = 0, offset = 0, file, fd;
  try {
  for await (const piece of stream) {
    const data = carry.length ? Buffer.concat([carry, piece]) : piece;
    let cursor = 0;
    for (; cursor + frameBytes <= data.length; cursor += frameBytes) {
      const frame = data.subarray(cursor, cursor + frameBytes);
      let energy = 0;
      for (let i = 0; i < frame.length; i += 2) energy += frame.readInt16LE(i) ** 2;
      silence = Math.sqrt(energy / (frameBytes / 2)) <= threshold ? silence + frameBytes : 0;
      if (fd !== undefined) fs.writeSync(fd, frame); else frames.push(frame);
      bytes += frameBytes;
      if (bytes - Math.floor(silence / 4) * 2 >= minSeconds * rate && silence >= silenceMs / 1000 * rate) {
        const cut = bytes - Math.floor(silence / 4) * 2;
        let tail;
        if (fd !== undefined) {
          tail = Buffer.alloc(bytes-cut); fs.readSync(fd, tail, 0, tail.length, cut);
          fs.closeSync(fd); fd = undefined;
          yield {file, length:cut, offset:offset / rate};
        } else {
          const pcm = Buffer.concat(frames, bytes);
          tail = pcm.subarray(cut);
          yield {pcm:pcm.subarray(0, cut), offset:offset / rate};
        }
        offset += cut;
        frames = [tail]; bytes = tail.length; silence = tail.length; file = undefined;
      }
      if (directory && fd === undefined && bytes >= bufferSeconds * rate) {
        file = path.join(directory, crypto.randomUUID()+'.pcm'); fd = fs.openSync(file,'w+',0o600);
        fs.writeSync(fd, Buffer.concat(frames, bytes)); frames = [];
      }
    }
    carry = Buffer.from(data.subarray(cursor));
  }
  if (carry.length % 2) throw new Error('音频数据不完整，请重新提取音频');
  if (carry.length) { if(fd !== undefined)fs.writeSync(fd,carry);else frames.push(carry); bytes += carry.length; }
  if (bytes) {
    if(fd !== undefined){fs.closeSync(fd);fd=undefined;yield {file,length:bytes,offset:offset/rate};}
    else yield {pcm:Buffer.concat(frames,bytes),offset:offset/rate};
  }
  } finally { if(fd !== undefined) fs.closeSync(fd); }
}

async function recognizeSilenceParallel(stream, credentials, recognize, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'wanchuang-speech-'));
  const controller = new AbortController(), tasks = new Set(), sockets = new Set();
  const results = new Map(), sent = new Map();
  let index = 0, completed = 0, firstError;
  const publishState = () => options.onChunkState?.({discovered:index, completed, concurrency:connectionLimit});
  const ordered = () => [...results.entries()].sort((a,b) => a[0]-b[0]).flatMap(([, rows]) => rows);
  const stop = () => {
    if (controller.signal.aborted) return;
    controller.abort(); stream.destroy();
    for (const task of sockets) task.cancel();
  };
  const unregister = options.registerTask?.({cancel:stop});
  try {
    for await (const chunk of silenceChunks(stream, {...options.split, directory})) {
      if (firstError) throw firstError;
      if (options.isCancelled?.() || controller.signal.aborted) throw cancelled();
      while (tasks.size >= connectionLimit) { await Promise.race(tasks); if (firstError) throw firstError; }
      const part = index++;
      publishState();
      const task = (async () => {
        const release = await acquire(controller.signal);
        let input, inputDone;
        try {
          if (controller.signal.aborted || options.isCancelled?.()) throw cancelled();
          const publish = rows => {
            results.set(part, rows.map(row => ({...row, start:row.start + chunk.offset, end:row.end + chunk.offset})));
            options.onResult?.(ordered());
          };
          input = chunk.file ? fs.createReadStream(chunk.file,{end:chunk.length-1}) : Readable.from([chunk.pcm]);
          inputDone = require('node:stream/promises').finished(input).catch(()=>{});
          const rows = await recognize(input, credentials, {
            isCancelled:() => controller.signal.aborted || options.isCancelled?.(),
            registerTask:task => { sockets.add(task); return () => sockets.delete(task); },
            onProgress:bytes => { sent.set(part, bytes); options.onProgress?.([...sent.values()].reduce((a,b)=>a+b,0)); },
            onResult:publish,
          });
          publish(rows);
          completed++; publishState();
        } finally { input?.destroy(); await inputDone; release(); if(chunk.file)fs.rmSync(chunk.file,{force:true}); }
      })().catch(error => { firstError ||= error; stop(); }).finally(() => tasks.delete(task));
      tasks.add(task);
    }
    await Promise.all(tasks);
    if (firstError) throw firstError;
    if (controller.signal.aborted || options.isCancelled?.()) throw cancelled();
    return ordered();
  } catch (error) {
    stop(); await Promise.allSettled(tasks); throw firstError || error;
  } finally { unregister?.(); fs.rmSync(directory,{recursive:true,force:true}); }
}

module.exports = {silenceChunks, recognizeSilenceParallel};
