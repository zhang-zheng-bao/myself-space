(() => {
  const report=error=>document.getElementById('webStatus').textContent=error.message||String(error);
  function download(url,name) {
    const parsed=new URL(url,location.href);
    if(parsed.origin!==location.origin && parsed.protocol!=='blob:')throw new Error('无效的结果地址');
    const a=document.createElement('a');a.href=url;a.download=name||'生成音频.mp3';a.click();
  }
  function downloadItem(kind,item) {
    const files=item.files||[];
    if(!files.length){report(new Error('文件已过期或尚未生成，请重试任务。'));return;}
    if(files.length===1){download(files[0].url,files[0].name);return;}
    const dialog=document.createElement('dialog');dialog.className='web-file-list';
    const title=document.createElement('h3');title.textContent='下载结果文件';dialog.append(title);
    for(const file of files){const a=document.createElement('a');a.href=file.url;a.download=file.name;a.textContent=file.name;dialog.append(a);}
    const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();dialog.append(close);
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  window.webDownloads={downloadItem,report};
  const add=(parent,text,handler)=>{if(!parent)return;const b=document.createElement('button');b.type='button';b.className='secondary-button';b.textContent=text;b.onclick=()=>Promise.resolve().then(handler).catch(report);parent.append(b);};
  const open=document.getElementById('openVoiceOutput');
  if(open){open.hidden=true;add(open.parentElement,'下载音频',()=>{const src=document.getElementById('voiceAudio').getAttribute('src');if(!src)throw new Error('请先生成音频');download(src);});}
  add(document.querySelector('.side-nav'),'历史记录',()=>openHistoryPage('download','download'));
  const panel=document.querySelector('[data-settings-panel="voices"]');
  if(panel){const d=document.createElement('dialog');d.className='web-file-list';add(d,'关闭音色管理',()=>d.close());panel.hidden=false;d.append(panel);document.body.append(d);add(document.querySelector('.side-nav'),'音色管理',()=>{renderVoiceManagement();d.showModal();});}
})();
