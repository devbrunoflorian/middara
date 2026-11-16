import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndReconstruct } from '../backup-translations.mjs';

test('translation recovery preserves rich segments, symbols, IDs, and metadata', () => {
  const records = [{
    id: 'translation-1',
    spanKey: 'page_78_unit_example__pt-BR',
    language: 'pt-BR',
    createdAt: '2026-10-08T12:00:00.000Z',
    updatedAt: '2026-10-09T12:00:00.000Z',
    data: {
      segments: [
        { type: 'text', text: 'Exemplo: ' , bold: true },
        { type: 'symbol', symbolId: 'melee', alias: 'melee', italic: false },
        { type: 'text', text: ' corpo', style: { color: '#231f20' } },
      ],
      customEditorMetadata: { sourceUnitId: 'example' },
    },
  }];

  const { summary, representation } = validateAndReconstruct('translations', records);
  assert.equal(summary.records, 1);
  assert.equal(summary.richSegmentArrays, 1);
  assert.equal(summary.richSegments, 3);
  assert.equal(summary.symbolIds.melee, 1);
  assert.deepEqual(representation.get('pt-BR\0page_78_unit_example__pt-BR'), records[0]);
});

test('translation recovery rejects duplicate translation keys', () => {
  const record = { id: 'one', spanKey: 'page_1_block_1', language: 'pt-BR', data: { segments: [] } };
  assert.throws(
    () => validateAndReconstruct('translations', [record, { ...record, id: 'two' }]),
    /duplicate translations spanKey/u,
  );
});

test('legacy translation payload arrays are preserved without reshaping', () => {
  const records = [{
    id: 'legacy-en-1', spanKey: 'page_4_block_0_line_line_8_0', language: 'en',
    data: [{ text: 'Source run', style: { fontWeight: 700 }, symbolId: 'black-die' }],
  }];
  const { summary, representation } = validateAndReconstruct('translations', records);
  assert.deepEqual(summary.locales, ['en']);
  assert.deepEqual(representation.get('en\0page_4_block_0_line_line_8_0').data, records[0].data);
});

test('layout recovery validates localized frames and keeps their full records', () => {
  const records = [{
    id: 'frame-1', frameKey: 'page_78_unit_example::pt-BR', unitKey: 'page_78_unit_example',
    pageNumber: 78, language: 'pt-BR', data: { x: 10, y: 20, width: 30, height: 40, lineHeight: 1.2 },
  }];
  const { summary, representation } = validateAndReconstruct('layout-frames', records);
  assert.deepEqual(summary.locales, ['pt-BR']);
  assert.equal(representation.get(records[0].frameKey).data.lineHeight, 1.2);
  assert.throws(
    () => validateAndReconstruct('layout-frames', [{ ...records[0], data: { ...records[0].data, width: 0 } }]),
    /invalid frame geometry/u,
  );
});

test('symbol alias settings survive the in-memory package check', () => {
  const records = [{ id: 'aliases-1', settingsKey: 'shared', aliases: { melee: 'corpo a corpo' } }];
  const { representation } = validateAndReconstruct('symbol-alias-settings', records);
  assert.deepEqual(representation.get('shared').aliases, { melee: 'corpo a corpo' });
});
