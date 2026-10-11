import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Segment } from '../src/components/RichSpanEditor';
import { attachSourceInlineElements, sourceMaskClipPath, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { editableTextForSegments, segmentsFromEditableText } from '../src/symbols/inlineCodec';
import { getSymbolEditorToken, isSymbolAllowed, resolveLegacySymbol } from '../src/symbols/semanticSymbols';
import { SemanticSymbol } from '../src/symbols/SemanticSymbol';

const mapFont = (font: string) => ({ weight: font.includes('Bold') ? 700 : 400, style: 'normal' as const });

const cases = [
  { page: 13, lineId: 'line_19_0', symbolId: 'story.pencil', text: 'New Story Flag:', color: '#231f20' },
  { page: 78, lineId: 'line_25_4', symbolId: 'attack.melee', text: '(Melee) or ', color: '#231f20' },
];

describe('source inline whitespace ordering', () => {
  it('preserves adjacent whitespace while cleaning the full native circular symbol ink', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_078');
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const target = elements.find(element => element.symbolId === 'attack.ranged'
      && element.anchor.blockId === 'block_18' && element.anchor.lineId === 'line_18_4')!;
    expect(target).toBeDefined();
    expect(target.anchor.side).toBe('before');

    const style = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
    const token = getSymbolEditorToken('attack.ranged', 'en')!;
    const variants = [
      { value: `${token}Ranged`, before: '', after: 'Ranged' },
      { value: `${token} Ranged`, before: '', after: ' Ranged' },
      { value: `Weapon${token}`, before: 'Weapon', after: '' },
      { value: `Weapon ${token}`, before: 'Weapon ', after: '' },
      { value: `Weapon ${token} Ranged`, before: 'Weapon ', after: ' Ranged' },
    ];
    const parsed = variants.map(variant => segmentsFromEditableText(variant.value, style, 'en'));
    for (const [index, variant] of variants.entries()) {
      expect(parsed[index].map(run => run.symbolId ? `symbol:${run.symbolId}` : run.text).filter(Boolean)).toEqual([
        ...(variant.before ? [variant.before] : []), 'symbol:attack.ranged', ...(variant.after ? [variant.after] : []),
      ]);
      expect(parsed[index].filter(run => run.symbolId).map(run => run.symbolId)).toEqual(['attack.ranged']);
    }
    const toggledBeforeSpace = [variants[4], variants[4], variants[4]].map((variant, index) =>
      segmentsFromEditableText(index === 1 ? `Weapon${token} Ranged` : variant.value, style, 'en')
        .map(run => run.symbolId ? `symbol:${run.symbolId}` : run.text).filter(Boolean),
    );
    expect(toggledBeforeSpace).toEqual([
      ['Weapon ', 'symbol:attack.ranged', ' Ranged'],
      ['Weapon', 'symbol:attack.ranged', ' Ranged'],
      ['Weapon ', 'symbol:attack.ranged', ' Ranged'],
    ]);
    const toggledAfterSpace = [variants[4], variants[4], variants[4]].map((variant, index) =>
      segmentsFromEditableText(index === 1 ? `Weapon ${token}Ranged` : variant.value, style, 'en')
        .map(run => run.symbolId ? `symbol:${run.symbolId}` : run.text).filter(Boolean),
    );
    expect(toggledAfterSpace).toEqual([
      ['Weapon ', 'symbol:attack.ranged', ' Ranged'],
      ['Weapon ', 'symbol:attack.ranged', 'Ranged'],
      ['Weapon ', 'symbol:attack.ranged', ' Ranged'],
    ]);

    const [maskX0, maskY0, maskX1, maskY1] = target.mask.bbox;
    const [x0, y0, x1, y1] = target.bbox;
    const clip = sourceMaskClipPath(target)!;
    const match = clip.match(/^ellipse\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%\)$/)!;
    const maskWidth = maskX1 - maskX0;
    const maskHeight = maskY1 - maskY0;
    expect(Number(match[1])).toBe(49);
    expect(Number(match[2])).toBe(49);
    expect(Number(match[1]) * maskWidth / 100).toBeGreaterThan((x1 - x0) / 2);
    expect(Number(match[2]) * maskHeight / 100).toBeGreaterThan((y1 - y0) / 2);
    expect(Number(match[1]) * maskWidth / 100).toBeLessThan(maskWidth / 2);
    expect(Number(match[2]) * maskHeight / 100).toBeLessThan(maskHeight / 2);
    expect(Number(match[3])).toBeCloseTo(((x0 + x1) / 2 - maskX0) / maskWidth * 100, 8);
    expect(Number(match[4])).toBeCloseTo(((y0 + y1) / 2 - maskY0) / maskHeight * 100, 8);

    const otherAttackFamily = elements.find(element => element.symbolId === 'attack.melee-ranged'
      && element.mask.clipShape === 'circle')!;
    expect(otherAttackFamily).toBeDefined();
    expect(sourceMaskClipPath(otherAttackFamily)).toMatch(/^ellipse\(/);
    const nonCircularSemanticFamily = elements.find(element => element.symbolId === 'tag.important.icon')!;
    expect(nonCircularSemanticFamily).toBeDefined();
    expect(sourceMaskClipPath(nonCircularSemanticFamily)).toBeUndefined();

    const pageCircleMasks = elements.filter(element => element.mask.clipShape === 'circle');
    expect(pageCircleMasks).toHaveLength(18);
    for (const circularElement of pageCircleMasks) {
      const circleClip = sourceMaskClipPath(circularElement)!;
      const circleMatch = circleClip.match(/^ellipse\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%\)$/)!;
      const [circleMaskX0, circleMaskY0, circleMaskX1, circleMaskY1] = circularElement.mask.bbox;
      const [symbolX0, symbolY0, symbolX1, symbolY1] = circularElement.bbox;
      expect(Number(circleMatch[1]) * (circleMaskX1 - circleMaskX0) / 100)
        .toBeCloseTo((circleMaskX1 - circleMaskX0) * 0.49, 8);
      expect(Number(circleMatch[2]) * (circleMaskY1 - circleMaskY0) / 100)
        .toBeCloseTo((circleMaskY1 - circleMaskY0) * 0.49, 8);
      expect(Number(circleMatch[1]) * (circleMaskX1 - circleMaskX0) / 100).toBeGreaterThan((symbolX1 - symbolX0) / 2);
      expect(Number(circleMatch[2]) * (circleMaskY1 - circleMaskY0) / 100).toBeGreaterThan((symbolY1 - symbolY0) / 2);
    }
  });

  it('keeps all 44 circular attack-symbol cleanup masks inside their raster crop padding', () => {
    const pagesRoot = join(process.cwd(), 'public/pages');
    const counts = new Map<string, number>();
    const pages = new Set<number>();
    let total = 0;

    for (const pageDir of readdirSync(pagesRoot).filter(name => /^page_\d{3}$/.test(name))) {
      const pageNumber = Number(pageDir.slice(-3));
      const pagePath = join(pagesRoot, pageDir);
      const sidecarPath = join(pagePath, 'inline_elements.json');
      if (!existsSync(sidecarPath)) continue;
      const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8')) as { elements: SourceInlineElement[] };
      const elements = sidecar.elements.filter(element => element.mask.clipShape === 'circle');
      if (!elements.length) continue;

      pages.add(pageNumber);
      const dom = JSON.parse(readFileSync(join(pagePath, `${pageDir}_dom.json`), 'utf8'));
      const before = JSON.stringify(dom.blocks);
      const anchorsBefore = JSON.stringify(sidecar.elements.map(element => element.anchor));
      const attached = attachSourceInlineElements(dom.blocks, sidecar.elements);
      expect(JSON.stringify(dom.blocks), `source DOM must remain immutable on p.${pageNumber}`).toBe(before);
      expect(JSON.stringify(sidecar.elements.map(element => element.anchor)), `anchors must remain immutable on p.${pageNumber}`)
        .toBe(anchorsBefore);

      for (const element of elements) {
        total++;
        counts.set(element.symbolId, (counts.get(element.symbolId) ?? 0) + 1);
        expect(['attack.melee', 'attack.ranged', 'attack.melee-ranged']).toContain(element.symbolId);
        expect(element.bbox.every(Number.isFinite)).toBe(true);
        expect(element.mask.bbox.every(Number.isFinite)).toBe(true);

        const [x0, y0, x1, y1] = element.bbox;
        const [maskX0, maskY0, maskX1, maskY1] = element.mask.bbox;
        expect(x1).toBeGreaterThan(x0);
        expect(y1).toBeGreaterThan(y0);
        expect(maskX0).toBeLessThanOrEqual(x0);
        expect(maskY0).toBeLessThanOrEqual(y0);
        expect(maskX1).toBeGreaterThanOrEqual(x1);
        expect(maskY1).toBeGreaterThanOrEqual(y1);

        const maskFile = element.mask.url.split('/').at(-1)!;
        const maskPath = join(pagePath, maskFile);
        expect(existsSync(maskPath), `p.${pageNumber} missing ${maskFile}`).toBe(true);
        const png = readFileSync(maskPath);
        expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(png.readUInt32BE(16)).toBeGreaterThan(0);
        expect(png.readUInt32BE(20)).toBeGreaterThan(0);

        const clip = sourceMaskClipPath(element);
        expect(clip).toBeDefined();
        const clipMatch = clip!.match(/^ellipse\(([-\d.]+)% ([-\d.]+)% at ([-\d.]+)% ([-\d.]+)%\)$/);
        expect(clipMatch, `p.${pageNumber} ${element.symbolId} must have a bounded circular clip`).not.toBeNull();
        const [, rxText, ryText, cxText, cyText] = clipMatch!;
        const maskWidth = maskX1 - maskX0;
        const maskHeight = maskY1 - maskY0;
        const rx = Number(rxText) * maskWidth / 100;
        const ry = Number(ryText) * maskHeight / 100;
        const cx = maskX0 + Number(cxText) * maskWidth / 100;
        const cy = maskY0 + Number(cyText) * maskHeight / 100;
        expect(rx).toBeCloseTo(maskWidth * 0.49, 7);
        expect(ry).toBeCloseTo(maskHeight * 0.49, 7);
        expect(cx).toBeCloseTo((x0 + x1) / 2, 7);
        expect(cy).toBeCloseTo((y0 + y1) / 2, 7);
        expect(rx).toBeGreaterThan((x1 - x0) / 2);
        expect(ry).toBeGreaterThan((y1 - y0) / 2);
        expect(rx).toBeLessThan(maskWidth / 2);
        expect(ry).toBeLessThan(maskHeight / 2);

        const block = attached.find((candidate: { id: string }) => candidate.id === element.anchor.blockId);
        const line = block?.lines?.find((candidate: { id: string }) => candidate.id === element.anchor.lineId);
        expect(line, `p.${pageNumber} ${element.symbolId} anchor line should survive attachment`).toBeDefined();
        const attachedSpans = line!.spans.filter((span: { semanticSymbolId?: string; bbox?: number[] }) =>
          span.semanticSymbolId === element.symbolId && span.bbox?.every((value, index) => value === element.bbox[index]));
        expect(attachedSpans, `p.${pageNumber} ${element.symbolId} anchor should attach exactly once`).toHaveLength(1);
        const [span] = attachedSpans;
        expect(span.bbox).toEqual(element.bbox);
        const expectedMetrics = element.metrics ? {
          ...element.metrics,
          ...(element.anchor.gapPt !== undefined ? { gapEm: element.anchor.gapPt / element.anchor.sizePt } : {}),
          ...(element.anchor.trailingGapPt !== undefined
            ? { trailingGapEm: element.anchor.trailingGapPt / element.anchor.sizePt } : {}),
        } : undefined;
        expect(span.sourceSymbolMetrics).toEqual(expectedMetrics);

        const sourceLine = dom.blocks.find((candidate: { id: string }) => candidate.id === element.anchor.blockId)
          ?.lines.find((candidate: { id: string }) => candidate.id === element.anchor.lineId);
        expect(sourceLine, `p.${pageNumber} source anchor line should exist`).toBeDefined();
        const runs = sourceSpanRuns(line!.spans, mapFont);
        const matchingRun = runs.filter(run => run.symbolId === element.symbolId);
        expect(matchingRun.filter(run => run.symbolMetrics?.widthEm === element.metrics?.widthEm)).not.toHaveLength(0);
      }
    }

    expect(total).toBe(44);
    expect(pages.size).toBe(14);
    expect(Object.fromEntries(counts)).toEqual({
      'attack.melee': 25,
      'attack.ranged': 11,
      'attack.melee-ranged': 8,
    });
  });

  for (const item of cases) {
    it(`p${item.page} inserts ${item.symbolId} before its geometrically following space`, () => {
    const pageDir = join(process.cwd(), 'public/pages', `page_${String(item.page).padStart(3, '0')}`);
    const dom = JSON.parse(readFileSync(join(pageDir, `page_${String(item.page).padStart(3, '0')}_dom.json`), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const target = elements.find(element => element.symbolId === item.symbolId && element.anchor.lineId === item.lineId)!;
    expect(target).toBeDefined();
    expect(target.anchor.side).toBe('before');
    const lineBefore = dom.blocks[target.anchor.blockIndex].lines.find((line: { id: string }) => line.id === item.lineId)!;
    const oldAnchorIndex = target.anchor.spanIndex;
    const oldMetrics = { ...target.metrics };
    const original = JSON.stringify(dom.blocks);

    const blocks = attachSourceInlineElements(dom.blocks, [target]);
    const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
    const line = block.lines.find((candidate: { id: string }) => candidate.id === item.lineId)!;
    const runs = sourceSpanRuns(line.spans, mapFont);

    expect(runs.map(run => [run.text, run.symbolId])).toEqual([
      ['\uFFFC', item.symbolId], [' ', undefined], [item.text, undefined],
    ]);
    const icon = runs[0];
    expect(icon.color).toBe(item.color);
    expect(icon.symbolMetrics).toEqual(oldMetrics);
    expect(lineBefore.spans[oldAnchorIndex - 1].text.trim()).toBe('');
    expect(target.anchor.spanIndex).toBe(oldAnchorIndex);
    expect(JSON.stringify(dom.blocks)).toBe(original);
    });
  }

  it('inherits a unique legacy glyph style when no per-occurrence metrics exist', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_033');
    const dom = JSON.parse(readFileSync(join(pageDir, 'page_033_dom.json'), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const block = dom.blocks.find((candidate: { id: string }) => candidate.id === 'block_111')!;
    const line = block.lines.find((candidate: { id: string }) => candidate.id === 'line_111_2')!;
    const blocks = attachSourceInlineElements(dom.blocks, elements.filter(element => element.anchor.blockId === block.id));
    const attachedBlock = blocks.find((candidate: { id: string }) => candidate.id === block.id)!;
    const attachedLine = attachedBlock.lines.find((candidate: { id: string }) => candidate.id === line.id)!;
    const sourceTemplateSegments = sourceSpanRuns(attachedBlock.lines.flatMap((sourceLine: { spans: unknown[] }) => sourceLine.spans), mapFont);
    const sourceRuns = sourceSpanRuns(attachedLine.spans, mapFont);
    const sourceIcon = sourceRuns.find(run => run.symbolId === 'tag.discard.icon')!;
    const previous = sourceRuns.filter(run => run !== sourceIcon);
    const token = getSymbolEditorToken('tag.discard.icon', 'en')!;
    const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
    const restored = segmentsFromEditableText(token + editableTextForSegments(previous, 'en'), toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
    const restoredIcon = restored.find(run => run.symbolId === 'tag.discard.icon')!;

    expect(sourceIcon.size).toBeCloseTo(5.6832, 3);
    expect(sourceIcon.symbolMetrics).toBeUndefined();
    expect(restoredIcon.size).toBe(sourceIcon.size);
    expect(restoredIcon.color).toBe(sourceIcon.color);
  });

  it('round-trips the source style for every visible, unadapted, unambiguous legacy glyph', () => {
    const pagesRoot = join(process.cwd(), 'public/pages');
    const aliases = new Map<number, { dom: any; elements: SourceInlineElement[]; compounds: any[] }>();
    const targets: { pageNumber: number; blockId: string; lineId: string; spanIndex: number; symbolId: string }[] = [];
    for (const pageDir of readdirSync(pagesRoot).filter(name => /^page_\d{3}$/.test(name))) {
      const pageNumber = Number(pageDir.slice(-3));
      const pageDirPath = join(pagesRoot, pageDir);
      const dom = JSON.parse(readFileSync(join(pageDirPath, `${pageDir}_dom.json`), 'utf8'));
      const sidecarPath = join(pageDirPath, 'inline_elements.json');
      const elements = existsSync(sidecarPath)
        ? JSON.parse(readFileSync(sidecarPath, 'utf8')).elements as SourceInlineElement[] : [];
      const compoundPath = join(pageDirPath, 'compound_elements.json');
      const compounds = existsSync(compoundPath) ? JSON.parse(readFileSync(compoundPath, 'utf8')).elements as any[] : [];
      aliases.set(pageNumber, { dom, elements, compounds });

      for (const block of dom.blocks) for (const line of block.lines) for (const [spanIndex, span] of line.spans.entries()) {
        // Hidden artwork text is not a reader/editor glyph and has no rich-run
        // round-trip contract. Keep this coverage scoped to rendered content.
        if (block.hiddenFromPage) continue;
        const symbol = resolveLegacySymbol(span.font, span.text);
        if (!symbol || !isSymbolAllowed(symbol, 'paragraph')) continue;
        const adapted = elements.some(element => element.anchor.side === 'replace' && element.symbolId === symbol.id
          && element.anchor.blockId === block.id && element.anchor.lineId === line.id && element.anchor.spanIndex === spanIndex);
        const compounded = compounds.some(element => element.anchor.blockId === block.id && element.anchor.lineId === line.id
          && spanIndex >= element.anchor.spanStartIndex && spanIndex <= element.anchor.spanEndIndex);
        if (!adapted && !compounded) targets.push({ pageNumber, blockId: block.id, lineId: line.id, spanIndex, symbolId: symbol.id });
      }
    }
    expect(targets).toHaveLength(126);
    expect(new Set(targets.map(target => target.pageNumber)).size).toBe(26);
    expect(Object.fromEntries(['tag.passive.icon', 'marker.arrow', 'marker.star', 'tag.discard.icon', 'tag.status.icon']
      .map(id => [id, targets.filter(target => target.symbolId === id).length]))).toEqual({
      'tag.passive.icon': 57, 'marker.arrow': 25, 'marker.star': 23, 'tag.discard.icon': 19, 'tag.status.icon': 2,
    });

    for (const target of targets) {
      const { dom, elements } = aliases.get(target.pageNumber)!;
      const blockElements = elements.filter(element => element.anchor.blockId === target.blockId);
      const blocks = attachSourceInlineElements(dom.blocks, blockElements);
      const block = blocks.find((candidate: { id: string }) => candidate.id === target.blockId)!;
      const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((sourceLine: { spans: unknown[] }) => sourceLine.spans), mapFont);
      const line = block.lines.find((candidate: { id: string }) => candidate.id === target.lineId)!;
      const sourceRuns = sourceSpanRuns(line.spans, mapFont);
      const sourceIcon = sourceRuns.find(run => run.symbolId === target.symbolId)!;
      const previous = sourceRuns.filter(run => run !== sourceIcon);
      const token = getSymbolEditorToken(target.symbolId, 'en')!;
      const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
      const restored = segmentsFromEditableText(token + editableTextForSegments(previous, 'en'), toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
      const restoredIcon = restored.find(run => run.symbolId === target.symbolId)!;

      expect(restoredIcon.size).toBe(sourceIcon.size);
      expect(restoredIcon.font, `p.${target.pageNumber} ${target.blockId}/${target.lineId} span ${target.spanIndex} ${target.symbolId}: source ${sourceIcon.font}, restored ${restoredIcon.font}`).toBe(sourceIcon.font);
      expect(restoredIcon.color).toBe(sourceIcon.color);
      expect(restoredIcon.weight).toBe(sourceIcon.weight);
      expect(restoredIcon.style).toBe(sourceIcon.style);
      expect(restoredIcon.symbolMetrics).toBeUndefined();
      const renderSymbol = (run: Segment) => renderToStaticMarkup(createElement(SemanticSymbol, {
        id: run.symbolId!, language: 'en', size: run.size, color: run.color, metrics: run.symbolMetrics,
      }));
      expect(renderSymbol(restoredIcon)).toBe(renderSymbol(sourceIcon));
    }
  });

  for (const item of cases) {
    it(`p${item.page} restores ${item.symbolId} source styling and metrics after alias reinsertion`, () => {
      const pageDir = join(process.cwd(), 'public/pages', `page_${String(item.page).padStart(3, '0')}`);
      const dom = JSON.parse(readFileSync(join(pageDir, `page_${String(item.page).padStart(3, '0')}_dom.json`), 'utf8'));
      const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
      const target = elements.find(element => element.symbolId === item.symbolId && element.anchor.lineId === item.lineId)!;
      const blockElements = elements.filter(element => element.anchor.blockId === target.anchor.blockId);
      const blocks = attachSourceInlineElements(dom.blocks, blockElements);
      const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
      const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
      const line = block.lines.find((candidate: { id: string }) => candidate.id === item.lineId)!;
      const sourceRuns = sourceSpanRuns(line.spans, mapFont);
      const sourceIcon = sourceRuns.find(run => run.symbolId === item.symbolId)!;
      const previous = sourceRuns.filter(run => run !== sourceIcon);
      const sourceText = editableTextForSegments(previous, 'en');
      const token = getSymbolEditorToken(item.symbolId, 'en')!;
      const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };

      const restored = segmentsFromEditableText(token + sourceText, toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
      const restoredIcon = restored.find(run => run.symbolId === item.symbolId)!;

      expect(restoredIcon).toBeDefined();
      expect(restoredIcon.size).toBe(sourceIcon.size);
      expect(restoredIcon.color).toBe(sourceIcon.color);
      expect(restoredIcon.symbolMetrics).toEqual(sourceIcon.symbolMetrics);
    });
  }

  it('restores the p. 13 bounty skull source image variant after [[skull]] reinsertion', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_013');
    const dom = JSON.parse(readFileSync(join(pageDir, 'page_013_dom.json'), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const target = elements.find(element => element.symbolId === 'combat.skull'
      && element.anchor.blockId === 'block_48' && element.anchor.lineId === 'line_48_0')!;
    expect(target).toBeDefined();
    const blocks = attachSourceInlineElements(dom.blocks, [target]);
    const block = blocks.find((candidate: { id: string }) => candidate.id === 'block_48')!;
    const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
    const line = block.lines.find((candidate: { id: string }) => candidate.id === 'line_48_0')!;
    const sourceRuns = sourceSpanRuns(line.spans, mapFont);
    const sourceIcon = sourceRuns.find(run => run.symbolId === 'combat.skull')!;
    const previous = sourceRuns.filter(run => run !== sourceIcon);
    const sourceText = editableTextForSegments(previous, 'en');
    const token = getSymbolEditorToken('combat.skull', 'en')!;
    const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };

    expect(sourceIcon.symbolMetrics?.renderVariant).toBe('bounty-red-raster');
    const restored = segmentsFromEditableText(token + sourceText, toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
    const restoredIcon = restored.find(run => run.symbolId === 'combat.skull')!;

    expect(restoredIcon).toBeDefined();
    expect(restoredIcon.size).toBe(sourceIcon.size);
    expect(restoredIcon.color).toBe(sourceIcon.color);
    expect(restoredIcon.symbolMetrics).toEqual(sourceIcon.symbolMetrics);
  });

  it('restores and renders the p. 78 compact black die vector after [[black-die]] reinsertion', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_078');
    const dom = JSON.parse(readFileSync(join(pageDir, 'page_078_dom.json'), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const target = elements.find(element => element.symbolId === 'dice.black'
      && element.anchor.blockId === 'block_22' && element.anchor.lineId === 'line_22_21')!;
    expect(target).toBeDefined();
    const blockElements = elements.filter(element => element.anchor.blockId === target.anchor.blockId);
    const blocks = attachSourceInlineElements(dom.blocks, blockElements);
    const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
    const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
    const line = block.lines.find((candidate: { id: string }) => candidate.id === target.anchor.lineId)!;
    const sourceRuns = sourceSpanRuns(line.spans, mapFont);
    const sourceIcon = sourceRuns.find(run => run.symbolId === 'dice.black')!;
    const previous = sourceRuns.filter(run => run !== sourceIcon);
    const sourceText = editableTextForSegments(previous, 'en');
    const token = getSymbolEditorToken('dice.black', 'en')!;
    const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };

    expect(sourceIcon.symbolMetrics?.renderVariant).toBe('black-p78-compact-lines');
    const restored = segmentsFromEditableText(token + sourceText, toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
    const restoredIcon = restored.find(run => run.symbolId === 'dice.black')!;

    expect(restoredIcon.size).toBe(sourceIcon.size);
    expect(restoredIcon.color).toBe(sourceIcon.color);
    expect(restoredIcon.symbolMetrics).toEqual(sourceIcon.symbolMetrics);

    const svg = renderToStaticMarkup(createElement(SemanticSymbol, {
      id: restoredIcon.symbolId!, language: 'en', size: restoredIcon.size,
      color: restoredIcon.color, metrics: restoredIcon.symbolMetrics,
    }));
    expect(svg.match(/<path\b/g)).toHaveLength(4);
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).not.toMatch(/<rect(?:\s|>)/);
  });

  it('restores the p. 41 source artwork for all six purple and black dice aliases', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_041');
    const dom = JSON.parse(readFileSync(join(pageDir, 'page_041_dom.json'), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const dice = elements.filter(element => element.symbolId === 'dice.purple' || element.symbolId === 'dice.black');
    expect(dice).toHaveLength(6);
    expect(dice.filter(element => element.symbolId === 'dice.purple')).toHaveLength(2);
    expect(dice.filter(element => element.symbolId === 'dice.black')).toHaveLength(4);

    for (const target of dice) {
      const blockElements = elements.filter(element => element.anchor.blockId === target.anchor.blockId);
      const blocks = attachSourceInlineElements(dom.blocks, blockElements);
      const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
      const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
      const line = block.lines.find((candidate: { id: string }) => candidate.id === target.anchor.lineId)!;
      const sourceRuns = sourceSpanRuns(line.spans, mapFont);
      const sourceIcon = sourceRuns.find(run => run.symbolId === target.symbolId)!;
      const previous = sourceRuns.filter(run => run !== sourceIcon);
      const token = getSymbolEditorToken(target.symbolId, 'en')!;
      const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
      // This test knows the source occurrence's line. A block-level template
      // can contain several same-ID symbols with different contextual gaps;
      // choosing one for a newly typed alias would violate the ambiguity guard.
      const restored = segmentsFromEditableText(token + editableTextForSegments(previous, 'en'), toolStyle, 'en', previous, 'paragraph', undefined, sourceRuns);
      const restoredIcon = restored.find(run => run.symbolId === target.symbolId)!;

      expect(restoredIcon.size, `p.41 ${target.anchor.blockId}/${target.anchor.lineId} ${target.symbolId}: source=${sourceIcon.size}, restored=${restoredIcon.size}, source runs=${JSON.stringify(sourceRuns.filter(run => run.symbolId === target.symbolId))}, metrics=${JSON.stringify(restoredIcon.symbolMetrics)}`).toBe(sourceIcon.size);
      expect(restoredIcon.color).toBe(sourceIcon.color);
      expect(restoredIcon.symbolMetrics?.renderVariant).toBe(sourceIcon.symbolMetrics?.renderVariant);
      for (const metric of ['widthEm', 'heightEm', 'verticalAlignEm', 'gapEm', 'trailingGapEm'] as const) {
        const original = sourceIcon.symbolMetrics?.[metric];
        const restored = restoredIcon.symbolMetrics?.[metric];
        if (original === undefined || restored === undefined) {
          expect(restored).toBe(original);
        } else {
          // The two purple source placements differ only by PDF metric rounding.
          expect(Math.abs(restored - original) * sourceIcon.size).toBeLessThanOrEqual(0.0011);
        }
      }

      const svg = renderToStaticMarkup(createElement(SemanticSymbol, {
        id: restoredIcon.symbolId!, language: 'en', size: restoredIcon.size,
        color: restoredIcon.color, metrics: restoredIcon.symbolMetrics,
      }));
      expect(svg.match(/<path\b/g)).toHaveLength(4);
      expect(svg).toContain('stroke="#ffffff"');
      expect(svg).not.toMatch(/<rect(?:\s|>)/);
      if (target.symbolId === 'dice.purple') {
        expect(restoredIcon.symbolMetrics?.renderVariant).toBe('purple-p41-heavy-outline');
        expect(svg).toContain('fill="#6a3f8d"');
        expect(svg).toContain('stroke-width="1.2640000581741333"');
        expect(svg).toContain('stroke-width="0.6629999876022339"');
      } else {
        expect(restoredIcon.symbolMetrics?.renderVariant).toBeUndefined();
        expect(svg).toContain('fill="#231f20"');
        expect(svg).toContain('stroke-width="1.2640000581741333"');
        expect(svg).toContain('stroke-width="0.6629999876022339"');
      }
    }
  });

  it('restores the p. 67 heavy-face black die variant at both source occurrences', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_067');
    const dom = JSON.parse(readFileSync(join(pageDir, 'page_067_dom.json'), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const dice = elements.filter(element => element.symbolId === 'dice.black');
    expect(dice).toHaveLength(2);

    for (const target of dice) {
      const blockElements = elements.filter(element => element.anchor.blockId === target.anchor.blockId);
      const blocks = attachSourceInlineElements(dom.blocks, blockElements);
      const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
      const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
      const line = block.lines.find((candidate: { id: string }) => candidate.id === target.anchor.lineId)!;
      const sourceRuns = sourceSpanRuns(line.spans, mapFont);
      const sourceIcon = sourceRuns.find(run => run.symbolId === 'dice.black')!;
      const previous = sourceRuns.filter(run => run !== sourceIcon);
      const token = getSymbolEditorToken('dice.black', 'en')!;
      const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
      const restored = segmentsFromEditableText(token + editableTextForSegments(previous, 'en'), toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
      const restoredIcon = restored.find(run => run.symbolId === 'dice.black')!;

      expect(restoredIcon.size).toBe(sourceIcon.size);
      expect(restoredIcon.color).toBe(sourceIcon.color);
      expect(restoredIcon.symbolMetrics).toEqual(sourceIcon.symbolMetrics);
      expect(restoredIcon.symbolMetrics?.renderVariant).toBe('black-p67-heavy-face-lines');

      const svg = renderToStaticMarkup(createElement(SemanticSymbol, {
        id: 'dice.black', language: 'en', size: restoredIcon.size,
        color: restoredIcon.color, metrics: restoredIcon.symbolMetrics,
      }));
      expect(svg.match(/<path\b/g)).toHaveLength(4);
      expect(svg).toContain('fill="#231f20"');
      expect(svg).toContain('stroke="#ffffff"');
      expect(svg).toContain('stroke-width="1.2640000581741333"');
      expect(svg).toContain('stroke-width="1"');
      expect(svg).not.toMatch(/<rect(?:\s|>)/);
    }
  });

  it('round-trips all p. 78 weapon icon aliases across the three source path families', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_078');
    const dom = JSON.parse(readFileSync(join(pageDir, 'page_078_dom.json'), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const attacks = elements.filter(element => element.symbolId === 'attack.melee'
      || element.symbolId === 'attack.ranged' || element.symbolId === 'attack.melee-ranged');
    expect(attacks).toHaveLength(18);
    expect(attacks.filter(element => element.symbolId === 'attack.melee')).toHaveLength(8);
    expect(attacks.filter(element => element.symbolId === 'attack.ranged')).toHaveLength(4);
    expect(attacks.filter(element => element.symbolId === 'attack.melee-ranged')).toHaveLength(6);
    const pathCounts = { 'attack.melee': 2, 'attack.ranged': 2, 'attack.melee-ranged': 4 } as const;
    const aliases = { 'attack.melee': '[[sword]]', 'attack.ranged': '[[arrow]]', 'attack.melee-ranged': '[[sword-arrow]]' } as const;

    for (const target of attacks) {
      const blockElements = elements.filter(element => element.anchor.blockId === target.anchor.blockId);
      const blocks = attachSourceInlineElements(dom.blocks, blockElements);
      const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
      const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
      const line = block.lines.find((candidate: { id: string }) => candidate.id === target.anchor.lineId)!;
      const sourceRuns = sourceSpanRuns(line.spans, mapFont);
      const sourceIcon = sourceRuns.find(run => run.symbolId === target.symbolId)!;
      const previous = sourceRuns.filter(run => run !== sourceIcon);
      const token = getSymbolEditorToken(target.symbolId, 'en')!;
      const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
      expect(token).toBe(aliases[target.symbolId as keyof typeof aliases]);

      const restored = segmentsFromEditableText(token + editableTextForSegments(previous, 'en'), toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
      const restoredIcon = restored.find(run => run.symbolId === target.symbolId)!;
      expect(restoredIcon).toBeDefined();
      expect(restoredIcon.size).toBe(sourceIcon.size);
      expect(restoredIcon.color).toBe(sourceIcon.color);
      expect(restoredIcon.symbolMetrics?.renderVariant).toBeUndefined();
      for (const metric of ['widthEm', 'heightEm', 'verticalAlignEm', 'gapEm', 'trailingGapEm'] as const) {
        const original = sourceIcon.symbolMetrics?.[metric];
        const restoredMetric = restoredIcon.symbolMetrics?.[metric];
        if (original === undefined || restoredMetric === undefined) {
          expect(restoredMetric).toBe(original);
        } else {
          expect(Math.abs(restoredMetric - original) * sourceIcon.size).toBeLessThanOrEqual(0.0011);
        }
      }

      const svg = renderToStaticMarkup(createElement(SemanticSymbol, {
        id: restoredIcon.symbolId!, language: 'en', size: restoredIcon.size,
        color: restoredIcon.color, metrics: restoredIcon.symbolMetrics,
      }));
      expect(svg.match(/<path\b/g)).toHaveLength(pathCounts[target.symbolId as keyof typeof pathCounts]);
      expect(svg).toContain('fill="#231f20"');
      expect(svg).toContain('fill="#ffffff"');
      expect(svg).not.toMatch(/<rect(?:\s|>)/);
    }
  });

  it('round-trips aliases through all 73 source-replaced legacy glyphs', () => {
    const pagesRoot = join(process.cwd(), 'public/pages');
    const pageCache = new Map<number, { dom: any; elements: SourceInlineElement[] }>();
    const targets: { pageNumber: number; element: SourceInlineElement }[] = [];
    for (const pageDir of readdirSync(pagesRoot).filter(name => /^page_\d{3}$/.test(name))) {
      const pageNumber = Number(pageDir.slice(-3));
      const pageDirPath = join(pagesRoot, pageDir);
      const sidecarPath = join(pageDirPath, 'inline_elements.json');
      if (!existsSync(sidecarPath)) continue;
      const elements = JSON.parse(readFileSync(sidecarPath, 'utf8')).elements as SourceInlineElement[];
      const matches = elements.filter(element => element.anchor.side === 'replace'
        && ['tag.important.icon', 'marker.arrow', 'tag.discard.icon', 'marker.star', 'tag.passive.icon'].includes(element.symbolId));
      if (matches.length === 0) continue;
      const dom = JSON.parse(readFileSync(join(pageDirPath, `page_${String(pageNumber).padStart(3, '0')}_dom.json`), 'utf8'));
      pageCache.set(pageNumber, { dom, elements });
      targets.push(...matches.map(element => ({ pageNumber, element })));
    }
    expect(targets).toHaveLength(73);
    expect(new Set(targets.map(target => target.pageNumber)).size).toBe(35);
    expect(Object.fromEntries(['tag.important.icon', 'marker.arrow', 'tag.discard.icon', 'marker.star', 'tag.passive.icon']
      .map(id => [id, targets.filter(target => target.element.symbolId === id).length]))).toEqual({
      'tag.important.icon': 62, 'marker.arrow': 4, 'tag.discard.icon': 3, 'marker.star': 2, 'tag.passive.icon': 2,
    });

    for (const { pageNumber, element: target } of targets) {
      const { dom, elements } = pageCache.get(pageNumber)!;
      const blockElements = elements.filter(element => element.anchor.blockId === target.anchor.blockId);
      const blocks = attachSourceInlineElements(dom.blocks, blockElements);
      const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
      const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
      const line = block.lines.find((candidate: { id: string }) => candidate.id === target.anchor.lineId)!;
      const sourceRuns = sourceSpanRuns(line.spans, mapFont);
      const sourceIcon = sourceRuns.find(run => run.symbolId === target.symbolId)!;
      const previous = sourceRuns.filter(run => run !== sourceIcon);
      const token = getSymbolEditorToken(target.symbolId, 'en')!;
      expect(token).toMatch(/^\[\[[a-z0-9-]+\]\]$/);
      const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
      const restored = segmentsFromEditableText(token + editableTextForSegments(previous, 'en'), toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
      const restoredIcon = restored.find(run => run.symbolId === target.symbolId)!;
      expect(restoredIcon.size).toBe(sourceIcon.size);
      expect(restoredIcon.symbolMetrics).toEqual(sourceIcon.symbolMetrics);

      const renderSymbol = (run: Segment) => renderToStaticMarkup(createElement(SemanticSymbol, {
        id: run.symbolId!, language: 'en', size: run.size,
        color: run.color, metrics: run.symbolMetrics,
      }));
      const sourceSvg = renderSymbol(sourceIcon);
      const restoredSvg = renderSymbol(restoredIcon);
      expect(restoredSvg).toBe(sourceSvg);
      expect(restoredSvg).not.toMatch(/<rect(?:\s|>)/);
      if (target.symbolId === 'tag.important.icon') {
        expect(restoredSvg.match(/<path\b/g)).toHaveLength(2);
        expect(restoredSvg).toContain('stroke="#ffffff"');
        expect(restoredSvg).toContain('fill="#ba1d23"');
        expect(restoredSvg).not.toContain('currentColor');
      }
      if (target.symbolId === 'tag.important.icon' && target.anchor.sizePt === 9) {
        expect(restoredIcon.symbolMetrics?.renderVariant).toBe('important-outline-2pt-at-9pt');
        expect(restoredSvg).toContain('stroke-width="0.2222222222222222"');
      } else if (target.symbolId === 'tag.important.icon') {
        expect(restoredIcon.symbolMetrics?.renderVariant).toBeUndefined();
        expect(restoredSvg).toContain('stroke-width="0.2"');
      }
    }
  });

  it('does not choose a random source metric when one ID has conflicting source variants', () => {
    const token = getSymbolEditorToken('dice.black', 'en')!;
    const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
    const templates = [
      { ...toolStyle, text: '\uFFFC', symbolId: 'dice.black', symbolMetrics: { widthEm: 1.1, heightEm: 1.2, verticalAlignEm: 0.2 } },
      // Mirrors the 0.004 pt line-baseline delta in the p. 50 source family;
      // this remains larger than PDF metric rounding and must stay ambiguous.
      { ...toolStyle, text: '\uFFFC', symbolId: 'dice.black', symbolMetrics: { widthEm: 1.1, heightEm: 1.2, verticalAlignEm: 0.2004 } },
    ];
    const result = segmentsFromEditableText(token, toolStyle, 'en', [], 'paragraph', undefined, templates);
    const icon = result.find(run => run.symbolId === 'dice.black')!;

    expect(icon.symbolMetrics).toBeUndefined();
    expect(icon.size).toBe(toolStyle.size);
  });

  it('inherits the p. 41 purple die template when identical PDF paths differ only by metric rounding', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_041');
    const dom = JSON.parse(readFileSync(join(pageDir, 'page_041_dom.json'), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const purpleDice = elements.filter(element => element.symbolId === 'dice.purple'
      && element.anchor.blockId === 'block_24');
    expect(purpleDice).toHaveLength(2);

    const blocks = attachSourceInlineElements(dom.blocks, purpleDice);
    const block = blocks.find((candidate: { id: string }) => candidate.id === 'block_24')!;
    const sourceTemplates = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
    const sourceDice = sourceTemplates.filter(run => run.symbolId === 'dice.purple');
    expect(sourceDice).toHaveLength(2);
    expect(Math.abs(sourceDice[0].symbolMetrics!.widthEm - sourceDice[1].symbolMetrics!.widthEm)
      * sourceDice[0].size).toBeCloseTo(0.001, 8);

    const token = getSymbolEditorToken('dice.purple', 'en')!;
    const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
    const restored = segmentsFromEditableText(token, toolStyle, 'en', [], 'paragraph', undefined, sourceTemplates);
    const restoredDie = restored.find(run => run.symbolId === 'dice.purple')!;
    expect(restoredDie.size).toBe(9);
    expect(restoredDie.color).toBe(sourceDice[0].color);
    expect(restoredDie.symbolMetrics).toEqual(sourceDice[0].symbolMetrics);
  });
});
