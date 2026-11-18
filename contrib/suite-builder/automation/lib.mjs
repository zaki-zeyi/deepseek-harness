import {createRequire} from 'node:module';
import {fileURLToPath as moduleFilePath} from 'node:url';
import {dirname as moduleDirname} from 'node:path';
const require=createRequire(import.meta.url);
const __dirname=moduleDirname(moduleFilePath(import.meta.url));
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function parseList(text) {
  const blocks = [...text.matchAll(/```dsh-plugins\s*\r?\n([\s\S]*?)```/g)];
  if (blocks.length !== 1) throw Error('列表必须包含且只包含一个 ```dsh-plugins 代码块');
  const entries = blocks[0][1].split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  if (!entries.length) throw Error('插件列表为空');
  if (new Set(entries).size !== entries.length) throw Error('插件列表有重复项');
  for (const value of entries) if (!/^(seed:)?(@[\w.-]+\/)?[\w.-]+(@[\w.+-]+)?$/.test(value) && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:#readme)?\/?$/.test(value)) throw Error(`不支持的插件输入：${value}`);
  return entries;
}
function hash(file) { return new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('data', b => h.update(b)).on('end', () => resolve(h.digest('hex'))).on('error', reject); }); }
function inside(root, file) { const rel = path.relative(root, file); return rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); }
function files(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : e.isFile() ? [path.join(dir,e.name)] : []); }
export { parseList, hash, inside, files };
