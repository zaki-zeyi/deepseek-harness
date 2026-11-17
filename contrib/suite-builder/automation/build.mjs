import {createRequire} from 'node:module';
import {fileURLToPath as moduleFilePath} from 'node:url';
import {dirname as moduleDirname} from 'node:path';
const require=createRequire(import.meta.url);
const __dirname=moduleDirname(moduleFilePath(import.meta.url));
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
import { parseList, hash, inside, files } from './lib.mjs';
const root = path.resolve(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname,'runtime-rules.json')));
const npm = path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const asar = require(path.join(root,'tools/node_modules/@electron/asar'));
const semver = require(path.join(root,'tools/node_modules/semver'));
const seven = require(path.join(root,'node_modules/7zip-bin')).path7za;
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i+1]; };
const list = path.resolve(root,arg('--list') || 'plugins.md');
import {inputPath} from './inputs.mjs';
const baseApp = inputPath('windowsApplication','app-win');
const seedInput = inputPath('seedProfile','seed-win');
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const resume = arg('--resume');
const runRoot = resume ? path.resolve(resume) : path.join(root,'build/automated',stamp);
if(!inside(path.join(root,'build/automated'),runRoot))throw Error('恢复路径必须位于 build/automated 内');
const previous = resume ? JSON.parse(fs.readFileSync(path.join(runRoot,'report.json'))) : null;
function alive(pid) {if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true}catch(e){if(e.code==='ESRCH')return false;throw e}}
if(previous?.status==='building') {
  const oldLock=path.join(root,'build/automated/.build-lock');
  const owner=fs.existsSync(oldLock)?Number(fs.readFileSync(oldLock,'utf8')):0;
  if(!alive(owner))previous.status='failed';
}
if(previous && (previous.status!=='failed'||!fs.existsSync(path.join(runRoot,'manage.mjs'))))throw Error('只能恢复已完成模板复制的失败构建');
const home = path.join(runRoot,'home');
const profile = path.join(home,'profiles/desktop');
const app = path.join(runRoot,'app');
const resources = path.join(app,'resources');
const payload = path.join(resources,'app');
const deps = path.join(resources,'dependencies');
const out = path.join(root,'dist/automated',stamp);
const report = {status:'building', started:new Date().toISOString(), target:rules.target, stagingRoot:runRoot, list, plugins:[], checks:[], disabledFeatures:rules.disabledFeatures, accountSetup:['ChatGPT / 飞书 / IM 账号由最终用户登录授权'], stages:[]};
fs.mkdirSync(runRoot,{recursive:true});
function save() { fs.writeFileSync(path.join(runRoot,'report.json'),JSON.stringify(report,null,2)); }
function log(message) { console.log(message); fs.appendFileSync(path.join(runRoot,'build.log'),message+'\n'); }
function run(command,args,{cwd=root,env={},capture=false,timeout=900000,allowFail=false}={}) {
  return new Promise((resolve,reject) => {
    const stream = fs.createWriteStream(path.join(runRoot,'commands.log'),{flags:'a'});
    const child = spawn(command,args,{cwd,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='', error='';
    const timer = setTimeout(()=>{ child.kill(); reject(Error(`命令超时：${command}`)); },timeout);
    child.stdout.on('data',b=>{output+=b;stream.write(b);if(!capture)process.stdout.write(b);});
    child.stderr.on('data',b=>{error+=b;stream.write(b);if(!capture)process.stderr.write(b);});
    child.on('error',e=>{clearTimeout(timer);stream.end();reject(e);});
    child.on('close',code=>{clearTimeout(timer);stream.end(); if(code&&!allowFail)reject(Error(`命令失败 (${code}) ${command}\n${(error||output).slice(-2500)}`));else resolve({code,output,error});});
  });
}
async function npmJson(args) { const r=await run(process.execPath,[npm,...args,'--json'],{capture:true});return JSON.parse(r.output); }
async function resolvePlugin(input) {
  if(input.startsWith('seed:')) {
    const name=input.slice(5), pkg=JSON.parse(fs.readFileSync(path.join(seedInput,'node_modules',name,'package.json')));
    return {input,name,version:pkg.version,seed:true,source:'existing pinned seed'};
  }
  let spec=input, repository;
  if(input.startsWith('https://github.com/')) {
    repository=input.replace(/#.*$/,'').replace(/\/$/,'').replace(/\.git$/,'');
    const slug=new URL(repository).pathname;
    const response=await fetch(`https://api.github.com/repos${slug}/contents/package.json`,{headers:{'User-Agent':'dsh-suite-builder',Accept:'application/vnd.github.raw+json'}});
    if(!response.ok)throw Error(`仓库没有可读的根 package.json：${repository} (${response.status})`);
    const pkg=await response.json();
    spec=`${pkg.name}@${pkg.version}`;
  }
  const pkg=await npmJson(['view',spec]);
  if(repository && !JSON.stringify(pkg.repository||'').toLowerCase().includes(new URL(repository).pathname.slice(1).toLowerCase()))throw Error(`npm 包来源与仓库不一致：${spec}`);
  if(!pkg.dsh?.bundle?.patch)throw Error(`不是声明了 dsh.bundle.patch 的插件：${spec}`);
  return {input,name:pkg.name,version:pkg.version,source:repository||'npm',integrity:pkg.dist?.integrity,spec:`${pkg.name}@${pkg.version}`};
}
async function download(url,dest,expected) {
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  if(fs.existsSync(dest) && await hash(dest)===expected)return;
  const response=await fetch(url,{signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw Error(`下载失败 ${url}: ${response.status}`);
  const temp=dest+'.partial';
  const {Readable}=require('node:stream');const {pipeline}=require('node:stream/promises');
  await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(temp));
  if(await hash(temp)!==expected)throw Error(`下载校验失败 ${url}`);
  fs.renameSync(temp,dest);
}
function resolveManifest(name,from) {
  let dir=from;
  while(inside(runRoot,dir)) { const file=path.join(dir,'node_modules',name,'package.json');if(fs.existsSync(file))return file;dir=path.dirname(dir); }
  return null;
}
function scanPlugin(plugin) {
  const base=path.join(profile,'node_modules',plugin.name);
  const evidence=[];
  function visit(dir) {
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if(['node_modules','.git','assets','tests','test','locale'].includes(entry.name))continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())visit(file);
      else if(/\.(mjs|cjs|js|ts|md)$/.test(file) && fs.statSync(file).size<8e6) {
        const text=fs.readFileSync(file,'utf8');
        if(/child_process|\b(?:spawn|execFile)\s*\(|electron-runtime|puppeteer|playwright|download(?:Runtime|Binary|Model)|(?:下载|安装).{0,24}(?:运行时|依赖|模型)/i.test(text))evidence.push(path.relative(base,file));
      }
    }
  }
  visit(base);
  plugin.externalProcessEvidence=evidence;
  if(evidence.length&&!rules.reviewedVersions[plugin.name]?.includes(plugin.version))throw Error(`插件 ${plugin.name}@${plugin.version} 含外部运行程序调用，需添加或更新依赖适配规则后才能发布。证据：${evidence.slice(0,5).join(', ')}`);
}
function checkDependencies() {
  const seen=new Set();
  function visit(file,legacy=false) {
    const real=fs.realpathSync(file);if(!inside(runRoot,real))throw Error(`依赖逃逸到构建目录外：${file}`);
    if(seen.has(real))return;seen.add(real);
    const pkg=JSON.parse(fs.readFileSync(file));
    for(const name of Object.keys(pkg.dependencies||{})) {
      const dep=resolveManifest(name,path.dirname(file));
      if(!dep)throw Error(`缺少依赖 ${pkg.name} -> ${name}`);visit(dep,legacy);
    }
    for(const [name,range] of Object.entries(pkg.peerDependencies||{})) {
      const peer=resolveManifest(name,path.dirname(file))||path.join(payload,'dsh/node_modules',name,'package.json');
      if(!fs.existsSync(peer)) {if(!pkg.peerDependenciesMeta?.[name]?.optional)throw Error(`缺少宿主 peer ${pkg.name} -> ${name}`);continue;}
      const version=JSON.parse(fs.readFileSync(peer)).version;
      if(!semver.satisfies(version,range,{includePrerelease:true})) {
        if(!legacy)throw Error(`peer 不兼容 ${pkg.name}: ${name}@${version} 不满足 ${range}`);
        (report.legacyPeerWarnings ||= []).push({plugin:pkg.name,peer:name,hostVersion:version,declared:range,requires:'actual host registration verification'});
      }
    }
  }
  for(const plugin of report.plugins)visit(path.join(profile,'node_modules',plugin.name,'package.json'),plugin.seed);
  report.checks.push({name:'dependency-and-peer-resolution',packages:seen.size,status:'passed'});
}
async function main() {
  if(process.platform!=='win32'||process.arch!=='x64'||rules.target!=='win32-x64')throw Error('当前自动构建器只验证 Windows x64；拒绝把 Windows 原生依赖直接装进 Mac 包。');
  if(!fs.existsSync(npm))throw Error('需要带 npm 的 Node.js 安装');
  for(const input of parseList(fs.readFileSync(list,'utf8')))report.plugins.push(await resolvePlugin(input));
  if(new Set(report.plugins.map(p=>p.name)).size!==report.plugins.length)throw Error('多个输入解析到了同一个插件');
  if(previous && JSON.stringify(previous.plugins.map(p=>[p.name,p.version]))!==JSON.stringify(report.plugins.map(p=>[p.name,p.version])))throw Error('恢复构建的插件版本发生变化，请重新构建');
  report.stages.push('resolved');save();
  log(`插件已解析：${report.plugins.map(p=>p.name+'@'+p.version).join(', ')}`);
  if(process.argv.includes('--plan')) {report.status='planned';save();return;}
  if(previous?.stages.includes('staged-and-checked')) {
    report.plugins=previous.plugins;report.checks=previous.checks;report.addedPeers=previous.addedPeers;report.legacyPeerWarnings=previous.legacyPeerWarnings;report.stages=previous.stages;
    await packageInstaller();return;
  }
  log('复制不可变的核心模板和独立构建 Profile…');
  if(!resume) {
    fs.cpSync(baseApp,app,{recursive:true});
    if(fs.existsSync(path.join(resources,'app.asar'))){asar.extractAll(path.join(resources,'app.asar'),payload);fs.unlinkSync(path.join(resources,'app.asar'));}
    else if(!fs.existsSync(path.join(payload,'package.json')))throw Error('Prepared desktop payload is missing');
    fs.mkdirSync(path.dirname(profile),{recursive:true});
    fs.cpSync(seedInput,profile,{recursive:true});
  }
  // Relocate pnpm's copied cache metadata, never the managed Profile manifest.
  const modulesFile=path.join(profile,'node_modules/.modules.yaml');
  const yaml=require(path.join(root,'tools/node_modules/js-yaml'));
  if(fs.existsSync(modulesFile)) {
    const modules=yaml.load(fs.readFileSync(modulesFile,'utf8'));
    modules.virtualStoreDir=path.join(profile,'node_modules/.pnpm');
    fs.writeFileSync(modulesFile,JSON.stringify(modules,null,2));
  }
  const node=path.join(resources,'runtime/primary-runtime/dependencies/node/bin/node.exe');
  const pnpm=path.join(resources,'runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs');
  const cli=path.join(runRoot,'manage.mjs');
  fs.writeFileSync(cli,`import {runCli} from ${JSON.stringify(pathToFileURL(path.join(payload,'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js')).href)}; await runCli({manageDesktopProfile:true,packageManager:{command:process.execPath,args:[${JSON.stringify(pnpm)}],env:{PATH:${JSON.stringify(path.dirname(node)+';'+process.env.PATH)}}}});`);
  const env={DSH_HOME:home,ELECTRON_RUN_AS_NODE:'',DSH_DESKTOP_NODE_EXECUTABLE:node,PATH:path.dirname(node)+';'+process.env.PATH};
  const dsh=async args=>run(node,[cli,...args],{env});
  // Only the supported DSH manager mutates the disposable Profile.
  const selected=new Set(report.plugins.map(p=>p.name));
  const original=JSON.parse(fs.readFileSync(path.join(seedInput,'package.json')));
  for(const name of Object.keys(original.dependencies||{}))if(!selected.has(name))await dsh(['plugin','--profile','desktop','remove',name]);
  for(const plugin of report.plugins)if(!plugin.seed)await dsh(['plugin','--profile','desktop','add',plugin.spec]);
  // Some frontend peers are not carried by the desktop's server package tree.
  // Resolve and install missing non-optional peers through the same DSH manager.
  const hostVersion=JSON.parse(fs.readFileSync(path.join(payload,'dsh/node_modules/@deepseek-ai/dsh/package.json'))).version;
  for(const plugin of report.plugins) {
    const pkgFile=path.join(profile,'node_modules',plugin.name,'package.json');
    const pkg=JSON.parse(fs.readFileSync(pkgFile));
    for(const [name,range] of Object.entries(pkg.peerDependencies||{})) {
      if(pkg.peerDependenciesMeta?.[name]?.optional || resolveManifest(name,path.dirname(pkgFile)) || fs.existsSync(path.join(payload,'dsh/node_modules',name,'package.json')))continue;
      const versions=await npmJson(['view',name,'versions']);
      const version=name.startsWith('@deepseek-ai/dsh-')&&versions.includes(hostVersion)&&semver.satisfies(hostVersion,range,{includePrerelease:true}) ? hostVersion : semver.maxSatisfying(versions,range,{includePrerelease:true});
      if(!version)throw Error(`无法解析 peer ${name}@${range}`);
      log(`补充缺失 peer：${name}@${version}`);
      await dsh(['plugin','--profile','desktop','add',`${name}@${version}`]);
      (report.addedPeers ||= []).push({name,version,requiredBy:plugin.name});
    }
  }
  for(const plugin of report.plugins)scanPlugin(plugin);
  checkDependencies();save();
  log('准备内置 CLI、Bun 和 Orb 专用 Electron…');
  fs.mkdirSync(deps,{recursive:true});
  fs.writeFileSync(path.join(deps,'package.json'),JSON.stringify({name:'dsh-suite-runtimes',version:'1.0.0',private:true,dependencies:rules.npmRuntimes},null,2));
  await run(process.execPath,[npm,'install','--omit=dev','--include=optional','--no-audit','--no-fund','--foreground-scripts'],{cwd:deps});
  const orbZip=path.join(root,rules.orb.cache);
  if(selected.has('dsh-orb')) {await download(rules.orb.url,orbZip,rules.orb.sha256);await run(seven,['x','-y',`-o${path.join(deps,'orb-electron')}`,orbZip],{capture:true});}
  const gitZip=path.join(root,rules.git.cache);await download(rules.git.url,gitZip,rules.git.sha256);
  await run(seven,['x','-y',`-o${path.join(deps,'git')}`,gitZip],{capture:true});
  const bin=path.join(deps,'bin');fs.mkdirSync(bin,{recursive:true});
  // Real executable copies ensure execFile('lark-cli') works without a shell.
  fs.copyFileSync(node,path.join(bin,'node.exe'));
  fs.copyFileSync(path.join(deps,'node_modules/@larksuite/cli/bin/lark-cli.exe'),path.join(bin,'lark-cli.exe'));
  fs.copyFileSync(path.join(deps,'node_modules/bun/bin/bun.exe'),path.join(bin,'bun.exe'));
  const codexFiles=files(path.join(deps,'node_modules/@openai')).filter(p=>path.basename(p)==='codex.exe');
  if(codexFiles.length!==1)throw Error('未找到唯一 Codex 平台二进制');
  fs.copyFileSync(codexFiles[0],path.join(bin,'codex.exe'));
  const runtimeScript=`import {join,delimiter} from 'node:path';\nconst dep=join(process.resourcesPath,'dependencies');\nprocess.env.PATH=join(dep,'bin')+delimiter+join(dep,'git','cmd')+delimiter+(process.env.PATH||'');\nprocess.env.OUR_FREE_MODEL_BUN=join(dep,'bin','bun.exe');\n${selected.has('dsh-orb')?"process.env.DSH_ORB_ELECTRON_PATH=join(dep,'orb-electron','electron.exe');":''}\n`;
  fs.writeFileSync(path.join(payload,'lib/suite-runtimes.js'),runtimeScript);
  const mainFile=path.join(payload,'lib/main.js');fs.writeFileSync(mainFile,'import "./suite-runtimes.js";\n'+fs.readFileSync(mainFile,'utf8'));
  const pkgFile=path.join(payload,'package.json');const pkg=JSON.parse(fs.readFileSync(pkgFile));pkg.version=rules.version;pkg.dshSuite.plugins=report.plugins.map(p=>p.name);fs.writeFileSync(pkgFile,JSON.stringify(pkg,null,2));
  const cmd=path.join(resources,'runtime/cli/bin/dsh.cmd');fs.writeFileSync(cmd,fs.readFileSync(cmd,'utf8').replaceAll('app.asar','app'));
  const cleanEnv={...env,PATH:bin+';'+path.join(process.env.SystemRoot,'System32')+';'+process.env.SystemRoot};
  for(const name of ['lark-cli','codex','bun']) {const result=await run(path.join(bin,name+'.exe'),['--version'],{env:cleanEnv,capture:true,timeout:30000});report.checks.push({name:name+'-bundled-launch',status:'passed',output:result.output.trim()});}
  {const result=await run(path.join(deps,'git/cmd/git.exe'),['--version'],{env:cleanEnv,capture:true,timeout:30000});report.checks.push({name:'git-bundled-launch',status:'passed',output:result.output.trim()});}
  if(selected.has('dsh-orb')) {const result=await run(path.join(deps,'orb-electron/electron.exe'),['--version'],{env:{...cleanEnv,ELECTRON_RUN_AS_NODE:'1'},capture:true,timeout:30000});report.checks.push({name:'orb-runtime-launch',status:'passed',output:result.output.trim()});}
  const verifyAlias=path.join(home,'profiles/suite-check');
  if(!fs.existsSync(verifyAlias))fs.symlinkSync(profile,verifyAlias,'junction');
  await run(node,[cli,'--profile','suite-check','--dump-config'],{env:cleanEnv,capture:true});
  report.checks.push({name:'dsh-dump-config',status:'passed'});
  const nativeCheck=path.join(runRoot,'native.cjs');
  fs.writeFileSync(nativeCheck,`const {createRequire}=require('node:module'); const req=createRequire(${JSON.stringify(path.join(profile,'package.json'))});${selected.has('@xmanrui/dsh-im')?"req('sharp'); console.log('sharp loaded');":''}${selected.has('dsh-industry-research')?`const p=createRequire(${JSON.stringify(path.join(profile,'node_modules/dsh-industry-research/package.json'))}); const pty=p('node-pty'); const child=pty.spawn(${JSON.stringify(node)},['-e','console.log("PTY_OK")'],{env:process.env}); let output=''; child.onData(d=>output+=d); child.onExit(({exitCode})=>{const ok=!exitCode&&output.includes('PTY_OK');console.log(ok?'pty passed':'pty failed');process.exit(ok?0:1)}); setTimeout(()=>{child.kill();process.exit(1)},10000).unref();`:''}`);
  await run(node,[nativeCheck],{env:cleanEnv,capture:true,timeout:20000});report.checks.push({name:'native-module-launch',status:'passed'});
  await run(node,[path.join(root,'scripts/audit_dependencies.mjs'),profile,resources],{env:cleanEnv,capture:true});
  log('启动真实 Desktop Host，验证插件服务注册…');
  report.checks.push(...await (await import('./verify-host.mjs')).default({node,payload,profile,resources,plugins:report.plugins,logFile:path.join(runRoot,'host-smoke.log'),env:{...cleanEnv,DSH_ORB_ELECTRON_PATH:path.join(deps,'orb-electron/electron.exe'),OUR_FREE_MODEL_BUN:path.join(bin,'bun.exe')}}));
  log('生成插件种子包…');
  if(fs.existsSync(path.join(resources,'seed-profile.zip')))fs.unlinkSync(path.join(resources,'seed-profile.zip'));
  await run(seven,['a','-tzip','-mx=6',path.join(resources,'seed-profile.zip'),'.','-xr!.git','-xr!.pnpm','-xr!.bin','-xr!.modules.yaml','-xr!.plugin-manager'],{cwd:profile,capture:true});
  // The previous template zip must not retain files of removed plugins.
  report.stages.push('staged-and-checked');save();
  const inventory={plugins:report.plugins,addedPeers:report.addedPeers,legacyPeerWarnings:report.legacyPeerWarnings,runtimes:rules.npmRuntimes,git:rules.git,orb:selected.has('dsh-orb')?rules.orb:null,disabledFeatures:rules.disabledFeatures,checks:report.checks};
  fs.writeFileSync(path.join(resources,'suite-inventory.json'),JSON.stringify(inventory,null,2));
  await packageInstaller();
}
async function packageInstaller() {
  // extractAll materialized the native payload under resources/app. Remove only
  // the redundant original ASAR sidecar in this private staging directory.
  const redundant=path.resolve(resources,'app.asar.unpacked');
  if(!inside(runRoot,redundant)||path.basename(redundant)!=='app.asar.unpacked')throw Error('拒绝清理构建目录以外的路径');
  if(fs.existsSync(redundant))fs.rmSync(redundant,{recursive:true,force:true});
  if(report.plugins.some(p=>p.name==='dsh-our-free-model')) {
    log('准备 mihomo 出口运行程序…');
    const archive=path.join(root,rules.mihomo.cache),target=path.join(deps,'mihomo');
    await download(rules.mihomo.url,archive,rules.mihomo.sha256);
    await run(seven,['x','-y',`-o${target}`,archive],{capture:true});
    const binaries=files(target).filter(p=>p.endsWith('.exe'));if(binaries.length!==1)throw Error('mihomo 归档中没有唯一可执行文件');
    fs.copyFileSync(binaries[0],path.join(deps,'bin/mihomo.exe'));
    const license=path.join(target,'LICENSE');
    if(!fs.existsSync(license)) {
      const response=await fetch(`https://raw.githubusercontent.com/MetaCubeX/mihomo/v${rules.mihomo.version}/LICENSE`);
      if(!response.ok)throw Error('无法取得 mihomo 许可证');fs.writeFileSync(license,await response.text());
    }
    fs.writeFileSync(path.join(target,'SOURCE.txt'),`https://github.com/MetaCubeX/mihomo/tree/v${rules.mihomo.version}\nhttps://github.com/MetaCubeX/mihomo/archive/refs/tags/v${rules.mihomo.version}.tar.gz\n`);
    const r=await run(path.join(deps,'bin/mihomo.exe'),['-v'],{capture:true,timeout:30000});
    report.checks=report.checks.filter(c=>c.name!=='mihomo-bundled-launch');report.checks.push({name:'mihomo-bundled-launch',status:'passed',output:r.output.trim()});
  }
  const hostLog=path.join(runRoot,'host-smoke.log');
  if(fs.existsSync(hostLog)) {
    const warnings=fs.readFileSync(hostLog,'utf8').split(/\r?\n/).filter(line=>/dsh-orb:.*failed:/i.test(line));
    report.checks=report.checks.filter(c=>c.name!=='host-runtime-warnings');
    if(warnings.length)report.checks.push({name:'host-runtime-warnings',status:'warning',messages:warnings});
  }
  const inventoryPath=path.join(resources,'suite-inventory.json');
  const inventory=JSON.parse(fs.readFileSync(inventoryPath));inventory.checks=report.checks;inventory.mihomo=rules.mihomo;inventory.disabledFeatures=rules.disabledFeatures;
  fs.writeFileSync(inventoryPath,JSON.stringify(inventory,null,2));
  report.disabledFeatures=rules.disabledFeatures;save();
  log('生成支持自定义安装目录的 NSIS 安装器…');
  fs.mkdirSync(out,{recursive:true});
  const builder=path.join(root,'tools/node_modules/electron-builder/out/cli/cli.js');
  await run(process.execPath,[builder,'--win','--x64','--prepackaged',app,'--config',path.join(root,'builder/win.yml'),`--config.directories.output=${out}`,`--config.extraMetadata.version=${rules.version}`],{cwd:path.join(root,'tools'),env:{CSC_IDENTITY_AUTO_DISCOVERY:'false',ELECTRON_BUILDER_COMPRESSION_LEVEL:'3'}});
  const artifact=files(out).find(p=>p.endsWith('.exe'));if(!artifact)throw Error('构建器没有输出安装器');
  await run(seven,['t',artifact,'-bso0','-bsp0'],{capture:true});
  report.checks.push({name:'installer-archive-integrity',status:'passed'});
  report.artifact=artifact;report.sha256=await hash(artifact);report.status='built';report.finished=new Date().toISOString();save();
  fs.copyFileSync(path.join(runRoot,'report.json'),path.join(out,'report.json'));
  fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),`${report.sha256}  ${path.basename(artifact)}\n`);
  fs.writeFileSync(path.join(root,'dist/automated/latest.json'),JSON.stringify({artifact,sha256:report.sha256,report:path.join(out,'report.json')},null,2));
  fs.writeFileSync(path.join(out,'使用说明.txt'),'安装向导可选安装目录。首次启动使用内置依赖；ChatGPT、飞书等账号请自行登录。已有非空 DSH Profile 不会覆盖，因此已有用户需在插件管理中安装新增插件。\n未提供功能：'+rules.disabledFeatures.join('\n')+'\n');
  log(`完成：${artifact}`);
}
const lock=path.join(root,'build/automated/.build-lock');fs.mkdirSync(path.dirname(lock),{recursive:true});
let locked=false;
(async()=>{try{if(fs.existsSync(lock)&&!alive(Number(fs.readFileSync(lock,'utf8'))))fs.unlinkSync(lock);fs.writeFileSync(lock,String(process.pid),{flag:'wx'});locked=true;await main();}catch(error){report.status='failed';report.error=error.stack;save();console.error(error.message);process.exitCode=1;}finally{if(locked)fs.unlinkSync(lock);}})();
