import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {command} from './ci-common.mjs';
import {suiteInstallPlan} from './templates/seed-profile-windows.js';
import {patchWindowsStartup} from './windows-startup.mjs';

test('Windows plugin preparation runs after Electron readiness and before host startup',async()=>{
  const source=patchWindowsStartup('app.whenReady().then(main);');
  const entry=source.replace('import {prepareSuite} from "./seed-profile.js";\n','');
  const calls=[];let ready;
  const app={whenReady:()=>new Promise(resolve=>{ready=resolve})};
  const run=Function('app','prepareSuite','main','return '+entry);
  const pending=run(app,async()=>{calls.push('prepare');return ()=>calls.push('cleanup')},()=>calls.push('main'));
  assert.deepEqual(calls,[]);ready();await pending;
  assert.deepEqual(calls,['prepare','main','cleanup']);
  assert.equal(patchWindowsStartup(source),source);
  assert.throws(()=>patchWindowsStartup('unsupported entry'),/Unsupported/);
});

test('Windows setup adds suite plugins to existing profiles without replacing user versions or disabled choices',()=>{
  const plugins=[{name:'existing'},{name:'new-plugin'}];
  const manifest={dependencies:{existing:'9.0.0','user-plugin':'1.0.0'},dsh:{profile:{bundles:['user-plugin']}}};
  assert.deepEqual(suiteInstallPlan(manifest,{links:{}},plugins,'C:/New install').map(p=>p.name),['new-plugin']);
  assert.deepEqual(manifest.dsh.profile.bundles,['user-plugin']);
  assert.equal(manifest.dependencies.existing,'9.0.0');
  assert.equal(suiteInstallPlan({}, {links:{}},plugins,'C:/New install').length,2);
});

test('moving an installation repairs only links still owned by the suite',()=>{
  const old='link:C:/Old install/node_modules/plugin',plugins=[{name:'plugin'}];
  const previous={links:{plugin:old}};
  assert.equal(suiteInstallPlan({dependencies:{plugin:old}},previous,plugins,'C:/New install').length,1);
  assert.deepEqual(suiteInstallPlan({dependencies:{plugin:'2.0.0'}},previous,plugins,'C:/New install'),[]);
});

const loader=fileURLToPath(new URL('./templates/seed-profile.js',import.meta.url));
test('first-run loader preserves an existing user profile even with a damaged seed',async()=>{
  const owned=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-seed-existing-'));
  try {
    const profile=path.join(owned,'home/profiles/desktop');fs.mkdirSync(profile,{recursive:true});
    const manifest='{"private":true,"dependencies":{"user-plugin":"1.0.0"}}\n';
    fs.writeFileSync(path.join(profile,'package.json'),manifest);
    fs.writeFileSync(path.join(profile,'account.txt'),'existing user account');
    fs.writeFileSync(path.join(owned,'seed-profile.zip'),'damaged zip');
    const entry=path.join(owned,'probe.mjs');
    fs.writeFileSync(entry,`process.resourcesPath=${JSON.stringify(owned)};await import(${JSON.stringify(pathToFileURL(loader).href)});`);
    await command(process.execPath,[entry],{env:{DSH_HOME:path.join(owned,'home')},capture:true});
    assert.equal(fs.readFileSync(path.join(profile,'package.json'),'utf8'),manifest);
    assert.equal(fs.readFileSync(path.join(profile,'account.txt'),'utf8'),'existing user account');
    assert.deepEqual(fs.readdirSync(profile).sort(),['account.txt','package.json']);
  } finally {fs.rmSync(owned,{recursive:true,force:true})}
});
test('a broken first-run archive fails without publishing a partial profile',async()=>{
  const owned=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-seed-broken-'));
  try {
    fs.writeFileSync(path.join(owned,'seed-profile.zip'),'damaged zip');
    const entry=path.join(owned,'probe.mjs');
    fs.writeFileSync(entry,`process.resourcesPath=${JSON.stringify(owned)};await import(${JSON.stringify(pathToFileURL(loader).href)});`);
    await assert.rejects(command(process.execPath,[entry],{env:{DSH_HOME:path.join(owned,'home')},capture:true}),/ZIP is incomplete/);
    assert.equal(fs.existsSync(path.join(owned,'home/profiles/desktop')),false);
  } finally {fs.rmSync(owned,{recursive:true,force:true})}
});
