import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { editableTextForSegments, segmentsFromEditableText } from '../src/symbols/inlineCodec';
import type { Segment } from '../src/components/RichSpanEditor';

describe('Page 9 block 34 editorial unit and paragraph pilot', () => {
  const db = new Database('../../apps/admin/apps-admin.db');
  const row = db.prepare("SELECT data FROM translations WHERE span_key = 'page_9_unit_p9-block-34-remaining-size-10pt__pt-BR'").get() as { data: string };
  db.close();

  const originalOverride = JSON.parse(row.data);
  const segments: Segment[] = originalOverride.segments;

  it('loads the unified editorial unit with 4 internal paragraphs', () => {
    const text = segments.map(s => s.text).join('');
    const paragraphs = text.trim().split('\n');
    expect(paragraphs.length).toBe(4);
    
    // Rich spans check
    const boldSpans = segments.filter(s => s.weight === 700 || s.font.includes('Bold'));
    const boldTexts = boldSpans.map(s => s.text);
    expect(boldTexts).toEqual(['1', '1', 'XP', '2', 'XP', 'XP', 'XP', 'XP', '4']);
  });

  it('preserves text, rich spans and paragraph breaks on open -> edit -> reopen roundtrip', () => {
    // 1. Open editor: editable text generated
    const editableText = editableTextForSegments(segments, 'pt-BR');
    expect(editableText.trim().split('\n').length).toBe(4);

    // 2. Parse back to segments (as done in RichSpanEditor on edit)
    const baseStyle = {
      font: segments[0].font,
      size: segments[0].size,
      color: segments[0].color,
      weight: segments[0].weight,
      style: segments[0].style,
    };
    const reconstructed = segmentsFromEditableText(editableText, baseStyle, 'pt-BR', segments, 'paragraph', undefined, segments);

    // Verify reconstructed has identical text and identical rich spans
    const reconText = reconstructed.map(s => s.text).join('');
    expect(reconText).toBe(segments.map(s => s.text).join(''));

    const reconBold = reconstructed.filter(s => s.weight === 700 || s.font.includes('Bold')).map(s => s.text);
    const origBold = segments.filter(s => s.weight === 700 || s.font.includes('Bold')).map(s => s.text);
    expect(reconBold).toEqual(origBold);

    // 3. Make an edit within paragraph 2: replace "uma Rodada de Compra" with "uma Fase de Compra"
    const modifiedText = editableText.replace('uma Rodada de Compra', 'uma Fase de Compra');
    const modifiedSegments = segmentsFromEditableText(modifiedText, baseStyle, 'pt-BR', reconstructed, 'paragraph', undefined, segments);

    expect(modifiedSegments.map(s => s.text).join('')).toContain('uma Fase de Compra');
    expect(modifiedSegments.map(s => s.text).join('').trim().split('\n').length).toBe(4);
    
    // Bold runs in modified text must still be intact
    const modBold = modifiedSegments.filter(s => s.weight === 700 || s.font.includes('Bold')).map(s => s.text);
    expect(modBold).toEqual(origBold);

    // 4. Reopen (roundtrip again from modified)
    const reloadedText = editableTextForSegments(modifiedSegments, 'pt-BR');
    const reloadedSegments = segmentsFromEditableText(reloadedText, baseStyle, 'pt-BR', modifiedSegments, 'paragraph', undefined, segments);
    expect(reloadedSegments.map(s => s.text).join('')).toBe(modifiedText);
    expect(reloadedSegments.filter(s => s.weight === 700 || s.font.includes('Bold')).map(s => s.text)).toEqual(origBold);
  });

  it('safely extracts info when toggling language on a typographic unit (regression guard)', async () => {
    const { extractCreditFieldInfo } = await import('../src/components/PageRenderer');
    const block = {
      id: 'block_34',
      bbox: [415.84, 567.11, 770.15, 787.98] as [number, number, number, number],
      lines: [],
    };
    const unit = {
      id: 'p9-block-34-remaining-size-10pt',
      field: {
        id: 'p9-block-34-remaining-size-10pt-field',
        lineIds: [],
        bbox: [415.84, 590.63, 770.15, 787.98] as [number, number, number, number],
        frame: {
          x: 415.84,
          width: 354.31,
          textAlign: 'left' as const,
          lineHeight: 1.1,
        },
      },
    };

    // Test passing typographicUnit directly (the bug that occurred)
    const infoFromUnit = extractCreditFieldInfo('page_9_unit_p9-block-34-remaining-size-10pt__en', block, unit as any);
    expect(infoFromUnit.textAlign).toBe('left');
    expect(infoFromUnit.lineHeight).toBe(1.1);

    // Test passing field directly
    const infoFromField = extractCreditFieldInfo('page_9_unit_p9-block-34-remaining-size-10pt__en', block, unit.field);
    expect(infoFromField.textAlign).toBe('left');
    expect(infoFromField.lineHeight).toBe(1.1);
  });
});
