import {createRequire} from 'node:module';
import {fileURLToPath as moduleFilePath} from 'node:url';
import {dirname as moduleDirname} from 'node:path';
const require=createRequire(import.meta.url);
const __dirname=moduleDirname(moduleFilePath(import.meta.url));
// Static staging audit; never consult the developer's global npm/PATH.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const seed = path.resolve(process.argv[2] || path.join(root, 'seed-win'));
const resources = path.resolve(process.argv[3] || path.join(root,'app-win/resources'));
const manifest = JSON.parse(fs.readFileSync(path.join(seed,'package.json'),'utf8'));
const plugins = (manifest.dsh?.profile?.bundles || []).filter(name => !name.startsWith('@deepseek-ai/'));
let failures = 0;
const within = file => { const rel = path.relative(seed, file); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
function locate(name, from) {
  let dir = from;
  while (within(dir)) {
    const file = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
function record(ok, label) { console.log(`${ok ? 'OK' : 'MISSING'} ${label}`); if (!ok) failures++; }
const visited = new Set();
function walk(file) {
  const real = fs.realpathSync(file);
  if (!within(real)) { record(false, `dependency resolves outside staging: ${file}`); return; }
  if (visited.has(real)) return;
  visited.add(real);
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const name of Object.keys(pkg.dependencies || {})) {
    const found = locate(name, path.dirname(file));
    if (!found) record(false, `${pkg.name} -> ${name}`);
    else walk(found);
  }
}
for (const name of plugins) {
  const file = locate(name, seed);
  record(!!file, `plugin ${name}`);
  if (file) walk(file);
}
const im = locate('@xmanrui/dsh-im', seed);
if (im) {
  for (const name of ['sharp', '@matrix-org/olm', '@tencent-qqmail/agently-cli', '@tencent-qqmail/agently-cli-win32-x64']) {
    record(!!locate(name, path.dirname(im)), `IM runtime ${name} (Windows staging)`);
  }
  const wasm=locate('@matrix-org/olm',path.dirname(im));
  record(!!wasm && fs.existsSync(path.join(path.dirname(wasm),'olm.wasm')), 'Matrix olm WASM payload');
}
if(plugins.includes('dsh-our-free-model')) {
  const base=path.join(seed,'node_modules/dsh-our-free-model');
  const metadata=JSON.parse(fs.readFileSync(path.join(base,'vendor/magpie/engine.json'),'utf8'));
  const entry=metadata.binaries?.['win32-x64'];
  record(!!entry, 'Magpie Windows engine metadata');
  if(entry?.compressed)for(const part of entry.compressed.parts) {
    const file=path.resolve(base,part.path);
    const ok=within(file)&&fs.existsSync(file)&&fs.statSync(file).size===part.size&&crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===part.sha256;
    record(ok, 'Magpie compressed payload '+part.path);
  }
  else if(entry)record(fs.existsSync(path.join(base,'vendor/magpie',entry.path)), 'Magpie executable');
}
// A release must wire this runtime through DSH_ORB_ELECTRON_PATH as well.
if(plugins.includes('dsh-orb'))record(fs.existsSync(path.join(resources, 'dependencies/orb-electron/electron.exe')), 'bundled Orb Electron executable');
record(fs.existsSync(path.join(resources, 'runtime/primary-runtime/dependencies/node/bin/node.exe')), 'bundled Node');
console.log(`Checked ${visited.size} package manifests; ${failures} missing items. External CLI launch, peer services, native ABI, Magpie payload and macOS require separate verification.`);
process.exitCode = failures ? 1 : 0;
