import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {command} from './ci-common.mjs';

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
