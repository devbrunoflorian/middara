#!/usr/bin/env node
/** Build a recoverable p.25 proposal that separates editable prose from card artwork. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const page = 25;
const sourceDir = resolve(root, 'apps/web/public/pages/page_025');
const v1Dir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v1');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v4');
const snapshotDir = join(proofDir, 'snapshot');
const v1ProposalPath = resolve(root, 'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v1.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v4.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v4.md');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const mustNotExist = async path => {
  try { await access(path); throw new Error('Refusing to overwrite existing artifact: ' + path); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
};
for (const path of [proofDir, proposalPath, markdownPath]) await mustNotExist(path);

const v1 = JSON.parse(await readFile(v1ProposalPath, 'utf8'));
const v1Snapshot = JSON.parse(await readFile(join(v1Dir, 'snapshot/snapshot.json'), 'utf8'));
const dom = JSON.parse(await readFile(join(sourceDir, 'page_025_dom.json'), 'utf8'));
const norm = value => String(value ?? '').replace(/[\u0000-\u001f\u007f\u00a0]+/gu, ' ').replace(/\s+/gu, ' ').trim();
const fullBlockText = blockId => {
  const block = dom.blocks.find(item => item.id === blockId);
  assert.ok(block, 'Missing page block ' + blockId);
  return norm(block.lines.flatMap(line => line.spans.map(span => span.text)).join(''));
};
const candidateKey = candidate => candidate.spanKey.endsWith('__pt-BR') ? candidate.spanKey : candidate.spanKey + '__pt-BR';
const editableBlockIds = new Set(['block_91', 'block_83', 'block_84', 'block_85', 'block_86', 'block_87', 'block_88', 'block_89']);
const baseCandidates = v1.candidates.filter(candidate => editableBlockIds.has(candidate.sourceBlockId));
const legacyEditorUnits = new Map([
  ['p25-block-83-font-size-10pt-unit-01', 'p25-block-83-remaining-size-10pt'],
  ['p25-block-85-font-size-10pt-unit-01', 'p25-block-85-remaining-size-10pt'],
  ['p25-block-88-font-size-9pt-unit-00', 'p25-block-88-first-size-9pt'],
  ['p25-block-88-localized-body-v1', 'p25-block-88-remaining-size-10pt'],
  ['p25-block-89-font-size-9pt-unit-00', 'p25-block-89-first-size-9pt'],
  ['p25-block-89-localized-body-v1', 'p25-block-89-remaining-size-10pt'],
]);
const candidateKeyRemap = new Map();
const candidates = baseCandidates.map(candidate => {
  const oldKey = candidateKey(candidate);
  const sourceUnitId = legacyEditorUnits.get(candidate.sourceUnitId) ?? candidate.sourceUnitId;
  const spanKey = sourceUnitId ? 'page_' + page + '_unit_' + sourceUnitId + '__pt-BR' : candidate.spanKey;
  const revisedText = sourceUnitId === 'p25-block-85-remaining-size-10pt'
    ? 'Use estas 5 Perícias nos Testes de Habilidade indicados pelas Mecânicas da Aventura ou Regras Especiais de Encontro: desviar de armadilhas ou convencer um guarda a deixá-lo passar.'
    : candidate.proposalText;
  const reviseData = data => ({ ...data, segments: data.segments.map((segment, index) => index === 0 ? { ...segment, text: revisedText } : segment) });
  const translated = {
    ...candidate,
    sourceUnitId,
    spanKey,
    editorUnitKey: sourceUnitId ? spanKey : candidate.spanKey,
    proposalText: revisedText,
    proposalMarkup: revisedText,
    data: reviseData(candidate.data),
    diagnosticData: reviseData(candidate.diagnosticData),
  };
  candidateKeyRemap.set(oldKey, candidateKey(translated));
  return translated;
});
assert.equal(candidates.length, 12, 'Expected only title and explanatory-page candidates in the editable set.');
assert.ok(candidates.every(candidate => !['block_5', 'block_69', 'block_70'].includes(candidate.sourceBlockId)));

const artworkExceptions = [
  {
    id: 'p25-card-adventurer-label',
    sourceBlockIds: ['block_5'],
    spanKeys: ['page_25_block_0'],
    sourceText: 'ADVENTURER',
    proposedText: 'AVENTUREIRO',
    reason: 'The label is part of the Nightingale card image in background.webp; replacing its extracted text alone leaves the printed English label visible.',
    requiredAction: 'Provide or create a localized card-art variant, then verify the full card in the Viewer and exported PDF.',
    status: 'open',
  },
  ...[
    { id: 'health', sourceBlockIds: ['block_6'], spanKeys: ['page_25_block_1'], sourceText: 'HEALTH', proposedText: 'SAÚDE' },
    { id: 'movement', sourceBlockIds: ['block_12'], spanKeys: ['page_25_block_2'], sourceText: 'MOVEMENT', proposedText: 'MOVIMENTO' },
    { id: 'defense', sourceBlockIds: ['block_20'], spanKeys: ['page_25_block_3'], sourceText: 'DEFENSE', proposedText: 'DEFESA' },
    { id: 'presence', sourceBlockIds: ['block_28', 'block_32'], spanKeys: ['page_25_block_5', 'page_25_block_6'], sourceText: 'PRESENCE', proposedText: 'PRESENÇA' },
    { id: 'agility', sourceBlockIds: ['block_36', 'block_39'], spanKeys: ['page_25_block_7', 'page_25_block_8'], sourceText: 'AGILITY', proposedText: 'AGILIDADE' },
    { id: 'perception', sourceBlockIds: ['block_43'], spanKeys: ['page_25_block_9'], sourceText: 'PERCEPTION', proposedText: 'PERCEPÇÃO' },
    { id: 'strength', sourceBlockIds: ['block_53'], spanKeys: ['page_25_block_10'], sourceText: 'STRENGTH', proposedText: 'FORÇA' },
    { id: 'lore', sourceBlockIds: ['block_61', 'block_63'], spanKeys: ['page_25_block_11', 'page_25_block_12'], sourceText: 'LORE', proposedText: 'SABER' },
  ].map(item => ({
    id: 'p25-card-stat-' + item.id,
    ...item,
    reason: 'The curved label is printed in the character-card image. The extracted glyph runs follow the artwork curve, so replacing them as a straight text block duplicates the English label and breaks the composition.',
    requiredAction: 'Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.',
    status: 'open',
  })),
  {
    id: 'p25-card-ability-title',
    sourceBlockIds: ['block_69'],
    spanKeys: ['page_25_unit_p25-block-69-font-size-9.62pt-unit-00__pt-BR'],
    sourceText: 'Ambitious',
    proposedText: 'Ambiciosa',
    reason: 'The card ability title is printed in the character-card image and its extracted text has already been suppressed as a duplicate in the canonical page data.',
    requiredAction: 'Localize the ability title in a card-art variant; confirm the title term in human editorial review.',
    status: 'open',
  },
  {
    id: 'p25-card-ability-timing',
    sourceBlockIds: ['block_69'],
    spanKeys: ['page_25_unit_p25-block-69-font-size-6.3pt-unit-01__pt-BR'],
    sourceText: 'PER ENCOUNTER',
    proposedText: 'POR ENCONTRO',
    reason: 'The timing label is printed in the character-card image and its extracted text has already been suppressed as a duplicate in the canonical page data.',
    requiredAction: 'Localize the timing label in a card-art variant; confirm the game-term treatment of Encounter.',
    status: 'open',
  },
  {
    id: 'p25-card-ability-description',
    sourceBlockIds: ['block_69'],
    spanKeys: ['page_25_unit_p25-block-69-font-size-8.18pt-unit-02__pt-BR'],
    sourceText: 'Nightingale’s commanding personality makes her a natural leader.',
    proposedText: 'A personalidade imponente de Nightingale faz dela uma líder natural.',
    reason: 'The ability description is printed in the character-card image and its extracted text has already been suppressed as a duplicate in the canonical page data.',
    requiredAction: 'Localize the body copy in a card-art variant and confirm the wording in human editorial review.',
    status: 'open',
  },
  {
    id: 'p25-card-ability-effect',
    sourceBlockIds: ['block_69'],
    spanKeys: [
      'page_25_unit_p25-block-69-font-size-7.7pt-unit-03__pt-BR',
      'page_25_unit_p25-block-69-font-size-7.7pt-unit-05__pt-BR',
    ],
    sourceText: fullBlockText('block_69'),
    proposedText: 'Todos os demais aliados ganham +1 SP. Nightingale ganha +2 SP.',
    reason: 'The complete mechanical effect, including both SP values, is printed in the character-card image and its extracted text has already been suppressed as a duplicate in the canonical page data.',
    requiredAction: 'Localize the complete effect in a card-art variant and confirm Gain/capitalization in human editorial review.',
    status: 'open',
  },
  {
    id: 'p25-card-conviction-casting',
    sourceBlockIds: ['block_70'],
    spanKeys: ['page_25_block_15'],
    sourceText: 'Conviction: / Casting:',
    proposedText: 'CONVICÇÃO: / CONJURAÇÃO:',
    reason: 'Both labels are printed in the character-card image and their extracted text has already been suppressed as a duplicate in the canonical page data.',
    requiredAction: 'Localize both labels in a card-art variant and confirm the contextual form for Casting.',
    status: 'open',
  },
].map(item => ({
  ...item,
  category: 'printed_artwork_localization',
  technicalStatus: 'blocked_until_localized_artwork_exists',
  editorialStatus: 'pending_human_review',
  evidence: [
    'apps/web/public/pages/page_025/background.webp',
    'output/proofs/translation-readiness-2026-10-16/p025-source-review-v1/source-en-page-025.png',
    'output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v1/viewer-pt-br-v1.png',
  ],
}));
assert.equal(artworkExceptions.length, 14);

const allV1CandidateKeys = new Set(v1.candidates.map(candidateKey));
const savedRecords = (v1Snapshot.translations ?? []).filter(record => !allV1CandidateKeys.has(record.spanKey));
assert.equal(savedRecords.length, 4, 'The four saved human translations must be preserved unchanged.');
assert.deepEqual(savedRecords.map(record => Number(record.id)).sort((a, b) => a - b), [320, 321, 322, 323]);
const candidateByKey = new Map(candidates.map(candidate => [candidateKey(candidate), candidate]));
const candidateRecords = (v1Snapshot.translations ?? [])
  .filter(record => candidateKeyRemap.has(record.spanKey))
  .map(record => {
    const spanKey = candidateKeyRemap.get(record.spanKey);
    const candidate = candidateByKey.get(spanKey);
    assert.ok(candidate, 'Missing transformed candidate for ' + spanKey);
    return { ...record, spanKey, data: candidate.diagnosticData };
  });
assert.equal(candidateRecords.length, candidates.length, 'Every live proposal needs one matching snapshot translation.');
const snapshot = {
  ...v1Snapshot,
  translations: [...savedRecords, ...candidateRecords],
  layoutFrames: [],
};
assert.equal(snapshot.translations.length, 16);
assert.equal(snapshot.layoutFrames.length, 0, 'The art-only Conviction/Casting text must not carry a diagnostic frame.');
await mkdir(snapshotDir, { recursive: true });
await cp(join(v1Dir, 'snapshot/pages'), join(snapshotDir, 'pages'), { recursive: true, errorOnExist: true });
await writeFile(join(snapshotDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });

const oldHash = JSON.parse(await readFile(join(v1Dir, 'source-hashes-v1.json'), 'utf8'));
const sourceHashes = {};
for (const name of ['page_025_dom.json', 'background.webp', 'layout_frames.json']) {
  const hash = sha256(await readFile(join(sourceDir, name)));
  assert.equal(hash, oldHash[name], 'Canonical source asset changed since the v1 snapshot: ' + name);
  sourceHashes[name] = hash;
}
sourceHashes.sourcePdfSha256 = v1.sourcePdfSha256;
sourceHashes.snapshotSha256 = sha256(await readFile(join(snapshotDir, 'snapshot.json')));
sourceHashes.snapshotDomSha256 = sha256(await readFile(join(snapshotDir, 'pages/page_025/page_025_dom.json')));
sourceHashes.payloadRecordsBefore = savedRecords.length;
sourceHashes.payloadLayoutFramesBefore = 0;
sourceHashes.payloadWrites = 0;

const proposal = {
  ...v1,
  proposalId: 'page-025-adventurer-card-2026-10-16-v4',
  title: 'Componentes da Carta de Aventureiro',
  status: 'draft_pending_viewer_editor_pdf_copyfit_human_review_and_artwork_localization',
  counts: {
    candidates: candidates.length,
    verifiedInViewer: 0,
    verifiedInEditor: 0,
    verifiedInPdf: 0,
    preservedHumanRecords: savedRecords.length,
    artworkExceptions: artworkExceptions.length,
  },
  sourceReview: {
    ...v1.sourceReview,
    fidelityNote: 'The official raster, English Viewer and one-page English export were compared. The complete Nightingale card, including its labels, ability copy, stats, values and name, is already printed in background.webp. The p.25 proposal therefore renders only the heading and explanatory callouts as text; complete PT-BR candidates for the embedded card text are preserved as artwork exceptions. The four saved human translations are unchanged.',
  },
  candidates,
  artworkExceptions,
  copyfitIteration: 1,
  copyfitIterationLimit: 2,
  diagnosticLayoutFrames: {
    status: 'none',
    preservedHumanFrames: 0,
    frames: [],
    reason: 'No diagnostic frame is needed for the editable heading and explanatory callouts. The Conviction/Casting labels are part of the card artwork and remain in the artwork exception queue.',
  },
  payload: { readOnlyMethod: 'GET', existingPageRecords: savedRecords.length, existingPageLayoutFrames: 0, writes: 0 },
  diagnosticFailurePolicy: 'If an editable candidate fails copyfit or semantic rendering, blank only that candidate in the diagnostic snapshot; preserve complete source and proposal text in this file. Do not overlay PT text on source artwork that already contains the English string.',
};
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' });
const markdown = [
  '# p.25 — proposta PT-BR “Componentes da Carta de Aventureiro” v4',
  '',
  '**Estado:** 12 unidades editáveis aguardam a verificação Viewer/Editor/PDF e revisão humana; 14 grupos de texto dentro da carta rasterizada estão preservados como exceções de localização de arte. Quatro traduções humanas salvas (IDs 320–323) foram mantidas sem alteração. Nenhuma escrita no Payload ou alteração canônica.',
  '',
  '## Unidades de página editáveis',
  '',
  candidates.map(candidate =>
    '### ' + candidate.sourceBlockId + (candidate.sourceUnitId ? ' / ' + candidate.sourceUnitId : '') +
    '\n\n**EN:** ' + candidate.sourceText +
    '\n\n**PT-BR:** ' + candidate.proposalText +
    '\n\n**Revisão pendente:** ' + (candidate.pendingTerms.length ? candidate.pendingTerms.join(' ') : 'Nenhum termo adicional identificado.'),
  ).join('\n\n'),
  '',
  '## Texto impresso dentro da carta — exceções abertas',
  '',
  'A imagem completa da carta em background.webp já contém estes rótulos e textos em inglês. A primeira tentativa de sobrepor traduções aos alvos extraídos produziu duplicação e fragmentos fora da curva original; os candidatos completos permanecem aqui para a futura localização do artwork.',
  '',
  artworkExceptions.map(item =>
    '### ' + item.id +
    '\n\n**Blocos:** ' + item.sourceBlockIds.join(', ') +
    '\n\n**EN:** ' + item.sourceText +
    '\n\n**PT-BR proposto:** ' + item.proposedText +
    '\n\n**Ação:** ' + item.requiredAction,
  ).join('\n\n'),
  '',
  '## Registros humanos e conteúdo mantido',
  '',
  proposal.preservedHumanRecords.map(record =>
    '- **' + record.spanKey + '** (ID ' + record.id + '): ' + record.disposition + '. Texto salvo: “' + record.text + '”',
  ).join('\n'),
  '',
  proposal.unchangedSourceContent.map(item =>
    '- **' + item.sourceBlockId + ':** ' + item.sourceText + ' — ' + item.reason,
  ).join('\n'),
  '',
  '## Persistência e evidência',
  '',
  '- PDF oficial SHA-256: ' + proposal.sourcePdfSha256 + '.',
  '- Fonte EN, Viewer EN e PDF isolado foram comparados; o card inteiro aparece no background da página.',
  '- Snapshot isolado: ' + snapshotDir + '; zero frames de diagnóstico.',
  '- Payload: quatro registros existentes preservados (IDs 320–323), sem frames salvos e zero writes.',
  '- A lista de exceções guarda o texto completo, chaves de origem e ação futura para não confundir texto impresso com tradução editável.',
].join('\n') + '\n';
await writeFile(markdownPath, markdown, { flag: 'wx' });
await writeFile(join(proofDir, 'source-hashes-v2.json'), JSON.stringify(sourceHashes, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({
  proposalId: proposal.proposalId,
  candidates: candidates.length,
  artworkExceptions: artworkExceptions.length,
  preservedPayloadRecords: savedRecords.map(record => ({ id: record.id, spanKey: record.spanKey })),
  payloadWrites: 0,
  sourcePdfSha256: proposal.sourcePdfSha256,
  snapshotSha256: sourceHashes.snapshotSha256,
  proposalPath,
  markdownPath,
  snapshotPath: join(snapshotDir, 'snapshot.json'),
}, null, 2));
