import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {command,assertRunner} from './ci-common.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arch=process.argv[2];
assertRunner(`darwin-${arch}`);
const version=JSON.parse(fs.readFileSync(path.join(root,'automation/runtime-rules.json'))).version;
const out=path.join(root,`dist/automated/macos-${version}`);
const archive=path.join(out,`DeepSeek-Harness-Suite-${version}-mac-${arch}.zip`);
const unpacked=path.join(root,'build/mac-native-smoke');
if(fs.existsSync(unpacked))throw Error('Smoke directory must be fresh');
fs.mkdirSync(unpacked,{recursive:true});
await command('/usr/bin/ditto',['-x','-k',archive,unpacked]);
const app=path.join(unpacked,'DeepSeek Harness Suite.app'),resources=path.join(app,'Contents/Resources');
await command('/bin/bash',[path.join(unpacked,'修复签名.command'),app],{cwd:unpacked});
const bin=path.join(resources,'dependencies/bin'),node=path.join(resources,'runtime/primary-runtime/dependencies/node/bin/node');
const env={PATH:bin+path.delimiter+'/usr/bin:/bin:/usr/sbin:/sbin',DSH_HOME:path.join(unpacked,'home'),DSH_TELEMETRY_DISABLED:'1'};
const checks=[];
for(const name of ['codex','bun','lark-cli','mihomo']){
  const output=await command(path.join(bin,name),[name==='mihomo'?'-v':'--version'],{env,capture:true,timeout:60000});
  checks.push({name:`native-${name}-launch`,status:'passed',output:output.trim()});
}
await command(path.join(resources,'dependencies/orb-electron/Electron.app/Contents/MacOS/Electron'),['-p','process.versions.electron'],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},timeout:60000});
const profile=path.join(root,`build/macos-${version}`,arch,'seed');
const native=path.join(unpacked,'native.cjs');
fs.writeFileSync(native,`const {createRequire}=require('node:module');const r=createRequire(${JSON.stringify(path.join(profile,'node_modules/dsh-industry-research/package.json'))});const im=createRequire(${JSON.stringify(path.join(profile,'node_modules/@xmanrui/dsh-im/package.json'))});(async()=>{await im('sharp')({create:{width:1,height:1,channels:4,background:'#ffffff'}}).png().toBuffer();const p=r('node-pty').spawn(${JSON.stringify(node)},['-e','console.log("SUITE_PTY_OK")'],{env:process.env});let output='';p.onData(s=>output+=s);p.onExit(({exitCode})=>process.exit(!exitCode&&output.includes('SUITE_PTY_OK')?0:1));setTimeout(()=>{p.kill();process.exit(1)},30000).unref()})().catch(error=>{console.error(error);process.exit(1)});`);
await command(node,[native],{env,timeout:60000});
checks.push({name:'native-sharp-image-and-pty-child',status:'passed'});
const reportFile=path.join(out,`report-darwin-${arch}.json`),report=JSON.parse(fs.readFileSync(reportFile));
report.macNativeChecks=checks;report.macRuntimeTested=true;report.macApplicationUITested=false;
report.status='packaged-native-verified';
report.signing='Package includes local ad-hoc signing scripts; no Apple notarization credentials were used';
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log(`macOS ${arch}: native runtime checks passed`);
