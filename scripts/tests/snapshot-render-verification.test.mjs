import assert from 'node:assert/strict';
import test from 'node:test';
import { verifySnapshotRenderTargets } from '../lib/snapshot-render-verification.mjs';

test('an empty override is verified only on its exact keyed target', () => {
  const key = 'page_21_block_2__pt-BR';
  const result = verifySnapshotRenderTargets([{ spanKey: key, expected: '' }], [
    { spanKey: 'unrelated-empty-box', text: '' },
    { spanKey: key, text: '' },
  ]);

  assert.deepEqual(result[0], {
    spanKey: key,
    expected: '',
    targetCount: 1,
    matchCount: 1,
    actual: [''],
  });
});

test('unkeyed empty boxes cannot satisfy a blank snapshot override', () => {
  const result = verifySnapshotRenderTargets([
    { spanKey: 'page_21_block_2__pt-BR', expected: '' },
  ], [
    { spanKey: 'page_21_block_3__pt-BR', text: '' },
    { spanKey: 'page_21_block_4__pt-BR', text: '' },
  ]);

  assert.equal(result[0].matchCount, 0);
  assert.equal(result[0].targetCount, 0);
});

test('a missing blank override cannot silently fall back to visible source text', () => {
  const result = verifySnapshotRenderTargets([
    { spanKey: 'page_21_block_2__pt-BR', expected: '' },
  ], [
    { spanKey: 'page_21_block_2__pt-BR', text: 'HINDERING: Attacks made through terrain…' },
  ]);

  assert.equal(result[0].matchCount, 0);
  assert.deepEqual(result[0].actual, ['HINDERING: Attacks made through terrain…']);
});

test('duplicate keyed targets fail even when both contain the expected text', () => {
  const key = 'page_21_unit_label__pt-BR';
  const result = verifySnapshotRenderTargets([{ spanKey: key, expected: 'ÁGUA' }], [
    { spanKey: key, text: 'ÁGUA' },
    { spanKey: key, text: 'ÁGUA' },
  ]);

  assert.equal(result[0].targetCount, 2);
  assert.equal(result[0].matchCount, 2);
});
