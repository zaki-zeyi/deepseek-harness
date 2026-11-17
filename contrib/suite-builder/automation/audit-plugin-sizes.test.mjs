import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {auditPlugins} from './audit-plugin-sizes.mjs';
import {assertNoOrbVoiceModels} from './profile-guard.mjs';

test('shared dependencies count once while private bundled files stay with their plugin',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'plugin-size-'));
  function pkg(name,dependencies={},data='x'){
    const dir=path.join(root,'node_modules',name);fs.mkdirSync(dir,{recursive:true});
    const manifest=JSON.stringify({name,version:'1.0.0',dependencies});
    fs.writeFileSync(path.join(dir,'package.json'),manifest);fs.writeFileSync(path.join(dir,'data'),data);
    return Buffer.byteLength(manifest)+Buffer.byteLength(data);
  }
  try{
    const a=pkg('a',{shared:'1',unique:'1'}),b=pkg('b',{shared:'1'}),shared=pkg('shared',{},'shared bytes'),unique=pkg('unique',{},'unique bytes');
    const privateDir=path.join(root,'node_modules/a/node_modules/private');fs.mkdirSync(privateDir,{recursive:true});fs.writeFileSync(path.join(privateDir,'blob'),'private');
    const result=auditPlugins(root,['a','b']);
    assert.equal(result.sharedBytes,shared);assert.equal(result.plugins[0].exclusiveDependencyBytes,unique);
    assert.equal(result.plugins[0].ownAndPrivateBytes,a+7);assert.equal(result.plugins[1].ownAndPrivateBytes,b);
    assert.equal(result.totalModuleBytes,a+b+shared+unique+7);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('voice libraries are retained but packaged model weights are rejected',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'orb-model-policy-'));
  try{
    const dir=path.join(root,'node_modules/dsh-orb/node_modules/sherpa-onnx-win-x64');fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'onnxruntime.dll'),'library');assert.doesNotThrow(()=>assertNoOrbVoiceModels(root));
    fs.writeFileSync(path.join(dir,'model.onnx'),'model');assert.throws(()=>assertNoOrbVoiceModels(root),/user opt-in/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
