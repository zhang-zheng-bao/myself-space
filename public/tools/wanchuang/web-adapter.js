(() => {
  const base='/api/tools/wanchuang';
  const listeners={jobs:new Set(),voice:new Set(),cookies:new Set()};
  let timer, polling=false, current;
  let noticeTimer;
  const status=(message,error=false)=>{
    document.getElementById('webStatus').textContent=message;
    if(error){
      fetch(base+'/client-errors',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({view:document.body.dataset.view,code:message.includes('MiniMax 尚未配置')?'minimax-unconfigured':message.includes('20MB')?'audio-too-large':'operation-failed'})}).catch(()=>{});
      let notice=document.getElementById('webErrorNotice');
      if(!notice){notice=document.createElement('div');notice.id='webErrorNotice';notice.className='web-notice';notice.setAttribute('role','alert');document.body.append(notice);}
      notice.textContent=message;notice.hidden=false;
      clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;},15000);
      const inline=document.getElementById(document.body.dataset.view==='voiceClone'?'voiceCloneStatus':'voiceGenerateStatus');
      if(inline){inline.className='parse-status bad';inline.textContent=message;}
    }
  };
  window.addEventListener('wanchuang-error',e=>status(e.detail,true));
  async function request(url,options={}) {
    const response=await fetch(base+url,{credentials:'same-origin',...options});
    const data=await response.json().catch(()=>({error:'应用接口返回异常，请检查服务器部署'}));
    if(!response.ok || data.error)throw new Error(data.error || '应用请求失败');
    return data;
  }
  function apply(next, notify=true) {
    current=next;
    if(notify){
      for(const fn of listeners.jobs)fn(next.jobs||[]);
      for(const fn of listeners.voice)fn(next.voiceHistory||[]);
      for(const fn of listeners.cookies)fn(next.settings.cookieProfiles||[]);
      window.dispatchEvent(new CustomEvent('wanchuang-config',{detail:next.settings.minimax}));
    }
    const missing=Object.entries(next.tools).filter(([,v])=>!v).map(([k])=>({ytDlp:'视频下载组件',ffmpeg:'音频处理组件',browser:'浏览器组件'}[k]));
    status(missing.length?`服务已连接 · 服务器缺少${missing.join('、')}`:'服务已连接 · 结果可下载，历史按浏览器独立保存');
    return next;
  }
  async function poll() {
    if(polling || document.hidden)return;
    polling=true;
    try{apply(await request('/state'));}catch(error){status(error.message);}finally{polling=false;}
  }
  async function action(method,payload) {
    try {const result=await request('/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,payload})});await poll();return result;}
    catch(error){status(error.message,true);throw error;}
  }
  const api={
    async getState(){const next=apply(await request('/state'),false);if(!timer)timer=setInterval(poll,3000);return next;},
    onJobsChanged:fn=>listeners.jobs.add(fn),onVoiceHistoryChanged:fn=>listeners.voice.add(fn),onCookieStatus:fn=>listeners.cookies.add(fn),
    async chooseAudio(){
      return new Promise(resolve=>{
        const input=document.createElement('input');input.type='file';input.accept='.mp3,.wav,.m4a,.aac,.ogg';
        input.oncancel=()=>resolve(null);
        input.onchange=async()=>{
          const file=input.files?.[0];if(!file){resolve(null);return;}
          if(file.size>20*1024*1024){status('参考音频不能超过 20MB',true);resolve(null);return;}
          const data=new FormData();data.append('audio',file);status('正在上传参考音频…');
          try{resolve((await request('/audio',{method:'POST',body:data})).refPath);}catch(error){status(error.message,true);resolve(null);}
        };input.click();
      });
    },
    async openPath(){status('请使用结果旁的下载按钮保存到电脑。');},
  };
  for(const method of ['parseMedia','addJobs','cancelJob','retryJob','clearFinished','refreshMinimaxModels','saveMinimaxFavorites','generateVoice','cloneVoice','readVoiceHistoryAudio'])api[method]=payload=>action(method,payload);
  const managed=async()=>{throw new Error('请在网站管理后台配置此项');};
  for(const method of ['chooseFolder','saveSettings','importCookies','inspectCookies','validateCookies','authorizeCookies','clearCookies','saveSpeechConfig','validateSpeechConfig','clearSpeechConfig','saveMinimaxConfig','clearMinimaxConfig','deleteHistoryFiles','revealHistoryFile','setMinimaxVoiceHidden','removeHistoryRecord','clearHistory'])api[method]=managed;
  window.clipHarbor=Object.freeze(api);
  window.addEventListener('unhandledrejection',event=>{status(event.reason?.message||'操作失败',true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
})();
