import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

/** Add missing suite plugins; relocate only links recorded as owned by this installer. */
export function suiteInstallPlan(manifest,previous,plugins,seed){
  return plugins.filter(({name})=>{
    const current=manifest.dependencies?.[name];
    const desired='link:'+path.join(seed,'node_modules',name).replaceAll('\\','/');
    return current===undefined||(current===previous.links?.[name]&&current!==desired);
  }).map(({name})=>({name,spec:'link:'+path.join(seed,'node_modules',name).replaceAll('\\','/')}));
}

function inputs(resources,home){
  const profile=path.join(home,'profiles/desktop'),seed=path.join(resources,'seed-profile');
  const inventory=JSON.parse(fs.readFileSync(path.join(resources,'suite-inventory.json'),'utf8'));
  const manifestFile=path.join(profile,'package.json'),receiptFile=path.join(profile,'.dsh-suite-links.json');
  const manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{};
  const previous=fs.existsSync(receiptFile)?JSON.parse(fs.readFileSync(receiptFile,'utf8')):{links:{}};
  return {profile,seed,manifestFile,receiptFile,manifest,previous,plugins:inventory.plugins};
}

/** Register prepared local packages through the official manager without fetching dependencies. */
export async function initializeSuite(resources,home,onProgress=()=>{}){
  const initial=inputs(resources,home),runtime=path.join(resources,'app/dsh');
  const carrier=createRequire(path.join(runtime,'package.json'));
  const boot=await import(pathToFileURL(carrier.resolve('@deepseek-ai/dsh-app-boot')).href);
  const {withFileLock,writeFileAtomic}=await import(pathToFileURL(carrier.resolve('@deepseek-ai/dsh-atomic-write')).href);
  const {runProfilePnpm}=await import(pathToFileURL(carrier.resolve('@deepseek-ai/dsh-plugin-manager/operations')).href);
  fs.mkdirSync(initial.profile,{recursive:true});
  await withFileLock(initial.manifestFile,async()=>{
    boot.initProfile(initial.profile,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']);
    const state=inputs(resources,home),plan=suiteInstallPlan(state.manifest,state.previous,state.plugins,state.seed);
    if(!plan.length)return;
    for(const {name} of plan)if(!fs.existsSync(path.join(state.seed,'node_modules',name,'package.json')))throw Error('安装文件缺少插件 '+name+'，请重新安装应用');
    onProgress('正在注册 '+plan.length+' 个插件，保留已有账号和配置…');
    const node=path.join(resources,'runtime/primary-runtime/dependencies/node/bin/node.exe');
    const pnpm=path.join(resources,'runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs');
    const result=await runProfilePnpm({profile:'desktop',dir:state.profile,installAnchor:path.join(runtime,'package.json'),cwd:state.seed},
      ['add',...plan.map(p=>p.spec),'--offline','--ignore-scripts','--config.auto-install-peers=false'],
      {execution:'service',command:node,args:[pnpm],outputBytes:8192,lockWaitMs:120000,idleTimeoutMs:120000,
        env:{PATH:path.dirname(node)+path.delimiter+process.env.PATH,CI:'true',DSH_HOME:home}});
    if(result.exitCode!==0)throw Error('插件初始化未完成。请保留配置并重试启动；诊断文件：'+result.logPath+'\n'+result.output);
    const after=JSON.parse(fs.readFileSync(state.manifestFile,'utf8'));
    for(const {name} of plan)if(!after.dsh?.profile?.bundles?.includes(name)&&!Object.hasOwn(state.manifest.dependencies||{},name))throw Error('插件未成功注册：'+name);
    const links={...state.previous.links,...Object.fromEntries(plan.map(p=>[p.name,p.spec]))};
    await writeFileAtomic(state.receiptFile,JSON.stringify({schemaVersion:1,links},null,2)+'\n',{mode:0o600});
    onProgress('插件准备完成，正在启动应用…');
  },{waitMs:120000});
}

async function launchSetup(resources,home){
  const state=inputs(resources,home);
  if(!suiteInstallPlan(state.manifest,state.previous,state.plugins,state.seed).length)return;
  const {app,BrowserWindow,dialog}=await import('electron');
  await app.whenReady();
  let finished=false;
  const window=new BrowserWindow({width:520,height:210,resizable:false,autoHideMenuBar:true,title:'DeepSeek Harness 插件准备',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.on('close',event=>{if(!finished)event.preventDefault()});
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>插件准备</title><style>body{font:15px "Microsoft YaHei UI",sans-serif;margin:24px;color:#222;background:#fafafa}h1{font-size:20px;font-weight:500}progress{width:100%}p{line-height:1.6}</style><h1>正在准备插件</h1><p id="status">首次启动或新增插件时需要配置本地依赖，请稍候…</p><progress></progress>'));
  let succeeded=false;
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn(path.join(resources,'runtime/primary-runtime/dependencies/node/bin/node.exe'),[fileURLToPath(import.meta.url),'--initialize-suite',resources,home],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
      let output='';
      const collect=chunk=>{output=(output+chunk).slice(-8192)};child.stdout.on('data',collect);child.stderr.on('data',collect);
      child.on('message',message=>{if(typeof message?.text==='string'&&!window.isDestroyed())void window.webContents.executeJavaScript('document.getElementById("status").textContent='+JSON.stringify(message.text)).catch(collect)});
      child.once('error',reject);
      child.once('close',code=>code===0?resolve():reject(Error(output||'插件准备进程退出：'+code)));
    });
    succeeded=true;
    return ()=>{finished=true;if(!window.isDestroyed())window.close()};
  } catch(error){dialog.showErrorBox('插件准备未完成',String(error.message)+'\n请重试启动应用；已有账号和配置仍保留。');app.exit(1);throw error}
  finally{if(!succeeded){finished=true;if(!window.isDestroyed())window.close()}}
}

/** Called from the desktop's ready handler, never from entry-module evaluation. */
export async function prepareSuite(){
  return await launchSetup(process.resourcesPath,process.env.DSH_HOME?.trim()||path.join(os.homedir(),'.dsh'));
}

if(process.argv[2]==='--initialize-suite'){
  await initializeSuite(process.argv[3],process.argv[4],text=>process.send?.({text}));
  process.disconnect?.();
}
