import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {innoFileEntries} from './windows-inno.mjs';

test('identical executable aliases share archive content and retain separate installation names',async()=>{
  const owned=fs.mkdtempSync(path.join(os.tmpdir(),'DSH Inno 文件 '));
  try{
    const binaries=path.join(owned,'runtime');fs.mkdirSync(binaries);
    const canonical=path.join(binaries,'bun.exe');
    fs.writeFileSync(canonical,'identical native executable');fs.copyFileSync(canonical,path.join(binaries,'bunx.exe'));
    const literal=path.join(owned,'pkg{literal}');fs.mkdirSync(literal);fs.writeFileSync(path.join(literal,'module.js'),'distinct module');
    const {rows,stats}=await innoFileEntries(owned);
    assert.equal(stats.files,3);assert.equal(stats.uniqueFiles,2);assert.equal(stats.mergedFiles,1);
    assert.equal(stats.avoidedBytes,fs.statSync(canonical).size);
    assert.equal(rows.filter(row=>row.includes('Source: "'+canonical+'";')).length,2);
    assert.ok(rows.some(row=>row.includes('DestName: "bunx.exe"')));
    assert.ok(rows.some(row=>row.includes('pkg{{literal}')));
  }finally{fs.rmSync(owned,{recursive:true,force:true})}
});
