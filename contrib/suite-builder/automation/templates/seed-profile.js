import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {inflateRawSync} from 'node:zlib';

// Seed only an empty profile. Existing account/configuration directories stay owned by the user.
const home=process.env.DSH_HOME?.trim()||path.join(os.homedir(),'.dsh');
const profile=path.join(home,'profiles','desktop');
const archive=path.join(process.resourcesPath,'seed-profile.zip');
const manifest=path.join(profile,'package.json');
const pristine=!fs.existsSync(manifest)&&(!fs.existsSync(profile)||fs.readdirSync(profile).length===0);
if(pristine&&fs.existsSync(archive)&&!fs.existsSync(path.join(profile,'.dsh-suite-seed-v1'))){
  const bytes=fs.readFileSync(archive);let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break}
  if(end<0)throw Error('Suite profile ZIP is incomplete');
  let ptr=bytes.readUInt32LE(end+16);const count=bytes.readUInt16LE(end+10);
  if(count===65535)throw Error('Suite profile ZIP64 entry count is not supported');
  const staging=profile+'.seed-'+process.pid;fs.mkdirSync(path.dirname(profile),{recursive:true});fs.mkdirSync(staging);
  try {
    for(let n=0;n<count;n++){
      if(bytes.readUInt32LE(ptr)!==0x02014b50)throw Error('Invalid suite ZIP directory');
      const method=bytes.readUInt16LE(ptr+10),size=bytes.readUInt32LE(ptr+20),raw=bytes.readUInt32LE(ptr+24);
      const length=bytes.readUInt16LE(ptr+28),extra=bytes.readUInt16LE(ptr+30),comment=bytes.readUInt16LE(ptr+32),mode=bytes.readUInt32LE(ptr+38)>>>16,offset=bytes.readUInt32LE(ptr+42);
      const name=bytes.subarray(ptr+46,ptr+46+length).toString('utf8').replaceAll('\\','/');ptr+=46+length+extra+comment;
      if(name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').includes('..')||(mode&0o170000)===0o120000)throw Error('Unsafe suite ZIP path');
      const dest=path.join(staging,...name.split('/').filter(Boolean));
      if(name.endsWith('/')){fs.mkdirSync(dest,{recursive:true});continue}
      const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);
      if(method!==0&&method!==8)throw Error('Unsupported suite ZIP compression');
      const data=bytes.subarray(start,start+size),content=method===0?data:inflateRawSync(data);
      if(content.length!==raw)throw Error('Invalid suite ZIP file length');
      fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);
      if(process.platform!=='win32')fs.chmodSync(dest,mode&0o777||0o644);
    }
    fs.writeFileSync(path.join(staging,'.dsh-suite-seed-v1'),'1\n');
    if(fs.existsSync(profile))fs.rmdirSync(profile);
    fs.renameSync(staging,profile);
  } finally {if(fs.existsSync(staging))fs.rmSync(staging,{recursive:true,force:true})}
}
