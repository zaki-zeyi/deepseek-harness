"""Build a baseline from an official, checksum-verified Mac application."""
import os,pathlib,plistlib,sys,zipfile
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);prefix='DeepSeek Harness Suite.app/'
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as z:
    for root,dirs,files in os.walk(source,followlinks=False):
        for name in list(dirs)+files:
            p=pathlib.Path(root)/name;rel=p.relative_to(source).as_posix()
            if rel.startswith(('Contents/Resources/app.asar','Contents/Resources/app-update.yml')):continue
            stat=p.lstat();info=zipfile.ZipInfo(prefix+rel);info.create_system=3;info.external_attr=stat.st_mode<<16;info.compress_type=zipfile.ZIP_DEFLATED
            if p.is_symlink():z.writestr(info,os.readlink(p).encode())
            elif p.is_file():
                data=p.read_bytes()
                if rel=='Contents/Info.plist':
                    pl=plistlib.loads(data);pl.update(CFBundleName='DeepSeek Harness Suite',CFBundleDisplayName='DeepSeek Harness Suite',CFBundleIdentifier='com.deepseek.dsh.suite');data=plistlib.dumps(pl)
                if rel=='Contents/Resources/runtime/cli/bin/dsh':data=data.replace(b'app.asar/dsh',b'app/dsh')
                z.writestr(info,data)
print(out)
