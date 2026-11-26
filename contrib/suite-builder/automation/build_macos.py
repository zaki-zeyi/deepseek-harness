"""Cross-package macOS payloads; runtime validation requires a real Mac."""
import hashlib, json, os, pathlib, plistlib, shutil, struct, subprocess, sys, tarfile, time, urllib.request, zipfile
import base64, urllib.parse
from zip_helpers import write_alias
R = pathlib.Path(__file__).resolve().parent.parent
INPUTS = json.loads((R/'inputs.local.json').read_text('utf-8')) if (R/'inputs.local.json').exists() else {}
def input_path(name,default):
    p=pathlib.Path(INPUTS.get(name,default));return p if p.is_absolute() else R/p
NODE = pathlib.Path(shutil.which('node'))
NPM = NODE.parent/'node_modules/npm/bin/npm-cli.js'
def windows_staging():
    if INPUTS.get('windowsStaging'):return input_path('windowsStaging','')
    latest=R/'dist/automated/latest.json'
    if not latest.exists():raise RuntimeError('Build Windows first, or set windowsStaging in inputs.local.json')
    artifact=json.loads(latest.read_text('utf-8'))['artifact']
    for p in (R/'build/automated').glob('*/report.json'):
        report=json.loads(p.read_text('utf-8'))
        if report.get('status')=='built' and report.get('artifact')==artifact:return p.parent
    raise RuntimeError('Windows staging directory is missing; set windowsStaging')
WINDOWS_STAGE=windows_staging()
SEED=WINDOWS_STAGE/'home/profiles/desktop'
VERSION = '1.1.0'
BASE = R/'build/macos-1.1.0'
OUT = R/'dist/automated/macos-1.1.0'
CACHE = R/'downloads'
REV = 'eef99e4bbebaf363840847dce4a33ee72eb37945'
PLUGIN_REV = '9aa84122b95d80e734c27f05526262580a9c3b4d'
BASE.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
def say(s): print(s,flush=True)
def longpath(p):
    s=str(pathlib.Path(p).absolute())
    if os.name!='nt':return pathlib.Path(s)
    return pathlib.Path(s if s.startswith('\\\\?\\') else '\\\\?\\'+s)
def digest(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def run(args,cwd=R,env=None):
    say('RUN '+str(args[0])+' '+str(args[1]))
    result=subprocess.run([str(x) for x in args],cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.stdout:say(result.stdout)
    result.check_returncode()
def get_json(url):
    req=urllib.request.Request(url,headers={'User-Agent':'dsh-suite-builder'})
    with urllib.request.urlopen(req,timeout=120) as r:return json.load(r)
def download(url,name,expected=None):
    p=CACHE/name
    if p.exists() and (not expected or digest(p)==expected):return p
    say('DOWNLOAD '+name)
    req=urllib.request.Request(url,headers={'User-Agent':'dsh-suite-builder'})
    with urllib.request.urlopen(req,timeout=180) as r,open(str(p)+'.partial','wb') as f:shutil.copyfileobj(r,f)
    temp=pathlib.Path(str(p)+'.partial')
    if expected and digest(temp)!=expected:raise RuntimeError('SHA256 mismatch: '+name)
    temp.replace(p);return p
def asset(repo,tag,predicate):
    pinned={
        'larksuite/cli':{
            'lark-cli-1.0.100-darwin-arm64.tar.gz':'d068a27f608335016a8a7fb1b3cd1fccfb96bda92075a027e2bf1c4c23134e30',
            'lark-cli-1.0.100-darwin-amd64.tar.gz':'7f5d442e5da3ae62b03a5b552880b651637b16b2eed91b588afaca6d72a6643a'},
        'MetaCubeX/mihomo':{
            'mihomo-darwin-arm64-v1.19.34.gz':'1a7a20eca63fbbaec90137717465bfde488d0db2a3a79b8fadebf9b2545b6e4c',
            'mihomo-darwin-amd64-compatible-v1.19.34.gz':'703bceaa494732fa456f47e6ac2f06bf0bc5593d4c927d5f61e10f1a31039c37'}}
    for name,sha in pinned.get(repo,{}).items():
        if predicate(name):
            url=f'https://github.com/{repo}/releases/download/{tag}/{name}'
            return download(url,name,sha),{'source':url,'sha256':sha}
    data=get_json(f'https://api.github.com/repos/{repo}/releases/tags/{tag}')
    a=next(a for a in data['assets'] if predicate(a['name']))
    sha=a.get('digest','').removeprefix('sha256:')
    if len(sha)!=64:raise RuntimeError('Missing upstream digest: '+a['name'])
    p=download(a['browser_download_url'],a['name'],sha)
    return p,{'source':a['browser_download_url'],'sha256':sha}
def extract(archive,target):
    target.mkdir(parents=True,exist_ok=True)
    if str(archive).endswith('.zip'):
        with zipfile.ZipFile(archive) as z:
            for i in z.infolist():
                rel=pathlib.PurePosixPath(i.filename)
                if rel.is_absolute() or '..' in rel.parts:raise RuntimeError('Unsafe ZIP entry')
                if (i.external_attr>>16)&0o170000==0o120000:continue # symlinks preserved separately in final ZIP
                z.extract(i,target)
    else:
        with tarfile.open(archive) as t:t.extractall(target,filter='data')
def npm_payload(name,version,target):
    meta=get_json('https://registry.npmjs.org/'+urllib.parse.quote(name,safe='')+'/'+version)
    archive=download(meta['dist']['tarball'],name.replace('/','-').replace('@','')+'-'+version+'.tgz')
    algorithm,expected=meta['dist']['integrity'].split('-',1)
    h=hashlib.new(algorithm)
    with open(archive,'rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    if base64.b64encode(h.digest()).decode()!=expected:raise RuntimeError('npm integrity mismatch: '+name)
    extract(archive,target)
def magpie_build():
    go=pathlib.Path(shutil.which('go')) if os.name!='nt' and shutil.which('go') else BASE/'go-tool/go/bin/go.exe'
    if not go.exists():
        archive=download('https://go.dev/dl/go1.27.1.windows-amd64.zip','go1.27.1.windows-amd64.zip','a3911b5e0e1b1053f25ed0675f4c1c6aad1e2bfcf253df2b9be4caabd2edd95d')
        extract(archive,BASE/'go-tool')
    src=BASE/'magpie-source'
    if not (src/'.git').exists():
        src.mkdir(exist_ok=True);run(['git','init'],src);run(['git','fetch','--depth=1','https://github.com/yetone/magpie.git',REV],src);run(['git','checkout','--detach',REV],src)
    patch=download(f'https://raw.githubusercontent.com/Ebony-Vinyl/dsh-our-free-model/{PLUGIN_REV}/scripts/magpie-engine-patches/0001-agent-sync-skip-an-empty-catalog.patch','magpie-guard.patch','50acab57addbd3821a6a293f2a6be4f496b4fb4a8e118b3cfd224f29e83747aa')
    marker=BASE/'magpie-patched'
    if not marker.exists():run(['git','apply','--whitespace=nowarn',patch],src);marker.write_text(REV)
    for arch,goarch in [('arm64','arm64'),('x64','amd64')]:
        if sys.argv[1:] and arch not in sys.argv[1:]:continue
        binary=BASE/f'magpie-darwin-{arch}'
        if not binary.exists():
            env={**os.environ,'GOOS':'darwin','GOARCH':goarch,'CGO_ENABLED':'0','GOTOOLCHAIN':'local','GOCACHE':str(BASE/'go-cache'),'GOMODCACHE':str(BASE/'go-mod'),'GOWORK':'off','GOPROXY':os.environ.get('GOPROXY','https://goproxy.cn,https://goproxy.io,direct' if os.name=='nt' else 'https://proxy.golang.org,direct')}
            run([go,'build','-tags','nogui','-trimpath','-buildvcs=true','-ldflags','-s -w -X main.version=ofm-eef99e4bbeba','-o',binary,'.'],src,env)
        macho(binary,arch)
def macho(file,arch):
    with open(file,'rb') as f:b=f.read(8)
    if b[:4]!=b'\xcf\xfa\xed\xfe':raise RuntimeError('Not Mach-O: '+str(file))
    expected=0x100000c if arch=='arm64' else 0x1000007
    if struct.unpack('<I',b[4:8])[0]!=expected:raise RuntimeError('Wrong architecture: '+str(file))
def executable(rel):
    name=pathlib.PurePosixPath(rel).name
    return '/bin/' in '/'+rel or '/Contents/MacOS/' in rel or name in ('spawn-helper','soffice','soffice.bin','unopkg','rg','node','bun','codex','lark-cli','mihomo') or name.startswith('magpie-darwin-') or name.endswith(('.command','.sh')) or '/libreoffice-kit-' in rel and '/program/' in rel
def add_bytes(z,name,data,mode=0o100644):
    i=zipfile.ZipInfo(name,(2026,11,17,0,0,0));i.create_system=3;i.external_attr=mode<<16;i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,data,compresslevel=3)
def add_tree(z,base,prefix,exclude=()):
    base=longpath(base)
    for p in sorted(base.rglob('*')):
        if p.is_file():
            rel=p.relative_to(base).as_posix()
            if rel in exclude:continue
            add_bytes(z,prefix+rel,p.read_bytes(),0o100755 if executable(rel) else 0o100644)
def ignore(dir,names):
    return [n for n in names if n in ('.pnpm','.git','.bin','.modules.yaml','.plugin-manager','.dsh-market')]
def reuse_profile_zip(arch,seedzip):
    base=BASE/'arm64/seed-profile.zip'
    if arch!='x64' or not base.exists() or seedzip.exists():return
    seedzip.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(base,seedzip)
    meta=json.loads((SEED/'node_modules/dsh-our-free-model/vendor/magpie/engine.json').read_text('utf-8'))
    meta['binaries']['darwin-x64']={'path':'bin/magpie-darwin-x64','sha256':digest(BASE/'magpie-darwin-x64')}
    prefix='node_modules/dsh-our-free-model/vendor/magpie/'
    with zipfile.ZipFile(seedzip,'a') as z:
        remove={prefix+'engine.json',prefix+'bin/magpie-darwin-arm64',prefix+'bin/magpie-darwin-x64'}
        z.filelist=[i for i in z.filelist if i.filename not in remove];z.NameToInfo={i.filename:i for i in z.filelist}
        add_bytes(z,prefix+'engine.json',json.dumps(meta,indent=2).encode())
        add_bytes(z,prefix+'bin/magpie-darwin-x64',(BASE/'magpie-darwin-x64').read_bytes(),0o100755)
def prepare(arch):
    say('PREPARE darwin-'+arch)
    stage=BASE/arch;stage.mkdir(exist_ok=True)
    seed=stage/'seed';app=stage/'app';deps=stage/'dependencies'
    if not (stage/'copied').exists():
        shutil.copytree(longpath(SEED),longpath(seed),ignore=ignore,dirs_exist_ok=True)
        source_app=longpath(input_path('macApp'+arch.title(),f'work/mac-{arch}/app'))
        for name in ['package.json','lib/main.js']:
            dest=app/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source_app/name,dest)
        (stage/'copied').write_text('ok')
    # Refuse a stale plugin selection: this cross build derives from the verified Windows inventory.
    inv=json.loads((WINDOWS_STAGE/'app/resources/suite-inventory.json').read_text('utf-8'))
    inv['inputReferenceChecks']=inv.pop('checks',[])
    inv['inputReferencePeerWarnings']=inv.pop('legacyPeerWarnings',[])
    inv['checks']=[{'name':'macOS-runtime-execution','status':'not-run','reason':'Cross-packaged on Windows'}]
    inv.update(target='darwin-'+arch,version=VERSION,validation='static-only; real macOS startup/signing/permissions not tested',systemPrerequisites=['Git features require Apple Command Line Tools (/usr/bin/git); Git is not bundled.'])
    # Target-specific native files already supplied by the multi-architecture profile install.
    for name in ['@img/sharp-darwin-'+arch+'/lib/sharp-darwin-'+arch+'-0.35.5.node','@tencent-qqmail/agently-cli-darwin-'+arch+'/bin/agently-cli','dsh-industry-research/node_modules/node-pty/prebuilds/darwin-'+arch+'/pty.node']:
        file=seed/'node_modules'/name
        if not file.exists() and 'dsh-industry-research/node_modules/node-pty' in name:file=seed/'node_modules'/name.replace('dsh-industry-research/node_modules/','')
        macho(file,arch)
    magpie=seed/'node_modules/dsh-our-free-model/vendor/magpie'
    (magpie/'bin').mkdir(exist_ok=True);shutil.copy2(BASE/f'magpie-darwin-{arch}',magpie/f'bin/magpie-darwin-{arch}')
    meta=json.loads((magpie/'engine.json').read_text('utf-8'));meta['binaries']['darwin-'+arch]={'path':f'bin/magpie-darwin-{arch}','sha256':digest(BASE/f'magpie-darwin-{arch}')};(magpie/'engine.json').write_text(json.dumps(meta,indent=2))
    if not (deps/'.target-runtime-ready').exists():
        deps.mkdir(exist_ok=True);(deps/'package.json').write_text(json.dumps({'name':'dsh-suite-mac-runtimes','version':VERSION,'private':True}))
        npm_payload('@openai/codex','0.169.0-darwin-'+arch,deps/'node_modules/@openai/codex-target')
        npm_payload('@oven/bun-darwin-aarch64' if arch=='arm64' else '@oven/bun-darwin-x64','1.4.4',deps/'node_modules/@oven/bun-target')
        (deps/'.target-runtime-ready').write_text('darwin-'+arch)
    bin=deps/'bin';bin.mkdir(exist_ok=True)
    codex=next(p for p in (deps/'node_modules/@openai').rglob('codex') if p.is_file());shutil.copy2(codex,bin/'codex')
    bun=next(p for p in (deps/'node_modules/@oven').rglob('bun') if p.is_file());shutil.copy2(bun,bin/'bun')
    lark_arch='arm64' if arch=='arm64' else 'amd64'
    lark,record=asset('larksuite/cli','v1.0.100',lambda n:n==f'lark-cli-1.0.100-darwin-{lark_arch}.tar.gz')
    extract(lark,deps/'lark');larkbin=next(p for p in (deps/'lark').rglob('lark-cli') if p.is_file());shutil.copy2(larkbin,bin/'lark-cli');inv['macLark']=record
    aliases={f'bin/{name}':os.path.relpath(source,bin).replace('\\','/') for name,source in [('codex',codex),('bun',bun),('lark-cli',larkbin)]}
    for name,source in [('codex',codex),('bun',bun),('lark-cli',larkbin)]:
        if digest(source)!=digest(bin/name):raise RuntimeError('Runtime alias payload mismatch: '+name)
    inv['runtimeDeduplication']={'method':'relative executable symlinks; canonical binaries retained','aliases':aliases,'uncompressedBytesAvoided':sum((bin/name).stat().st_size for name in ['codex','bun','lark-cli'])}
    mh,mhrecord=asset('MetaCubeX/mihomo','v1.19.34',lambda n:n==('mihomo-darwin-arm64-v1.19.34.gz' if arch=='arm64' else 'mihomo-darwin-amd64-compatible-v1.19.34.gz'))
    import gzip
    with gzip.open(mh,'rb') as f,open(bin/'mihomo','wb') as out:shutil.copyfileobj(f,out)
    inv['macMihomo']=mhrecord
    for name in ['codex','bun','lark-cli','mihomo']:macho(bin/name,arch)
    electron=download(f'https://github.com/electron/electron/releases/download/v44.0.0/electron-v44.0.0-darwin-{arch}.zip',f'electron-v44.0.0-darwin-{arch}.zip',{'arm64':'076d79742986e1b100b69ebecc691cb07368045e54c9087cef631b8622b76a80','x64':'28429e700ad68d9624aaa90b6543ffe891a48c14121fd904cd294e5edcee63ff'}[arch])
    runtime="import {join,delimiter} from 'node:path';\nconst d=join(process.resourcesPath,'dependencies');\nprocess.env.PATH=join(d,'bin')+delimiter+join(process.resourcesPath,'runtime/primary-runtime/dependencies/node/bin')+delimiter+(process.env.PATH||'');\nprocess.env.OUR_FREE_MODEL_BUN=join(d,'bin/bun');\nprocess.env.DSH_ORB_ELECTRON_PATH=join(d,'orb-electron/Electron.app/Contents/MacOS/Electron');\n"
    (app/'lib/suite-runtimes.js').write_text(runtime,encoding='utf-8')
    main=app/'lib/main.js';s=main.read_text('utf-8');s='import "./suite-runtimes.js";\n'+s if 'import "./suite-runtimes.js";' not in s else s;main.write_text(s,encoding='utf-8')
    pkg=json.loads((app/'package.json').read_text('utf-8'));pkg['version']=VERSION;pkg['dshSuite']['plugins']=[p['name'] for p in inv['plugins']];(app/'package.json').write_text(json.dumps(pkg,indent=2))
    inv['macMagpie']={'revision':REV,'patch':'50acab57addbd3821a6a293f2a6be4f496b4fb4a8e118b3cfd224f29e83747aa','sha256':digest(BASE/f'magpie-darwin-{arch}')}
    (stage/'inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2),encoding='utf-8')
    seedzip=stage/'seed-profile.zip'
    reuse_profile_zip(arch,seedzip)
    say('ZIP target profile '+arch)
    cached=False
    if seedzip.exists():
        try:
            with zipfile.ZipFile(seedzip) as z:cached=json.loads(z.read('package.json'))==json.loads((seed/'package.json').read_text('utf-8')) and json.loads(z.read('node_modules/dsh-our-free-model/vendor/magpie/engine.json'))==json.loads((magpie/'engine.json').read_text('utf-8'))
        except (zipfile.BadZipFile,KeyError):pass
    if not cached:
        with zipfile.ZipFile(seedzip,'w',allowZip64=True) as z:add_tree(z,seed,'')
    original=input_path('macBaseline'+arch.title(),f'dist/DeepSeek-Harness-Suite-1.0.0-mac-{arch}.zip')
    dest=OUT/f'DeepSeek-Harness-Suite-{VERSION}-mac-{arch}.zip'
    prefix='DeepSeek Harness Suite.app/';resource=prefix+'Contents/Resources/'
    say('ZIP macOS app '+arch)
    # A fresh archive avoids orphaned local entries confusing macOS Archive Utility/ditto.
    with zipfile.ZipFile(original) as baseline,zipfile.ZipFile(dest,'w',allowZip64=True) as z:
        pl=plistlib.loads(baseline.read(prefix+'Contents/Info.plist'));pl.update(CFBundleShortVersionString=VERSION,CFBundleVersion=VERSION)
        replace={prefix+'Contents/Info.plist',resource+'seed-profile.zip',resource+'suite-inventory.json','安装说明.txt','安装到自定义位置.command','修复签名.command','验证依赖.command'}
        replace.update(resource+'app/'+n for n in ('lib/main.js','lib/suite-runtimes.js','package.json'))
        for entry in baseline.infolist():
            if entry.filename not in replace:z.writestr(entry,baseline.read(entry),compresslevel=3)
        add_bytes(z,prefix+'Contents/Info.plist',plistlib.dumps(pl))
        for name in ('lib/main.js','lib/suite-runtimes.js','package.json'):add_bytes(z,resource+'app/'+name,(app/name).read_bytes())
        add_tree(z,deps,resource+'dependencies/',exclude=aliases)
        for alias,target in aliases.items():write_alias(z,resource+'dependencies/'+alias,target)
        with zipfile.ZipFile(electron) as e:
            for i in e.infolist():
                info=zipfile.ZipInfo(resource+'dependencies/orb-electron/'+i.filename,i.date_time);info.create_system=3;info.external_attr=i.external_attr;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,e.read(i),compresslevel=3)
        z.write(seedzip,resource+'seed-profile.zip',compress_type=zipfile.ZIP_STORED)
        add_bytes(z,resource+'suite-inventory.json',(stage/'inventory.json').read_bytes())
        for tool in ['codex','bun','lark-cli','mihomo']:
            wrapper='#!/bin/sh\nBASE=$(CDPATH= cd -- "$(dirname -- "$0")/../../dependencies/bin" && pwd) || exit 1\nexec "$BASE/'+tool+'" "$@"\n'
            add_bytes(z,resource+'runtime/bin/'+tool,wrapper.encode(),0o100755)
        for name in ['安装到自定义位置.command','修复签名.command','验证依赖.command']:
            add_bytes(z,name,(R/'automation/mac-assets'/name).read_bytes(),0o100755)
        add_bytes(z,'安装说明.txt',('解压后运行“安装到自定义位置.command”，选择目录。脚本会在本机重新签名；也可拖动 app 后运行修复签名脚本。\n首次使用请运行“验证依赖.command”。ChatGPT/飞书等账号需自行授权。Git 相关功能需要 Apple Command Line Tools。\n本包是在 Windows 上交叉打包，已检查架构、依赖文件、ZIP CRC 和符号链接，尚未经过真实 Mac 启动验收。\n').encode())
    say('VERIFY '+dest.name)
    with zipfile.ZipFile(dest) as z:
        if z.testzip():raise RuntimeError('Corrupted ZIP')
        links=[i for i in z.infolist() if (i.external_attr>>16)&0o170000==0o120000]
        if len(links)<10:raise RuntimeError('Electron framework symlinks lost')
        for name in ['codex','bun','lark-cli','mihomo']:
            i=z.getinfo(resource+'dependencies/bin/'+name)
            if not (i.external_attr>>16)&0o111:raise RuntimeError('Executable permissions lost')
    report={'status':'packaged-static-verified','target':'darwin-'+arch,'artifact':str(dest),'sha256':digest(dest),'bytes':dest.stat().st_size,'macRuntimeTested':False,'requires':['Run installer/re-sign on macOS','Git features: Apple Command Line Tools'],'inventory':inv}
    (OUT/f'report-darwin-{arch}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    say('DONE '+str(dest))
def main():
    magpie_build()
    for arch in sys.argv[1:] or ['arm64','x64']:prepare(arch)
    sums=''.join(digest(p)+'  '+p.name+'\n' for p in OUT.glob('*.zip'));(OUT/'SHA256SUMS.txt').write_text(sums)
if __name__=='__main__':main()
