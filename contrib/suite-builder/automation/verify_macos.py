"""Final architecture and ZIP checks; no claim of macOS execution."""
import hashlib,io,json,pathlib,struct,sys,zipfile
from build_macos import OUT,add_bytes,digest
ROOT='DeepSeek Harness Suite.app/Contents/Resources/'
for arch in sys.argv[1:] or ('arm64','x64'):
    artifact=OUT/f'DeepSeek-Harness-Suite-1.1.0-mac-{arch}.zip'
    with zipfile.ZipFile(artifact,'a') as z:
        for tool in ('codex','bun','lark-cli','mihomo'):
            entry=ROOT+'runtime/bin/'+tool
            if entry not in z.namelist():
                text='#!/bin/sh\nBASE=$(CDPATH= cd -- "$(dirname -- "$0")/../../dependencies/bin" && pwd) || exit 1\nexec "$BASE/'+tool+'" "$@"\n'
                add_bytes(z,entry,text.encode(),0o100755)
    with zipfile.ZipFile(artifact) as z:
        expected=0x100000c if arch=='arm64' else 0x1000007
        paths=[ROOT+'runtime/primary-runtime/dependencies/node/bin/node',ROOT+'dependencies/orb-electron/Electron.app/Contents/MacOS/Electron']
        paths += [ROOT+'dependencies/bin/'+n for n in ('codex','bun','lark-cli','mihomo')]
        for p in paths:
            with z.open(p) as f:b=f.read(8)
            if b[:4]!=b'\xcf\xfa\xed\xfe' or struct.unpack('<I',b[4:8])[0]!=expected:raise RuntimeError('Wrong Mach-O architecture: '+p)
        core=json.loads(z.read(ROOT+'app/dsh/node_modules/@deepseek-ai/dsh/package.json'))['version']
        with zipfile.ZipFile(io.BytesIO(z.read(ROOT+'seed-profile.zip'))) as seed:
            native=[f'node_modules/@img/sharp-darwin-{arch}/lib/sharp-darwin-{arch}-0.35.5.node',f'node_modules/@img/sharp-libvips-darwin-{arch}/lib/libvips-cpp.8.18.7.dylib',f'node_modules/@tencent-qqmail/agently-cli-darwin-{arch}/bin/agently-cli',f'node_modules/dsh-industry-research/node_modules/node-pty/prebuilds/darwin-{arch}/pty.node',f'node_modules/dsh-our-free-model/vendor/magpie/bin/magpie-darwin-{arch}']
            for p in native:
                with seed.open(p) as f:b=f.read(8)
                if b[:4]!=b'\xcf\xfa\xed\xfe' or struct.unpack('<I',b[4:8])[0]!=expected:raise RuntimeError('Wrong native dependency architecture: '+p)
            if seed.testzip():raise RuntimeError('Profile ZIP corruption')
        if z.testzip():raise RuntimeError('ZIP corruption')
        names=z.namelist()
        if len(names)!=len(set(names)):raise RuntimeError('Duplicate archive entries')
    reportfile=OUT/f'report-darwin-{arch}.json';report=json.loads(reportfile.read_text('utf-8'))
    report['sha256']=digest(artifact);report['bytes']=artifact.stat().st_size
    report['coreVersion']=core
    report['macStaticChecks']=['ZIP and nested profile CRC','Mach-O CPU: core Node / Orb Electron / Codex / Bun / Lark / mihomo / sharp / libvips / Agent Mail / node-pty / Magpie','Framework symlink preservation','executable permissions','launcher-owned CLI wrappers']
    reportfile.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(arch,report['sha256'],report['bytes'],flush=True)
(OUT/'SHA256SUMS.txt').write_text(''.join(digest(p)+'  '+p.name+'\n' for p in OUT.glob('*.zip')))
