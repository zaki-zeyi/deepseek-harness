import fs from 'node:fs';
import path from 'node:path';
import {hash} from './lib.mjs';

const root=path.resolve(process.argv[2]||'release-input/mac');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
const entries=files(root);
function unique(name){const matches=entries.filter(file=>path.basename(file)===name);if(matches.length!==1)throw Error('Expected one release asset: '+name);return matches[0]}
const reportPath=unique('report-darwin-arm64.json');
const report=JSON.parse(fs.readFileSync(reportPath));
const pins=JSON.parse(fs.readFileSync(new URL('./ci-inputs.json',import.meta.url)));
const expected=pins.seedSources['dsh-industry-research'].version;
const artifact=unique(path.basename(report.artifact));
if(report.target!=='darwin-arm64'||report.status!=='packaged-native-verified'||!report.macRuntimeTested||report.bytes>=600000000||fs.statSync(artifact).size!==report.bytes||await hash(artifact)!==report.sha256)throw Error('Invalid native Mac package');
if(!report.inventory.plugins.some(p=>p.name==='dsh-industry-research'&&p.version===expected))throw Error('Unexpected industry version');
for(const name of ['native-bun-launch','native-lark-cli-launch','native-mihomo-launch','native-sharp-image-and-pty-child','fresh-industry-research-registered-and-ready','existing-industry-research-registered-and-ready'])if(!report.macNativeChecks.some(c=>c.name===name&&c.status==='passed'))throw Error('Missing Mac acceptance: '+name);
if(!report.orbIncluded&&report.withOrbBytes<600000000)throw Error('Orb was removed without reaching the size limit');
const repo=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA,number=process.env.GITHUB_RUN_NUMBER;
if(repo!=='zaki-zeyi/deepseek-harness'||!sha||sha!==report.sourceCommit||!number||!process.env.GH_TOKEN)throw Error('Unexpected publication context');
const tag=`community-mac-arm64-1.1.0-industry-${expected}-build-${number}`;
const body=`Apple Silicon（M 系列）完整离线安装包，${(report.bytes/1e6).toFixed(2)} MB。下载 ZIP 并完整解压，运行“安装到自定义位置.command”选择目录，脚本会在本机完成 ad-hoc 签名。安装不下载插件和运行依赖。\n\n行研工作台 v${expected}，其余插件和运行库见报告。${report.orbIncluded?'保留 Orb 悬浮球。':`带 Orb 的首包为 ${(report.withOrbBytes/1e6).toFixed(2)} MB，超过 600 MB，已移除 Orb 及其专用 Electron。`}全局 Codex CLI 不再携带，不预装语音模型；账号由用户自行授权。首次启动显示本地插件准备进度，已有账号、用户版本和禁用选择保留。\n\n已在真实 Apple Silicon 构建机验证归档、架构、符号链接、执行权限、本机签名、Bun/Lark/mihomo、sharp 图像、PTY 子进程以及新旧 Profile 的真实 Desktop Host 和行研 ready。未自动验收完整 GUI、账号授权和业务写入。未进行 Apple 公证；Git 功能需要系统 Apple Command Line Tools。Intel Mac 不在本次范围。\n\n构建：https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}\n源码：${sha}\n`;
const headers={Authorization:'Bearer '+process.env.GH_TOKEN,'User-Agent':'dsh-macos-suite-publisher',Accept:'application/vnd.github+json'};
async function api(endpoint,method='GET',data){const r=await fetch('https://api.github.com/repos/'+repo+endpoint,{method,headers:{...headers,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok)throw Error('GitHub API '+r.status+': '+(await r.text()).slice(0,500));return r.json()}
const release=await api('/releases','POST',{tag_name:tag,target_commitish:sha,name:`DeepSeek Harness · M 系列离线包 · 行研 ${expected}`,body,draft:true,prerelease:true});
const assets=[artifact,reportPath,unique('SHA256SUMS.txt')];
for(const file of assets){
  const url=new URL(release.upload_url.replace('{?name,label}',''));if(url.hostname!=='uploads.github.com'||url.pathname!==`/repos/${repo}/releases/${release.id}/assets`)throw Error('Unexpected upload destination');url.searchParams.set('name',path.basename(file));
  const r=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(fs.statSync(file).size)},body:fs.createReadStream(file),duplex:'half',signal:AbortSignal.timeout(30*60*1000)});if(!r.ok)throw Error('Asset upload HTTP '+r.status);const asset=await r.json();if(asset.size!==fs.statSync(file).size||asset.digest!=='sha256:'+await hash(file))throw Error('Uploaded asset checksum mismatch');
}
await api('/releases/'+release.id,'PATCH',{draft:false,tag_name:tag,target_commitish:sha,body});
const verified=await api('/releases/'+release.id);if(verified.draft||verified.tag_name!==tag||verified.assets.length!==assets.length)throw Error('Release metadata mismatch');
for(const file of assets){const item=verified.assets.find(a=>a.name===path.basename(file));if(!item||item.digest!=='sha256:'+await hash(file))throw Error('Published asset mismatch')}
console.log('Published verified Apple Silicon package: '+verified.html_url);
