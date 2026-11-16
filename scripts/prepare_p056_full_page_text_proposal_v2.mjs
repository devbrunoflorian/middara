import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Extend the immutable p.56 General Information proof to every editable prose
// family on the page. Physical card artwork remains English by project policy.
const root = process.cwd();
const page = 56;
const pageId = 'page_056';
const sourceDir = resolve(root, 'apps/web/public/pages', pageId);
const baseProofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-general-information-v2');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-full-page-v2');
const snapshotDir = join(proofDir, 'snapshot');
const proposalPath = resolve(root, 'docs/translations/proposals/page-056-full-page-text-proposal-2026-10-15-v2.json');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://127.0.0.1:3000';
const expectedSourcePdfSha256 = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), 'Refusing to replace changed artifact: ' + path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
async function fetchJson(path, params = {}) {
  const url = new URL(path, apiUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Read-only API request failed (' + response.status + '): ' + url);
  return response.json();
}
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const lineText = line => (line.spans ?? [])
  .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
  .map(span => span.text ?? '').join('');
const blockText = block => normalize((block.lines ?? []).map(lineText).join(' '));
const unitText = lines => normalize(lines.map(lineText).join(' '));

const sourcePdfBytes = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdfBytes), expectedSourcePdfSha256, 'Official source PDF changed');
const baseProposal = await readJson(join(baseProofDir, 'proposal-p056-general-information-v2.json'));
const baseSnapshot = await readJson(join(baseProofDir, 'snapshot', 'snapshot-p056-general-information-v2-export.json'));
const expectedPageHashes = baseProposal.sourceHashes.pageFiles;
const pageFileNames = (await readdir(sourceDir)).sort();
const pageAssets = {};
for (const name of pageFileNames) {
  const bytes = await readFile(join(sourceDir, name));
  assert.equal(sha256(bytes), expectedPageHashes[name], 'Canonical p.56 asset changed since the v2 proposal: ' + name);
  pageAssets[name] = bytes;
}
assert.deepEqual(pageFileNames, Object.keys(expectedPageHashes).sort(), 'p.56 file inventory changed');
const dom = JSON.parse(pageAssets[pageId + '_dom.json'].toString('utf8'));

const sourceDefinitions = [
  {
    id: 'block_15', expected: 'Activation Numbers and Groups', lineHeight: 1,
    segments: [{ text: 'Números de Ativação e Grupos', font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 400, style: 'normal' }],
  },
  {
    id: 'block_21', expected: 'Across the top of most Combatant Cards players will find up to 3 different colored boxes with numbers in them. These are called Activation Numbers. Each Activation Number has a color associated with it. Each color has a corresponding colored base snap to keep track of multiple figures of the same type on the game board.', lineHeight: 1.1,
    segments: [
      { text: 'Na parte superior da maioria das Cartas de Combatente há até ' },
      { text: '3', font: 'OptimaLTStd-Bold', size: 9, weight: 700 },
      { text: ' caixas coloridas, cada uma com um número. Esses números são chamados de Números de Ativação. Cada Número de Ativação corresponde a uma cor; no tabuleiro, um anel colorido encaixado na base ajuda a diferenciar miniaturas do mesmo tipo.' },
    ],
  },
  {
    id: 'block_26', expected: 'Example: Cave Sickle 2 would always have a purple base snap. While Cave Sickle 4 would always have a teal base snap.', lineHeight: 1.1,
    segments: [
      { text: 'Exemplo: ', font: 'OptimaLTStd-Bold', weight: 700 },
      { text: 'Cave Sickle ' }, { text: '2', font: 'OptimaLTStd-Bold', size: 9, weight: 700 },
      { text: ' sempre teria um encaixe roxo na base. Já Cave Sickle ' },
      { text: '4', font: 'OptimaLTStd-Bold', size: 9, weight: 700 },
      { text: ' sempre teria um encaixe verde-azulado na base.' },
    ],
  },
  {
    id: 'block_28', expected: 'When setting up an Encounter or spawning figures found on a Diagram, Combatants will have their Activation Number depicted. This number indicates which figure should be placed on the board and where.', lineHeight: 1.1,
    segments: [{ text: 'Em um Encontro ou ao fazer surgir miniaturas de um Diagrama, cada Combatente exibe seu Número de Ativação, que indica qual miniatura colocar no tabuleiro e onde.' }],
  },
  {
    id: 'block_76', expected: 'Example: The Diagram to the left shows where and which Cave Sickles Spawn by Activation Number.', lineHeight: 1.1,
    segments: [
      { text: 'Exemplo: ', font: 'OptimaLTStd-Bold', weight: 700 },
      { text: 'O Diagrama à esquerda mostra onde surgem as Cave Sickles e qual delas corresponde a cada Número de Ativação.' },
    ],
  },
  {
    id: 'block_77', expected: 'Reminder: Their individual borders are all kept red to indicate they are opponents. See Allies, Opponents, and Figures Pg. 38.', lineHeight: 1.1,
    segments: [
      { text: 'Lembrete: ', font: 'OptimaLTStd-Bold', weight: 700 },
      { text: 'As bordas individuais são vermelhas: identificam essas miniaturas como oponentes. Veja ' },
      { text: 'Aliados, Oponentes e Miniaturas', font: 'OptimaLTStd-BoldItalic', weight: 700, style: 'italic' },
      { text: ', pág. 38.' },
    ],
  },
  {
    id: 'block_78', expected: 'Figures with more than 1 Activation Number are considered a Group. A Group represents a set of 2 or more figures that share a single Combatant', lineHeight: 1.1,
    segments: [
      { text: 'Um Grupo reúne ' }, { text: '2', font: 'OptimaLTStd-Bold', size: 10, weight: 700 },
      { text: ' ou mais miniaturas que compartilham uma Carta de Combatente e têm mais de ' },
      { text: '1', font: 'OptimaLTStd-Bold', size: 9, weight: 700 }, { text: ' Número de Ativação.' },
    ],
  },
  {
    id: 'block_79', expected: 'Card. Each Group will also have a corresponding Initiative Card labeled with the same set of Group numbers printed on their Combatant Card. (e.g. 1-3.)', lineHeight: 1.1,
    segments: [
      { text: 'Cada Grupo tem uma Carta de Iniciativa com os mesmos números do Grupo indicados na Carta de Combatente (ex.: ' },
      { text: '1–3', font: 'OptimaLTStd-Bold', weight: 700 }, { text: ').' },
    ],
  },
  {
    id: 'block_94', expected: 'CAVE SICKLE GROUP 1-3', lineHeight: 1, textAlign: 'center',
    segments: [{ text: 'GRUPO 1–3', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal' }],
  },
  {
    id: 'block_99', expected: 'CAVE SICKLE GROUP 4-6', lineHeight: 1, textAlign: 'center',
    segments: [{ text: 'GRUPO 4–6', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal' }],
  },
  {
    id: 'block_100', expected: 'Combatants of the same type might also have two or more Combatant Cards representing additional Groups. Each additional Group has ascending Activation Numbers and their own matching Initiative Card.', lineHeight: 1.1,
    segments: [{ text: 'Combatentes do mesmo tipo podem ter várias Cartas de Combatente, uma para cada Grupo. Cada Grupo adicional tem Números de Ativação consecutivos e sua própria Carta de Iniciativa.' }],
  },
  {
    id: 'block_101', expected: 'This means that if enough Combatants Spawn, or if a Diagram calls for a specific set of figures with Activations Numbers in differing Groups, you will have multiple Initiative Cards placed at different positions on the Initiative Track. These Groups will take turns at different moments than other Groups of the same type of Combatant.', lineHeight: 1.1,
    segments: [{ text: 'Quando surgem Combatentes suficientes ou um Diagrama pede um conjunto específico de miniaturas com Números de Ativação de Grupos diferentes, várias Cartas de Iniciativa podem ocupar posições distintas na Trilha de Iniciativa. Assim, Grupos do mesmo tipo de Combatente realizam seus turnos em momentos diferentes.' }],
  },
  {
    id: 'block_103', expected: 'A Group\'s corresponding Initiative Card is only ever removed from the Initiative Track when the last figure in a Group is Defeated. Additionally, figures in a Group are considered separate figures and keep track of all Damage and Effects separately. Activation Numbers are used to keep track of which figures might have Damage tokens and Effects. When a figure in a Group Gains or loses a token, a player puts the token above the corresponding Activation Number.', lineHeight: 1.1,
    segments: [
      { text: 'A Carta de Iniciativa correspondente só é retirada da Trilha quando a última miniatura do Grupo é Derrotada. Além disso, cada miniatura do Grupo é considerada separadamente e mantém seu próprio controle de Dano e Efeitos. Os Números de Ativação identificam quais miniaturas podem ter fichas de Dano e Efeitos. Quando uma miniatura do Grupo ganha ou perde uma ficha, o jogador a coloca acima do Número de Ativação correspondente.' },
    ],
  },
  {
    id: 'block_104', expected: 'Combatant Tags', lineHeight: 1,
    segments: [{ text: 'Tags: Combatentes', font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 400, style: 'normal' }],
  },
  {
    id: 'block_111', expected: 'Combatant Tags are Tags that are uniquely associated with Combatant Cards. These Tags are listed in the top right hand corner of Combatant Cards and have their own special rules. Some Combatant Tags might be referenced by other cards and Abilities controlled by Adventurers or Combatants. See Combatant Tags Pg. 91.', lineHeight: 1.1,
    segments: [
      { text: 'As Tags de Combatente são associadas exclusivamente às Cartas de Combatente. Elas aparecem no canto superior direito dessas cartas e têm regras especiais. Outras cartas e Habilidades de Aventureiros ou Combatentes podem fazer referência a elas. Veja ' },
      { text: 'Tags de Combatente', font: 'OptimaLTStd-BoldItalic', weight: 700, style: 'italic' },
      { text: ', pág. 91.' },
    ],
  },
  {
    id: 'block_113', expected: 'Combatants', lineHeight: 1,
    textAlign: 'center',
    segments: [{ text: 'Combatentes', font: 'EsmeraldaPro', size: 30, color: '#231f20', weight: 400, style: 'normal' }],
  },
];

const addedCandidates = [];
for (const definition of sourceDefinitions) {
  const block = dom.blocks.find(item => item.id === definition.id);
  assert.ok(block, 'Missing source block ' + definition.id);
  assert.equal(blockText(block), normalize(definition.expected), 'Source text changed in ' + definition.id);
  const blockIndex = dom.blocks.indexOf(block);
  const spanKey = 'page_56_block_' + blockIndex + '__pt-BR';
  const segments = definition.segments.map(segment => ({
    font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', ...segment,
  }));
  const proposalText = segments.map(segment => segment.text).join('');
  const candidate = {
    spanKey,
    language: 'pt-BR',
    data: {
      schemaVersion: 2,
      spanKey,
      bbox: block.bbox,
      textAlign: definition.textAlign ?? 'left',
      lineHeight: definition.lineHeight,
      lineHeightMode: 'custom',
      segments,
      managedSourceSymbols: [],
    },
  };
  addedCandidates.push({
    blockId: block.id,
    blockIndex,
    spanKey,
    sourceText: normalize(definition.expected),
    proposalText,
    lineHeight: definition.lineHeight,
    candidate,
  });
}

const unitDefinitions = [
  {
    blockId: 'block_102',
    unitId: 'p56-block-102-paragraph-1',
    expected: 'Example: Each Group of the above Cave Sickles has their own Initiative Card and will activate at different times. Specifically when their corresponding Group\'s Initiative Card comes up in the Initiative Track.',
    segments: [
      { text: 'Exemplo: ', font: 'OptimaLTStd-Bold', weight: 700 },
      { text: 'Cada Grupo de Cave Sickles acima tem sua própria Carta de Iniciativa e é ativado em um momento diferente: quando a carta correspondente aparece na Trilha de Iniciativa.' },
    ],
  },
  {
    blockId: 'block_102',
    unitId: 'p56-block-102-paragraph-2',
    expected: 'When a Group starts its turn, each figure that is on the board and in that Group will take a turn, starting with the figure who has the lowest Activation Number. See The Initiative Track Pg. 36.',
    segments: [
      { text: 'Quando começa o turno de um Grupo, cada miniatura desse Grupo que estiver no tabuleiro realiza seu turno, começando pela de menor Número de Ativação. Veja ' },
      { text: 'A Trilha de Iniciativa', font: 'OptimaLTStd-BoldItalic', weight: 700, style: 'italic' },
      { text: ', pág. 36.' },
    ],
  },
];
for (const definition of unitDefinitions) {
  const block = dom.blocks.find(item => item.id === definition.blockId);
  assert.ok(block, 'Missing source block ' + definition.blockId);
  const unit = (block.typographicUnits ?? []).find(item => item.id === definition.unitId);
  assert.ok(unit, 'Missing source editorial unit ' + definition.unitId);
  const sourceLines = unit.field.lineIds.map(lineId => block.lines.find(line => line.id === lineId));
  assert.ok(sourceLines.every(Boolean), 'Missing source line for ' + definition.unitId);
  assert.equal(unitText(sourceLines), normalize(definition.expected), 'Source text changed in ' + definition.unitId);
  const spanKey = 'page_56_unit_' + definition.unitId + '__pt-BR';
  const segments = definition.segments.map(segment => ({
    font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', ...segment,
  }));
  const proposalText = segments.map(segment => segment.text).join('');
  const candidate = {
    spanKey,
    language: 'pt-BR',
    data: {
      schemaVersion: 2,
      spanKey,
      bbox: unit.field.bbox,
      textAlign: unit.field.frame.textAlign,
      lineHeight: unit.field.frame.lineHeight,
      lineHeightMode: 'custom',
      segments,
      managedSourceSymbols: [],
    },
  };
  addedCandidates.push({
    blockId: block.id,
    unitId: definition.unitId,
    spanKey,
    sourceText: normalize(definition.expected),
    proposalText,
    lineHeight: unit.field.frame.lineHeight,
    candidate,
  });
}

assert.equal(addedCandidates.length, 18, 'Unexpected number of added p.56 candidates');
const candidates = [...baseProposal.candidates.map(item => item), ...addedCandidates];
assert.equal(candidates.length, 23, 'Unexpected total candidate count on p.56');
assert.equal(new Set(candidates.map(item => item.spanKey)).size, candidates.length, 'Duplicate candidate keys');
assert.ok(candidates.every(item => item.spanKey.endsWith('__pt-BR')), 'Candidate key must have exactly the PT-BR suffix');
assert.ok(!candidates.some(item => item.spanKey.includes('__en')), 'A source/fallback key leaked into the PT-BR candidates');

const payload = await fetchJson('/api/translations', {
  'where[language][equals]': 'pt-BR',
  limit: '5000',
});
const existingPageRecords = (payload.docs ?? [])
  .filter(record => String(record.spanKey ?? '').startsWith('page_56_'))
  .map(record => ({ id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt }))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.deepEqual(existingPageRecords, [], 'A PT-BR record now exists for p.56; preserve it and reassess');

const snapshot = {
  ...baseSnapshot,
  translations: candidates.map(item => item.candidate),
  page,
  patched: true,
  verifyRenderedSnapshot: true,
};
const copiedAssetHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', pageId);
await mkdir(snapshotPageDir, { recursive: true });
for (const [name, bytes] of Object.entries(pageAssets)) {
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedAssetHashes[name] = sha256(bytes);
}

const proposal = {
  page,
  family: 'p.56 — proposta de todas as unidades textuais editáveis',
  status: 'isolated-page-text-proposal-awaiting-final-viewer-and-pdf-copyfit',
  attempt: 2,
  revisionBudget: 2,
  sourceHashes: {
    sourcePdf: expectedSourcePdfSha256,
    pageFiles: copiedAssetHashes,
    payloadBaseline: existingPageRecords,
    baseProposalV2: 'docs/translations/proposals/page-056-general-information-proposal-2026-10-15-v2.json',
  },
  candidateKeysUnique: true,
  candidateCount: candidates.length,
  candidates: candidates.map(({ blockId, blockIndex, unitId, spanKey, lineHeight, sourceText, proposalText, candidate }) => ({
    blockId, ...(blockIndex === undefined ? {} : { blockIndex }), ...(unitId ? { unitId } : {}),
    spanKey, sourceText, proposalText, lineHeight, candidate,
  })),
  textScope: {
    editableContentCovered: ['page title', 'General Information', 'Activation Numbers and Groups', 'Combatant Tags', 'diagram group captions'],
    intentionallyEnglishComponentArtwork: [
      'physical Command/Intelligent Combatant card faces and printed tags',
      'physical Cave Sickle Combatant Cards and printed creature names',
      'source diagrams, card artwork, page ornament and footer numerals',
    ],
    policyReference: 'docs/QA/drafts/2026-10-03-component-artwork-and-marker-audit.md',
    pageStructuralFidelity: 'not-certified-by-this-translation-proposal',
  },
  terminologyPendingHumanReview: [
    'Combatant → Combatente; Combatant Card → Carta de Combatente; Command/Intelligent Combatant → Combatente de Comando/Inteligente.',
    'Activation Number → Número de Ativação; Initiative Card → Carta de Iniciativa; Initiative Track → Trilha de Iniciativa; Group → Grupo; Combatant Tag → Tag de Combatente remain proposed forms, not official glossary additions.',
    'base snap → encaixe/anel colorido na base and teal → verde-azulado are descriptive candidates; confirm the component terminology and color name.',
    'Figures → Miniaturas, Spawn → Surgir/Faça Surgir, Adventurers → Aventureiros, and Encounter → Encontro follow the official glossary.',
    'Cave Sickle(s) is preserved as the printed creature name.',
  ],
  richText: {
    sourceNumberEmphasisPreservedWherePresent: true,
    exampleReminderLabelsPreservedBold: true,
    crossReferencesPreservedBoldItalic: true,
    sourceDamageEmphasisPreservedItalic: true,
    componentArtTextReconstructedAsProse: false,
    sourceFontSizesAndFamiliesUnchanged: true,
    semanticSymbolsInScope: 0,
  },
  copyfit: {
    status: 'awaiting-first-isolated-viewer-and-pdf-render',
    sourceVisibleLineCounts: Object.fromEntries(candidates.map(item => [item.spanKey, item.blockId === 'block_102' && item.unitId
      ? dom.blocks.find(block => block.id === 'block_102').typographicUnits.find(unit => unit.id === item.unitId).field.lineIds.length
      : dom.blocks.find(block => block.id === item.blockId).lines.length])),
    evidence: [],
  },
  persistence: {
    payloadPageRecordsBeforeProposal: existingPageRecords.length,
    wrotePayload: false,
    wroteCanonicalTranslations: false,
    wroteHumanTranslations: false,
    wroteCanonicalPageAssets: false,
  },
};

await immutableWrite(join(snapshotDir, 'snapshot-p056-full-page-v2-export.json'), JSON.stringify(snapshot, null, 2) + '\n');
await immutableWrite(join(proofDir, 'proposal-p056-full-page-v2.json'), JSON.stringify(proposal, null, 2) + '\n');
await immutableWrite(proposalPath, JSON.stringify(proposal, null, 2) + '\n');
await immutableWrite(join(proofDir, 'source-hashes.json'), JSON.stringify({
  sourcePdfSha256: expectedSourcePdfSha256,
  pageFiles: copiedAssetHashes,
  payloadPtBrRecords: existingPageRecords,
  copiedFromCurrentCanonicalPage: true,
  baseGeneralInformationProposal: baseProposal.candidates.map(item => item.spanKey),
  candidateKeys: candidates.map(item => item.spanKey),
}, null, 2) + '\n');

console.log(JSON.stringify({
  page,
  family: proposal.family,
  attempt: proposal.attempt + '/' + proposal.revisionBudget,
  candidateCount: candidates.length,
  addedCandidateCount: addedCandidates.length,
  candidateKeys: candidates.map(item => item.spanKey),
  payloadPageRecords: existingPageRecords.length,
  snapshot: join(snapshotDir, 'snapshot-p056-full-page-v2-export.json'),
  proposal: proposalPath,
}, null, 2));
