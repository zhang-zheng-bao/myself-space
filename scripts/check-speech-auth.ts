import 'dotenv/config';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import {readToolSettings} from '../server/tool-settings';
const c=readToolSettings();
const appId=c.iflytekAppId.trim(),apiKey=c.secrets.iflytekApiKey?.trim(),secret=c.secrets.iflytekApiSecret?.trim();
console.log('Credential structure',JSON.stringify({appIdLength:appId.length,appIdHex:/^[a-f0-9]{8}$/i.test(appId),keyLength:apiKey?.length,secretLength:secret?.length}));
if(!appId||!apiKey||!secret)throw new Error('Missing credentials');
const ts=String(Math.floor(Date.now()/1000));
const digest=crypto.createHash('md5').update(appId+ts).digest('hex');
const signa=crypto.createHmac('sha1',apiKey).update(digest).digest('base64');
const date=new Date().toUTCString();
const signature=crypto.createHmac('sha256',secret).update(`host: iat-api.xfyun.cn\ndate: ${date}\nGET /v2/iat HTTP/1.1`).digest('base64');
const auth=Buffer.from(`api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`).toString('base64');
for(const [name,url] of [['realtime','wss://rtasr.xfyun.cn/v1/ws?'+new URLSearchParams({appid:appId,ts,signa,lang:'cn'})],['iat','wss://iat-api.xfyun.cn/v2/iat?'+new URLSearchParams({authorization:auth,date,host:'iat-api.xfyun.cn'})]]){
 await new Promise<void>(resolve=>{
  const ws=new WebSocket(url);const timer=setTimeout(()=>{console.log(name,'timeout');ws.terminate();resolve();},15000);
  const finish=()=>{clearTimeout(timer);ws.close();resolve();};
  ws.on('open',()=>{if(name==='iat')ws.send(JSON.stringify({common:{app_id:appId},business:{language:'zh_cn',domain:'iat',accent:'mandarin'},data:{status:2,format:'audio/L16;rate=16000',encoding:'raw',audio:Buffer.alloc(3200).toString('base64')}}));});
  ws.on('message',data=>{const p=JSON.parse(String(data));console.log(name,JSON.stringify({action:p.action,code:p.code,desc:p.desc,message:p.message}));finish();});
  ws.on('unexpected-response',(_req,res)=>{console.log(name,'HTTP',res.statusCode);res.resume();finish();});
  ws.on('error',()=>{console.log(name,'connection error');finish();});
 });
}
