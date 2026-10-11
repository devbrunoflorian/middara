import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { localOverridesStorageKey } from '../src/localPersistence';
import type { SpanOverride } from '../src/components/RichSpanEditor';

describe('p. 41 translated substep marker spacing', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  let previousRangeClientRects: PropertyDescriptor | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    previousRangeClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    if (!previousRangeClientRects) {
      Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [] }),
    }));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    if (previousRangeClientRects) Object.defineProperty(Range.prototype, 'getClientRects', previousRangeClientRects);
    else delete (Range.prototype as Range & { getClientRects?: () => DOMRectList }).getClientRects;
    previousRangeClientRects = undefined;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('paints the marker tab as one visible space without changing the local override', async () => {
    const pagePath = join(process.cwd(), 'public/pages/page_041/page_041_dom.json');
    const page = JSON.parse(readFileSync(pagePath, 'utf8')) as PageData;
    const override: SpanOverride = {
      spanKey: 'page_41_unit_p41-step-4-substep-b__pt-BR',
      bbox: [100.51, 572.816, 381.869, 606.736],
      textAlign: 'left',
      lineHeight: 1.1,
      segments: [
        { text: 'b.', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal' },
        { text: '\tFaça uma Rolagem de Esquiva:', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' },
      ],
    };
    localStorage.setItem(localOverridesStorageKey('pt-BR'), JSON.stringify([override]));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={{ ...page, images: [] }} isAdmin={false} language="pt-BR" />);
    });

    const rendered = Array.from(container.querySelectorAll<HTMLElement>('.realbox'))
      .find(element => element.textContent?.includes('Faça uma Rolagem de Esquiva'));
    expect(rendered).not.toBeUndefined();
    expect(rendered!.textContent).toContain('b. Faça uma Rolagem de Esquiva:');
    expect(rendered!.textContent).not.toContain('\t');

    const persisted = JSON.parse(localStorage.getItem(localOverridesStorageKey('pt-BR')) || '[]') as SpanOverride[];
    expect(persisted[0].segments[1].text).toBe('\tFaça uma Rolagem de Esquiva:');
  });
});
