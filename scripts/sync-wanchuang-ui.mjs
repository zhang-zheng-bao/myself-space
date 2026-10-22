import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const source=resolve(process.argv[2] || '../WanChuangCore/src');
const target=resolve('public/tools/wanchuang');
for(const file of ['styles.css','glass.css'])copyFileSync(resolve(source,file),resolve(target,file));
let html=readFileSync(resolve(source,'index.html'),'utf8');
html=html.replace('</head>','<link rel="stylesheet" href="web.css"></head>')
  .replaceAll('本地历史','最近生成')
  .replaceAll('下载历史','下载任务')
  .replace('<body data-view="download">','<body data-view="download"><div class="web-status"><a href="/?tab=toolbox">← 返回工具箱</a><span id="webStatus" role="status">正在连接应用服务…</span></div>')
  .replace('../node_modules/lucide/dist/umd/lucide.js','vendor/lucide.js')
  .replace('<script src="renderer.js"></script>','<script src="web-adapter.js"></script><script src="renderer.js"></script><script src="web-downloads.js"></script><script type="module" src="/analytics.js"></script>');
writeFileSync(resolve(target,'index.html'),html);
let js=readFileSync(resolve(source,'renderer.js'),'utf8');
js=js.replace('function setActiveView(view) {',"function setActiveView(view) {\n if(view==='settings'){document.getElementById('webStatus').textContent='服务凭证由网站管理员配置，请联系管理员检查应用配置。';return;}")
  .replace("function openHistoryPage(kind, returnView = 'settings')","function openHistoryPage(kind, returnView = 'voice')")
  .replace("controls.append(historyActionButton('reveal', '查看素材位置', 'folder-search', () => window.clipHarbor.revealHistoryFile(kind, item.id)));","controls.append(historyActionButton('download', '下载结果文件', 'download', () => window.webDownloads.downloadItem(kind,item)));")
  .replace("if (full) controls.append(historyActionButton('delete', '删除本地素材', 'trash-2', () => window.clipHarbor.deleteHistoryFiles(kind, item.id), true));",'')
  .replace('本地素材文件和进行中的任务已保留。','已清除当前浏览器的已结束记录。')
  .replace('查看本机保存的声音生成记录。','查看当前浏览器的生成历史。');
js=js.replace("initialize().then(() => setActiveView('download'));", `initialize().then(() => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  setActiveView(['download', 'speech', 'voice', 'voiceClone'].includes(view) ? view : 'download');
  const requestedMode = params.get('mode');
  if (['video', 'cover', 'both'].includes(requestedMode)) {
    document.querySelector('.segment[data-mode="' + requestedMode + '"]')?.click();
  }
});`);
writeFileSync(resolve(target,'renderer.js'),js.replace(/[ \t]+\r?$/gm,''));
console.log('Synced desktop UI with browser transport and downloads.');
