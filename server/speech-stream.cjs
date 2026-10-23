// The configured three-field credentials use the standard recognition service.
// Split at 45 seconds to stay below its per-session audio limit.
module.exports = async function recognizeStream(stream,credentials,options,recognize) {
  const bytesPerSecond=32000, chunkSize=45*bytesPerSecond;
  let pending=Buffer.alloc(0),processed=0;
  const segments=[];
  async function submit(pcm){
    if(options.isCancelled?.()){const error=new Error('语音识别已取消');error.name='AbortError';throw error;}
    const text=await recognize(pcm,credentials,{...options,onProgress:ratio=>options.onProgress?.(processed+Math.round(pcm.length*ratio))});
    if(text)segments.push({segId:segments.length,start:Math.round(processed/bytesPerSecond*1000),end:Math.round((processed+pcm.length)/bytesPerSecond*1000),text});
    processed+=pcm.length;options.onProgress?.(processed);options.onResult?.([...segments]);
  }
  for await(const chunk of stream){
    pending=Buffer.concat([pending,chunk]);
    while(pending.length>=chunkSize){const pcm=pending.subarray(0,chunkSize);pending=pending.subarray(chunkSize);await submit(pcm);}
  }
  if(pending.length)await submit(pending);
  return segments;
};
