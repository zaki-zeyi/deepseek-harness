import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {command} from './ci-common.mjs';

const root=path.resolve(process.argv[2]||'release-input');
const settings=JSON.parse(fs.readFileSync(new URL('./runtime-rules.json',import.meta.url)));
const pins=JSON.parse(fs.readFileSync(new URL('./ci-inputs.json',import.meta.url)));
const expectedIndustry=pins.seedSources['dsh-industry-research'].version;
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
const assets=[],sums=[];
for(const [folder,target,extension,reportName] of [['windows','win32-x64','.exe','report.json'],['mac','darwin-arm64','.zip','report-darwin-arm64.json']]){
  const entries=files(path.join(root,folder));
  const reports=entries.filter(f=>path.basename(f)===reportName),packages=entries.filter(f=>f.endsWith(extension));
  if(reports.length!==1||packages.length!==1)throw Error('Expected one verified report and installer for '+target);
  const report=JSON.parse(fs.readFileSync(reports[0]));
  const plugins=report.plugins||report.inventory?.plugins||[];
  if(report.target!==target||!plugins.some(p=>p.name==='dsh-industry-research'&&p.version===expectedIndustry))throw Error('Unexpected target or industry plugin version');
  if(target==='win32-x64'&&(report.status!=='built'||!report.checks.some(c=>c.name==='industry-research-registered-and-ready'&&c.status==='passed')))throw Error('Windows runtime checks incomplete');
  if(target==='darwin-arm64'&&(!report.macRuntimeTested||report.status!=='packaged-native-verified'))throw Error('Mac native checks incomplete');
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(packages[0]))hash.update(chunk);
  const digest=hash.digest('hex');if(digest!==report.sha256)throw Error('Installer SHA-256 mismatch');
  sums.push(digest+'  '+path.basename(packages[0]));assets.push(packages[0]);
  const copy=path.join(root,`report-${target}.json`);fs.copyFileSync(reports[0],copy);assets.push(copy);
}
const checksum=path.join(root,'SHA256SUMS.txt');fs.writeFileSync(checksum,sums.join('\n')+'\n');assets.push(checksum);
if(process.argv.includes('--check')){console.log('Both installers, versions, native reports and hashes verified');process.exit(0)}
if(process.env.GITHUB_REPOSITORY!=='zaki-zeyi/deepseek-harness'||!process.env.GITHUB_SHA||!process.env.GITHUB_RUN_NUMBER)throw Error('Publish only from the intended repository workflow');
const tag=`community-suite-${settings.version}-industry-${expectedIndustry}-build-${process.env.GITHUB_RUN_NUMBER}`;
const notes=path.join(root,'release-notes.md');
fs.writeFileSync(notes,`社区整合安装包，包含行研插件 v${expectedIndustry}。\n\nWindows x64：下载 EXE，安装时可选择目录。\nApple Silicon Mac：下载 mac-arm64.zip，解压后运行安装到自定义位置.command，按说明完成本机 ad-hoc 签名。Intel Mac 暂不提供。\n\n两平台已完成打包和依赖运行检查；Windows 已验证行研服务注册与启动。Mac GUI、账号登录和业务写入未在本轮验收。Windows 未使用发布者证书签名，Mac 未进行 Apple 公证；Git 功能需要 Apple Command Line Tools。已有非空 Profile 会保留，不会自动向已有 Profile 注入插件。账号需用户自行授权。\n\n校验值与测试报告见附件。\n\n构建记录：https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}\n`);
await command('gh',['release','create',tag,'--repo',process.env.GITHUB_REPOSITORY,'--target',process.env.GITHUB_SHA,'--title',`DeepSeek Harness 社区整合包 ${settings.version} · 行研 ${expectedIndustry}`,'--notes-file',notes,'--draft','--prerelease',...assets]);
await command('gh',['release','edit',tag,'--repo',process.env.GITHUB_REPOSITORY,'--draft=false']);
console.log('Published https://github.com/'+process.env.GITHUB_REPOSITORY+'/releases/tag/'+tag);
