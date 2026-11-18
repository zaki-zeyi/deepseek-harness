import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {command} from './ci-common.mjs';
import {verifyWindowsProfiles} from './verify-windows-profile.mjs';

/** Install the real NSIS payload into a fresh Unicode path and exercise its bundled host. */
export async function verifyWindowsInstaller(artifact,{keep=false}={}){
  const owned=fs.mkdtempSync(path.join(os.tmpdir(),'DSH 离线安装 验收 '));
  const installed=path.join(owned,'自定义 目录','DeepSeek Harness Suite');
  const resources=path.join(installed,'resources'),payload=path.join(resources,'app');
  const started=Date.now();
  await command(path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./windows-install.ps1',import.meta.url)),artifact,installed],{timeout:15*60*1000});
  const checks=[{name:'offline-installer-unicode-custom-path',status:'passed',installationMs:Date.now()-started}];
  const inventory=JSON.parse(fs.readFileSync(path.join(resources,'suite-inventory.json')));
  const node=path.join(resources,'runtime/primary-runtime/dependencies/node/bin/node.exe');
  const deps=path.join(resources,'dependencies');
  const env={PATH:[path.dirname(node),path.join(deps,'bin'),process.env.WINDIR+'\\System32',process.env.WINDIR].join(';'),DSH_ORB_ELECTRON_PATH:path.join(deps,'orb-electron/electron.exe'),OUR_FREE_MODEL_BUN:path.join(deps,'node_modules/bun/bin/bun.exe')};
  checks.push(...(await verifyWindowsProfiles({resources,payload,node,plugins:inventory.plugins,env})).map(check=>({...check,name:'installed-'+check.name})));
  if(!keep){
    await command(path.join(installed,'Uninstall DeepSeek Harness Suite.exe'),['/S'],{timeout:120000});
    const deadline=Date.now()+60000;
    while(fs.existsSync(path.join(installed,'DeepSeek Harness Suite.exe'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,250));
    if(fs.existsSync(path.join(installed,'DeepSeek Harness Suite.exe')))throw Error('Test uninstall did not finish: '+installed);
    fs.rmSync(owned,{recursive:true,force:true,maxRetries:5,retryDelay:500});
  }
  return {installed,checks};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const result=await verifyWindowsInstaller(path.resolve(process.argv[2]),{keep:process.argv.includes('--keep')});
  if(process.argv[3]&&!process.argv[3].startsWith('--'))fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
