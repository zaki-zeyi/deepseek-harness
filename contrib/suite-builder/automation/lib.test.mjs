import {createRequire} from 'node:module';
import {fileURLToPath as moduleFilePath} from 'node:url';
import {dirname as moduleDirname} from 'node:path';
const require=createRequire(import.meta.url);
const __dirname=moduleDirname(moduleFilePath(import.meta.url));
const {test}=require('node:test');
const assert=require('node:assert/strict');
import {parseList,inside} from './lib.mjs';
test('accept repository and scoped pinned package while ignoring prose',()=>{
  assert.deepEqual(parseList('说明\n```dsh-plugins\nhttps://github.com/WSL043/dsh-codex-subscription#readme\n@scope/plugin@1.2.3\nseed:dsh-orb\n```'),['https://github.com/WSL043/dsh-codex-subscription#readme','@scope/plugin@1.2.3','seed:dsh-orb']);
});
test('reject command injection, empty and ambiguous lists',()=>{
  for(const body of ['x;whoami','x$(whoami)','../package','https://example.com/file'])assert.throws(()=>parseList('```dsh-plugins\n'+body+'\n```'));
  assert.throws(()=>parseList('普通 README'));
  assert.throws(()=>parseList('```dsh-plugins\n```'));
  assert.throws(()=>parseList('```dsh-plugins\nx\nx\n```'));
});
test('staging boundary rejects parents and sibling prefixes',()=>{
  assert.equal(!!inside('C:/build/run','C:/build/run/package'),true);
  assert.equal(!!inside('C:/build/run','C:/build/run-other/package'),false);
  assert.equal(!!inside('C:/build/run','C:/build/run/../secret'),false);
});
