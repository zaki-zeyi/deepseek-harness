import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {command} from './ci-common.mjs';
import {verifyWindowsProfiles} from './verify-windows-profile.mjs';
import {files,hash} from './lib.mjs';
import {verifyInnoMigration} from './verify-inno-migration.mjs';

/**
 * Install the complete payload into a fresh Unicode path and exercise its bundled host.
 * @param artifact Complete installer executable.
 * @param options Installer engine, immutable payload source and whether to retain the test installation.
 * @returns Installed path and native installation, plugin and removal acceptance results.
 */
export async function verifyWindowsInstaller(artifact,{keep=false,engine='nsis',source}={}){
  if(!['nsis','inno'].includes(engine))throw Error('Unsupported installer engine');
  if(engine==='inno'&&!source)throw Error('Inno acceptance requires the prepared application source');
  const owned=fs.mkdtempSync(path.join(os.tmpdir(),'DSH 离线安装 验收 '));
  const installed=path.join(owned,'自定义 目录','DeepSeek Harness Suite');
  const resources=path.join(installed,'resources'),payload=path.join(resources,'app');
  const started=Date.now();
  const powershell=path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./windows-install.ps1',import.meta.url)),artifact,installed,'-Engine',engine];
  const options={env:{DSH_HOME:path.join(owned,'installer-home'),DSH_TELEMETRY_DISABLED:'1'},timeout:30*60*1000};
  await command(powershell,[...args,'-RequireFreshSuite'],options);
  const checks=[{name:'offline-installer-unicode-custom-path',status:'passed',engine,installationMs:Date.now()-started,nativeExitCode:0}];
  if(engine==='inno')checks.push(await verifyInnoMigration());
  const extra=path.join(installed,'suite-acceptance-user-note.txt');
  if(engine==='inno'){
    fs.writeFileSync(extra,'preserve user-added file');const restart=Date.now();
    await command(powershell,args,options);
    if(fs.readFileSync(extra,'utf8')!=='preserve user-added file')throw Error('Reinstallation changed a user-added file');
    checks.push({name:'offline-installer-reinstall',status:'passed',reinstallationMs:Date.now()-restart,nativeExitCode:0});
  }
  if(source){
    const entries=files(source);let next=0,bytes=0,longFiles=0;
    await Promise.all(Array.from({length:8},async()=>{while(next<entries.length){
      const file=entries[next++],relative=path.relative(source,file),actual=path.join(installed,relative);
      if(!fs.existsSync(actual)||await hash(actual)!==await hash(file))throw Error('Installed file differs from source: '+relative);
      bytes+=fs.statSync(file).size;if(actual.length>=260)longFiles++;
    }}));
    checks.push({name:'installer-archive-integrity',status:'passed',method:'all installed payload files match source SHA-256',files:entries.length,bytes,longFiles});
  }
  const inventory=JSON.parse(fs.readFileSync(path.join(resources,'suite-inventory.json')));
  const node=path.join(resources,'runtime/primary-runtime/dependencies/node/bin/node.exe');
  const deps=path.join(resources,'dependencies');
  const env={PATH:[path.dirname(node),path.join(deps,'bin'),process.env.WINDIR+'\\System32',process.env.WINDIR].join(';'),DSH_ORB_ELECTRON_PATH:path.join(deps,'orb-electron/electron.exe'),OUR_FREE_MODEL_BUN:path.join(deps,'node_modules/bun/bin/bun.exe')};
  checks.push(...(await verifyWindowsProfiles({resources,payload,node,plugins:inventory.plugins,env})).map(check=>({...check,name:'installed-'+check.name})));
  if(!keep){
    await command(path.join(installed,engine==='inno'?'unins000.exe':'Uninstall DeepSeek Harness Suite.exe'),engine==='inno'?['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART']:['/S'],{timeout:10*60*1000});
    const deadline=Date.now()+60000;
    while(fs.existsSync(path.join(installed,'DeepSeek Harness Suite.exe'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,250));
    if(fs.existsSync(path.join(installed,'DeepSeek Harness Suite.exe')))throw Error('Test uninstall did not finish: '+installed);
    if(source){const remaining=files(source).map(file=>path.relative(source,file)).filter(relative=>fs.existsSync(path.join(installed,relative)));if(remaining.length)throw Error('Uninstallation left payload files: '+remaining.slice(0,3).join(', '))}
    if(engine==='inno'&&fs.readFileSync(extra,'utf8')!=='preserve user-added file')throw Error('Uninstallation removed a user-added file');
    checks.push({name:'offline-installer-uninstall',status:'passed',nativeExitCode:0});
    if(path.dirname(path.resolve(owned))!==path.resolve(os.tmpdir())||!path.basename(owned).startsWith('DSH 离线安装 验收 '))throw Error('Unexpected test cleanup path');
    fs.rmSync(owned,{recursive:true,force:true,maxRetries:5,retryDelay:500});
  }
  return {installed,checks};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const sourceIndex=process.argv.indexOf('--source');
  const result=await verifyWindowsInstaller(path.resolve(process.argv[2]),{keep:process.argv.includes('--keep'),engine:process.argv.includes('--inno')?'inno':'nsis',source:sourceIndex>=0?path.resolve(process.argv[sourceIndex+1]):undefined});
  if(process.argv[3]&&!process.argv[3].startsWith('--'))fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
