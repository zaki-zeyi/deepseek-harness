import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

/** Voice model weights are downloaded only after the user opts in. */
export function assertNoOrbVoiceModels(profile){
  const root=path.join(profile,'node_modules/dsh-orb');
  if(!fs.existsSync(root))return;
  function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isDirectory())scan(file);
    else if(/\.(onnx|tflite|safetensors|gguf|pt|pth)$/i.test(item.name))throw Error('Orb voice models must be user opt-in downloads: '+path.relative(root,file));
  }}
  scan(root);
}

/** Check the native profile before any platform is allowed to package it. */
export function checkProfile({profile,runtime,plugins,rules,semver}) {
  assertNoOrbVoiceModels(profile);
  const within=file=>{const rel=path.relative(profile,file);return rel!== '..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)};
  function locate(name,from){let dir=from;while(within(dir)){const file=path.join(dir,'node_modules',name,'package.json');if(fs.existsSync(file))return file;const next=path.dirname(dir);if(next===dir)break;dir=next}return null}
  const visited=new Set(),warnings=[];
  function walk(file,legacy){
    const real=fs.realpathSync(file);if(!within(real))throw Error('Dependency resolves outside the prepared profile');
    if(visited.has(real))return;visited.add(real);
    const pkg=JSON.parse(fs.readFileSync(file));
    for(const name of Object.keys(pkg.dependencies||{})){const found=locate(name,path.dirname(file));if(!found)throw Error(`Missing dependency ${pkg.name} -> ${name}`);walk(found,legacy)}
    for(const [name,range] of Object.entries(pkg.peerDependencies||{})){
      const candidate=locate(name,path.dirname(file))||path.join(runtime,'node_modules',name,'package.json');
      if(!fs.existsSync(candidate)){if(!pkg.peerDependenciesMeta?.[name]?.optional)throw Error(`Missing peer ${pkg.name} -> ${name}`);continue}
      const version=JSON.parse(fs.readFileSync(candidate)).version;
      if(!semver.satisfies(version,range,{includePrerelease:true})){
        if(!legacy)throw Error(`Peer mismatch ${pkg.name}: ${name}@${version} does not satisfy ${range}`);
        warnings.push({plugin:pkg.name,peer:name,version,range});
      }
    }
  }
  for(const plugin of plugins){
    const directory=path.join(profile,'node_modules',plugin.name),manifest=path.join(directory,'package.json');
    walk(manifest,plugin.seed);
    const evidence=[];
    function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(['node_modules','.git','assets','locale','tests','test'].includes(entry.name))continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())scan(file);
      else if(/\.(js|mjs|cjs|ts|md)$/.test(file)&&fs.statSync(file).size<8e6&&/child_process|\b(?:spawn|execFile)\s*\(|electron-runtime|playwright|puppeteer|download(?:Runtime|Binary|Model)/i.test(fs.readFileSync(file,'utf8')))evidence.push(path.relative(directory,file));
    }}
    scan(directory);plugin.externalProcessEvidence=evidence;
    if(evidence.length&&!rules.reviewedVersions[plugin.name]?.includes(plugin.version))throw Error(`External runtime adapter required for ${plugin.name}@${plugin.version}: ${evidence.slice(0,5).join(', ')}`);
    // Resolve through the same profile anchor used by the host rather than the build machine.
    createRequire(manifest).resolve(plugin.name);
  }
  return {packages:visited.size,legacyPeerWarnings:warnings};
}
