#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

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
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v1');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', 'page_' + pageId);
const domPath = join(canonicalPageDir, 'page_' + pageId + '_dom.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

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
const text = (value, size = 10, color = '#231f20', extra = {}) => ({
  text: value, font: 'OptimaLTStd', size, color, weight: 400, style: 'normal',
  disableLigatures: true, ...extra,
});
const bold = (value, size = 9, color = '#231f20') => text(value, size, color, {
  font: 'OptimaLTStd-Bold', weight: 700,
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
    segments: [text('Muitas Habilidades oferecem Aprimoramentos de Convicção ou de Conjuração. Um Aprimoramento desse tipo permite que um Aventureiro role dados melhores ao fazer Testes de Convicção e rolagens de Conjuração.')],
    pendingTerms: ['Upgrade, Conviction Check e Casting: propostas locais, pendentes de revisão humana.'],
  },
  {
    blockIndex: 19, unitId: 'p33-block-35-default-dice-paragraph', label: 'Default Conviction and Casting dice',
    spanKey: 'page_33_unit_p33-block-35-default-dice-paragraph__pt-BR', lineHeight: 1.1,
    unitLines: ['line_35_0', 'line_35_1', 'line_35_2', 'line_35_3', 'line_35_4', 'line_35_5'],
    segments: [
      text('Por padrão, um Aventureiro usa os dados impressos em sua Carta de Aventureiro ao fazer rolagens de Convicção ou de Conjuração. Em geral, usa '),
      bold('1 dado roxo'), text(' ao Conjurar e '), bold('2 dados roxos'),
      text(' ao fazer um Teste de Convicção.'),
    ],
    pendingTerms: ['Upgrade e Casting: propostas locais, pendentes de revisão humana.'],
  },
  {
    blockIndex: 20, unitId: 'block_36', label: 'Example on an Adventurer Card',
    spanKey: 'page_33_block_20__pt-BR', lineHeight: 1.1,
    segments: [text('Exemplo em uma Carta de Aventureiro:')],
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
    segments: [
      text('Acima estão '), bold('2'), text(' exemplos de Aprimoramentos de '), bold('2'),
      text(' tipos diferentes de Itens. O '), italic('Magic Staff'),
      text(' permite que o Aventureiro substitua seu dado '), bold('roxo'),
      text(' padrão por um dado '), bold('branco'),
      text(' ao determinar a Força de um '), bold('Feitiço'), text('.'),
    ],
    pendingTerms: ['Upgrade: proposta local. Magic Staff permanece em inglês porque o texto do card ainda está em inglês.'],
  },
  {
    blockIndex: 26, unitId: 'block_43', label: 'Deflection Core explanation',
    spanKey: 'page_33_block_26__pt-BR', lineHeight: 1.2,
    segments: [
      italic('Deflection Core'), text(' permite que um Aventureiro substitua '), bold('1'),
      text(' de seus dados '), bold('roxos'), text(' padrão por um dado '), bold('branco'),
      text(' ao fazer um Teste de Convicção. Se um Aventureiro tiver '), bold('2'),
      text(' Aprimoramentos de Convicção, poderá usar ambos para substituir os dois dados roxos padrão por dados melhores.'),
    ],
    pendingTerms: ['Upgrade e Conviction Check: propostas locais. Deflection Core permanece em inglês porque o texto do card ainda está em inglês.'],
  },
  {
    blockIndex: 29, unitId: 'block_48', label: 'Discipline Card Breakdown — heading',
    spanKey: 'page_33_block_29__pt-BR', lineHeight: 1,
    segments: [title('Estrutura da Carta de Disciplina', 18, white)],
    pendingTerms: ['Discipline → Disciplina: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 8, unitId: 'block_24', label: 'XP Cost',
    spanKey: 'page_33_block_8__pt-BR', lineHeight: 1.1,
    segments: [bold('CUSTO DE XP:', 9, white), text('\nXP necessário para um Aventureiro aprender esta Disciplina.', 10, white)],
    pendingTerms: ['Discipline → Disciplina: proposta local, pendente de revisão humana.'],
  },
  {
    blockIndex: 9, unitId: 'block_25', label: 'Stamina Point cost',
    spanKey: 'page_33_block_9__pt-BR', lineHeight: 1.1,
    segments: [
      bold('CUSTO DE SP:', 9, white),
      text('\nOs pontos vermelhos indicam quantos Pontos de Vigor (SP) custa usar uma Disciplina. Algumas custam ', 10, white),
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
      text('\nÁrvore de Disciplinas da qual a carta faz parte e seu Nível (LVL).', 10, white),
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
    segments: [text('Esta seção da carta reúne as Habilidades, as regras de seus efeitos e as Condições que devem ser atendidas para usá-las.', 10, white)],
    pendingTerms: ['Ability → Habilidade: proposta local, pendente de revisão humana.'],
  },
];

assert.equal(candidates.length, 19);
assert.equal(new Set(candidates.map(item => item.spanKey)).size, candidates.length, 'Duplicate candidate keys.');
assert.equal(await exists(proofDir), false, 'Proof path already exists; refusing to replace it.');

const domBytes = await readFile(domPath);
const dom = JSON.parse(domBytes.toString('utf8'));
assert.equal(dom.page_number, page);
assert.equal(sha256(domBytes), '881A9E6F8D759907140BC42CD47DFF820AE2C9489B10F23D044171D19464955D', 'Canonical page 33 DOM changed since the reviewed source.');

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
    managedSourceSymbols: [],
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
    semanticSymbols: [],
  };
});

const sourcePdfBytes = await readFile(sourcePdfPath);
const sourcePdfSha256 = sha256(sourcePdfBytes);
const previousSnapshot = JSON.parse(await readFile(join(priorProofDir, 'snapshot', 'snapshot.json'), 'utf8'));
const previousBlock35 = previousSnapshot.translations?.find(record =>
  record.spanKey === 'page_33_unit_p33-block-35-default-dice-paragraph__pt-BR');
assert.ok(previousBlock35, 'Previously validated block_35 proposal is missing.');
assert.equal(previousBlock35.data.segments.map(segment => segment.text).join(''), proposalRecords[2].proposalText,
  'Block_35 wording differs from the previously validated proposal.');

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
  status: 'editable-prose-proposal-v1-pending-human-review',
  page,
  scope: '19 editable text-unit proposals. Three language-invariant English card overlays remain unchanged; this is not a fully localized physical page.',
  candidates: proposalRecords,
  counts: { candidateUnits: proposalRecords.length, savedHumanRecords: 0, snapshotRecords: proposalRecords.length },
});
await writeJson(join(proofDir, 'source-hashes.json'), {
  sourcePdf: { path: sourcePdfPath, sha256: sourcePdfSha256 },
  pageDomSha256: sha256(domBytes),
  pageAssets: pageAssetHashes,
  payloadRead: { matchingPage33Records: savedPageRecords.length, method: 'read-only GET' },
});
await writeJson(join(proofDir, 'artwork-scope.json'), {
  status: 'source-artwork-preserved',
  overlays: artworkScope,
  preservedInlinePlacements: JSON.parse(await readFile(join(canonicalPageDir, 'inline_elements.json'), 'utf8')),
  note: 'No card image or inline placement was changed. Embedded card lettering remains English and needs its own localization pass.',
});
await writeImmutable(join(proofDir, 'README.md'), Buffer.from(
  '# p.33 editable prose proposal — v1\n\n' +
  'This package contains 19 PT-BR prose candidates in an isolated snapshot. It does not write Payload, page sidecars, human translations, the source PDF, or the three English card overlays. The two existing white-die placements remain in the copied page assets. The proposal is pending human review and does not make the physical page fully localized.\n\n' +
  'Rebuild with node scripts/prepare_p033_full_prose_proposal_v1.mjs, then render through scripts/export_page_pdf.mjs using the snapshot in this directory. The builder refuses to continue if the source DOM hash changes, the API has existing p.33 records, candidate IDs duplicate, or the proof package already exists.\n'
));

console.log(JSON.stringify({
  status: 'p033-isolated-prose-snapshot-prepared',
  page,
  candidateUnits: proposalRecords.length,
  duplicateKeys: 0,
  payloadWrites: 0,
  savedPage33Records: savedPageRecords.length,
  sourcePdfSha256,
  pageDomSha256: sha256(domBytes),
  pageAssetHashes,
  proofDir,
  snapshotPath: join(snapshotDir, 'snapshot.json'),
}, null, 2));
