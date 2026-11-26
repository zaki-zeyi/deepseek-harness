import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';

/** Run one owned child and settle only after its exit. */
export function command(executable,args,{cwd,env,timeout=30*60*1000,capture=false}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='',timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
    child.stdout.on('data',b=>{output+=b;if(!capture)process.stdout.write(b)});
    child.stderr.on('data',b=>{output+=b;if(!capture)process.stderr.write(b)});
    child.once('error',error=>{clearTimeout(timer);reject(error)});
    child.once('close',code=>{clearTimeout(timer);if(timedOut||code!==0)reject(Error(`${executable} failed ${timedOut?'(timeout)':code}: ${output.slice(-3000)}`));else resolve(output)});
  });
}

/** Find npm's JS entry beside an official Node installation. */
export function npmCli() {
  const bin=path.dirname(fs.realpathSync(process.execPath));
  const candidates=[process.env.npm_execpath,path.join(bin,'node_modules/npm/bin/npm-cli.js'),path.join(bin,'../lib/node_modules/npm/bin/npm-cli.js')];
  const selected=candidates.find(p=>p&&fs.existsSync(p));
  if(!selected)throw Error('Install Node with npm before running the suite builder');
  return selected;
}

/** Fetch a pinned desktop input; a mismatched digest never becomes a usable input. */
export async function verifiedInput(input,destination,fetcher=fetch) {
  if(!/^https:\/\/download\.deepseek\.com\//.test(input.url)||Buffer.from(input.sha512,'base64').length!==64)throw Error('Invalid pinned official desktop input');
  const check=async file=>{const h=crypto.createHash('sha512');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('base64')===input.sha512};
  if(fs.existsSync(destination)&&await check(destination))return destination;
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const partial=destination+'.partial-'+process.pid;
  try {
    const response=await fetcher(input.url,{signal:AbortSignal.timeout(10*60*1000)});
    if(!response.ok)throw Error(`Desktop download failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(partial,{flags:'wx'}));
    if(!await check(partial))throw Error('Desktop SHA-512 mismatch');
    fs.renameSync(partial,destination);return destination;
  } finally {if(fs.existsSync(partial))fs.unlinkSync(partial)}
}

/** Reject a runner that would produce the wrong platform's binaries. */
export function assertRunner(target,platform=process.platform,arch=process.arch) {
  if(!['win32-x64','darwin-arm64','darwin-x64'].includes(target)||target!==`${platform}-${arch}`)throw Error(`Runner ${platform}-${arch} does not match ${target}`);
}
