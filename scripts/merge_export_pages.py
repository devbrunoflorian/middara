"""Merge independently verified single-page PDFs without changing page geometry."""

from __future__ import annotations

import argparse
from pathlib import Path

import pymupdf


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    parser.add_argument('pages', type=Path, nargs='+')
    args = parser.parse_args()
    if not args.pages:
        raise ValueError('At least one verified page is required.')

    merged = pymupdf.open()
    try:
        for page_path in args.pages:
            if not page_path.is_file():
                raise FileNotFoundError(f'Missing verified page: {page_path.name}')
            source = pymupdf.open(page_path)
            try:
                if source.page_count != 1:
                    raise ValueError(f'{page_path.name} must contain exactly one page.')
                merged.insert_pdf(source, links=True, annots=True)
            finally:
                source.close()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        merged.save(args.output, garbage=3, deflate=True)
    finally:
        merged.close()

    result = pymupdf.open(args.output)
    try:
        if result.page_count != len(args.pages):
            raise ValueError(f'Expected {len(args.pages)} pages, merged {result.page_count}.')
        for index, page_path in enumerate(args.pages):
            page_source = pymupdf.open(page_path)
            try:
                expected = page_source[0].mediabox
                actual = result[index].mediabox
                if abs(actual.width - expected.width) > 0.01 or abs(actual.height - expected.height) > 0.01:
                    raise ValueError(f'Page box changed while merging {page_path.name}.')
            finally:
                page_source.close()
    finally:
        result.close()
    print(f'Merged {len(args.pages)} verified pages into {args.output.name}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
