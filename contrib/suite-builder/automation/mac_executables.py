"""Restore executable metadata for reviewed Apple Silicon plugin helpers."""
import pathlib


def prepare_profile_executables(profile):
    """Verify native helper architecture and restore execution permission inside the prepared Profile."""
    profile = pathlib.Path(profile).resolve()
    helpers = [p for p in profile.rglob('spawn-helper') if 'darwin-arm64' in p.parts]
    if not helpers:
        raise RuntimeError('Missing Apple Silicon PTY spawn helper')
    mail = profile / 'node_modules/@tencent-qqmail/agently-cli-darwin-arm64/bin/agently-cli'
    if mail.exists():
        helpers.append(mail)
    repaired = []
    for helper in helpers:
        if not helper.resolve().is_relative_to(profile):
            raise RuntimeError('Native helper escapes prepared Profile')
        with helper.open('rb') as stream:
            if stream.read(8) != b'\xcf\xfa\xed\xfe\x0c\x00\x00\x01':
                raise RuntimeError('Wrong Apple Silicon helper architecture: ' + str(helper))
        helper.chmod(0o755)
        repaired.append(helper.relative_to(profile).as_posix())
    return repaired
