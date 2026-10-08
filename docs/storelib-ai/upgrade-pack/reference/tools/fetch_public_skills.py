#!/usr/bin/env python3
"""Optional downloader for PUBLIC third-party repositories cited in this pack.
Standard library only. Downloads source ZIPs from GitHub's official codeload
host, filters to selected folders, preserves original LICENSE/NOTICE files.
Does not execute downloaded scripts; inspect before running them.
"""
import argparse
import io
import os
import pathlib
import shutil
import sys
import urllib.request
import zipfile

SOURCES = {
    "ui-ux-pro-max": {
        "repo": "nextlevelbuilder/ui-ux-pro-max-skill",
        "allowed": (
            ".claude/skills/ui-ux-pro-max/",
            "src/ui-ux-pro-max/",
            "LICENSE", "README.md", "skill.json",
        ),
        "license": "MIT",
    },
    "impeccable": {
        "repo": "pbakaus/impeccable",
        "allowed": (
            ".agents/skills/impeccable/",
            "skill/",
            "docs/",
            "LICENSE", "NOTICE.md", "README.md",
        ),
        "license": "Apache-2.0",
    },
}
MAX_COMPRESSED = 28 * 1024 * 1024
MAX_FILES = 2500
MAX_EXTRACTED = 48 * 1024 * 1024


def safe_parts(relative):
    p = pathlib.PurePosixPath(relative)
    return relative and not p.is_absolute() and '..' not in p.parts and '\\' not in relative


def fetch_one(name, root):
    meta = SOURCES[name]
    repo = meta['repo']
    url = f'https://codeload.github.com/{repo}/zip/refs/heads/main'
    print(f'Fetching {repo} ({meta["license"]}) ...')
    req = urllib.request.Request(url, headers={'User-Agent': 'Storelib-AI-Builder-Knowledge-Pack/1.0'})
    with urllib.request.urlopen(req, timeout=40) as stream:
        blob = stream.read(MAX_COMPRESSED + 1)
    if len(blob) > MAX_COMPRESSED:
        raise RuntimeError('Repository ZIP exceeds safety size limit')
    outdir = root / name
    outdir.mkdir(parents=True, exist_ok=True)
    total, count = 0, 0
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            # Ignore symlinks and unsupported file types.
            filetype = (info.external_attr >> 16) & 0o170000
            if filetype not in (0, 0o100000):
                continue
            parts = info.filename.split('/', 1)
            if len(parts) != 2:
                continue
            relative = parts[1]
            if not safe_parts(relative):
                raise RuntimeError(f'Unsafe ZIP path {relative!r}')
            if not any(relative == path or relative.startswith(path) for path in meta['allowed']):
                continue
            count += 1
            total += info.file_size
            if count > MAX_FILES or total > MAX_EXTRACTED:
                raise RuntimeError('Selected extracted files exceed safety limits')
            target = outdir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as source, open(target, 'wb') as dest:
                shutil.copyfileobj(source, dest)
    if not (outdir / 'LICENSE').exists():
        raise RuntimeError(f'{repo} LICENSE not found; inspect upstream before use')
    print(f'  saved {count} files under {outdir}')
    return count


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--only', choices=list(SOURCES), help='Fetch just this source')
    p.add_argument('--dry-run', action='store_true', help='Show pinned source origins without internet')
    args = p.parse_args()
    names = [args.only] if args.only else list(SOURCES)
    if args.dry_run:
        for name in names:
            print(f'{name}: https://github.com/{SOURCES[name]["repo"]} / license {SOURCES[name]["license"]}')
        return 0
    dest = pathlib.Path(__file__).resolve().parents[1] / 'third_party'
    failures = 0
    for name in names:
        try:
            fetch_one(name, dest)
        except Exception as exc:
            failures += 1
            print(f'ERROR fetching {name}: {exc}', file=sys.stderr)
    print('Read the original LICENSE/NOTICE files; third-party skills are references, not mandatory runtime dependencies.')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
