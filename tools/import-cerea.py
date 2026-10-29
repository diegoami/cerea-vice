#!/usr/bin/env python3
"""Rebuild Cerea Centro from towns/cerea.town.json with tools/import-town.py.
--tiles also exports the outskirts prototype afterwards; --tiles-only exports it from the
checked-in prepared Cerea map without rebuilding Cerea. No network is needed.
"""
import subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
if '--tiles-only' not in sys.argv:
    subprocess.run([sys.executable,str(ROOT/'tools/import-town.py'),str(ROOT/'towns/cerea.town.json')],check=True)
if '--tiles' in sys.argv or '--tiles-only' in sys.argv:
    subprocess.run(['node','--import','tsx',str(ROOT/'tools/export-tiles.mjs')],check=True)
