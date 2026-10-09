#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_API_URL = process.env.MIDDARA_TRANSLATION_API_URL ?? 'http://localhost:3000';
const OUTPUT_ROOT = resolve(ROOT, 'output', 'backups', 'translations');
const COLLECTIONS = ['translations', 'layout-frames', 'symbol-alias-settings'];
const COLLECTION_FILES = {
  translations: 'translations.json',
  'layout-frames': 'frames.json',
  'symbol-alias-settings': 'symbol-alias-settings.json',
};
const API_TIMEOUT_MS = 30_000;
const PAGE_LIMIT = 500;

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function toPayloadRecordKey(record) {
  return String(record.id ?? '');
}

function parseEditorKey(spanKey) {
  const key = String(spanKey ?? '');
  const block = key.match(/^page_(\d+)_block_(\d+)(?:__(?:en|pt-BR))?$/u);
  if (block) return { pageNumber: Number(block[1]), blockIndex: Number(block[2]) };
  const unit = key.match(/^page_(\d+)_unit_(.+?)(?:__(?:en|pt-BR))?$/u);
  if (unit) return { pageNumber: Number(unit[1]), editorialUnitId: unit[2] };
  const page = key.match(/^page_(\d+)_/u);
  return page ? { pageNumber: Number(page[1]) } : {};
}

function assertObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be a JSON object.`);
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Unexpected duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function visitData(value, path, stats) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) visitData(value[index], `${path}[${index}]`, stats);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, 'segments')) {
    if (!Array.isArray(value.segments)) throw new Error(`${path}.segments must be an array when present.`);
    stats.richSegmentArrays += 1;
    stats.richSegments += value.segments.length;
  }
  if (Object.hasOwn(value, 'symbolId')) {
    if (typeof value.symbolId !== 'string' || value.symbolId.length === 0) {
      throw new Error(`${path}.symbolId must be a non-empty string.`);
    }
    stats.symbolIds[value.symbolId] = (stats.symbolIds[value.symbolId] ?? 0) + 1;
  }
  for (const [key, child] of Object.entries(value)) visitData(child, `${path}.${key}`, stats);
}

export function validateCollectionRecords(slug, records) {
  if (!Array.isArray(records)) throw new Error(`${slug}: records must be an array.`);
  const ids = records.map(toPayloadRecordKey);
  if (ids.some(id => !id)) throw new Error(`${slug}: a record is missing its Payload id.`);
  assertUnique(ids, `${slug} Payload id`);

  if (slug === 'translations') {
    const keys = [];
    const localePairs = [];
    const locales = new Set();
    const stats = { richSegmentArrays: 0, richSegments: 0, symbolIds: {} };
    for (const [index, record] of records.entries()) {
      if (typeof record.spanKey !== 'string' || !record.spanKey.trim()) {
        throw new Error(`${slug}[${index}] is missing spanKey.`);
      }
      if (typeof record.language !== 'string' || !record.language.trim()) {
        throw new Error(`${slug}[${index}] is missing language.`);
      }
      if ((!record.data || typeof record.data !== 'object')) {
        throw new Error(`${slug}[${index}].data must be a non-null JSON object or array.`);
      }
      keys.push(record.spanKey);
      localePairs.push(`${record.language}\0${record.spanKey}`);
      locales.add(record.language);
      visitData(record.data, `${slug}[${index}].data`, stats);
    }
    assertUnique(keys, `${slug} spanKey`);
    assertUnique(localePairs, `${slug} (language, spanKey)`);
    return { records: records.length, locales: [...locales].sort(), ...stats };
  }

  if (slug === 'layout-frames') {
    const keys = [];
    const locales = new Set();
    for (const [index, record] of records.entries()) {
      if (typeof record.frameKey !== 'string' || !record.frameKey.trim()) throw new Error(`${slug}[${index}] is missing frameKey.`);
      if (typeof record.unitKey !== 'string' || !record.unitKey.trim()) throw new Error(`${slug}[${index}] is missing unitKey.`);
      if (!Number.isInteger(Number(record.pageNumber)) || Number(record.pageNumber) < 1) throw new Error(`${slug}[${index}] has an invalid pageNumber.`);
      if (!['en', 'pt-BR'].includes(record.language)) throw new Error(`${slug}[${index}] has unsupported language ${String(record.language)}.`);
      assertObject(record.data, `${slug}[${index}].data`);
      if (!Number.isFinite(record.data.x) || !Number.isFinite(record.data.y)
        || !Number.isFinite(record.data.width) || !Number.isFinite(record.data.height)
        || record.data.width <= 0 || record.data.height <= 0) {
        throw new Error(`${slug}[${index}].data has invalid frame geometry.`);
      }
      keys.push(record.frameKey);
      locales.add(record.language);
    }
    assertUnique(keys, `${slug} frameKey`);
    return { records: records.length, locales: [...locales].sort() };
  }

  if (slug === 'symbol-alias-settings') {
    const keys = [];
    for (const [index, record] of records.entries()) {
      if (typeof record.settingsKey !== 'string' || !record.settingsKey.trim()) throw new Error(`${slug}[${index}] is missing settingsKey.`);
      assertObject(record.aliases, `${slug}[${index}].aliases`);
      keys.push(record.settingsKey);
    }
    assertUnique(keys, `${slug} settingsKey`);
    return { records: records.length, settingsKeys: keys };
  }

  throw new Error(`Unsupported collection in translation backup: ${slug}`);
}

function reconstructCollection(slug, records) {
  if (slug === 'translations') {
    return new Map(records.map(record => [`${record.language}\0${record.spanKey}`, structuredClone(record)]));
  }
  if (slug === 'layout-frames') {
    return new Map(records.map(record => [record.frameKey, structuredClone(record)]));
  }
  if (slug === 'symbol-alias-settings') {
    return new Map(records.map(record => [record.settingsKey, structuredClone(record)]));
  }
  throw new Error(`Unsupported collection in recovery check: ${slug}`);
}

export function validateAndReconstruct(slug, records) {
  const summary = validateCollectionRecords(slug, records);
  const representation = reconstructCollection(slug, records);
  const roundTripped = [...representation.values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const source = [...records].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  if (stableStringify(roundTripped) !== stableStringify(source)) {
    throw new Error(`${slug}: in-memory recovery round-trip changed records or rich data.`);
  }
  if (representation.size !== records.length) throw new Error(`${slug}: in-memory recovery lost records.`);
  return { summary, representation };
}

async function fetchCollection(apiUrl, slug) {
  const docs = [];
  let page = 1;
  let expectedTotal = null;
  let expectedPages = null;
  while (true) {
    const url = new URL(`/api/${slug}`, apiUrl);
    url.searchParams.set('depth', '0');
    url.searchParams.set('limit', String(PAGE_LIMIT));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'id');
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}.`);
    const result = await response.json();
    if (!Array.isArray(result.docs) || !Number.isInteger(result.totalDocs) || !Number.isInteger(result.totalPages)) {
      throw new Error(`${slug}: Payload response lacks complete pagination metadata.`);
    }
    if (expectedTotal === null) {
      expectedTotal = result.totalDocs;
      expectedPages = result.totalPages;
    } else if (expectedTotal !== result.totalDocs || expectedPages !== result.totalPages) {
      throw new Error(`${slug}: collection changed while pages were being read.`);
    }
    docs.push(...result.docs);
    if (page >= expectedPages) break;
    page += 1;
  }
  if (docs.length !== expectedTotal) throw new Error(`${slug}: received ${docs.length} of ${expectedTotal} records; refusing a truncated backup.`);
  return docs;
}

async function readBundle(apiUrl) {
  const entries = await Promise.all(COLLECTIONS.map(async slug => [slug, await fetchCollection(apiUrl, slug)]));
  const bundle = Object.fromEntries(entries);
  for (const slug of COLLECTIONS) validateCollectionRecords(slug, bundle[slug]);
  return bundle;
}

function bundleFingerprint(bundle) {
  return sha256(stableStringify(Object.fromEntries(COLLECTIONS.map(slug => [
    slug,
    [...bundle[slug]].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
  ]))));
}

async function readStableBundle(apiUrl) {
  let previous = await readBundle(apiUrl);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readBundle(apiUrl);
    if (bundleFingerprint(previous) === bundleFingerprint(current)) return current;
    previous = current;
  }
  throw new Error('Payload data changed during all read passes. No backup was written; retry after saving edits finish.');
}

function appMetadata() {
  let packageInfo = {};
  try { packageInfo = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')); } catch {}
  let gitCommit = null;
  try { gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  return {
    projectId: 'middara-rulebook-1.2',
    document: 'Middara Rulebook 1.2',
    sourcePdf: (process.env.MIDDARA_SOURCE_PDF_PATH ?? 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf').split(/[\\/]/u).at(-1),
    sourcePageCount: 102,
    appVersion: packageInfo.version ?? null,
    gitCommit,
    nodeVersion: process.version,
  };
}

function makeCollectionFile(slug, records) {
  const index = slug === 'translations'
    ? records.map(record => ({
      id: record.id,
      spanKey: record.spanKey,
      language: record.language,
      ...parseEditorKey(record.spanKey),
      createdAt: record.createdAt ?? null,
      updatedAt: record.updatedAt ?? null,
    }))
    : slug === 'layout-frames'
      ? records.map(record => ({
        id: record.id,
        frameKey: record.frameKey,
        unitKey: record.unitKey,
        pageNumber: Number(record.pageNumber),
        language: record.language,
        createdAt: record.createdAt ?? null,
        updatedAt: record.updatedAt ?? null,
      }))
      : records.map(record => ({
        id: record.id,
        settingsKey: record.settingsKey,
        createdAt: record.createdAt ?? null,
        updatedAt: record.updatedAt ?? null,
      }));
  return { collection: slug, records, index };
}

function countSymbolIds(records) {
  const summary = { richSegmentArrays: 0, richSegments: 0, symbolIds: {} };
  records.forEach((record, index) => visitData(record.data, `translations[${index}].data`, summary));
  return {
    richSegmentArrays: summary.richSegmentArrays,
    richSegments: summary.richSegments,
    semanticSymbolOccurrences: Object.values(summary.symbolIds).reduce((sum, count) => sum + count, 0),
    semanticSymbolIds: Object.keys(summary.symbolIds).length,
  };
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function verifyBackupDirectory(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.backupSchemaVersion !== 1) throw new Error(`Unsupported backup schema version ${String(manifest.backupSchemaVersion)}.`);
  const loaded = {};
  for (const slug of COLLECTIONS) {
    const filename = COLLECTION_FILES[slug];
    const bytes = await readFile(resolve(directory, filename));
    const expected = manifest.files?.[filename];
    if (!expected || expected.sha256 !== sha256(bytes) || expected.bytes !== bytes.length) {
      throw new Error(`${filename}: checksum or byte count mismatch.`);
    }
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (parsed.collection !== slug || !Array.isArray(parsed.records) || !Array.isArray(parsed.index)) {
      throw new Error(`${filename}: invalid collection envelope.`);
    }
    if (parsed.records.length !== expected.recordCount) throw new Error(`${filename}: record count mismatch.`);
    validateAndReconstruct(slug, parsed.records);
    if (parsed.index.length !== parsed.records.length) throw new Error(`${filename}: index is incomplete.`);
    if (stableStringify(parsed.index) !== stableStringify(makeCollectionFile(slug, parsed.records).index)) {
      throw new Error(`${filename}: index does not match its records.`);
    }
    loaded[slug] = parsed.records;
  }
  const metadataBytes = await readFile(resolve(directory, 'metadata.json'));
  const metadataExpected = manifest.files?.['metadata.json'];
  if (!metadataExpected || metadataExpected.sha256 !== sha256(metadataBytes) || metadataExpected.bytes !== metadataBytes.length) {
    throw new Error('metadata.json: checksum or byte count mismatch.');
  }
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  if (stableStringify(metadata) !== stableStringify(manifest.metadata)) throw new Error('manifest metadata differs from metadata.json.');
  const locales = [...new Set(loaded.translations.map(record => record.language))].sort();
  if (stableStringify(locales) !== stableStringify(manifest.localesPresent)) throw new Error('Manifest locale list does not match translation records.');
  return {
    manifest,
    counts: Object.fromEntries(COLLECTIONS.map(slug => [slug, loaded[slug].length])),
    translationDetails: countSymbolIds(loaded.translations),
    records: loaded,
  };
}

function ensureOutputPath(outputPath) {
  const resolvedPath = resolve(outputPath);
  const relativePath = relative(OUTPUT_ROOT, resolvedPath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Output must be a new folder under ${OUTPUT_ROOT}.`);
  }
  return resolvedPath;
}

function timestampId() {
  return new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}/u, '');
}

async function createBackup({ apiUrl = DEFAULT_API_URL, outputPath }) {
  const parsedApiUrl = new URL(apiUrl);
  if (!['http:', 'https:'].includes(parsedApiUrl.protocol)) throw new Error('API URL must use HTTP or HTTPS.');
  const apiOrigin = parsedApiUrl.origin;
  const bundle = await readStableBundle(apiOrigin);
  for (const slug of COLLECTIONS) validateAndReconstruct(slug, bundle[slug]);
  const generatedAtUtc = new Date().toISOString();
  const metadata = {
    ...appMetadata(),
    generatedAtUtc,
    apiOrigin,
    apiReadMethod: 'Payload REST API; GET only; two identical complete read passes required',
    browserLocalStorageIncluded: false,
    browserLocalStorageNote: 'Payload API does not expose browser-local fallback entries. Unsynchronized local-only overrides or frames are not part of this package.',
    unsavedDraftsIncluded: false,
    unsavedDraftsNote: 'Unsaved text/frame drafts are in-memory editor session state and are intentionally excluded.',
  };
  const locales = [...new Set(bundle.translations.map(record => record.language))].sort();
  const fileValues = Object.fromEntries(COLLECTIONS.map(slug => [COLLECTION_FILES[slug], makeCollectionFile(slug, bundle[slug])]));
  fileValues['metadata.json'] = metadata;
  const fileBytes = Object.fromEntries(Object.entries(fileValues).map(([name, value]) => [name, Buffer.from(jsonBytes(value), 'utf8')]));
  const manifest = {
    backupSchemaVersion: 1,
    backupId: `middara-rulebook-1.2-${timestampId()}`,
    generatedAtUtc,
    projectId: metadata.projectId,
    document: metadata.document,
    localesPresent: locales,
    source: { type: 'payload-rest-api', origin: apiOrigin },
    metadata,
    files: Object.fromEntries(Object.entries(fileBytes).map(([name, bytes]) => [name, {
      sha256: sha256(bytes),
      bytes: bytes.length,
      recordCount: name === 'metadata.json' ? undefined : fileValues[name].records.length,
    }])) ,
    recoveryValidation: {
      mode: 'in-memory reconstruction; no database restore performed',
      collectionCount: COLLECTIONS.length,
      localStorageIncluded: false,
    },
  };
  const destination = ensureOutputPath(outputPath ?? resolve(OUTPUT_ROOT, manifest.backupId));
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  try {
    await mkdir(temporary, { recursive: false });
    for (const [name, bytes] of Object.entries(fileBytes)) await writeFile(resolve(temporary, name), bytes, { flag: 'wx' });
    await writeFile(resolve(temporary, 'manifest.json'), jsonBytes(manifest), { flag: 'wx' });
    const stagedVerification = await verifyBackupDirectory(temporary);
    for (const slug of COLLECTIONS) {
      if (stableStringify([...bundle[slug]].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))))
        !== stableStringify([...stagedVerification.records[slug]].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))))) {
        throw new Error(`${slug}: written backup did not reproduce its API snapshot.`);
      }
    }
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }

  const verified = await verifyBackupDirectory(destination);
  return {
    output: destination,
    backupId: manifest.backupId,
    apiOrigin,
    locales,
    counts: verified.counts,
    translationDetails: verified.translationDetails,
    checksumsVerified: true,
    recoveryValidation: 'pass: complete records reconstructed in memory and compared with the fetched API snapshot',
    localStorageIncluded: false,
  };
}

function parseArgs(argv) {
  const options = { apiUrl: DEFAULT_API_URL };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    if (name === 'help') return { help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}.`);
    if (name === 'api-url') options.apiUrl = value;
    else if (name === 'output') options.outputPath = value;
    else if (name === 'verify') options.verifyPath = value;
    else throw new Error(`Unknown option: --${name}`);
    index += 1;
  }
  return options;
}

function usage() {
  return [
    'Read-only Payload translation backup',
    '  node scripts/backup-translations.mjs [--api-url http://localhost:3000] [--output <new-folder-under-output/backups/translations>]',
    '  node scripts/backup-translations.mjs --verify <backup-folder>',
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.verifyPath) {
    const result = await verifyBackupDirectory(resolve(options.verifyPath));
    process.stdout.write(`${JSON.stringify({
      verification: 'PASS',
      backupId: result.manifest.backupId,
      counts: result.counts,
      translationDetails: result.translationDetails,
      localStorageIncluded: result.manifest.metadata.browserLocalStorageIncluded,
    }, null, 2)}\n`);
    return;
  }
  const result = await createBackup(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`Translation backup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export { createBackup, parseEditorKey };
