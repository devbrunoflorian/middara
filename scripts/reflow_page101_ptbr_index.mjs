import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const PAGE_DIR = path.join(ROOT, 'apps/web/public/pages/page_101');
const ROWS_PATH = path.join(PAGE_DIR, 'contents_rows.json');
const PAGE_DOM_PATH = path.join(PAGE_DIR, 'page_101_dom.json');
const BACKGROUND_PATH = path.join(PAGE_DIR, 'background.webp');
const APPLY = process.argv.includes('--apply');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';

const rowFile = JSON.parse(await readFile(ROWS_PATH, 'utf8'));
const pageDom = JSON.parse(await readFile(PAGE_DOM_PATH, 'utf8'));
const { rows: sourceRows } = rowFile;
const response = await fetch(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=5000', apiUrl));
if (!response.ok) throw new Error(`Payload returned ${response.status}.`);
const payload = await response.json();
const translations = new Map((payload.docs ?? [])
  .filter(doc => String(doc.spanKey ?? '').startsWith('page_101_unit_p101-index-'))
  .map(doc => [doc.spanKey, doc]));
if (translations.size !== 197) throw new Error(`Expected 197 PT-BR index translations, found ${translations.size}.`);

const columns = [0, 1, 2].map(blockIndex => {
  const physical = sourceRows.filter(row => row.blockIndex === blockIndex)
    .sort((a, b) => a.labelBBox[1] - b.labelBBox[1]);
  if (!physical.length) throw new Error(`Missing physical column ${blockIndex}.`);
  const baseX = Math.min(...physical.map(row => row.labelBBox[0]));
  const rightX = Math.max(...physical.map(row => row.numberBBox?.[2] ?? 0));
  const offsets = physical.filter(row => row.leader?.style !== 'none')
    .map(row => row.leader.yPt - row.labelBBox[1]).sort((a, b) => a - b);
  return { blockIndex, physical, baseX, rightX, leaderOffset: offsets[Math.floor(offsets.length / 2)] };
});

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
function label(row) {
  const doc = translations.get(`${row.keyStem}__pt-BR`);
  if (!doc?.data?.segments?.length) throw new Error(`Missing rich text for ${row.keyStem}.`);
  return { row, doc, plain: doc.data.segments.map(segment => segment.text).join('') };
}

const groups = [];
for (const column of columns) {
  const ordered = column.physical.map(row => ({ ...label(row), depth: Math.max(0, Math.round((row.labelBBox[0] - column.baseX) / 18.98)) }));
  const stack = [];
  for (const entry of ordered) {
    const node = { ...entry, children: [] };
    while (stack.length && stack.at(-1).depth >= node.depth) stack.pop();
    if (node.depth === 0) groups.push(node);
    else {
      const parent = stack.at(-1);
      if (!parent) throw new Error(`Orphan index subentry ${node.row.sourceText}.`);
      parent.children.push(node);
    }
    stack.push(node);
  }
}

function sortTree(node) {
  node.children.sort((a, b) => collator.compare(a.plain, b.plain)
    || collator.compare(a.row.sourceText ?? '', b.row.sourceText ?? ''));
  for (const child of node.children) sortTree(child);
}
for (const group of groups) sortTree(group);
groups.sort((a, b) => collator.compare(a.plain, b.plain)
  || collator.compare(a.row.sourceText ?? '', b.row.sourceText ?? '')
  || collator.compare(a.row.sourceReference ?? '', b.row.sourceReference ?? ''));

const ordered = [];
function flatten(node) {
  ordered.push(node);
  for (const child of node.children) flatten(child);
}
for (const group of groups) flatten(group);
if (ordered.length !== 197) throw new Error(`Sorted index has ${ordered.length} rows.`);

const planned = [];
let cursor = 0;
for (const column of columns) {
  const next = ordered.slice(cursor, cursor + column.physical.length);
  const count = next.reduce((total, entry) => total + 1, 0);
  if (count !== column.physical.length) throw new Error(`Column ${column.blockIndex} does not have enough sorted entries.`);
  for (let index = 0; index < count; index++) {
    const entry = next[index];
    const source = entry.row;
    const slot = column.physical[index];
    const indentPt = Math.max(0, source.labelBBox[0] - columns[source.blockIndex].baseX);
    const x = column.baseX + indentPt;
    const y = slot.labelBBox[1];
    const bottom = slot.labelBBox[3];
    const reference = source.sourceReference === 'Back' ? 'Verso' : source.sourceReference;
    const row = {
      ...source,
      blockIndex: column.blockIndex,
      blockId: slot.blockId,
      lineId: slot.lineId,
      labelBBox: [x, y, x + Math.max(1, source.labelBBox[2] - source.labelBBox[0]), bottom],
      numberBBox: [column.rightX - 36, y, column.rightX, bottom],
      labelWidthPt: undefined,
      targetPage: source.sourceReference && /^\d/.test(source.sourceReference)
        ? Number(source.sourceReference.match(/^\d+/)[0]) : undefined,
      dynamicReferenceLayout: true,
      referenceTextPtBr: reference,
      leader: {
        bbox: [x, y + column.leaderOffset - 0.2, column.rightX, y + column.leaderOffset + 0.2],
        style: reference ? 'solid' : 'none',
        periodPt: 0,
        widthPt: 0.4,
        yPt: y + column.leaderOffset,
      },
      mask: {
        url: slot.mask.url,
        bbox: [column.baseX - 0.8, y - 0.2, column.rightX + 0.6, bottom + 0.2],
      },
    };
    delete row.numberLineId;
    delete row.sourceReferencePtBr;
    delete row.sourceReferencePtBrShiftPt;
    planned.push({ row, doc: entry.doc, depth: entry.depth, sourceLabel: entry.plain, slot });
  }
  cursor += count;
}

if (cursor !== ordered.length) throw new Error(`Unassigned sorted rows: ${ordered.length - cursor}.`);
const boundaries = columns.map((column, index) => ({ column: index, rows: column.physical.length }));
if (boundaries.map(item => item.rows).join(',') !== '74,74,49') {
  throw new Error(`Unexpected page 101 column capacities: ${boundaries.map(item => item.rows).join(',')}.`);
}

const maskInfo = await sharp(BACKGROUND_PATH).metadata();
const sx = maskInfo.width / pageDom.width;
const sy = maskInfo.height / pageDom.height;
const resultRows = planned.map(item => item.row);
if (APPLY) {
  await writeFile(path.join(ROOT, 'tmp/p101-contents-rows-before-reflow.json'), JSON.stringify(rowFile, null, 2));
  const bg = sharp(BACKGROUND_PATH);
  for (const { row } of planned) {
    const [x0, y0, x1, y1] = row.mask.bbox;
    const left = Math.max(0, Math.round(x0 * sx));
    const top = Math.max(0, Math.round(y0 * sy));
    const right = Math.min(maskInfo.width, Math.round(x1 * sx));
    const bottom = Math.min(maskInfo.height, Math.round(y1 * sy));
    const output = path.join(PAGE_DIR, path.basename(row.mask.url));
    await bg.clone().extract({ left, top, width: right - left, height: bottom - top }).png().toFile(output);
  }
  await writeFile(ROWS_PATH, `${JSON.stringify({ schemaVersion: 1, overlaySource: true, rows: resultRows }, null, 2)}\n`);
}

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  translations: translations.size,
  rows: resultRows.length,
  columns: boundaries,
  sortFirst: planned.slice(0, 6).map(item => item.sourceLabel),
  sortAtColumnBreaks: [planned[73]?.sourceLabel, planned[74]?.sourceLabel, planned[147]?.sourceLabel, planned[148]?.sourceLabel],
  sortLast: planned.slice(-6).map(item => item.sourceLabel),
  rowsWithPageReference: resultRows.filter(row => row.referenceTextPtBr).length,
  rowsWithoutPageReference: resultRows.filter(row => !row.referenceTextPtBr).length,
  labelCorridorPt: {
    min: Number(Math.min(...planned.map(item => item.row.numberBBox[2] - item.row.labelBBox[0])).toFixed(2)),
    max: Number(Math.max(...planned.map(item => item.row.numberBBox[2] - item.row.labelBBox[0])).toFixed(2)),
  },
}, null, 2));
