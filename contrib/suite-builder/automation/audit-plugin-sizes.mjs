import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertNoOrbVoiceModels} from './profile-guard.mjs';

export function treeBytes(root){
  if(!fs.existsSync(root))return 0;
  const stat=fs.lstatSync(root);
  if(stat.isSymbolicLink())return Buffer.byteLength(fs.readlinkSync(root));
  if(stat.isFile())return stat.size;
  return fs.readdirSync(root).reduce((sum,name)=>sum+treeBytes(path.join(root,name)),0);
}

export function auditPlugins(profile,names){
  const modules=path.join(profile,'node_modules'),buckets=new Map(),owners=new Map();
  for(const entry of fs.readdirSync(modules,{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    const names=entry.name.startsWith('@')?fs.readdirSync(path.join(modules,entry.name)).map(n=>entry.name+'/'+n):[entry.name];
    for(const name of names)buckets.set(name,treeBytes(path.join(modules,name)));
  }
  const inside=dir=>{const rel=path.relative(profile,dir);return rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)};
  const bucket=file=>{const rel=path.relative(modules,file);if(rel.startsWith('..')||path.isAbsolute(rel))return null;const parts=rel.split(path.sep);return parts[0].startsWith('@')?parts.slice(0,2).join('/'):parts[0]};
  function locate(name,from){for(let dir=from;inside(dir);dir=path.dirname(dir)){const file=path.join(dir,'node_modules',name,'package.json');if(fs.existsSync(file))return file;if(dir===profile)break}return null}
  const plugins=[];
  for(const name of names){
    const seen=new Set();
    function visit(file){
      file=fs.realpathSync(file);if(!inside(file))throw Error('Dependency escapes profile');
      if(seen.has(file))return;seen.add(file);
      const key=bucket(file);if(key){if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(name)}
      const pkg=JSON.parse(fs.readFileSync(file));
      const dependencies={...pkg.dependencies,...pkg.optionalDependencies,...pkg.peerDependencies};
      for(const dependency of Object.keys(dependencies)){const found=locate(dependency,path.dirname(file));if(found)visit(found)}
    }
    const manifest=path.join(modules,name,'package.json');visit(manifest);
    const pkg=JSON.parse(fs.readFileSync(manifest));plugins.push({name,version:pkg.version,ownAndPrivateBytes:buckets.get(name)||0});
  }
  for(const plugin of plugins){
    plugin.exclusiveDependencies=[];plugin.sharedReferences=[];
    for(const [name,set] of owners){if(name===plugin.name||!set.has(plugin.name))continue;const entry={name,bytes:buckets.get(name)||0};(set.size===1?plugin.exclusiveDependencies:plugin.sharedReferences).push(entry)}
    plugin.exclusiveDependencyBytes=plugin.exclusiveDependencies.reduce((n,p)=>n+p.bytes,0);
    plugin.sharedReferenceBytes=plugin.sharedReferences.reduce((n,p)=>n+p.bytes,0);
  }
  const shared=[],unassigned=[];
  for(const [name,bytes] of buckets){const set=owners.get(name);if(set?.size>1)shared.push({name,bytes,plugins:[...set]});else if(!set)unassigned.push({name,bytes})}
  const totalModuleBytes=[...buckets.values()].reduce((n,size)=>n+size,0);
  const countedBytes=plugins.reduce((n,p)=>n+p.ownAndPrivateBytes+p.exclusiveDependencyBytes,0)+shared.reduce((n,p)=>n+p.bytes,0)+unassigned.reduce((n,p)=>n+p.bytes,0);
  if(countedBytes!==totalModuleBytes)throw Error('Size attribution does not reconcile');
  return {plugins,shared,sharedBytes:shared.reduce((n,p)=>n+p.bytes,0),unassigned,totalModuleBytes};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const resources=path.resolve(process.argv[2]),profile=path.resolve(process.argv[3]);
  const receipt=JSON.parse(fs.readFileSync(path.join(resources,'suite-inventory.json')));
  assertNoOrbVoiceModels(profile);
  const result=auditPlugins(profile,receipt.plugins.map(p=>p.name));
  const deps=path.join(resources,'dependencies');
  result.externalRuntimes={codex:treeBytes(path.join(deps,'node_modules/@openai')),bun:treeBytes(path.join(deps,'node_modules/bun'))+treeBytes(path.join(deps,'node_modules/@oven')),larkCli:treeBytes(path.join(deps,'node_modules/@larksuite/cli')),orbElectron:treeBytes(path.join(deps,'orb-electron')),git:treeBytes(path.join(deps,'git')),mihomo:treeBytes(path.join(deps,'mihomo'))+treeBytes(path.join(deps,'bin/mihomo.exe'))};
  result.platform='win32-x64';result.measurement='Uncompressed physical file bytes; private bundled dependencies belong to their top-level plugin; shared profile dependencies counted once; host dependencies excluded';
  result.orbVoiceModelsBundled=false;
  fs.writeFileSync(process.argv[4],JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
