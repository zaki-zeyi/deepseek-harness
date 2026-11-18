import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {command} from './ci-common.mjs';
import {prepareInnoCompiler} from './inno-toolchain.mjs';
import {innoLegacyMigrationCode} from './windows-inno.mjs';

/**
 * Exercise migration code with isolated registry identities and temporary application folders.
 * @returns A native acceptance result for matching, foreign and different-directory legacy installations.
 */
export async function verifyInnoMigration(){
  if(process.platform!=='win32')throw Error('Migration acceptance requires Windows');
  const compiler=await prepareInnoCompiler(),owned=fs.mkdtempSync(path.join(os.tmpdir(),'DSH Inno migration '));
  const guid=randomUUID(),id='DSH.MigrationProbe.'+randomUUID(),a=path.join(owned,'existing A'),b=path.join(owned,'existing B');
  const powershell=path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const helper=fileURLToPath(new URL('./migration-probe.ps1',import.meta.url));
  const registry=(mode,root=a)=>command(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode',mode,'-Guid',guid,'-AppRoot',root],{capture:true});
  let installed;
  function legacy(root,appId='com.deepseek.dsh.suite'){
    fs.mkdirSync(path.join(root,'resources/app'),{recursive:true});
    fs.writeFileSync(path.join(root,'resources/app/package.json'),JSON.stringify({dshDesktopAppId:appId},null,2));
    fs.writeFileSync(path.join(root,'DeepSeek Harness Suite.exe'),'inert probe fixture');
    fs.writeFileSync(path.join(root,'Uninstall DeepSeek Harness Suite.exe'),'inert legacy fixture');
    fs.writeFileSync(path.join(root,'migration-probe-owner.json'),JSON.stringify({guid}));
  }
  try{
    const payload=path.join(owned,'proof.txt'),script=path.join(owned,'probe.iss');fs.writeFileSync(payload,'migration proof');
    fs.writeFileSync(script,'\uFEFF'+`[Setup]\nAppId=${id}\nAppName=DSH migration probe\nAppVersion=1.0\nDefaultDirName={code:SuiteDefaultDir}\nPrivilegesRequired=lowest\nSetupArchitecture=x64\nArchitecturesInstallIn64BitMode=x64compatible\nOutputDir=${owned}\nOutputBaseFilename=probe\n[Files]\nSource: "${payload}"; DestDir: "{app}"\n${innoLegacyMigrationCode(guid)}\nfunction InitializeSetup: Boolean;\nvar Expected: String;\nbegin\n Expected := ExpandConstant('{param:expectdefault|}');\n if Expected = 'standard' then Expected := ExpandConstant('{localappdata}\\Programs\\DeepSeek Harness Suite');\n if CompareText(SuiteDefaultDir(''), Expected) <> 0 then RaiseException('Unexpected default installation directory');\n Result := True;\nend;\n`);
    await command(compiler,['--quiet','--no-ide-signtools',script],{capture:true});
    const run=async(root,expected)=>{await command(path.join(owned,'probe.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/SP-','/DIR='+root,'/EXPECTDEFAULT='+expected],{capture:true,timeout:120000});installed=root;if(fs.readFileSync(path.join(root,'proof.txt'),'utf8')!=='migration proof')throw Error('Probe install failed')};
    legacy(a);await registry('create',a);await run(a,a);await registry('removed',a);
    legacy(b,'unrelated.application');await registry('create',b);await run(b,'standard');await registry('preserved',b);await registry('cleanup',b);
    legacy(b);await registry('create',b);await run(a,b);await registry('preserved',b);await registry('cleanup',b);
    return {name:'inno-legacy-installation-migration',status:'passed',sameDirectoryMigrated:true,foreignPackagePreserved:true,differentDirectoryPreserved:true};
  }finally{
    try{await registry('cleanup',a)}finally{
      if(installed&&fs.existsSync(path.join(installed,'unins000.exe')))await command(path.join(installed,'unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],{capture:true,timeout:120000});
      if(path.dirname(path.resolve(owned))!==path.resolve(os.tmpdir())||!path.basename(owned).startsWith('DSH Inno migration '))throw Error('Unexpected migration probe cleanup path');
      fs.rmSync(owned,{recursive:true,force:true,maxRetries:5,retryDelay:500});
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await verifyInnoMigration(),null,2));
