"""Relative in-archive aliases for shared native executables."""
import posixpath,zipfile

def write_alias(archive,name,target):
    info=zipfile.ZipInfo(name);info.create_system=3;info.external_attr=0o120777<<16
    archive.writestr(info,target.encode('utf-8'))

def resolve_alias(archive,name,root):
    visited=set()
    while True:
        if not name.startswith(root) or name in visited:raise RuntimeError('Unsafe or cyclic runtime alias')
        visited.add(name);entry=archive.getinfo(name)
        if (entry.external_attr>>16)&0o170000!=0o120000:return name
        target=archive.read(entry).decode('utf-8')
        if posixpath.isabs(target):raise RuntimeError('Absolute runtime alias')
        name=posixpath.normpath(posixpath.join(posixpath.dirname(name),target))
