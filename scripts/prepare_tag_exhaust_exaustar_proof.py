#!/usr/bin/env python3
"""Prepare isolated, no-translation snapshots for the three tag.exhaust occurrences."""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / 'output/proofs/tag-exhaust-exaustar-2026-10-16'
RECEIPT = PROOF / 'receipt.json'
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
PDF_SHA256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351'
REGISTRY = ROOT / 'apps/web/src/symbols/sourceSymbols.json'
PAGES = (47, 70, 90)
BOX_NAMES = {
    'mediaBox': 'mediabox',
    'cropBox': 'cropbox',
    'bleedBox': 'bleedbox',
    'trimBox': 'trimbox',
    'artBox': 'artbox',
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def page_hashes(directory: Path) -> dict[str, str]:
    return {
        item.name: digest(item)
        for item in sorted(directory.iterdir())
        if item.is_file()
    }


def main() -> None:
    if not RECEIPT.is_file():
        raise RuntimeError('The registry apply receipt is required before preparing proof snapshots.')
    receipt = json.loads(RECEIPT.read_text(encoding='utf-8'))
    if receipt.get('status') != 'applied' or receipt.get('symbolId') != 'tag.exhaust':
        raise RuntimeError('The registry receipt is not the expected applied tag.exhaust update.')
    if digest(REGISTRY) != receipt['after']['apps/web/src/symbols/sourceSymbols.json']:
        raise RuntimeError('sourceSymbols.json changed after the recorded application.')
    registry = json.loads(REGISTRY.read_text(encoding='utf-8-sig'))
    definition = next(item for item in registry if item.get('id') == 'tag.exhaust')
    if definition['labels']['pt-BR'] != 'EXAUSTAR':
        raise RuntimeError('The active symbol registry does not contain the approved label.')
    if digest(PDF) != PDF_SHA256:
        raise RuntimeError('The official PDF hash changed after preflight.')

    snapshots_root = PROOF / 'snapshots'
    if snapshots_root.exists():
        raise RuntimeError(f'Refusing to replace existing proof snapshots: {snapshots_root}')
    snapshots_root.mkdir(parents=True)

    with pymupdf.open(PDF) as document:
        source_boxes = {
            str(page_number): {
                key: [float(value) for value in getattr(document[page_number - 1], attribute)]
                for key, attribute in BOX_NAMES.items()
            }
            for page_number in PAGES
        }

    manifest = {
        'status': 'isolated-source-snapshots-prepared',
        'symbolId': 'tag.exhaust',
        'locale': 'pt-BR',
        'translationRecords': [],
        'payloadAccess': 'none',
        'registrySha256': digest(REGISTRY),
        'sourcePdfSha256': PDF_SHA256,
        'pages': {},
    }

    for page_number in PAGES:
        page_id = f'page_{page_number:03d}'
        source_dir = ROOT / 'apps/web/public/pages' / page_id
        snapshot_dir = snapshots_root / f'p{page_number:03d}'
        page_snapshot_dir = snapshot_dir / 'pages' / page_id
        page_snapshot_dir.parent.mkdir(parents=True)
        shutil.copytree(source_dir, page_snapshot_dir)
        before = page_hashes(source_dir)
        copied = page_hashes(page_snapshot_dir)
        if before != copied:
            raise RuntimeError(f'Canonical page asset copy mismatch on p.{page_number}.')

        snapshot = {
            'translations': [],
            'layoutFrames': [],
            'symbolAliasSettings': [],
            'assetPages': [page_number],
            'page': page_number,
            'patched': True,
            'verifyRenderedSnapshot': False,
            'sourcePageBoxes': source_boxes,
        }
        snapshot_path = snapshot_dir / 'snapshot.json'
        with snapshot_path.open('x', encoding='utf-8', newline='\n') as handle:
            json.dump(snapshot, handle, ensure_ascii=False, indent=2)
            handle.write('\n')

        sidecar = json.loads((source_dir / 'compound_elements.json').read_text(encoding='utf-8'))
        occurrences = [item for item in sidecar.get('elements', []) if item.get('symbolId') == 'tag.exhaust']
        if len(occurrences) != 1:
            raise RuntimeError(f'Expected one tag.exhaust occurrence on p.{page_number}; found {len(occurrences)}.')
        manifest['pages'][str(page_number)] = {
            'snapshot': str(snapshot_path.relative_to(ROOT)).replace('\\', '/'),
            'canonicalAssets': before,
            'snapshotAssets': copied,
            'tagOccurrence': occurrences[0],
        }

    manifest_path = PROOF / 'snapshots-manifest.json'
    with manifest_path.open('x', encoding='utf-8', newline='\n') as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
