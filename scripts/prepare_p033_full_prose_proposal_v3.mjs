#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

// Prepare an isolated page 33 editable-prose proposal. This script never
// writes Payload or canonical page files; it snapshots their current bytes.
const root = process.cwd();
const page = 33;
const pageId = '033';
const language = 'pt-BR';
const apiUrl = (process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000').replace(/\/+$/u, '');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const canonicalPageDir = resolve(root, 'apps/web/public/pages', 'page_' + pageId);
const priorProofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p033-editorial-unit-repair-v1');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', 'page_' + pageId);
const domPath = join(canonicalPageDir, 'page_' + pageId + '_dom.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const expectedSourcePdfSha256 = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';
const expectedInlineSidecarSha256 = '22602E811036B9399DE32753566A776E8182F74D79C5C1E8F052E70BEA57C24C';

async function writeImmutable(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  try {
    const old = await readFile(path);
    assert.deepEqual(old, Buffer.from(bytes), 'Refusing to replace a different proof artifact: ' + path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
const writeJson = (path, value) => writeImmutable(path, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
const exists = async path => { try { await access(path); return true; } catch { return false; } };

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function solidRgbPng(width, height, color) {
  const scanlineLength = 1 + width * 3;
  const raw = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * scanlineLength;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const px = row + 1 + x * 3;
      raw[px] = color[0]; raw[px + 1] = color[1]; raw[px + 2] = color[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function sourcePurpleSvg() {
  // One of the p.33 PDF vector dice, normalized to its measured ink bbox.
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11.488006592 13.259002686">
<path d="M 10.71800293 10.50500488 C 11.14300537 10.2519989 11.488006592 9.645996094 11.488006592 9.150985718 L 11.488006592 4.10798645 C 11.488006592 3.612991333 11.14300537 3.006988525 10.71800293 2.753982544 L 6.514007568 0.2519989 C 6.089004517 0 5.399002075 0 4.974000931 0.2519989 L 0.770004272 2.753982544 C 0.345001221 3.006988525 0 3.612991333 0 4.10798645 L 0 9.150985718 C 0 9.645996094 0.345001221 10.2519989 0.770004272 10.50500488 L 4.974000931 13.00698853 C 5.399002075 13.25898743 6.089004517 13.25898743 6.514007568 13.00698853 L 10.71800293 10.50500488 Z" fill="rgb(98.2646,63.1868,152.6770)" stroke="#fff" stroke-width="1.264" stroke-linecap="butt" stroke-linejoin="miter"/>
<path d="M 1.3152 3.7842 L 5.5482 6.0902 M 10.2782 3.7842 L 6.0452 6.0902 M 5.8043 6.5395 L 5.8043 11.4775" fill="none" stroke="#fff" stroke-width="0.663" stroke-linecap="round" stroke-linejoin="miter"/>
</svg>\n`, 'utf8');
}
const text = (value, size = 10, color = '#231f20', extra = {}) => ({
  text: value, font: 'OptimaLTStd', size, color, weight: 400, style: 'normal',
  disableLigatures: true, ...extra,
});
const bold = (value, size = 9, color = '#231f20') => text(value, size, color, {
  font: 'OptimaLTStd-Bold', weight: 700,
});
const symbol = (symbolId, size = 9) => ({
  text: '\uFFFC', symbolId, font: 'OptimaLTStd-Bold', size, color: '#231f20',
  weight: 700, style: 'normal', disableLigatures: true,
});
const italic = (value, size = 10) => text(value, size, '#231f20', {
  font: 'OptimaLTStd-Italic', style: 'italic',
});
const title = (value, size, color = '#231f20') => ({
  text: value, font: 'Cinzel-Regular', size, color, weight: 400, style: 'normal',
  disableLigatures: true,
});
const white = '#ffffff';

const candidates = [
  {
    blockIndex: 28, unitId: 'block_45', label: 'Conviction and Casting Upgrades — heading',
    spanKey: 'page_33_block_28__pt-BR', lineHeight: 1,
    segments: [title('Aprimoramentos de Convicção e Conjuração', 12)],
    pendingTerms: ['Upgrade → Aprimoramento: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 18, unitId: 'block_34', label: 'Conviction/Casting upgrades — introduction',
    spanKey: 'page_33_block_18__pt-BR', lineHeight: 1.1,
    segments: [text('Habilidades podem oferecer Aprimoramentos de Convicção ou de Conjuração, que permitem ao Aventureiro rolar dados melhores nesses Testes e rolagens.')],
    pendingTerms: ['Upgrade, Conviction Check e Casting: propostas locais, pendentes de revisão humana.'],
  },
  {
    blockIndex: 19, unitId: 'p33-block-35-default-dice-paragraph', label: 'Default Conviction and Casting dice',
    spanKey: 'page_33_unit_p33-block-35-default-dice-paragraph__pt-BR', lineHeight: 1.1,
    unitLines: ['line_35_0', 'line_35_1', 'line_35_2', 'line_35_3', 'line_35_4', 'line_35_5'],
    managedSourceSymbols: ['dice.purple'],
    segments: [
      text('Por padrão, o Aventureiro usa os dados impressos em sua Carta de Aventureiro para Conjurar e fazer Testes de Convicção. Em geral, rola '),
      bold('1 dado roxo'), text(' '), symbol('dice.purple', 9), text(' ao Conjurar e '),
      bold('2 dados roxos'), text(' '), symbol('dice.purple', 9), text(' em um Teste de Convicção.'),
    ],
    pendingTerms: ['Upgrade e Casting: propostas locais, pendentes de revisão humana.'],
  },
  {
    blockIndex: 20, unitId: 'block_36', label: 'Example on an Adventurer Card',
    spanKey: 'page_33_block_20__pt-BR', lineHeight: 1.1,
    segments: [text('Exemplo de Carta de Aventureiro:')],
    pendingTerms: [],
  },
  {
    blockIndex: 21, unitId: 'block_37', label: 'Conviction card label',
    spanKey: 'page_33_block_21__pt-BR', lineHeight: 1.1,
    segments: [title('Convicção:', 10)],
    pendingTerms: [],
  },
  {
    blockIndex: 22, unitId: 'block_38', label: 'Casting card label',
    spanKey: 'page_33_block_22__pt-BR', lineHeight: 1.1,
    segments: [title('Conjuração:', 10)],
    pendingTerms: ['Casting → Conjuração: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 23, unitId: 'block_39', label: 'Upgrade effect explanation',
    spanKey: 'page_33_block_23__pt-BR', lineHeight: 1.1,
    segments: [text('Os Aprimoramentos de Convicção e de Conjuração substituem os dados usados nessas rolagens.')],
    pendingTerms: ['Upgrade: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 24, unitId: 'block_40', label: 'Maximum number of Upgrades',
    spanKey: 'page_33_block_24__pt-BR', lineHeight: 1.1,
    segments: [
      text('Um Aventureiro pode usar no máximo '), bold('1'), text(' Aprimoramento na rolagem de Conjuração e '),
      bold('2'), text(' ao fazer um Teste de Convicção. Se uma Habilidade conceder mais Aprimoramentos do que ele pode usar, deverá escolher quais usar.'),
    ],
    pendingTerms: ['Upgrade e Conviction Check: propostas locais, pendentes de revisão humana.'],
  },
  {
    blockIndex: 25, unitId: 'p33-block-41-heading-size-12pt', label: 'Example — heading',
    spanKey: 'page_33_unit_p33-block-41-heading-size-12pt__pt-BR', lineHeight: 1,
    unitLines: ['line_41_0'], segments: [{ text: 'Exemplo:', font: 'AGaramondPro-Bold', size: 12, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true }],
    pendingTerms: [],
  },
  {
    blockIndex: 25, unitId: 'p33-block-41-body-size-10pt', label: 'Example — Magic Staff explanation',
    spanKey: 'page_33_unit_p33-block-41-body-size-10pt__pt-BR', lineHeight: 1.2,
    unitLines: ['line_41_1', 'line_41_2', 'line_41_3', 'line_41_4'],
    managedSourceSymbols: ['dice.purple', 'dice.white'],
    segments: [
      text('Acima: '), bold('2'), text(' exemplos de Aprimoramentos de '), bold('2'),
      text(' tipos de Item. O '), italic('Magic Staff'),
      text(' permite ao Aventureiro trocar o dado '), bold('roxo'), text(' '),
      symbol('dice.purple', 10), text(' padrão por um '), bold('branco'), text(' '),
      symbol('dice.white', 10), text(' ao determinar a Força do '), bold('Feitiço'), text('.'),
    ],
    pendingTerms: ['Upgrade: proposta local. Magic Staff permanece em inglês porque o texto do card ainda está em inglês.'],
  },
  {
    blockIndex: 26, unitId: 'block_43', label: 'Deflection Core explanation',
    spanKey: 'page_33_block_26__pt-BR', lineHeight: 1.2,
    managedSourceSymbols: ['dice.purple', 'dice.white'],
    segments: [
      italic('Deflection Core'), text(' permite trocar '), bold('1'), text(' dado '),
      bold('roxo'), text(' '), symbol('dice.purple', 10), text(' padrão por um '), bold('branco'), text(' '),
      symbol('dice.white', 10), text(' ao fazer um Teste de Convicção. Se tiver '), bold('2'),
      text(' Aprimoramentos de Convicção, o Aventureiro pode usar ambos para trocar os dois dados '),
      bold('roxos'), text(' '), symbol('dice.purple', 10), text(' por outros melhores.'),
    ],
    pendingTerms: ['Upgrade e Conviction Check: propostas locais. Deflection Core permanece em inglês porque o texto do card ainda está em inglês.'],
  },
  {
    blockIndex: 29, unitId: 'block_48', label: 'Discipline Card Breakdown — heading',
    spanKey: 'page_33_block_29__pt-BR', lineHeight: 1,
    segments: [title('Carta de Disciplina: partes', 18, white)],
    pendingTerms: ['Discipline → Disciplina: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 8, unitId: 'block_24', label: 'XP Cost',
    spanKey: 'page_33_block_8__pt-BR', lineHeight: 1.1,
    segments: [bold('CUSTO DE XP:', 9, white), text('\nXP para o Aventureiro aprender esta Disciplina.', 10, white)],
    pendingTerms: ['Discipline → Disciplina: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 9, unitId: 'block_25', label: 'Stamina Point cost',
    spanKey: 'page_33_block_9__pt-BR', lineHeight: 1.1,
    segments: [
      bold('CUSTO DE SP:', 9, white),
      text('\nOs pontos vermelhos mostram o custo em SP. Algumas Disciplinas custam ', 10, white),
      bold('0', 9, white), text(' SP, mas podem ter outras Condições.', 10, white),
    ],
    pendingTerms: ['Stamina Point → Ponto de Vigor: forma local, pendente de revisão humana.'],
  },
  {
    blockIndex: 10, unitId: 'p33-block-26-first-size-9pt', label: 'Card name — heading',
    spanKey: 'page_33_unit_p33-block-26-first-size-9pt__pt-BR', lineHeight: 1,
    unitLines: ['line_26_0'], segments: [bold('NOME DA CARTA:', 9, white)],
    pendingTerms: [],
  },
  {
    blockIndex: 10, unitId: 'p33-block-26-remaining-size-10pt', label: 'Card name — explanation',
    spanKey: 'page_33_unit_p33-block-26-remaining-size-10pt__pt-BR', lineHeight: 1.1,
    unitLines: ['line_26_1'], segments: [text('Nome da Disciplina.', 10, white)],
    pendingTerms: ['Discipline → Disciplina: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 11, unitId: 'block_27', label: 'Discipline tags',
    spanKey: 'page_33_block_11__pt-BR', lineHeight: 1.1,
    segments: [
      bold('TAGS:', 9, white),
      text('\nÁrvore de Disciplina e Nível (LVL) da carta.', 10, white),
    ],
    pendingTerms: ['Discipline Tree → Árvore de Disciplinas: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 12, unitId: 'p33-block-28-first-size-9pt', label: 'Ability text — heading',
    spanKey: 'page_33_unit_p33-block-28-first-size-9pt__pt-BR', lineHeight: 1,
    unitLines: ['line_28_0'], segments: [bold('TEXTO DA HABILIDADE:', 9, white)],
    pendingTerms: ['Ability → Habilidade: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 12, unitId: 'p33-block-28-remaining-size-10pt', label: 'Ability text — explanation',
    spanKey: 'page_33_unit_p33-block-28-remaining-size-10pt__pt-BR', lineHeight: 1.1,
    unitLines: ['line_28_1', 'line_28_2', 'line_28_3'],
    segments: [text('Habilidades da carta, regras de seus efeitos e Condições para usá-las.', 10, white)],
    pendingTerms: ['Ability → Habilidade: proposta local, pendente de revisão humana.'],
  },
];

// Five purple dice are source vectors painted over the page raster but absent
// from the old page sidecar. Keep their IDs and cleanup assets isolated in v3.
const sourcePurpleElements = [
  {
    id: 'p33-purple-001', blockIndex: 19, blockId: 'block_35', lineId: 'line_35_2', spanIndex: 4,
    side: 'after', sizePt: 9, ownerSpanRef: { lineId: 'line_35_2', spanIndex: 3 }, gapPt: 0.6316,
    bbox: [141.9541, 147.3572, 153.4421, 160.6162], drawings: [136, 137, 138, 139],
    maskBBox: [141, 146.25, 154.5, 161.75], color: [255, 254, 252],
    baselineY: 157.1854248046875,
  },
  {
    id: 'p33-purple-002', blockIndex: 19, blockId: 'block_35', lineId: 'line_35_3', spanIndex: 4,
    side: 'after', sizePt: 9, ownerSpanRef: { lineId: 'line_35_3', spanIndex: 3 }, gapPt: 0.6313,
    bbox: [282.1981, 147.3572, 293.6861, 160.6162], drawings: [140, 141, 142, 143],
    maskBBox: [281.25, 146.25, 294.75, 161.75], color: [255, 255, 253],
    baselineY: 157.1854248046875,
  },
  {
    id: 'p33-purple-003', blockIndex: 25, blockId: 'block_41', lineId: 'line_41_3', spanIndex: 0,
    side: 'before', sizePt: 10, ownerSpanRef: { lineId: 'line_41_2', spanIndex: 3 }, trailingGapPt: 0.6318,
    bbox: [433.8524, 325.3390, 445.3404, 338.5980], drawings: [156, 157, 158, 159],
    maskBBox: [432.75, 324.25, 446.5, 339.75], color: [228, 210, 182],
    baselineY: 335.1810,
  },
  {
    id: 'p33-purple-004', blockIndex: 26, blockId: 'block_43', lineId: 'line_43_2', spanIndex: 0,
    side: 'before', sizePt: 10, ownerSpanRef: { lineId: 'line_43_1', spanIndex: 0 }, trailingGapPt: 0.6312,
    bbox: [468.1414, 354.0083, 479.6294, 367.2673], drawings: [164, 165, 166, 167],
    maskBBox: [467.0, 352.9, 480.75, 368.4], color: [229, 209, 180],
    baselineY: 363.8503,
  },
  {
    id: 'p33-purple-005', blockIndex: 26, blockId: 'block_43', lineId: 'line_43_5', spanIndex: 2,
    side: 'after', sizePt: 10, ownerSpanRef: { lineId: 'line_43_5', spanIndex: 1 }, gapPt: 0.6312,
    bbox: [609.3212, 378.0083, 620.8092, 391.2673], drawings: [172, 173, 174, 175],
    maskBBox: [608.2, 376.9, 621.95, 392.4], color: [225, 205, 175],
    baselineY: 387.8503,
  },
];

assert.equal(candidates.length, 19);
assert.equal(new Set(candidates.map(item => item.spanKey)).size, candidates.length, 'Duplicate candidate keys.');
assert.equal(await exists(proofDir), false, 'Proof path already exists; refusing to replace it.');

const domBytes = await readFile(domPath);
const dom = JSON.parse(domBytes.toString('utf8'));
assert.equal(dom.page_number, page);
assert.equal(sha256(domBytes), '881A9E6F8D759907140BC42CD47DFF820AE2C9489B10F23D044171D19464955D', 'Canonical page 33 DOM changed since the reviewed source.');

const inlineSidecarBytes = await readFile(join(canonicalPageDir, 'inline_elements.json'));
assert.equal(sha256(inlineSidecarBytes), expectedInlineSidecarSha256, 'Canonical p.33 inline sidecar changed since v2.');
const canonicalInlineSidecar = JSON.parse(inlineSidecarBytes.toString('utf8'));
assert.equal(canonicalInlineSidecar.elements?.length, 2, 'Expected only the two previously registered white dice.');
assert.equal(sourcePurpleElements.length, 5);
for (const entry of sourcePurpleElements) {
  const ownerLine = dom.blocks[entry.blockIndex]?.lines?.find(line => line.id === entry.ownerSpanRef.lineId);
  assert.equal(ownerLine?.spans?.[entry.ownerSpanRef.spanIndex]?.text.trim(), 'PURPLE', 'Source symbol owner changed: ' + entry.id);
  const anchorLine = dom.blocks[entry.blockIndex]?.lines?.find(line => line.id === entry.lineId);
  assert.ok(anchorLine?.spans?.[entry.spanIndex], 'Source symbol anchor changed: ' + entry.id);
}

function sourceTextFor(item) {
  const block = dom.blocks[item.blockIndex];
  assert.ok(block, 'Missing block at index ' + item.blockIndex);
  if (!item.unitLines) return block.lines.flatMap(line => line.spans).map(span => span.text).join('');
  const refs = block.typographicUnits?.find(unit => unit.id === item.unitId);
  assert.ok(refs, 'Missing typographic unit ' + item.unitId);
  assert.deepEqual(refs.field?.lineIds ?? [], item.unitLines, 'Unit line mapping changed for ' + item.unitId);
  const ids = new Set(item.unitLines);
  return block.lines.filter(line => ids.has(line.id)).flatMap(line => line.spans).map(span => span.text).join('');
}

const proposalRecords = candidates.map(item => {
  const sourceText = sourceTextFor(item);
  const data = {
    schemaVersion: 2,
    segments: item.segments,
    textAlign: 'left',
    lineHeight: item.lineHeight,
    lineHeightMode: 'source',
    managedSourceSymbols: item.managedSourceSymbols ?? [],
  };
  return {
    page,
    blockIndex: item.blockIndex,
    unitId: item.unitId,
    label: item.label,
    spanKey: item.spanKey,
    language,
    data,
    sourceText,
    proposalText: item.segments.map(segment => segment.text).join(''),
    status: 'proposal_pending_human_editorial_review',
    pendingTerms: item.pendingTerms,
    semanticSymbols: item.managedSourceSymbols ?? [],
  };
});

const sourcePdfBytes = await readFile(sourcePdfPath);
const sourcePdfSha256 = sha256(sourcePdfBytes);
assert.equal(sourcePdfSha256, expectedSourcePdfSha256, 'Official source PDF changed since the vector coordinates were measured.');
const previousSnapshot = JSON.parse(await readFile(join(priorProofDir, 'snapshot', 'snapshot.json'), 'utf8'));
const previousBlock35 = previousSnapshot.translations?.find(record =>
  record.spanKey === 'page_33_unit_p33-block-35-default-dice-paragraph__pt-BR');
assert.ok(previousBlock35, 'Previously validated block_35 proposal is missing.');
assert.equal(previousBlock35.spanKey, proposalRecords[2].spanKey,
  'Block_35 candidate key differs from the previously validated proposal.');

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', language);
translationsUrl.searchParams.set('limit', '5000');
const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(response.ok, 'Read-only Payload GET failed: ' + response.status);
const payload = await response.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload baseline is paginated.');
const savedPageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_33_'));
assert.equal(savedPageRecords.length, 0, 'Page 33 Payload changed; do not overwrite existing human records.');

const pageFiles = (await readdir(canonicalPageDir)).sort();
const pageAssetHashes = {};
await mkdir(snapshotPageDir, { recursive: true });
for (const fileName of pageFiles) {
  const bytes = await readFile(join(canonicalPageDir, fileName));
  await writeImmutable(join(snapshotPageDir, fileName), bytes);
  pageAssetHashes[fileName] = sha256(bytes);
}

const sourceSvgBytes = sourcePurpleSvg();
await writeImmutable(join(snapshotPageDir, 'source-dice-purple-p33.svg'), sourceSvgBytes);
const isolatedElements = sourcePurpleElements.map((entry, index) => {
  const maskName = `inline-element-mask-${String(index + 2).padStart(3, '0')}.png`;
  const maskScale = 1710 / 820.346;
  const width = Math.round((entry.maskBBox[2] - entry.maskBBox[0]) * maskScale);
  const height = Math.round((entry.maskBBox[3] - entry.maskBBox[1]) * maskScale);
  const maskBytes = solidRgbPng(width, height, entry.color);
  const widthPt = entry.bbox[2] - entry.bbox[0];
  const heightPt = entry.bbox[3] - entry.bbox[1];
  const element = {
    id: entry.id,
    symbolId: 'dice.purple',
    bbox: entry.bbox,
    drawingIndices: entry.drawings,
    blockIndex: entry.blockIndex,
    blockId: entry.blockId,
    lineId: entry.lineId,
    spanIndex: entry.spanIndex,
    side: entry.side,
    expectedSpan: 'PURPLE',
    metrics: {
      widthEm: widthPt / entry.sizePt,
      heightEm: heightPt / entry.sizePt,
      verticalAlignEm: (entry.bbox[3] - entry.baselineY) / entry.sizePt,
      sourceAssetUrl: '/pages/page_033/source-dice-purple-p33.svg',
      sourceAppearanceKey: 'p33-purple-die-vector-source-pdf',
    },
    anchor: {
      blockId: entry.blockId,
      blockIndex: entry.blockIndex,
      lineId: entry.lineId,
      spanIndex: entry.spanIndex,
      side: entry.side,
      sizePt: entry.sizePt,
      ...(entry.gapPt !== undefined ? { gapPt: entry.gapPt } : {}),
      ...(entry.trailingGapPt !== undefined ? { trailingGapPt: entry.trailingGapPt } : {}),
      ownerSpanRef: entry.ownerSpanRef,
    },
    mask: { url: `/pages/page_033/${maskName}`, bbox: entry.maskBBox },
  };
  return { element, maskName, maskBytes, maskSize: [width, height] };
});

const augmentedInlineSidecar = {
  ...canonicalInlineSidecar,
  elements: [...canonicalInlineSidecar.elements, ...isolatedElements.map(item => item.element)],
};
assert.equal(new Set(augmentedInlineSidecar.elements.map((element, index) => element.id ?? `${element.symbolId}-${index}`)).size,
  augmentedInlineSidecar.elements.length, 'Duplicate source inline IDs in the isolated sidecar.');
const augmentedSidecarBytes = Buffer.from(JSON.stringify(augmentedInlineSidecar, null, 2) + '\n');
await writeFile(join(snapshotPageDir, 'inline_elements.json'), augmentedSidecarBytes, { flag: 'w' });
const isolatedAssetHashes = {
  'inline_elements.json': sha256(augmentedSidecarBytes),
  'source-dice-purple-p33.svg': sha256(sourceSvgBytes),
};
for (const item of isolatedElements) {
  await writeImmutable(join(snapshotPageDir, item.maskName), item.maskBytes);
  isolatedAssetHashes[item.maskName] = sha256(item.maskBytes);
}

const snapshot = {
  translations: proposalRecords.map(({ spanKey, language: recordLanguage, data }) => ({
    spanKey, language: recordLanguage, data,
  })),
  layoutFrames: [],
  symbolAliasSettings: [],
  assetPages: [page],
  page,
  patched: false,
  verifyRenderedSnapshot: true,
  sourcePageBoxes: previousSnapshot.sourcePageBoxes,
};

const overlays = JSON.parse(await readFile(join(canonicalPageDir, 'fidelity_overlays.json'), 'utf8'));
const overlayList = Array.isArray(overlays) ? overlays : overlays.overlays ?? [];
const artworkScope = overlayList.map(overlay => ({
  id: overlay.id,
  asset: overlay.src ?? overlay.asset ?? overlay.path,
  languageInvariant: overlay.languageInvariant,
}));

await writeJson(join(snapshotDir, 'snapshot.json'), snapshot);
await writeJson(join(proofDir, 'proposal-candidates.json'), {
  status: 'editable-prose-proposal-v3-source-symbol-cleanup-pending-visual-review',
  page,
  scope: '19 editable text-unit proposals. Five confirmed purple source vectors are represented by isolated semantic placements with cleanup masks. Three language-invariant English card overlays remain unchanged; this is not a fully localized physical page.',
  candidates: proposalRecords,
  counts: { candidateUnits: proposalRecords.length, savedHumanRecords: 0, snapshotRecords: proposalRecords.length },
});
await writeJson(join(proofDir, 'source-hashes.json'), {
  sourcePdf: { path: sourcePdfPath, sha256: sourcePdfSha256 },
  pageDomSha256: sha256(domBytes),
  pageAssets: pageAssetHashes,
  isolatedPageAssets: isolatedAssetHashes,
  sourcePurpleVectors: sourcePurpleElements.map(({ id, bbox, drawings, maskBBox, color, baselineY }) => ({
    id, bbox, drawings, maskBBox, sampledBackgroundRgb: color, baselineY,
  })),
  payloadRead: { matchingPage33Records: savedPageRecords.length, method: 'read-only GET' },
});
await writeJson(join(proofDir, 'artwork-scope.json'), {
  status: 'isolated-source-purple-vector-cleanup',
  overlays: artworkScope,
  canonicalInlineSidecarSha256: sha256(inlineSidecarBytes),
  isolatedInlineSidecar: augmentedInlineSidecar,
  sourcePurpleVectorCount: sourcePurpleElements.length,
  note: 'The five purple prose vectors and flat cleanup masks exist only in this snapshot. Canonical sidecars, background.webp, and all three card overlays are unchanged. Embedded card lettering remains English and needs its own localization pass.',
});
await writeImmutable(join(proofDir, 'README.md'), Buffer.from(
  '# p.33 editable prose proposal — v3\n\n' +
  'This isolated snapshot contains 19 PT-BR prose candidates and five source-traced purple-die placements. The five flat cleanup masks, the source-matched purple SVG, and the augmented inline sidecar exist only in this proof package. The source PDF, canonical page sidecars, background.webp, Payload, human translations, and the three English card overlays are unchanged. Seven dice are represented in the proposed prose: two purple dice in the default paragraph, purple plus white in the Magic Staff paragraph, and two purple plus one white in the Deflection Core paragraph.\n\n' +
  'Rebuild with node scripts/prepare_p033_full_prose_proposal_v3.mjs, then render with scripts/export_page_pdf.mjs --page 33 --language pt-BR --snapshot output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3/snapshot/snapshot.json. The builder requires the reviewed source PDF, DOM, original inline sidecar hashes, no existing p.33 Payload records, unique candidate keys, and a new proof directory.\n'
));

console.log(JSON.stringify({
  status: 'p033-isolated-prose-snapshot-v3-prepared',
  page,
  candidateUnits: proposalRecords.length,
  sourcePurplePlacements: sourcePurpleElements.length,
  snapshotInlineElements: augmentedInlineSidecar.elements.length,
  duplicateKeys: 0,
  payloadWrites: 0,
  savedPage33Records: savedPageRecords.length,
  sourcePdfSha256,
  pageDomSha256: sha256(domBytes),
  pageAssetHashes,
  isolatedAssetHashes,
  proofDir,
  snapshotPath: join(snapshotDir, 'snapshot.json'),
}, null, 2));
