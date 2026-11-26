"""Build an Apple Silicon offline ZIP, retrying without Orb above the delivery limit."""
import gzip
import json
import os
import pathlib
import plistlib
import shutil
import sys
import zipfile
from build_macos import R, BASE, OUT, SEED, WINDOWS_STAGE, input_path, magpie_build, digest, download, asset, extract, npm_payload, macho, ignore
from mac_executables import prepare_profile_executables

LIMIT = 600_000_000
ROOT = 'DeepSeek Harness Suite.app/Contents/Resources/'


def remove_owned(target, owner):
    """Remove only a generated descendant of this build's private directory."""
    target = target.resolve()
    if target == owner.resolve() or not target.is_relative_to(owner.resolve()):
        raise RuntimeError('Unexpected generated cleanup path')
    if target.exists():
        shutil.rmtree(target)


def write_zip(source, destination):
    """Preserve framework links and native executable modes with one archive entry per path."""
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=True) as z:
        for root, dirs, files in os.walk(source, followlinks=False):
            for name in list(dirs) + files:
                p = pathlib.Path(root) / name
                rel = p.relative_to(source).as_posix()
                info = zipfile.ZipInfo(rel)
                info.create_system = 3
                info.external_attr = p.lstat().st_mode << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                if p.is_symlink():
                    z.writestr(info, os.readlink(p).encode(), compresslevel=9)
                elif p.is_file():
                    z.write(p, rel, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def verify_archive(archive, plugins, orb):
    """Check the final profile, Mach-O architecture, executable modes and ZIP data."""
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        if len(names) != len(set(names)) or z.testzip():
            raise RuntimeError('Invalid ZIP entries or checksum')
        for p in plugins:
            manifest = json.loads(z.read(ROOT + 'seed-profile/node_modules/' + p['name'] + '/package.json'))
            if manifest['version'] != p['version']:
                raise RuntimeError('Unexpected packaged plugin version')
        if any('/dependencies/node_modules/@openai/' in n or '/dependencies/bin/codex' in n for n in names):
            raise RuntimeError('Obsolete global Codex CLI is bundled')
        if not orb and any('/node_modules/dsh-orb/' in n or '/dependencies/orb-electron/' in n for n in names):
            raise RuntimeError('Orb removal did not remove its payload')
        binaries = ['runtime/primary-runtime/dependencies/node/bin/node', 'dependencies/node_modules/bun-target/package/bin/bun', 'dependencies/bin/mihomo']
        inventory = json.loads(z.read(ROOT + 'suite-inventory.json'))
        binaries.extend('seed-profile/' + name for name in inventory['macExecutableRepairs'])
        if orb:
            binaries.append('dependencies/orb-electron/Electron.app/Contents/MacOS/Electron')
        for name in binaries:
            entry = z.getinfo(ROOT + name)
            with z.open(entry) as stream:
                header = stream.read(8)
            if header != b'\xcf\xfa\xed\xfe\x0c\x00\x00\x01' or not (entry.external_attr >> 16) & 0o111:
                raise RuntimeError('Wrong native architecture or permissions: ' + name)
        links = [i for i in z.infolist() if (i.external_attr >> 16) & 0o170000 == 0o120000]
        if len(links) < 10:
            raise RuntimeError('Framework links were lost')


def main():
    if sys.platform != 'darwin' or os.uname().machine != 'arm64':
        raise RuntimeError('Build and validate on a native Apple Silicon Mac')
    magpie_build()
    owned = BASE / 'native-arm64'
    if owned.exists():
        raise RuntimeError('Native staging must be fresh')
    owned.mkdir()
    delivery = owned / 'delivery'
    delivery.mkdir()
    from subprocess import run
    run(['/usr/bin/ditto', '-x', '-k', str(input_path('macBaselineArm64', 'build/ci-baseline-arm64.zip')), str(delivery)], check=True)
    app = delivery / 'DeepSeek Harness Suite.app'
    res = app / 'Contents/Resources'
    seed = res / 'seed-profile'
    deps = res / 'dependencies'
    if deps.exists() or seed.exists():
        raise RuntimeError('Official core unexpectedly contains suite payloads')
    deps.mkdir()
    bin_dir = deps / 'bin'
    bin_dir.mkdir()
    inv = json.loads((WINDOWS_STAGE / 'app/resources/suite-inventory.json').read_text())
    inv['target'] = 'darwin-arm64'
    inv['voiceModelsBundled'] = False
    npm_payload('@oven/bun-darwin-aarch64', '1.4.4', deps / 'node_modules/bun-target')
    bun = deps / 'node_modules/bun-target/package/bin/bun'
    macho(bun, 'arm64')
    bun.chmod(0o755)
    (bin_dir / 'bun').symlink_to(os.path.relpath(bun, bin_dir))
    lark, record = asset('larksuite/cli', 'v1.0.100', lambda n: n == 'lark-cli-1.0.100-darwin-arm64.tar.gz')
    extract(lark, deps / 'lark')
    lark_bin = next(p for p in (deps / 'lark').rglob('lark-cli') if p.is_file())
    macho(lark_bin, 'arm64')
    lark_bin.chmod(0o755)
    (bin_dir / 'lark-cli').symlink_to(os.path.relpath(lark_bin, bin_dir))
    inv['macLark'] = record
    mh, inv['macMihomo'] = asset('MetaCubeX/mihomo', 'v1.19.34', lambda n: n == 'mihomo-darwin-arm64-v1.19.34.gz')
    with gzip.open(mh, 'rb') as src, (bin_dir / 'mihomo').open('wb') as dst:
        shutil.copyfileobj(src, dst)
    (bin_dir / 'mihomo').chmod(0o755)
    macho(bin_dir / 'mihomo', 'arm64')
    electron = download('https://github.com/electron/electron/releases/download/v44.0.0/electron-v44.0.0-darwin-arm64.zip', 'electron-v44.0.0-darwin-arm64.zip', '076d79742986e1b100b69ebecc691cb07368045e54c9087cef631b8622b76a80')
    run(['/usr/bin/ditto', '-x', '-k', str(electron), str(deps / 'orb-electron')], check=True)
    runtime = "import {join,delimiter} from 'node:path';\nconst d=join(process.resourcesPath,'dependencies');\nprocess.env.PATH=join(d,'bin')+delimiter+join(process.resourcesPath,'runtime/primary-runtime/dependencies/node/bin')+delimiter+(process.env.PATH||'');\nprocess.env.OUR_FREE_MODEL_BUN=join(d,'bin/bun');\n"
    orb_env = "process.env.DSH_ORB_ELECTRON_PATH=join(d,'orb-electron/Electron.app/Contents/MacOS/Electron');\n"
    main_file = res / 'app/lib/main.js'
    main_file.write_text('import "./suite-runtimes.js";\n' + main_file.read_text())
    plist = app / 'Contents/Info.plist'
    metadata = plistlib.loads(plist.read_bytes())
    metadata.update(CFBundleShortVersionString='1.1.0', CFBundleVersion='1.1.0')
    plist.write_bytes(plistlib.dumps(metadata))
    for name in ['安装到自定义位置.command', '修复签名.command', '验证依赖.command']:
        shutil.copyfile(R / 'automation/mac-assets' / name, delivery / name)
        (delivery / name).chmod(0o755)
    (delivery / '安装说明.txt').write_text('Apple Silicon 完整离线包。解压后运行“安装到自定义位置.command”选择目录，脚本会完成本机 ad-hoc 签名。首次启动显示插件准备进度；已有账号、版本和禁用选择保留。语音模型未内置。账号需自行授权；Git 功能使用系统 Apple Command Line Tools。本包未进行 Apple 公证。\n', encoding='utf-8')
    artifact = OUT / 'DeepSeek-Harness-Suite-1.1.0-mac-arm64.zip'
    first_bytes = None
    for orb in [True, False]:
        if not orb:
            # Use the same official manager that created the build Profile.
            node = pathlib.Path(shutil.which('node'))
            run([str(node), str(WINDOWS_STAGE / 'manager.mjs'), 'plugin', '--profile', 'desktop', 'remove', 'dsh-orb'], env={**os.environ, 'DSH_HOME': str(WINDOWS_STAGE / 'home'), 'CI': 'true'}, check=True)
            inv['plugins'] = [p for p in inv['plugins'] if p['name'] != 'dsh-orb']
            remove_owned(seed, owned)
            remove_owned(deps / 'orb-electron', owned)
        shutil.copytree(SEED, seed, ignore=ignore)
        inv['macExecutableRepairs'] = prepare_profile_executables(seed)
        magpie = seed / 'node_modules/dsh-our-free-model/vendor/magpie'
        (magpie / 'bin').mkdir(exist_ok=True)
        engine = BASE / 'magpie-darwin-arm64'
        shutil.copyfile(engine, magpie / 'bin/magpie-darwin-arm64')
        (magpie / 'bin/magpie-darwin-arm64').chmod(0o755)
        config = json.loads((magpie / 'engine.json').read_text())
        config['binaries']['darwin-arm64'] = {'path': 'bin/magpie-darwin-arm64', 'sha256': digest(engine)}
        (magpie / 'engine.json').write_text(json.dumps(config, indent=2))
        inv['orbIncluded'] = orb
        (res / 'suite-inventory.json').write_text(json.dumps(inv, ensure_ascii=False, indent=2))
        (res / 'app/lib/suite-runtimes.js').write_text(runtime + (orb_env if orb else ''))
        package = json.loads((res / 'app/package.json').read_text())
        package['dshSuite']['plugins'] = [p['name'] for p in inv['plugins']]
        (res / 'app/package.json').write_text(json.dumps(package, indent=2))
        write_zip(delivery, artifact)
        size = artifact.stat().st_size
        print(json.dumps({'orbIncluded': orb, 'bytes': size, 'limit': LIMIT}), flush=True)
        if first_bytes is None:
            first_bytes = size
        if size < LIMIT:
            verify_archive(artifact, inv['plugins'], orb)
            break
    else:
        raise RuntimeError('Installer still exceeds 600 MB after removing Orb')
    report = {'status': 'packaged-static-verified', 'target': 'darwin-arm64', 'artifact': str(artifact), 'sha256': digest(artifact), 'bytes': size, 'limitBytes': LIMIT, 'withOrbBytes': first_bytes, 'orbIncluded': orb, 'coreVersion': inv['coreVersion'], 'inventory': inv, 'macRuntimeTested': False, 'macApplicationUITested': False, 'sourceCommit': os.environ.get('GITHUB_SHA'), 'checks': [{'name': 'installer-under-600mb', 'status': 'passed'}, {'name': 'archive-integrity-architecture-permissions-links', 'status': 'passed'}, {'name': 'obsolete-global-codex-absent', 'status': 'passed'}]}
    (OUT / 'report-darwin-arm64.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    (OUT / 'SHA256SUMS.txt').write_text(report['sha256'] + '  ' + artifact.name + '\n')


if __name__ == '__main__':
    main()
