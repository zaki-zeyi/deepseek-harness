import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {command} from './ci-common.mjs';

if(process.platform!=='win32')throw Error('Use a native Windows runner');
const root=path.resolve(process.argv[2]||'online-input');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
const entries=files(root),packages=entries.filter(f=>f.endsWith('.exe')),reports=entries.filter(f=>path.basename(f)==='report.json');
if(packages.length!==1||reports.length!==1)throw Error('Expected one Windows installer and report');
const payload=packages[0],report=JSON.parse(fs.readFileSync(reports[0]));
if(report.target!=='win32-x64'||report.status!=='built'||!report.checks.some(c=>c.name==='deduplicated-native-PATH-launch'&&c.status==='passed')||!report.checks.some(c=>c.name==='industry-research-registered-and-ready'&&c.status==='passed'))throw Error('Windows runtime verification missing');
if(!report.plugins.some(p=>p.name==='dsh-industry-research'&&p.version==='0.13.2'))throw Error('Unexpected industry plugin');
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex')}
if(await hash(payload)!==report.sha256)throw Error('Payload checksum mismatch');
if(fs.statSync(payload).size>=600000000||!report.checks.some(c=>c.name==='obsolete-global-codex-absent'&&c.status==='passed'))throw Error('Expected a Windows payload below 600 MB without the obsolete global Codex CLI');
const repo=process.env.GITHUB_REPOSITORY;if(repo!=='zaki-zeyi/deepseek-harness'||!process.env.GITHUB_RUN_NUMBER)throw Error('Unexpected publication repository');
const tag=`community-windows-online-1.1.0-build-${process.env.GITHUB_RUN_NUMBER}`;
const url=`https://github.com/${repo}/releases/download/${tag}/${path.basename(payload)}`;
const output=path.join(root,'online');fs.mkdirSync(output,{recursive:true});
const source=path.join(output,'Setup.cs'),bootstrap=path.join(output,'DeepSeek-Harness-Online-Setup-win-x64.exe');
fs.writeFileSync(source,fs.readFileSync(new URL('./windows-online/Setup.cs',import.meta.url),'utf8').replace('@@URL@@',url).replace('@@SHA256@@',report.sha256).replace('@@MEGABYTES@@',Math.ceil(fs.statSync(payload).size/1e6)));
const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
await command(compiler,['/nologo','/codepage:65001','/target:winexe','/platform:x64','/optimize+','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll',`/out:${bootstrap}`,source]);
await command(bootstrap,['--verify-payload',payload]);
const invalid=path.join(output,'invalid.tmp');fs.writeFileSync(invalid,'corrupt payload');
let rejected=false;try{await command(bootstrap,['--verify-payload',invalid],{capture:true})}catch(error){if(!error.message.includes('failed 2:'))throw error;rejected=true}
if(!rejected)throw Error('Corrupted payload accepted');fs.unlinkSync(invalid);
await command(bootstrap,['--smoke']);
// Install into an owned path and exercise the same runtime wiring as the desktop app.
const installed=path.join(process.env.RUNNER_TEMP,'dsh-online-install-'+process.env.GITHUB_RUN_ID);
if(fs.existsSync(installed))throw Error('Install verification directory must be fresh');
await command(payload,['/S',`/D=${installed}`],{timeout:15*60*1000});
const resources=path.join(installed,'resources'),probe=path.join(output,'installed-smoke.mjs');
fs.writeFileSync(probe,`import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';process.resourcesPath=${JSON.stringify(resources)};await import(pathToFileURL(${JSON.stringify(path.join(resources,'app/lib/suite-runtimes.js'))}).href);for(const name of ['bun','lark-cli','mihomo']){const r=spawnSync(name,[name==='mihomo'?'-v':'--version'],{encoding:'utf8',env:process.env});if(r.error||r.status!==0)throw r.error||Error(name+' failed');console.log(name+': '+r.stdout.trim())}`);
await command(path.join(resources,'runtime/primary-runtime/dependencies/node/bin/node.exe'),[probe],{env:{PATH:path.join(process.env.WINDIR,'System32')+';'+process.env.WINDIR},timeout:120000});
const sums=path.join(output,'SHA256SUMS.txt');fs.writeFileSync(sums,`${await hash(bootstrap)}  ${path.basename(bootstrap)}\n${report.sha256}  ${path.basename(payload)}\n`);
const notes=path.join(output,'notes.md');fs.writeFileSync(notes,`Windows x64 在线安装器。优先下载 **DeepSeek-Harness-Online-Setup-win-x64.exe**，运行后会下载约 ${Math.ceil(fs.statSync(payload).size/1e6)} MB 安装内容，校验后打开可选择安装目录的安装界面。\n\n包含行研插件 v0.13.2；完整运行依赖保留，已去除重复 CLI 文件。需要网络连接和 Windows .NET Framework 4.5+（Windows 10/11 通常已内置）。安装器未使用发布者证书签名。账号需自行登录，已有非空 Profile 保留。附件中的大型 EXE 是安装负载，也可用于离线安装。Mac 不在此次发布范围。\n\n完整负载来自已通过 Windows 构建、CLI PATH、行研宿主及原生模块检查的运行 ${process.env.SOURCE_RUN}。本轮另验证校验成功、损坏负载拒绝、窗口创建，以及公开下载地址的真实下载校验。\n`);
await command('gh',['release','create',tag,'--repo',repo,'--target',process.env.GITHUB_SHA,'--title','DeepSeek Harness Windows 在线安装器 · 行研 0.13.2','--notes-file',notes,'--draft','--prerelease',bootstrap,payload,reports[0],sums]);
await command('gh',['release','edit',tag,'--repo',repo,'--draft=false']);
try{await command(bootstrap,['--download-check'],{timeout:30*60*1000})}
catch(error){await command('gh',['release','edit',tag,'--repo',repo,'--draft=true']);throw error}
console.log(JSON.stringify({url:`https://github.com/${repo}/releases/tag/${tag}`,bootstrapBytes:fs.statSync(bootstrap).size,payloadBytes:fs.statSync(payload).size,publicDownloadVerified:true}));
