import {createRequire} from 'node:module';
import {fileURLToPath as moduleFilePath} from 'node:url';
import {dirname as moduleDirname} from 'node:path';
const require=createRequire(import.meta.url);
const __dirname=moduleDirname(moduleFilePath(import.meta.url));
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
export default async function verifyHost({node,payload,profile,resources,env,plugins,logFile}) {
  const runtime=path.join(payload,'dsh');
  const entry=path.join(runtime,'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js');
  const primary=path.join(resources,'runtime/primary-runtime');
  const output=fs.createWriteStream(logFile);
  const version=JSON.parse(fs.readFileSync(path.join(payload,'package.json'))).version;
  const child=spawn(node,[entry,runtime,profile,primary,path.join(primary,'dependencies/pnpm/bin/pnpm.mjs'),path.join(resources,'dependencies/bin')],{env:{...process.env,...env,DSH_CLIENT_VERSION:version},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  let text='';const record=b=>{const redacted=String(b).replace(/([?&]token=)[^\s&]+/g,'$1[redacted]');text+=redacted;output.write(redacted)};child.stdout.on('data',record);child.stderr.on('data',record);
  try {
    const ready=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('DSH 宿主启动超时；检查 host-smoke.log')),180000);
      child.on('error',e=>{clearTimeout(timer);reject(e)});
      child.on('exit',code=>{clearTimeout(timer);reject(Error(`DSH 宿主提前退出 ${code}: ${text.slice(-1800)}`))});
      child.on('message',m=>{if(m?.type==='fatal'){clearTimeout(timer);reject(Error(m.message))}if(m?.type==='ready'){clearTimeout(timer);resolve(m)}});
    });
    // Exchange the private startup URL for an HTTP cookie. Never write its token to reports.
    let url=ready.url, cookie='';
    for(let i=0;i<6;i++) {
      const r=await fetch(url,{redirect:'manual',headers:cookie?{cookie}:{},signal:AbortSignal.timeout(10000)});
      const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies.map(c=>c.split(';')[0]).join('; ');
      const next=r.headers.get('location');if(!next){if(!r.ok)throw Error(`DSH 页面不可用：HTTP ${r.status}`);break;}url=new URL(next,url).href;
    }
    const origin=new URL(url).origin;
    const checks=[{name:'actual-desktop-host-ready',status:'passed'}];
    if(plugins.some(p=>p.name==='dsh-industry-research')) {
      const deadline=Date.now()+45000;
      let status;
      do {
        const r=await fetch(origin+'/industry-research/status',{headers:{cookie,origin},signal:AbortSignal.timeout(10000)});
        if(!r.ok)throw Error(`行研插件服务未注册：HTTP ${r.status}`);
        status=await r.json();
        if(status.state==='error')throw Error('行研插件启动失败：'+status.message);
        if(status.state==='ready')break;
        await new Promise(resolve=>setTimeout(resolve,250));
      } while(Date.now()<deadline);
      if(status?.state!=='ready')throw Error('行研插件服务启动超时');
      checks.push({name:'industry-research-registered-and-ready',status:'passed'});
    }
    if(plugins.some(p=>p.name==='dsh-orb')) {
      await new Promise(resolve=>setTimeout(resolve,5000));
      const r=await fetch(origin+'/.dsh-orb/settings',{headers:{cookie,origin},signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw Error(`Orb 设置服务未注册或不可用：HTTP ${r.status}`);
      const data=await r.json();if(!data||typeof data!=='object')throw Error('Orb 设置返回无效');
      if(data.helperError)throw Error('Orb helper 启动错误：'+data.helperError);
      checks.push({name:'orb-registered-settings-route',status:'passed'});
    }
    for(const plugin of plugins.filter(p=>p.name==='dsh-codex-subscription')) {
      if(!JSON.stringify(ready.injections).includes(plugin.name))throw Error(`缺少 ${plugin.name} 的客户端注入`);
      checks.push({name:plugin.name+'-client-registered',status:'passed'});
    }
    return checks;
  } finally {
    if(child.connected)child.send({type:'shutdown'});
    await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>{child.kill();resolve()},10000);child.once('exit',()=>{clearTimeout(timer);resolve()})});
    output.end();
  }
};
