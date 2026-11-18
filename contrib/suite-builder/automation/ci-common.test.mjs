import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {verifiedInput,assertRunner,command} from './ci-common.mjs';

test('rejects a wrong runner before fetching platform binaries',()=>{
  assert.throws(()=>assertRunner('darwin-arm64','win32','x64'),/does not match/);
  assertRunner('darwin-x64','darwin','x64');
});
test('checksum failure removes the partial input and never publishes a destination',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'suite-input-'));
  try{
    const dest=path.join(dir,'desktop.zip'),bytes=Buffer.from('trusted input');
    const input={url:'https://download.deepseek.com/desktop.zip',sha512:crypto.createHash('sha512').update(bytes).digest('base64')};
    await assert.rejects(verifiedInput(input,dest,async()=>new Response('different bytes')),/SHA-512 mismatch/);
    assert.deepEqual(fs.readdirSync(dir),[]);
    await verifiedInput(input,dest,async()=>new Response(bytes));
    assert.equal(fs.readFileSync(dest,'utf8'),'trusted input');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('a failed subprocess is reported after its observed exit',async()=>{
  await assert.rejects(command(process.execPath,['-e','process.exit(7)'],{capture:true}),/failed 7/);
});
