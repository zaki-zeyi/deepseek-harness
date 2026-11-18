import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {command} from './ci-common.mjs';
import {hash} from './lib.mjs';

/**
 * Prepare a pinned portable compiler without registering a system installation or file associations.
 * @returns Path to the compiler executable after its cached files have been verified.
 */
export async function prepareInnoCompiler(){
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('The Windows compiler requires Windows x64');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const pin=JSON.parse(fs.readFileSync(new URL('./installer-toolchain.json',import.meta.url)));
  const target=path.join(root,'tools/inno7'),compiler=path.join(target,'ISCC.exe'),receiptFile=path.join(target,'suite-toolchain.json');
  const required=['ISCC.exe','ISCmplr.dll','ISPP.dll','Setup.e64','islzma-x64.dll'];
  if(fs.existsSync(receiptFile)){
    const receipt=JSON.parse(fs.readFileSync(receiptFile));
    if(receipt.installerSha256===pin.sha256&&await Promise.all(required.map(async name=>fs.existsSync(path.join(target,name))&&await hash(path.join(target,name))===receipt.files[name])).then(results=>results.every(Boolean)))return compiler;
  }
  const setup=path.join(root,pin.cache);fs.mkdirSync(path.dirname(setup),{recursive:true});
  if(!fs.existsSync(setup)||await hash(setup)!==pin.sha256){
    const partial=setup+'.partial-'+process.pid;
    try{
      const response=await fetch(pin.url,{signal:AbortSignal.timeout(20*60*1000)});if(!response.ok)throw Error('Compiler download HTTP '+response.status);
      await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(partial));
      if(await hash(partial)!==pin.sha256)throw Error('Compiler SHA-256 mismatch');
      fs.renameSync(partial,setup);
    }finally{if(fs.existsSync(partial))fs.unlinkSync(partial)}
  }
  await command(setup,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/CURRENTUSER','/PORTABLE=1','/NOICONS','/TASKS=','/DIR='+target],{timeout:120000});
  const verified={};for(const name of required){if(!fs.existsSync(path.join(target,name)))throw Error('Incomplete portable compiler: '+name);verified[name]=await hash(path.join(target,name))}
  fs.writeFileSync(receiptFile,JSON.stringify({version:pin.version,installerSha256:pin.sha256,files:verified},null,2));return compiler;
}
