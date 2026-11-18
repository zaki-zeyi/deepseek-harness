import fs from 'node:fs';
import path from 'node:path';
import {command} from './ci-common.mjs';
import {files,hash,inside} from './lib.mjs';

const literal=value=>value.replaceAll('{','{{');
const legacyGuid='300b6a8d-07ad-5ad6-95e0-3aeba88c5a0d';

/**
 * Preserve the former per-user installation directory and retire its registration after a successful same-directory update.
 * @param guid Legacy application identity; native probes supply an isolated identity.
 * @returns Inno Pascal code restricted to the legacy Suite identity and matching application directory.
 */
export function innoLegacyMigrationCode(guid=legacyGuid){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid))throw Error('Invalid legacy application identity');
  return `[Code]
function LegacySuiteDir: String;
var OldDir, OldCommand, Expected: String; PackageText: AnsiString;
begin
  Result := '';
  if not RegQueryStringValue(HKCU, 'Software\\${guid}', 'InstallLocation', OldDir) then exit;
  OldDir := RemoveBackslashUnlessRoot(OldDir);
  if not FileExists(OldDir + '\\DeepSeek Harness Suite.exe') then exit;
  if not LoadStringFromFile(OldDir + '\\resources\\app\\package.json', PackageText) then exit;
  if Pos('"dshDesktopAppId": "com.deepseek.dsh.suite"', String(PackageText)) = 0 then exit;
  if not RegQueryStringValue(HKCU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}', 'UninstallString', OldCommand) then exit;
  Expected := '"' + OldDir + '\\Uninstall DeepSeek Harness Suite.exe"';
  if (CompareText(OldCommand, Expected) <> 0) and (CompareText(OldCommand, Expected + ' /currentuser') <> 0) then exit;
  Result := OldDir;
end;

function SuiteDefaultDir(Param: String): String;
begin
  Result := LegacySuiteDir;
  if Result = '' then Result := ExpandConstant('{localappdata}\\Programs\\DeepSeek Harness Suite');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var OldDir, OldUninstaller: String;
begin
  if CurStep <> ssPostInstall then exit;
  OldDir := LegacySuiteDir;
  if (OldDir = '') or (CompareText(OldDir, RemoveBackslashUnlessRoot(ExpandConstant('{app}'))) <> 0) then exit;
  if not FileExists(ExpandConstant('{uninstallexe}')) then exit;
  OldUninstaller := OldDir + '\\Uninstall DeepSeek Harness Suite.exe';
  if FileExists(OldUninstaller) and not DeleteFile(OldUninstaller) then exit;
  RegDeleteKeyIncludingSubkeys(HKCU, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}');
  RegDeleteKeyIncludingSubkeys(HKCU, 'Software\\${guid}');
end;
`}

/**
 * Store identical source bytes once while retaining every installed destination.
 * @param app Prepared application directory.
 * @returns Compiler rows and counts for the payload content that is stored once.
 */
export async function innoFileEntries(app){
  const entries=files(app).sort(),digests=new Array(entries.length);let next=0;
  await Promise.all(Array.from({length:8},async()=>{while(next<entries.length){const index=next++;digests[index]=await hash(entries[index])}}));
  const canonical=new Map(),rows=[],duplicates=[];let totalBytes=0,avoidedBytes=0;
  for(let index=0;index<entries.length;index++){
    const file=entries[index],relative=path.relative(app,file),bytes=fs.statSync(file).size;
    if(!inside(app,file)||relative.includes('"')||/[\r\n]/.test(relative))throw Error('Invalid installer source path');
    const key=bytes+':'+digests[index],source=canonical.get(key)||file;canonical.set(key,source);totalBytes+=bytes;
    if(source!==file){avoidedBytes+=bytes;duplicates.push({source:path.relative(app,source),destination:relative,bytes})}
    const dir=path.dirname(relative),destination=dir==='.'?'{app}':'{app}\\'+literal(dir);
    rows.push(`Source: "${literal(source)}"; DestDir: "${destination}"; DestName: "${literal(path.basename(file))}"; Flags: ignoreversion`);
  }
  return {rows,stats:{files:entries.length,uniqueFiles:canonical.size,totalBytes,avoidedBytes,mergedFiles:duplicates.length,largestMerges:duplicates.sort((a,b)=>b.bytes-a.bytes).slice(0,20)}};
}

/**
 * Compile a self-contained Windows installer with native long-path installation and removal.
 * @param options Prepared application, output directory, version and pinned compiler path.
 * @returns Artifact path, digest, compiler version and payload deduplication counts.
 */
export async function buildWindowsInno(options){
  const {version}=options;const app=path.resolve(options.app),out=path.resolve(options.out),compiler=path.resolve(options.compiler);
  const compilerVersion=(await command(compiler,['--version'],{capture:true})).trim();
  if(compilerVersion!=='7.1.1')throw Error('Expected pinned Inno Setup 7.1.1, got '+compilerVersion);
  fs.mkdirSync(out,{recursive:true});
  const {rows,stats}=await innoFileEntries(app);
  const entriesFile=path.join(out,'payload-files.iss'),script=path.join(out,'installer.iss');
  fs.writeFileSync(entriesFile,'\uFEFF'+rows.join('\n')+'\n');
  const filename=`DeepSeek-Harness-Suite-${version}-win-x64`;
  fs.writeFileSync(script,'\uFEFF'+`[Setup]
AppId=com.deepseek.dsh.suite
AppName=DeepSeek Harness Suite
AppVersion=${version}
AppPublisher=DeepSeek Harness community
DefaultDirName={code:SuiteDefaultDir}
DefaultGroupName=DeepSeek Harness Suite
PrivilegesRequired=lowest
SetupArchitecture=x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableDirPage=no
DisableProgramGroupPage=yes
UsePreviousLanguage=no
WizardStyle=modern
Compression=lzma2/ultra64
LZMADictionarySize=131072
LZMABlockSize=262144
LZMANumBlockThreads=2
CompressionThreads=2
SolidCompression=yes
MergeDuplicateFiles=yes
CloseApplications=yes
RestartApplications=no
SetupMutex=${legacyGuid}
OutputDir=${out}
OutputBaseFilename=${filename}
UninstallDisplayName=DeepSeek Harness Suite
UninstallDisplayIcon={app}\\DeepSeek Harness Suite.exe
[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
#include "${entriesFile}"
[Icons]
Name: "{autoprograms}\\DeepSeek Harness Suite"; Filename: "{app}\\DeepSeek Harness Suite.exe"; WorkingDir: "{app}"; AppUserModelID: "com.deepseek.dsh.suite"
Name: "{autodesktop}\\DeepSeek Harness Suite"; Filename: "{app}\\DeepSeek Harness Suite.exe"; WorkingDir: "{app}"; AppUserModelID: "com.deepseek.dsh.suite"
[Run]
Filename: "{app}\\DeepSeek Harness Suite.exe"; Description: "启动 DeepSeek Harness Suite"; Flags: nowait postinstall skipifsilent
${innoLegacyMigrationCode()}
`);
  console.log('Inno payload deduplication: '+stats.mergedFiles+' duplicate paths, '+stats.avoidedBytes+' raw bytes stored once');
  await command(compiler,['--quiet-progress','--no-ide-signtools',script],{capture:true,timeout:45*60*1000});
  const artifact=path.join(out,filename+'.exe');if(!fs.existsSync(artifact))throw Error('Inno compiler produced no installer');
  const receipt={engine:'inno',compilerVersion,artifact,bytes:fs.statSync(artifact).size,sha256:await hash(artifact),deduplication:stats};
  fs.writeFileSync(path.join(out,'inno-build.json'),JSON.stringify(receipt,null,2));return receipt;
}
