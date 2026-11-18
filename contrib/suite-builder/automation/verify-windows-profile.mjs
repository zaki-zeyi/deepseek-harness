import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import verifyHost from './verify-host.mjs';

/** Exercise first registration and existing-profile upgrades against the packaged host. */
export async function verifyWindowsProfiles({resources,payload,node,plugins,env}){
  const {initializeSuite}=await import(pathToFileURL(path.join(payload,'lib/seed-profile.js')).href);
  const owned=fs.mkdtempSync(path.join(os.tmpdir(),'DSH profile acceptance '));
  const carrier=createRequire(path.join(payload,'dsh/package.json'));
  const boot=await import(pathToFileURL(carrier.resolve('@deepseek-ai/dsh-app-boot')).href);
  const checks=[];
  try {
    for(const scenario of ['fresh','existing']){
      const home=path.join(owned,scenario),profile=path.join(home,'profiles/desktop');
      fs.mkdirSync(profile,{recursive:true});
      fs.writeFileSync(path.join(profile,'account-sentinel.txt'),'user account preserved');
      if(scenario==='existing'){
        boot.initProfile(profile,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']);
        const existing=plugins.find(p=>p.name==='dsh-brand');
        await initializeSuite(resources,home);
        const manifest=JSON.parse(fs.readFileSync(path.join(profile,'package.json'),'utf8'));
        boot.writeProfileBundles(profile,manifest,manifest.dsh.profile.bundles.filter(name=>name!==existing.name));
        // The official manager removes one bundle to model an older suite installation.
        const {runProfilePnpm}=await import(pathToFileURL(carrier.resolve('@deepseek-ai/dsh-plugin-manager/operations')).href);
        const result=await runProfilePnpm({profile:'desktop',dir:profile,installAnchor:path.join(payload,'dsh/package.json'),cwd:profile},['remove','dsh-codex-subscription','--config.offline=true','--config.ignore-scripts=true'],
          {execution:'service',command:node,args:[path.join(resources,'runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs')],env:{...env,DSH_HOME:home,CI:'true'},outputBytes:8192,lockWaitMs:120000,idleTimeoutMs:120000});
        if(result.exitCode!==0)throw Error(result.output);
      }
      const started=performance.now();await initializeSuite(resources,home);
      const firstMs=Math.round(performance.now()-started);
      const manifestFile=path.join(profile,'package.json'),saved=fs.readFileSync(manifestFile,'utf8');
      const manifest=JSON.parse(saved);
      for(const {name} of plugins){
        assert.ok(manifest.dependencies[name],scenario+': missing dependency '+name);
        assert.ok(fs.existsSync(path.join(profile,'node_modules',name,'package.json')),scenario+': broken link '+name);
        assert.equal(manifest.dsh.profile.bundles.includes(name),!(scenario==='existing'&&name==='dsh-brand'),scenario+': unexpected enablement '+name);
      }
      assert.equal(fs.readFileSync(path.join(profile,'account-sentinel.txt'),'utf8'),'user account preserved');
      const warmStart=performance.now();await initializeSuite(resources,home);
      assert.equal(fs.readFileSync(manifestFile,'utf8'),saved);
      checks.push({name:'suite-profile-'+scenario,status:'passed',registrationMs:firstMs,warmRegistrationMs:Math.round(performance.now()-warmStart)});
      if(scenario==='existing'){
        const relocated=path.join(owned,'安装位置 变更','resources');
        fs.mkdirSync(relocated,{recursive:true});
        for(const name of ['app','runtime','seed-profile'])fs.symlinkSync(path.join(resources,name),path.join(relocated,name),'junction');
        fs.copyFileSync(path.join(resources,'suite-inventory.json'),path.join(relocated,'suite-inventory.json'));
        await initializeSuite(relocated,home);
        const moved=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
        for(const {name} of plugins)assert.equal(moved.dependencies[name],'link:'+path.join(relocated,'seed-profile/node_modules',name).replaceAll('\\','/'));
        assert.ok(!moved.dsh.profile.bundles.includes('dsh-brand'));
        assert.equal(fs.readFileSync(path.join(profile,'account-sentinel.txt'),'utf8'),'user account preserved');
        checks.push({name:'suite-profile-existing-relocation',status:'passed'});
      }
      const host=await verifyHost({node,payload,resources,profile,plugins,env:{...env,DSH_HOME:home},logFile:path.join(owned,scenario+'-host.log')});
      checks.push(...host.map(check=>({...check,name:scenario+'-'+check.name})));
      console.log('Verified '+scenario+' suite profile; registration '+firstMs+' ms');
    }
    return checks;
  } finally {fs.rmSync(owned,{recursive:true,force:true})}
}
