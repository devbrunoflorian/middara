import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPage14V2ExperimentalFrames,
  getPage14V2ExperimentalOverrides,
  PAGE14_V2_SNAPSHOT,
  PAGE14_V2_VOTE_STORAGE_KEY_EXPORTED,
  readPage14V2ExperimentLocation,
  savePage14V2Vote,
  updatePage14V2ExperimentLocation,
  getPage14ExperimentalFrames,
  getPage14ExperimentalOverrides,
  PAGE14_EDITORIAL_EXPERIMENT,
  readPage14ExperimentLocation,
  updatePage14ExperimentLocation,
  getPage14V3CurrentOverrides,
  getPage14V3CurrentCandidate,
  getPage14V3Frames,
  normalizePage14V3UnitKey,
  PAGE14_V3_COPYFIT,
} from '../src/editorialExperiment';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('page 14 editorial experiment snapshots', () => {
  it('uses the same captured frames for A and B and does not mutate the snapshot', () => {
    const a = getPage14ExperimentalFrames();
    const b = getPage14ExperimentalFrames();
    expect([...a]).toEqual([...b]);

    const [frameKey, frame] = [...a][0];
    frame.width += 20;
    expect(getPage14ExperimentalFrames().get(frameKey)).toEqual(PAGE14_EDITORIAL_EXPERIMENT.baselineFrames[frameKey]);
  });

  it('keeps the same editorial keys in A and B, with separate rich-text snapshots', () => {
    const a = getPage14ExperimentalOverrides('A');
    const b = getPage14ExperimentalOverrides('B');
    expect([...a.keys()]).toEqual([...b.keys()]);
    expect(a.size).toBe(3);
    expect(a.get('page_14_block_17')?.segments.some(segment => segment.text === 'B' && segment.weight === 700)).toBe(true);
    expect(a.get('page_14_block_17')?.segments.some(segment => segment.style === 'italic' && segment.weight === 700)).toBe(true);
    expect(a.get('page_14_block_23')?.segments[0].text).not.toBe(b.get('page_14_block_23')?.segments[0].text);

    const firstA = a.get('page_14_block_17')!;
    firstA.segments[0].text = 'mutated';
    expect(getPage14ExperimentalOverrides('A').get('page_14_block_17')?.segments[0].text).not.toBe('mutated');
  });

  it('restores the selected experiment and variant from the URL without local storage', () => {
    const href = updatePage14ExperimentLocation('http://localhost:8080/?tab=rulebook', 'B');
    expect(href).toContain('tab=rulebook');
    expect(readPage14ExperimentLocation(new URL(href, 'http://localhost').search)).toEqual({ pageNumber: 14, variant: 'B' });
    expect(readPage14ExperimentLocation('?experiment=unknown&variant=A')).toBeNull();
    expect(readPage14ExperimentLocation(`?experiment=${PAGE14_EDITORIAL_EXPERIMENT.id}&variant=C`)).toBeNull();
  });
});

describe('page 14 editorial A/B V2 blind snapshot', () => {
  it('keeps all eight units and exactly the same frozen frames for X and Y', () => {
    expect(PAGE14_V2_SNAPSHOT.units).toHaveLength(8);
    const xFrames = getPage14V2ExperimentalFrames();
    const yFrames = getPage14V2ExperimentalFrames();
    expect([...xFrames]).toEqual([...yFrames]);
    const x = getPage14V2ExperimentalOverrides('X');
    const y = getPage14V2ExperimentalOverrides('Y');
    expect([...x.keys()]).toEqual([...y.keys()]);
    for (const key of x.keys()) expect(x.get(key)?.bbox).toEqual(y.get(key)?.bbox);
  });

  it('reconstructs source rich-text roles and tab structure without altering saved frames', () => {
    const x = getPage14V2ExperimentalOverrides('X');
    const y = getPage14V2ExperimentalOverrides('Y');
    for (const variant of [x, y]) {
      const phase = variant.get('page_14_block_1')!;
      expect(phase.segments.some(segment => segment.text === '1.')).toBe(true);
      expect(phase.segments.some(segment => segment.text === '\t')).toBe(true);
      expect(phase.segments.some(segment => segment.font === 'OptimaLTStd-BoldItalic' && segment.text === 'mais')).toBe(true);
      expect(phase.segments.some(segment => segment.style === 'italic' && segment.text === 'Efeito')).toBe(true);
      expect(variant.get('page_14_block_7')?.segments.some(segment => segment.style === 'italic' && segment.weight === 700 && segment.text === 'Trilha de Iniciativa')).toBe(true);
    }
  });

  it('restores V2 URL state without changing the historical V1 location parser', () => {
    const next = updatePage14V2ExperimentLocation('http://localhost:8080/?tab=rulebook', 'X');
    expect(next).toContain('tab=rulebook');
    expect(readPage14V2ExperimentLocation(new URL(next, 'http://localhost').search)).toEqual({ pageNumber: 14, variant: 'X' });
    expect(readPage14V2ExperimentLocation('?experiment=page14-editorial-ab-v2-2026-10-12&variant=A')).toBeNull();
    expect(readPage14ExperimentLocation('?experiment=page14-editorial-ab-v2-2026-10-12&variant=X')).toBeNull();
  });

  it('updates only the dedicated blind-vote record and preserves other local values/votes', () => {
    const store = new Map([['v2-test-unrelated-key', 'preserve-me']]);
    const setItem = vi.fn((key: string, value: string) => { store.set(key, value); });
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem } });
    const previousVote = { unitKey: 'page_14_block_0', preference: 'X' as const, note: 'nota anterior', savedAt: '2026-10-12T00:00:00Z' };
    const nextVote = { unitKey: 'page_14_block_1', preference: 'tie' as const, note: '', savedAt: '2026-10-12T00:01:00Z' };
    const saved = savePage14V2Vote([previousVote], nextVote);
    expect(saved).toEqual([previousVote, nextVote]);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(PAGE14_V2_VOTE_STORAGE_KEY_EXPORTED, JSON.stringify(saved));
    expect(store.get('v2-test-unrelated-key')).toBe('preserve-me');
  });

  it('propagates a local storage failure instead of pretending that a vote was saved', () => {
    vi.stubGlobal('window', { localStorage: { setItem: () => { throw new Error('quota'); } } });
    expect(() => savePage14V2Vote([], { unitKey: 'page_14_block_0', preference: 'X', note: '', savedAt: '2026-10-12T00:00:00Z' }))
      .toThrow('quota');
  });
});

describe('page 14 editorial A/B V3 copyfit gate', () => {
  it('normalizes selected legacy block keys with locale suffixes, rejecting unrelated keys', () => {
    expect(normalizePage14V3UnitKey('page_14_block_1')).toBe('page_14_block_1');
    expect(normalizePage14V3UnitKey('page_14_block_1__pt-BR')).toBe('page_14_block_1');
    expect(normalizePage14V3UnitKey('page_14_block_1__en')).toBe('page_14_block_1');
    expect(normalizePage14V3UnitKey('page_15_block_1__pt-BR')).toBeNull();
    expect(normalizePage14V3UnitKey(null)).toBeNull();
  });

  it('uses identical source frames, blocks exhausted overflow candidates, and keeps safe drafts inspectable', () => {
    expect([...getPage14V3Frames()]).toEqual([...getPage14V2ExperimentalFrames()]);
    expect(PAGE14_V3_COPYFIT.conditions.A.units.page_14_block_1.status).toBe('fit-awaiting-human-review');
    expect(PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_6.status).toBe('fit-awaiting-human-review');
    expect(PAGE14_V3_COPYFIT.conditions.A.units.page_14_block_1.historicalStatusBeforeStructuralCorrection).toBe('blocked-overflow-revisions-exhausted');
    expect(PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_6.historicalStatusBeforeStructuralCorrection).toBe('blocked-overflow-revisions-exhausted');
    expect(PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_1.status).toBe('blocked-structural-remeasurement-overflow');
    expect(PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_5.status).toBe('blocked-structural-remeasurement-overflow');
    expect(PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_1.historicalStatusBeforeStructuralCorrection).toBe('fit-awaiting-human-review');
    expect(PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_5.historicalStatusBeforeStructuralCorrection).toBe('fit-awaiting-human-review');
    expect(PAGE14_V3_COPYFIT.conditions.A.units.page_14_block_7.status).toBe('source-en-preserved-not-translated');
    expect(PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_7.status).toBe('source-en-preserved-not-translated');
    expect(PAGE14_V3_COPYFIT.conditions.A.units.page_14_block_1.proposedText).toContain('Valor de Recuperação de Stamina');
    expect(PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_6.proposedText).toContain('A ordem é livre');
    const aOverrides = getPage14V3CurrentOverrides('A');
    const bOverrides = getPage14V3CurrentOverrides('B');
    expect(aOverrides.has('page_14_block_1')).toBe(true);
    expect(bOverrides.has('page_14_block_6')).toBe(true);
    expect(aOverrides.has('page_14_block_7')).toBe(false);
    expect(bOverrides.has('page_14_block_7')).toBe(false);
    expect(aOverrides.size).toBe(7);
    expect(bOverrides.size).toBe(5);
    expect(getPage14V3CurrentOverrides('A').has('page_14_block_5')).toBe(true);
    expect(getPage14V3CurrentOverrides('B').has('page_14_block_6')).toBe(true);
    expect(getPage14V3CurrentOverrides('B').has('page_14_block_1')).toBe(false);
    expect(getPage14V3CurrentOverrides('B').has('page_14_block_5')).toBe(false);
    const derivedA1 = getPage14V3CurrentCandidate('A', 'page_14_block_1')!;
    expect(derivedA1.derivedRevision?.id).toBe('condition-a-phase-1-copyfit-derived-final');
    expect(derivedA1.status).toBe('fit-awaiting-human-review');
    expect(derivedA1.derivedRevision?.priorAttempts).toHaveLength(3);
    expect(derivedA1.derivedRevision?.priorAttempts?.every(attempt => attempt.status === 'blocked-live-overflow')).toBe(true);
    expect(aOverrides.get('page_14_block_1')?.segments.some(segment => segment.text === 'mais' && segment.font === 'OptimaLTStd-BoldItalic')).toBe(true);
    expect(aOverrides.get('page_14_block_1')?.segments.some(segment => segment.text === 'Dano' && segment.style === 'italic')).toBe(true);
    const runtimeBlockedA1 = getPage14V3CurrentOverrides('A', new Set(['page_14_block_1']));
    expect(runtimeBlockedA1.has('page_14_block_1')).toBe(false);
    expect(runtimeBlockedA1.has('page_14_block_5')).toBe(true);
    expect(runtimeBlockedA1.size).toBe(aOverrides.size - 1);
  });

  it('requires complete live measurements and distinguishes frame overflow from collision', () => {
    const conditionA = PAGE14_V3_COPYFIT.conditions.A.units;
    const conditionB = PAGE14_V3_COPYFIT.conditions.B.units;
    for (const units of [conditionA, conditionB]) {
      for (const unit of Object.values(units)) {
        expect(unit.proposalMeasurement).toMatchObject({
          viewport: '1536×639',
          devicePixelRatio: 1.25,
          zoomLevel: 2,
          collision: false,
        });
      }
    }
    expect(conditionA.page_14_block_1.proposalMeasurement).toMatchObject({ bottomOverflowPx: 1.1, overflow: true });
    expect(conditionB.page_14_block_6.proposalMeasurement).toMatchObject({ rightEdgeOverflowPx: 3, overflow: true });
    expect(conditionA.page_14_block_5.proposalMeasurement).toMatchObject({ lineCount: 5, frameHeightPx: 72.2, overflow: false });
  });
});
