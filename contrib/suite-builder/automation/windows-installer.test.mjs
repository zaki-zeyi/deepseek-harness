import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {command} from './ci-common.mjs';

test('offline installer verification passes an unquoted final NSIS directory and rejects child failure', {skip:process.platform!=='win32'}, async()=>{
  const owned=fs.mkdtempSync(path.join(os.tmpdir(),'DSH 安装测试 '));
  try {
    const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    fs.writeFileSync(path.join(owned,'Child.cs'),`using System;using System.IO;class Child{static int Main(){var raw=Environment.CommandLine;var at=raw.IndexOf(" /S /D=",StringComparison.Ordinal);if(at<0)return 8;var dir=raw.Substring(at+7);if(dir.Contains("\\\""))return 9;Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"arguments.txt"),raw);File.WriteAllText(Path.Combine(dir,"DeepSeek Harness Suite.exe"),"fixture");return Environment.GetEnvironmentVariable("DSH_SETUP_TEST_EXIT")=="7"?7:0;}}`);
    await command(compiler,['/nologo','/target:winexe','/out:Child.exe','Child.cs'],{cwd:owned,capture:true});
    const payload=path.join(owned,'Child.exe');
    const destination=path.join(owned,'自定义 目录','Harness Suite');
    const powershell=path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe');
    const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./windows-install.ps1',import.meta.url)),payload,destination];
    await command(powershell,args,{capture:true});
    assert.ok(fs.readFileSync(path.join(destination,'arguments.txt'),'utf8').endsWith('/S /D='+destination));
    await assert.rejects(command(powershell,args,{env:{DSH_SETUP_TEST_EXIT:'7'},capture:true}),/Installer exited 7/);
  } finally {fs.rmSync(owned,{recursive:true,force:true})}
});

test('Inno installer verification preserves a quoted Unicode directory and reports child failure',{skip:process.platform!=='win32'},async()=>{
  const owned=fs.mkdtempSync(path.join(os.tmpdir(),'DSH Inno 参数 '));
  try{
    const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    fs.writeFileSync(path.join(owned,'Child.cs'),`using System;using System.IO;class Child{static int Main(string[] args){var spec=Array.Find(args,a=>a.StartsWith("/DIR="));if(spec==null||Array.IndexOf(args,"/VERYSILENT")<0)return 8;var dir=spec.Substring(5);Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"arguments.txt"),Environment.CommandLine);File.WriteAllText(Path.Combine(dir,"DeepSeek Harness Suite.exe"),"fixture");return Environment.GetEnvironmentVariable("DSH_SETUP_TEST_EXIT")=="7"?7:0;}}`);
    await command(compiler,['/nologo','/target:winexe','/out:Child.exe','Child.cs'],{cwd:owned,capture:true});
    const destination=path.join(owned,'中文 自定义位置','Harness Suite'),powershell=path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe');
    const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./windows-install.ps1',import.meta.url)),path.join(owned,'Child.exe'),destination,'-Engine','inno'];
    await command(powershell,args,{capture:true});
    assert.ok(fs.readFileSync(path.join(destination,'arguments.txt'),'utf8').endsWith('/DIR="'+destination+'"'));
    await assert.rejects(command(powershell,args,{env:{DSH_SETUP_TEST_EXIT:'7'},capture:true}),/Installer exited 7/);
  }finally{fs.rmSync(owned,{recursive:true,force:true})}
});
