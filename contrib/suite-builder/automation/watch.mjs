import {createRequire} from 'node:module';
import {fileURLToPath as moduleFilePath} from 'node:url';
import {dirname as moduleDirname} from 'node:path';
const require=createRequire(import.meta.url);
const __dirname=moduleDirname(moduleFilePath(import.meta.url));
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
import { parseList } from './lib.mjs';
const root = path.resolve(__dirname, '..');
const file = path.resolve(root, process.argv[2] || 'plugins.md');
let current = JSON.stringify(parseList(fs.readFileSync(file, 'utf8')));
let running = false, pending = false;
async function build() {
  if (running) { pending = true; return; }
  running = true;
  const child = spawn(process.execPath, [path.join(__dirname,'build.mjs'), '--list', file], {stdio:'inherit', windowsHide:true});
  const code = await new Promise(r => { child.on('error', e => { console.error(e); r(1); }); child.on('close',r); });
  console.log(code === 0 ? '构建完成，等待下一次修改。' : '构建失败，检查报告后修改列表重试。');
  running = false;
  if (pending) { pending = false; build(); }
}
console.log(`正在监听 ${file}；保存插件列表会自动构建。按 Ctrl+C 停止。`);
fs.watchFile(file,{interval:1000}, () => {
  try {
    const next = JSON.stringify(parseList(fs.readFileSync(file,'utf8')));
    if (next !== current) { current = next; build(); }
  } catch (e) { console.error(e.message); }
});
