import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {inputPath} from './inputs.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(inputPath('windowsApplication','app-win'),'resources/runtime/primary-runtime/dependencies/python/python.exe');
if(!fs.existsSync(python))throw Error('Prepared desktop Python is missing; configure windowsApplication in inputs.local.json');
for(const file of ['build_macos.py','verify_macos.py']){
  const code=await new Promise((resolve,reject)=>{const child=spawn(python,['-u',path.join(root,'automation',file)],{cwd:root,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',resolve);});
  if(code!==0){process.exitCode=code||1;break;}
}
