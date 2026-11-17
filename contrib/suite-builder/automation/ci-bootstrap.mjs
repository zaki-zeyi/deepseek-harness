import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseList} from './lib.mjs';
import {assertRunner,command,npmCli,verifiedInput} from './ci-common.mjs';
import {checkProfile} from './profile-guard.mjs';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=process.argv[2]||`${process.platform}-${process.arch}`;
assertRunner(target);
const pins=JSON.parse(fs.readFileSync(path.join(root,'automation/ci-inputs.json')));
const rules=JSON.parse(fs.readFileSync(path.join(root,'automation/runtime-rules.json')));
const scratch=path.join(root,'build/ci-input');
fs.mkdirSync(scratch,{recursive:true});
const core=pins.cores[target];
const archive=await verifiedInput(core,path.join(root,'downloads',path.basename(new URL(core.url).pathname)));
const extracted=path.join(scratch,'desktop');
if(fs.existsSync(extracted))throw Error('CI input staging already exists; use a fresh checkout');
fs.mkdirSync(extracted);
const seven=require(path.join(root,'node_modules/7zip-bin')).path7za;
if(process.platform==='win32')await command(seven,['x','-y',`-o${extracted}`,archive],{capture:true});
else await command('/usr/bin/ditto',['-x','-k',archive,extracted]);
const bundle=process.platform==='win32'?extracted:path.join(extracted,'DeepSeek Harness.app');
const resources=process.platform==='win32'?path.join(bundle,'resources'):path.join(bundle,'Contents/Resources');
const payload=path.join(resources,'app');
const asar=require(path.join(root,'tools/node_modules/@electron/asar'));
asar.extractAll(path.join(resources,'app.asar'),payload);
// Extraction has materialized unpacked native sidecars too; retain one complete copy.
if(process.platform==='darwin'){
  fs.unlinkSync(archive);
  fs.unlinkSync(path.join(resources,'app.asar'));
  fs.rmSync(path.join(resources,'app.asar.unpacked'),{recursive:true,force:true});
}
const pkgFile=path.join(payload,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgFile));
if(pkg.version!==core.version)throw Error(`Desktop package version ${pkg.version} does not match pin ${core.version}`);
pkg.name='dsh-desktop-suite';pkg.productName='DeepSeek Harness Suite';pkg.version=rules.version;
pkg.dshDesktopAppId='com.deepseek.dsh.suite';pkg.dshSuite={core:core.version,plugins:[]};
delete pkg.dshMandatoryUpdatePolicy;
fs.writeFileSync(pkgFile,JSON.stringify(pkg,null,2)+'\n');
const seedLoader=fs.readFileSync(path.join(root,'automation/templates/seed-profile.js'));
fs.writeFileSync(path.join(payload,'lib/seed-profile.js'),seedLoader);
const main=path.join(payload,'lib/main.js');
fs.writeFileSync(main,'import "./seed-profile.js";\n'+fs.readFileSync(main,'utf8'));
const updateFile=path.join(resources,'app-update.yml');if(fs.existsSync(updateFile))fs.unlinkSync(updateFile);
// The Windows builder extracts this patched archive into its own private staging.
if(process.platform==='win32'){
  fs.renameSync(path.join(bundle,'DeepSeek Harness.exe'),path.join(bundle,'DeepSeek Harness Suite.exe'));
  const launcher=path.join(resources,'runtime/cli/bin/dsh.cmd');
  fs.writeFileSync(launcher,fs.readFileSync(launcher,'utf8').replaceAll('DeepSeek Harness.exe','DeepSeek Harness Suite.exe'));
  fs.unlinkSync(path.join(resources,'app.asar'));
  // Keep ordinary on-disk paths for CLI and native modules; build.mjs accepts prepared apps.
}

const runtime=path.join(payload,'dsh');
const carrier=createRequire(path.join(runtime,'package.json'));
const init=await import(pathToFileURL(carrier.resolve('@deepseek-ai/dsh-app-boot')).href);
const home=path.join(scratch,'home'),profile=path.join(home,'profiles/desktop');
process.env.DSH_HOME=home;
init.initProfile(profile,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']);
fs.appendFileSync(path.join(profile,'pnpm-workspace.yaml'),'\nminimumReleaseAge: 0\nonlyBuiltDependencies:\n  - node-pty\n  - sharp\n  - koffi\n  - fs-ext\n');
const manager=path.join(scratch,'manager.mjs');
const pnpm=path.join(resources,'runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs');
fs.writeFileSync(manager,`import {runCli} from ${JSON.stringify(pathToFileURL(path.join(runtime,'node_modules/@deepseek-ai/dsh/lib/bin.js')).href)};await runCli({manageDesktopProfile:true,packageManager:{command:process.execPath,args:[${JSON.stringify(pnpm)}],env:{PATH:${JSON.stringify(path.dirname(process.execPath)+path.delimiter+(process.env.PATH||''))}}}});`);
const plugins=[];
const inputs=parseList(fs.readFileSync(path.join(root,'plugins.md'),'utf8'));
for(const input of inputs){
  let spec=input,name,version;
  if(input.startsWith('seed:')){
    name=input.slice(5);const seed=pins.seedSources[name];
    if(!seed)throw Error(`No CI source for seed alias ${name}`);
    ({spec,version}=seed);
  }else if(input.startsWith('https://github.com/')){
    const slug=new URL(input).pathname.replace(/\/$/,'').replace(/\.git$/,'');
    const response=await fetch(`https://api.github.com/repos${slug}/contents/package.json`,{headers:{'User-Agent':'dsh-suite-builder',Accept:'application/vnd.github.raw+json'}});
    if(!response.ok)throw Error(`Cannot resolve plugin repository ${input}: ${response.status}`);
    const manifest=await response.json();name=manifest.name;version=manifest.version;spec=`${name}@${version}`;
    const published=JSON.parse(await command(process.execPath,[npmCli(),'view',spec,'--json'],{capture:true}));
    if(!JSON.stringify(published.repository||'').toLowerCase().includes(slug.slice(1).toLowerCase()))throw Error('Published plugin repository differs from input');
  }
  await command(process.execPath,[manager,'plugin','--profile','desktop','add',spec],{cwd:root,env:{DSH_HOME:home,CI:'true'}});
  if(!name){const manifest=JSON.parse(await command(process.execPath,[npmCli(),'view',input,'--json'],{capture:true}));name=manifest.name;version=manifest.version;}
  const installed=JSON.parse(fs.readFileSync(path.join(profile,'node_modules',name,'package.json')));
  if(installed.version!==version||!installed.dsh?.bundle?.patch)throw Error(`Plugin installation did not produce the expected bundle: ${name}@${version}`);
  plugins.push({input,name,version,source:spec,seed:input.startsWith('seed:')});
}

// Match the host's version for omitted, non-optional peers; never add a duplicate host package.
const semver=require(path.join(root,'tools/node_modules/semver'));
for(const plugin of plugins){
  const manifestFile=path.join(profile,'node_modules',plugin.name,'package.json');
  const manifest=JSON.parse(fs.readFileSync(manifestFile));const resolver=createRequire(manifestFile);
  for(const [name,range] of Object.entries(manifest.peerDependencies||{})){
    if(manifest.peerDependenciesMeta?.[name]?.optional||fs.existsSync(path.join(runtime,'node_modules',name,'package.json')))continue;
    let found=false;try{resolver.resolve(name);found=true}catch(error){if(error.code!=='MODULE_NOT_FOUND'&&error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error}
    if(found)continue;
    const versions=JSON.parse(await command(process.execPath,[npmCli(),'view',name,'versions','--json'],{capture:true}));
    const version=name.startsWith('@deepseek-ai/dsh-')&&versions.includes(core.version)&&semver.satisfies(core.version,range,{includePrerelease:true})?core.version:semver.maxSatisfying(versions,range,{includePrerelease:true});
    if(!version)throw Error(`Cannot resolve required peer ${name}@${range}`);
    await command(process.execPath,[manager,'plugin','--profile','desktop','add',`${name}@${version}`],{cwd:root,env:{DSH_HOME:home,CI:'true'}});
  }
}
// This receipt is an input manifest, not a claim that the installed application was exercised.
const checked=checkProfile({profile,runtime,plugins,rules,semver});
const receipt={target,coreVersion:core.version,coreInput:core,plugins,legacyPeerWarnings:checked.legacyPeerWarnings,checks:[{name:'official-input-sha512',status:'passed'},{name:'profile-manager-install',status:'passed'},{name:'profile-dependency-guard',status:'passed',packages:checked.packages}],runtimes:rules.npmRuntimes};
const receiptPath=path.join(scratch,'app/resources/suite-inventory.json');fs.mkdirSync(path.dirname(receiptPath),{recursive:true});fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
const config={windowsApplication:bundle,seedProfile:profile,windowsStaging:scratch};
if(process.platform==='darwin'){
  const arch=process.arch,key=arch==='arm64'?'Arm64':'X64';
  const baseline=path.join(root,`build/ci-baseline-${arch}.zip`);
  await command('python3',[path.join(root,'automation/ci-mac-baseline.py'),bundle,baseline]);
  // The baseline owns the full core. The append builder only reads these two files.
  const appendCore=path.join(scratch,'append-core');fs.mkdirSync(path.join(appendCore,'lib'),{recursive:true});
  for(const file of ['package.json','lib/main.js'])fs.copyFileSync(path.join(payload,file),path.join(appendCore,file));
  config['macApp'+key]=appendCore;config['macBaseline'+key]=baseline;
  fs.rmSync(extracted,{recursive:true});
}
fs.writeFileSync(path.join(root,'inputs.local.json'),JSON.stringify(config,null,2));
console.log(`Prepared clean CI inputs for ${target}: ${plugins.length} plugins`);
