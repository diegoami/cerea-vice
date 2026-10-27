#!/usr/bin/env python3
"""Archive a portable app without symlinks or path escapes, then verify its CRCs."""
import datetime
import os
from pathlib import Path
import sys
import zipfile


def archive_bundle(source: Path, target: Path, folder: str, epoch: int):
    if not source.is_dir() or source.is_symlink():
        raise ValueError("Source must be a real directory")
    if not folder or folder in (".", "..") or any(c in folder for c in "/\\\x00"):
        raise ValueError("Archive folder must be one safe directory name")
    source = source.resolve()
    if target.resolve().is_relative_to(source):
        raise ValueError("Archive output must be outside the bundle")
    entries = sorted(source.rglob("*"))
    if any(p.is_symlink() or not (p.is_dir() or p.is_file()) for p in entries):
        raise ValueError("Bundle contains a symbolic link or unsupported entry")
    stamp = datetime.datetime.fromtimestamp(max(315532800, epoch), datetime.timezone.utc)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED,
                             compresslevel=6, allowZip64=True) as archive:
            for entry in entries:
                if entry.is_dir():
                    continue
                info = zipfile.ZipInfo(f"{folder}/{entry.relative_to(source).as_posix()}",
                                       stamp.timetuple()[:6])
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = (0o100644 << 16)
                with entry.open("rb") as data, archive.open(info, "w", force_zip64=True) as output:
                    while block := data.read(1024 * 1024):
                        output.write(block)
        with zipfile.ZipFile(temporary) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f"Archive CRC failed: {bad}")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    archive_bundle(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], int(sys.argv[4]))
