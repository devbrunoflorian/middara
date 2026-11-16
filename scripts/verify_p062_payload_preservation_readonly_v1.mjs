import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p062-ai-target-priority-v1');
const baselinePath = resolve(proofDir, 'preexisting-payload-records.json');
const receiptPath = resolve(proofDir, 'payload-preservation-v1.json');
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
assert.equal(baseline.readOnlyCapture, true);
assert.equal(baseline.page, 62);
assert.equal(baseline.language, 'pt-BR');
const url = new URL('/api/translations', apiUrl);
url.searchParams.set('where[language][equals]', 'pt-BR');
url.searchParams.set('limit', '5000');
const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`Payload read failed: ${response.status}`);
const payload = await response.json();
const current = (payload.docs ?? [])
  .filter(doc => String(doc.spanKey ?? '').startsWith('page_62_'))
  .sort((a, b) => Number(a.id) - Number(b.id))
  .map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt, sha256: sha256(stable(doc)) }));
const candidateKeys = [
  'page_62_unit_p62-ai-target-priority-body__pt-BR',
  'page_62_unit_p62-ai-target-priority-example__pt-BR',
];
assert.deepEqual(current, baseline.records, 'p.62 saved Payload records changed after the proposal snapshot');
assert.ok(!current.some(record => candidateKeys.includes(record.spanKey)), 'A proposed key appeared in Payload');

const receipt = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  method: 'Payload API GET only',
  page: 62,
  baselineRecordCount: baseline.records.length,
  currentRecordCount: current.length,
  recordsMatchByIdKeyTimestampAndSha256: true,
  candidateKeysAbsent: true,
  candidateKeys,
  writesAttempted: 0,
  records: current,
};
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: 'passed', ...receipt }, null, 2));
