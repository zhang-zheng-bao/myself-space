import wallpaperImage from './assets/coastal-twilight.jpg?inline';

export type HomeDevice = 'laptop' | 'tablet' | 'phone';
export type HomeApp = { id: string; label: string; x: number; y: number; size: number };
export const homeSize = { laptop: [1024, 640], tablet: [1024, 720], phone: [400, 860] } as const;
export const homeApps: Record<HomeDevice, HomeApp[]> = {
  laptop: ['about:关于我','experience:经历','plan:规划','works:作品','resume:简历'].map((v,i) => ({id:v.split(':')[0],label:v.split(':')[1],x:344+i*70,y:552,size:52})),
  tablet: ['photos:相册','videos:视频','works:作品','posts:图文','slides:演示'].map((v,i) => ({id:v.split(':')[0],label:v.split(':')[1],x:112+i*170,y:300,size:76})),
  phone: [{id:'wechat',label:'微信',x:84,y:728,size:64},{id:'music',label:'音乐',x:252,y:728,size:64}],
};
const uri = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
// Embed the bitmap so SVG images also render it in Three.js canvas textures.
function wallpaper(device: HomeDevice) {
 const [w,h] = homeSize[device];
 return `<image href="${wallpaperImage}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
}
const iconColors: Record<string,string[]> = {about:['#89d9ff','#1567eb'],experience:['#ffbc71','#ed693a'],plan:['#8ae2d4','#199e8e'],works:['#a69aff','#5842bc'],resume:['#90bfff','#477cd8'],photos:['#fff','#e9ecf3'],videos:['#fe85a6','#e63464'],posts:['#83e0ae','#22a767'],slides:['#81c9ff','#4274d6'],wechat:['#64ec80','#08b94f'],music:['#ff718e','#ee2655']};
function iconBody(id:string) {
 if(id==='photos') return Array.from({length:8},(_,i)=>`<ellipse cx="50" cy="31" rx="12" ry="22" fill="hsl(${i*45},90%,60%)" fill-opacity=".8" transform="rotate(${i*45} 50 50)"/>`).join('');
 if(id==='wechat') return '<path d="M20 26C8 38 15 58 31 61L27 70 41 63C67 66 79 45 65 30 54 19 33 18 20 26Z" fill="white"/><path d="M49 45C36 59 48 78 65 77L77 84 74 74C92 62 83 44 67 42Z" fill="#dcffe5"/><g fill="#18ae55"><circle cx="32" cy="39" r="3"/><circle cx="51" cy="39" r="3"/><circle cx="59" cy="57" r="2.5"/><circle cx="73" cy="57" r="2.5"/></g>';
 if(id==='music') return '<path d="M40 28 76 20V65C76 81 51 84 51 70 51 62 61 59 67 61V39L48 44V73C48 88 23 90 23 77 23 69 34 66 40 68Z" fill="white"/>';
 if(id==='videos') return '<rect x="16" y="25" width="68" height="50" rx="13" fill="#fff"/><path d="m43 37 21 13-21 13Z" fill="#ec426b"/>';
 if(id==='about') return '<path d="M10 10H50V90H10Z" fill="#fff" opacity=".32"/><path d="M53 18 45 57H59V82" fill="none" stroke="#123b77" stroke-width="3"/><path d="M25 64Q50 80 77 61" fill="none" stroke="#123b77" stroke-width="4" stroke-linecap="round"/><g fill="#123b77"><ellipse cx="29" cy="37" rx="3" ry="5"/><ellipse cx="71" cy="37" rx="3" ry="5"/></g>';
 if(id==='works') return '<rect x="17" y="22" width="66" height="56" rx="8" fill="#fff"/><circle cx="62" cy="39" r="8" fill="#ffc466"/><path d="m20 70 19-24 14 14 10-9 17 19Z" fill="#8f80dc"/>';
 if(id==='experience') return '<rect x="19" y="32" width="62" height="45" rx="8" fill="#fff0d9"/><path d="M37 32V23H63V32M20 49Q50 63 80 49" fill="none" stroke="#b95c2e" stroke-width="5"/><rect x="45" y="49" width="10" height="13" rx="3" fill="#e19b50"/>';
 if(id==='plan') return '<circle cx="50" cy="50" r="32" fill="#effffb"/><path d="m61 28-4 29-19 15 4-29Z" fill="#ef755d"/><path d="m42 43 15 14-19 15Z" fill="#277b89"/>';
 return '<rect x="25" y="16" width="50" height="68" rx="7" fill="#fff"/><path d="M36 34H64M36 45H64M36 56H64M36 67H54" stroke="#80a0c4" stroke-width="4" stroke-linecap="round"/>';
}
function iconMarkup(id:string,x:number,y:number,size:number) {
 const c=iconColors[id]||iconColors.works;
 return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100"><defs><linearGradient id="i-${id}" x2=".3" y2="1"><stop stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="23" fill="url(#i-${id})" stroke="#ffffff" stroke-opacity=".35"/>${iconBody(id)}</svg>`;
}
export const appIconUrl = (id:string) => uri(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${iconMarkup(id,0,0,100)}</svg>`);
export function homeScreenUrl(device:HomeDevice, time=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})) {
 const [w,h]=homeSize[device];
 const text=(x:number,y:number,value:string,size=16,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${value}</text>`;
 let ui='';
 if(device==='laptop') {
  ui='<rect width="1024" height="28" fill="#182335" fill-opacity=".38"/>'+text(22,20,'　 访达　 文件　 编辑　 显示　 前往　 窗口　 帮助',13)+text(1004,20,'⌕　 ▰　 ◉　 Wi-Fi　 '+time,12,'text-anchor="end"')+'<rect x="324" y="540" width="376" height="76" rx="19" fill="#fff" fill-opacity=".23" stroke="#fff" stroke-opacity=".3"/>';
  homeApps.laptop.forEach((a,i)=>{ui+=iconMarkup(a.id,920,58+i*88,46)+text(943,120+i*88,a.label,14,'text-anchor="middle"');});
 } else {
  ui=text(26,32,time,15)+text(w-26,32,device==='phone'?'5G · 86%':'Wi-Fi · 86%',14,'text-anchor="end"');
  ui+=text(device==='phone'?200:76,device==='phone'?190:170,time,device==='phone'?80:86,device==='phone'?'text-anchor="middle" font-weight="200"':'font-weight="200"');
  if(device==='phone') ui+='<rect x="159" y="9" width="82" height="22" rx="12" fill="#080910"/><rect x="24" y="256" width="352" height="94" rx="24" fill="#fff" fill-opacity=".8"/>'+iconMarkup('wechat',40,277,44)+text(98,292,'微信',17,'fill="#1d2632" font-weight="600"')+text(98,321,'聊天与视频通话',16,'fill="#515865"')+'<rect x="28" y="710" width="344" height="119" rx="32" fill="#fff" fill-opacity=".18"/>';
  else ui+=text(80,212,'点开一个应用看看',21,'opacity=".8"');
  ui+='<rect x="'+(w/2-65)+'" y="'+(h-18)+'" width="130" height="5" rx="3" fill="#fff" fill-opacity=".8"/>';
 }
 homeApps[device].forEach(a=>{ui+=iconMarkup(a.id,a.x,a.y,a.size)+(device==='laptop'?`<circle cx="${a.x+a.size/2}" cy="609" r="2" fill="#eef2fa"/>`:device==='phone'?'':text(a.x+a.size/2,a.y+a.size+21,a.label,16,'text-anchor="middle"'));});
 return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${wallpaper(device)}</svg><g fill="white" font-family="Segoe UI,Microsoft YaHei,sans-serif">${ui}</g></svg>`);
}
