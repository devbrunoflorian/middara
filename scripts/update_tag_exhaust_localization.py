#!/usr/bin/env python3
"""Safely refresh only tag.exhaust's PT-BR vectors and metadata.

Default mode is a read-only dry run. --apply updates the one registry entry;
--rollback restores all preflighted inputs only if none changed afterward.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / 'output/proofs/tag-exhaust-exaustar-2026-10-16'
BASELINE = PROOF / 'preflight-before.json'
RECEIPT = PROOF / 'receipt.json'
ROLLBACK_RECEIPT = PROOF / 'rollback.json'
REGISTRY_REL = 'apps/web/src/symbols/sourceSymbols.json'
REGISTRY = ROOT / REGISTRY_REL
PATCH_FILE_RELS = [
    REGISTRY_REL,
    'scripts/build_inline_compound_symbols.py',
    'apps/web/src/symbols/semanticSymbols.ts',
    'apps/web/tests/exhaustActionIcon.component.test.tsx',
]
CODE_PATCH_RELS = PATCH_FILE_RELS[1:]
CODE_PATCH_MANIFEST = PROOF / 'code-patch-sha256.json'
SOURCE_PDF_SHA256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351'
FONT_SHA256 = '86b88241d7804c7f55d8bdffe6616ef4735f37a9962d3ac598821bb9aea6d65c'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes())


def load_baseline() -> dict:
    if not BASELINE.is_file():
        raise RuntimeError(f'Missing immutable preflight: {BASELINE}')
    baseline = json.loads(BASELINE.read_text(encoding='utf-8-sig'))
    recorded = {item['path']: item['sha256'] for item in baseline['files']}
    if set(recorded) != set(PATCH_FILE_RELS):
        raise RuntimeError('Preflight file inventory changed; refusing to continue.')
    for rel, expected in recorded.items():
        backup = PROOF / 'before' / rel
        if not backup.is_file() or file_sha256(backup) != expected:
            raise RuntimeError(f'Preflight backup mismatch: {rel}')
    inputs = {item['path']: item['sha256'] for item in baseline['inputs']}
    if inputs.get('C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf') != SOURCE_PDF_SHA256:
        raise RuntimeError('Official PDF hash differs from the recorded preflight.')
    if inputs.get('apps/web/public/fonts/Optima LT Std Demi.otf') != FONT_SHA256:
        raise RuntimeError('Optima Demi font hash differs from the recorded preflight.')
    return baseline


def verify_code_patch() -> None:
    if not CODE_PATCH_MANIFEST.is_file():
        raise RuntimeError(f'Missing code-patch hash manifest: {CODE_PATCH_MANIFEST}')
    expected = json.loads(CODE_PATCH_MANIFEST.read_text(encoding='utf-8-sig'))
    actual = {rel: file_sha256(ROOT / rel) for rel in CODE_PATCH_RELS}
    if actual != expected:
        raise RuntimeError('A code/generator/test file changed after the recorded patch preflight.')


def generated_exhaust_entry() -> dict:
    sys.path.insert(0, str(ROOT / 'scripts'))
    import pymupdf as fitz
    import build_inline_compound_symbols as compounds
    import build_inline_symbol_registry as registry_builder

    pdf_path = registry_builder.PDF
    font_path = ROOT / 'apps/web/public/fonts/Optima LT Std Demi.otf'
    if file_sha256(pdf_path) != SOURCE_PDF_SHA256:
        raise RuntimeError(f'Official PDF changed: {pdf_path}')
    if file_sha256(font_path) != FONT_SHA256:
        raise RuntimeError(f'Optima Demi font changed: {font_path}')
    with fitz.open(pdf_path) as document:
        entries = compounds.compound_definitions(
            document,
            registry_builder.vector_path,
            registry_builder.native_paint_colors,
            registry_builder.definition,
        )
    matches = [entry for entry in entries if entry.get('id') == 'tag.exhaust']
    if len(matches) != 1:
        raise RuntimeError(f'Expected one generated tag.exhaust definition, found {len(matches)}.')
    generated = matches[0]
    if generated['labels']['pt-BR'] != 'EXAUSTAR':
        raise RuntimeError('The compound-symbol recipe did not generate the approved label.')
    if generated['composition']['localizedLabel']['pt-BR'] != 'EXAUSTAR':
        raise RuntimeError('The generated compound metadata has a different label.')
    generated['description']['pt-BR'] = (
        'EXAUSTAR — tag completa: fundo, ícone e rótulo localizado. '
        'Termo PT aprovado pelo usuário.'
    )
    return generated


def patched_registry_bytes(source: bytes, generated: dict) -> tuple[bytes, dict]:
    text = source.decode('utf-8-sig')
    data = json.loads(text)
    if not isinstance(data, list):
        raise RuntimeError('Unexpected sourceSymbols.json root; expected a symbol array.')
    matches = [index for index, entry in enumerate(data) if entry.get('id') == 'tag.exhaust']
    if len(matches) != 1:
        raise RuntimeError(f'Expected one registry tag.exhaust entry, found {len(matches)}.')
    index = matches[0]
    original_data = copy.deepcopy(data)
    old = data[index]
    if old.get('labels', {}).get('pt-BR') != 'EXAURIR':
        raise RuntimeError('Current tag.exhaust label differs from the preflight state.')
    if old.get('source') != generated.get('source'):
        raise RuntimeError('Source page or geometry changed since the generator recipe was recorded.')
    if old.get('render', {}).get('viewBox') != generated.get('render', {}).get('viewBox'):
        raise RuntimeError('Source tag viewBox changed; refusing a broad registry replacement.')
    if old.get('render', {}).get('paths') != generated.get('render', {}).get('paths'):
        raise RuntimeError('Source EN tag paths changed; refusing to replace source art.')
    if old.get('composition', {}).get('sourceLabelBbox') != generated.get('composition', {}).get('sourceLabelBbox'):
        raise RuntimeError('Source label geometry changed; refusing a broad registry replacement.')

    updated = copy.deepcopy(old)
    for field in ('labels', 'description', 'searchTerms', 'editorTokens'):
        updated[field]['pt-BR'] = copy.deepcopy(generated[field]['pt-BR'])
    updated['composition']['localizedLabel']['pt-BR'] = 'EXAUSTAR'
    updated['render']['localized']['pt-BR'] = copy.deepcopy(generated['render']['localized']['pt-BR'])

    old_variants = updated['render'].setdefault('variants', {})
    generated_variants = generated.get('render', {}).get('variants', {})
    compact_key = 'prose-6.62pt'
    if compact_key not in old_variants or compact_key not in generated_variants:
        raise RuntimeError('The reviewed p.70 compact variant is missing.')
    old_variants[compact_key].setdefault('localized', {})['pt-BR'] = copy.deepcopy(
        generated_variants[compact_key]['localized']['pt-BR']
    )

    data[index] = updated
    ids = [entry.get('id') for entry in data]
    if len(ids) != len(set(ids)):
        raise RuntimeError('Duplicate symbol IDs detected in the registry.')
    other_entries_equal = all(data[i] == original_data[i] for i in range(len(data)) if i != index)
    if not other_entries_equal:
        raise RuntimeError('A non-target registry entry changed in memory.')
    newline = '\r\n' if '\r\n' in text else '\n'
    output_text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if newline != '\n':
        output_text = output_text.replace('\n', newline)
    summary = {
        'symbolId': 'tag.exhaust',
        'oldLabel': old['labels']['pt-BR'],
        'newLabel': updated['labels']['pt-BR'],
        'oldMainLocalizedViewBox': old['render']['localized']['pt-BR']['viewBox'],
        'newMainLocalizedViewBox': updated['render']['localized']['pt-BR']['viewBox'],
        'oldCompactLocalizedViewBox': old['render']['variants'][compact_key]['localized']['pt-BR']['viewBox'],
        'newCompactLocalizedViewBox': old_variants[compact_key]['localized']['pt-BR']['viewBox'],
        'mainLocalizedPathCount': len(updated['render']['localized']['pt-BR']['paths']),
        'compactLocalizedPathCount': len(old_variants[compact_key]['localized']['pt-BR']['paths']),
        'registryEntryCount': len(data),
        'nonTargetEntriesPreserved': other_entries_equal,
    }
    return output_text.encode('utf-8'), summary


def current_hashes() -> dict[str, str]:
    return {rel: file_sha256(ROOT / rel) for rel in PATCH_FILE_RELS}


def atomic_restore(destination: Path, source: Path) -> None:
    temporary = destination.with_name(destination.name + '.exaustar-tmp')
    if temporary.exists():
        raise RuntimeError(f'Rollback temp file already exists: {temporary}')
    temporary.write_bytes(source.read_bytes())
    os.replace(temporary, destination)


def run_dry_run() -> None:
    baseline = load_baseline()
    verify_code_patch()
    expected_registry = next(item['sha256'] for item in baseline['files'] if item['path'] == REGISTRY_REL)
    current_registry = file_sha256(REGISTRY)
    if current_registry != expected_registry:
        if RECEIPT.is_file():
            receipt = json.loads(RECEIPT.read_text(encoding='utf-8'))
            if current_registry == receipt.get('after', {}).get(REGISTRY_REL):
                print(json.dumps({'status': 'already-applied', 'receipt': str(RECEIPT), 'hashes': current_hashes()}, indent=2))
                return
        raise RuntimeError('Current registry hash differs from preflight and no matching applied receipt exists.')
    generated = generated_exhaust_entry()
    output, summary = patched_registry_bytes(REGISTRY.read_bytes(), generated)
    print(json.dumps({
        'status': 'dry-run',
        'inputSha256': current_registry,
        'proposedOutputSha256': sha256(output),
        'sourcePdfSha256': SOURCE_PDF_SHA256,
        'fontSha256': FONT_SHA256,
        'payloadWrites': 0,
        'canonicalPageSidecarWrites': 0,
        'summary': summary,
    }, ensure_ascii=False, indent=2))


def run_apply() -> None:
    baseline = load_baseline()
    verify_code_patch()
    before = {item['path']: item['sha256'] for item in baseline['files']}
    current = current_hashes()
    if RECEIPT.exists():
        receipt = json.loads(RECEIPT.read_text(encoding='utf-8'))
        if current == receipt.get('after'):
            print(json.dumps({'status': 'already-applied', 'hashes': current}, indent=2))
            return
        raise RuntimeError(f'Apply receipt already exists but current files differ: {RECEIPT}')
    if current[REGISTRY_REL] != before[REGISTRY_REL]:
        raise RuntimeError('Registry changed after preflight; refusing to apply.')

    generated = generated_exhaust_entry()
    output, summary = patched_registry_bytes(REGISTRY.read_bytes(), generated)
    temporary = REGISTRY.with_name(REGISTRY.name + '.exaustar-tmp')
    if temporary.exists():
        raise RuntimeError(f'Apply temp file already exists: {temporary}')
    temporary.write_bytes(output)
    os.replace(temporary, REGISTRY)
    after = current_hashes()
    receipt = {
        'status': 'applied',
        'symbolId': 'tag.exhaust',
        'before': before,
        'after': after,
        'sourcePdfSha256': SOURCE_PDF_SHA256,
        'fontSha256': FONT_SHA256,
        'summary': summary,
        'payloadWrites': 0,
        'pageSidecarWrites': 0,
        'createdAtUtc': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    }
    try:
        with RECEIPT.open('x', encoding='utf-8', newline='\n') as handle:
            json.dump(receipt, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
    except Exception:
        if file_sha256(REGISTRY) == after[REGISTRY_REL]:
            atomic_restore(REGISTRY, PROOF / 'before' / REGISTRY_REL)
        raise
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


def run_rollback() -> None:
    if not RECEIPT.is_file():
        raise RuntimeError('Cannot roll back: application receipt is missing.')
    receipt = json.loads(RECEIPT.read_text(encoding='utf-8'))
    if receipt.get('status') != 'applied':
        raise RuntimeError('Cannot roll back: receipt is not an applied state.')
    current = current_hashes()
    expected_after = receipt['after']
    if current != expected_after:
        raise RuntimeError('Rollback refused: at least one affected file changed after application.')
    for rel, expected in receipt['before'].items():
        backup = PROOF / 'before' / rel
        if file_sha256(backup) != expected:
            raise RuntimeError(f'Rollback refused: preimage backup changed for {rel}.')
    if ROLLBACK_RECEIPT.exists():
        raise RuntimeError('Rollback receipt already exists; refusing to overwrite it.')
    for rel in PATCH_FILE_RELS:
        atomic_restore(ROOT / rel, PROOF / 'before' / rel)
    restored = current_hashes()
    if restored != receipt['before']:
        raise RuntimeError(f'Rollback verification failed: {restored}')
    rollback = {'status': 'rolled-back', 'before': expected_after, 'after': restored, 'createdAtUtc': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}
    with ROLLBACK_RECEIPT.open('x', encoding='utf-8', newline='\n') as handle:
        json.dump(rollback, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print(json.dumps(rollback, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--apply', action='store_true', help='Apply the reviewed tag.exhaust registry update.')
    group.add_argument('--rollback', action='store_true', help='Restore exact preflighted file bytes if untouched since apply.')
    args = parser.parse_args()
    if args.apply:
        run_apply()
    elif args.rollback:
        run_rollback()
    else:
        run_dry_run()


if __name__ == '__main__':
    main()
