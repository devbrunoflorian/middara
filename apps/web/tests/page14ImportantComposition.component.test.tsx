import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueriesForElement } from '@testing-library/dom';
import { createRoot } from 'react-dom/client';
import { RichSpanEditor } from '../src/components/RichSpanEditor';
import { decodeOverrideData, encodeOverrideData } from '../src/symbols/overrideData';
import {
  buildInitialPage14ImportantUnitOverrides,
  buildPage14ImportantCompositionProof,
  describePage14ImportantFit,
  mapExplicitStyleIntervals,
  PAGE14_IMPORTANT_SOURCE_UNITS,
} from '../src/experiments/page14-important-composition';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups = new Set<() => void>();

function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  const unmount = () => {
    act(() => root.unmount());
    container.remove();
    cleanups.delete(unmount);
  };
  cleanups.add(unmount);
  return { container, unmount, ...getQueriesForElement(container) };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.unstubAllGlobals();
});

describe('page 14 IMPORTANT composition proof', () => {
  it('keeps all three source owners, exact target intervals, the label outline, and one semantic lightning', () => {
    const proof = buildPage14ImportantCompositionProof();
    expect(proof.targetText).toBe('\uFFFCIMPORTANTE: Durante o 1º turno de cada Aventureiro no Encontro, não se ganha SP na Fase de Manutenção. Veja Fases do Turno de um Aventureiro, pág. 37.');
    expect(proof.sourceUnitIds).toHaveLength(3);
    expect(proof.override.segments.map(segment => segment.text).join('')).toBe(proof.targetText);
    expect(proof.ownerRanges.map(range => proof.targetText.slice(range.start, range.end))).toEqual(proof.ownerRanges.map(range => range.text));
    expect(proof.override.segments.filter(segment => segment.symbolId === 'tag.important.icon')).toHaveLength(1);
    expect(proof.override.segments.find(segment => segment.symbolId)?.symbolMetrics?.renderVariant).toBe('important-outline-2pt-at-9pt');

    const label = proof.styleIntervals.find(interval => interval.id === 'label')!;
    expect(proof.targetText.slice(label.start, label.end)).toBe('IMPORTANTE:');
    for (const [id, text] of [
      ['first-turn', '1º'],
      ['stamina-points', 'SP'],
      ['cross-reference', 'Fases do Turno de um Aventureiro'],
    ] as const) {
      const interval = proof.styleIntervals.find(candidate => candidate.id === id)!;
      expect(proof.targetText.slice(interval.start, interval.end)).toBe(text);
      expect(interval.start).toBe(proof.targetText.indexOf(text));
    }
    const labelSegment = proof.override.segments.find(segment => segment.text === 'IMPORTANTE:')!;
    expect(labelSegment).toMatchObject({ color: '#b91d23', weight: 900, textStrokeWidthPt: 2, textStrokeColor: '#ffffff' });
    expect(proof.override.segments.find(segment => segment.text === 'SP')).toMatchObject({ size: 9, weight: 700, style: 'normal' });
    expect(proof.override.segments.find(segment => segment.text === '1º')).toMatchObject({ weight: 700, style: 'normal' });
    expect(proof.override.segments.find(segment => segment.text === 'Fases do Turno de um Aventureiro')).toMatchObject({ weight: 700, style: 'italic' });
    expect(proof.override.segments.find(segment => segment.text.includes('na Fase de Manutenção'))).toMatchObject({ font: 'OptimaLTStd', weight: 400, style: 'normal' });
  });

  it('keeps three real editor IDs independent while composing one live block', () => {
    const units = buildInitialPage14ImportantUnitOverrides();
    const keys = PAGE14_IMPORTANT_SOURCE_UNITS.map(id => `page_14_unit_${id}__pt-BR`);
    expect([...units.keys()]).toEqual(keys);
    expect(units.get(keys[0])?.segments[0].symbolId).toBe('tag.important.icon');
    expect(units.get(keys[1])?.segments.map(segment => segment.text).join('')).toBe('SP');

    const before = buildPage14ImportantCompositionProof(units);
    const thirdUnit = units.get(keys[2])!;
    const changedUnits = new Map(units);
    changedUnits.set(keys[2], {
      ...thirdUnit,
      segments: thirdUnit.segments.map(segment => ({
        ...segment,
        text: segment.text.replace('pág. 37.', 'pág. 38.'),
      })),
    });
    const after = buildPage14ImportantCompositionProof(changedUnits);

    expect(after.targetText).toContain('Veja Fases do Turno de um Aventureiro, pág. 38.');
    expect(after.targetText).not.toContain('pág. 37.');
    expect(changedUnits.get(keys[0])).toEqual(units.get(keys[0]));
    expect(changedUnits.get(keys[1])).toEqual(units.get(keys[1]));
    expect(after.sourceUnitIds).toEqual([...PAGE14_IMPORTANT_SOURCE_UNITS]);
    expect(after.override.segments.filter(segment => segment.symbolId === 'tag.important.icon')).toHaveLength(1);
    expect(before.targetText).toContain('SP na Fase de Manutenção.');
  });

  it('round-trips the proposal through the existing override codec without losing rich styles or the symbol', () => {
    const proof = buildPage14ImportantCompositionProof();
    const restored = decodeOverrideData(JSON.parse(JSON.stringify(encodeOverrideData(proof.override))));
    expect(restored?.segments).toEqual(proof.override.segments);
    const restoredUnits = [...proof.unitOverrides].map(([key, override]) => [
      key,
      decodeOverrideData(JSON.parse(JSON.stringify(encodeOverrideData(override))))?.segments,
    ] as const);
    expect(restoredUnits.map(([, segments]) => segments)).toEqual([...proof.unitOverrides.values()].map(unit => unit.segments));
  });

  it('blocks a style anchor that is repeated instead of guessing which target occurrence inherits emphasis', () => {
    expect(() => mapExplicitStyleIntervals('SP is spent; SP is gained.', [{
      id: 'ambiguous-sp',
      targetText: 'SP',
      sourceSpanRefs: ['line_16_1:3'],
      style: { font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal' },
    }])).toThrow('must occur once in the final target; found 2');
  });

  it('reports measured sub-point bbox overflow without hiding it behind a tolerance', () => {
    expect(describePage14ImportantFit({
      leftOverflowPt: 0,
      rightOverflowPt: 0,
      topOverflowPt: 0,
      bottomOverflowPt: 0.43,
      nextUnitGapPt: 10.01,
    })).toBe('EXCESSO GEOMÉTRICO DE RANGE/PATH em 0.43 pt nesta escala; distância até a próxima unidade: 10.01 pt. Isso não prova corte de tinta; copy fit continua pendente.');
  });

  it('reports top-edge overflow instead of calling the composition fitted', () => {
    expect(describePage14ImportantFit({
      leftOverflowPt: 0,
      rightOverflowPt: 0,
      topOverflowPt: 1.24,
      bottomOverflowPt: 0,
      nextUnitGapPt: 11,
    })).toBe('EXCESSO GEOMÉTRICO DE RANGE/PATH em 1.24 pt nesta escala; distância até a próxima unidade: 11.00 pt. Isso não prova corte de tinta; copy fit continua pendente.');
  });

  it('shows the compiled emphasis and symbol runs in the existing Rich Block Editor without saving', () => {
    const proof = buildPage14ImportantCompositionProof();
    const view = render(<RichSpanEditor
      spanKey={proof.override.spanKey}
      originalText={proof.targetText}
      originalFont="OptimaLTStd"
      originalSize={10}
      originalColor="#231f20"
      originalWeight={400}
      originalStyle="normal"
      originalSegments={proof.override.segments}
      bbox={proof.override.bbox}
      pageNumber={14}
      language="pt-BR"
      onClose={vi.fn()}
      onSave={vi.fn()}
      existingOverride={proof.override}
    />);

    const chips = [...view.container.querySelectorAll<HTMLElement>('.rse-segment-chip')];
    const chipFor = (text: string) => chips.find(chip => chip.querySelector('.rse-seg-text')?.textContent?.includes(text));
    expect(chipFor('SP')?.querySelector('.rse-seg-meta')?.textContent).toContain('700');
    expect(chipFor('Fases do Turno')?.querySelector('.rse-seg-meta')?.textContent).toContain('italic');
    expect(chipFor('IMPORTANTE:')?.querySelector('.rse-seg-meta')?.textContent).toContain('#b91d23');
    expect(view.container.querySelectorAll('[data-symbol-id="tag.important.icon"]')).toHaveLength(1);
    expect(view.container.querySelector('.rse-panel')).not.toBeNull();
  });
});
