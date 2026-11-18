import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {command} from './ci-common.mjs';
const root=path.resolve(process.argv[2]||'release-input');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=walk(root),packages=files.filter(p=>p.endsWith('.exe')),reports=files.filter(p=>path.basename(p)==='report.json');
if(packages.length!==1||reports.length!==1)throw Error('Expected one Windows installer and report');
const report=JSON.parse(fs.readFileSync(reports[0]));
const signature=report.checks?.find(c=>c.name==='windows-authenticode-signatures'&&c.status==='passed');
if(!signature||!/^[a-f0-9]{40}$/i.test(signature.certificate)||!Number.isInteger(signature.files)||signature.files<1||signature.embeddedUninstaller!==true||signature.installerSha256!==report.sha256)throw Error('Trusted Windows signature evidence is missing or does not match the installer');
const selected=new Map(report.plugins.map(p=>[p.name,p.version]));
if(report.target!=='win32-x64'||report.status!=='built'||selected.has('dsh-orb')||selected.get('dsh-codex-subscription')!=='3.2.19'||selected.get('dsh-industry-research')!=='0.13.2')throw Error('Unexpected plugin selection');
for(const name of ['slim-no-orb-no-codex-cli','industry-research-registered-and-ready','dsh-codex-subscription-client-registered','deduplicated-native-PATH-launch','native-module-launch','installer-archive-integrity','installer-single-instance','windows-authenticode-signatures']){
  if(!report.checks.some(c=>c.name===name&&c.status==='passed'))throw Error('Required check not passed: '+name);
}
const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(packages[0]))h.update(chunk);
if(h.digest('hex')!==report.sha256)throw Error('Installer digest mismatch');
const sum=path.join(root,'SHA256SUMS.txt');fs.writeFileSync(sum,report.sha256+'  '+path.basename(packages[0])+'\n');
if(process.argv.includes('--check')){console.log('Windows slim selection, required checks and SHA-256 passed');process.exit(0)}
if(process.env.GITHUB_REPOSITORY!=='zaki-zeyi/deepseek-harness'||!process.env.GITHUB_SHA||!process.env.GITHUB_RUN_NUMBER)throw Error('Unexpected publishing environment');
const tag='community-suite-1.1.0-windows-slim-build-'+process.env.GITHUB_RUN_NUMBER;
const notes=path.join(root,'release-notes.md');
fs.writeFileSync(notes,`Windows x64 精简离线安装包：保留 Codex 订阅插件 3.2.19、行研插件 0.13.2、品牌/插件市场/IM/免费模型插件。移除 Orb 悬浮球、其独立 Electron、额外内置的 Codex CLI；Lark/Bun/Node 使用单份原始程序，mihomo 去重。\n\n已检查 DSH 宿主启动、行研服务 ready、保留插件的客户端注入、依赖与 peer、原生模块、CLI 通过 PATH 启动及安装器完整性。真实模型调用、账号登录、飞书业务读写和所有界面交互不在自动验收范围。Codex 订阅基础接入保留；其可选子任务功能可能另行安装自己管理的指定版本 CLI。旧行研任务的 Codex 终端兼容路径不随包提供。\n\n安装支持自定义目录。已有非空 Profile 保留，旧 Profile 中已经安装的 Orb 不会自动卸载。Windows 安装器、应用及内嵌卸载器均经过可信证书签名和验签；包内 PE 文件通过签名检查，保留有效的上游签名。\n\n大小：${report.artifactBytes||fs.statSync(packages[0]).size} 字节。\n构建：https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}\n`);
await command('gh',['release','create',tag,'--repo',process.env.GITHUB_REPOSITORY,'--target',process.env.GITHUB_SHA,'--title','DeepSeek Harness Windows 精简包 · 行研 0.13.2','--notes-file',notes,'--draft','--prerelease',packages[0],reports[0],sum]);
await command('gh',['release','edit',tag,'--repo',process.env.GITHUB_REPOSITORY,'--draft=false']);
console.log('Published https://github.com/'+process.env.GITHUB_REPOSITORY+'/releases/tag/'+tag);
