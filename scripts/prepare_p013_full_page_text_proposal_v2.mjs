#!/usr/bin/env node
/** Build a recoverable p.13 PT-BR proposal from current source and read-only Payload state. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const page = 13;
const pageId = 'page_013';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const expectedPdfSha256 = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p013-full-page-proposal-v2';
const proofDir = resolve(root, proofRel);
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot-p013-full-page-v2.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-013-full-page-text-proposal-2026-10-16-v2.json');
const sourcePageDir = resolve(root, 'apps/web/public/pages', pageId);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const newJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

try {
  await readdir(proofDir);
  throw new Error(`Refusing to overwrite proof directory: ${proofDir}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const pdfHash = sha256(await readFile(sourcePdfPath));
assert.equal(pdfHash, expectedPdfSha256, 'Official source PDF changed; stop and re-review source');
const sourcePageFiles = (await readdir(sourcePageDir)).sort();
const pageAssets = Object.fromEntries(await Promise.all(sourcePageFiles.map(async name => [
  name,
  sha256(await readFile(resolve(sourcePageDir, name))),
])));
const dom = await json(resolve(sourcePageDir, 'page_013_dom.json'));
const inline = await json(resolve(sourcePageDir, 'inline_elements.json'));
const sourceSnapshot = await json(resolve(root, 'output/proofs/important-family-validation-2026-10-13/p013-block_41/snapshot/snapshot.json'));
const sourceSnapshot52 = await json(resolve(root, 'output/proofs/important-family-validation-2026-10-13/p013-block_52/snapshot/snapshot.json'));
for (const name of ['page_013_dom.json', 'inline_elements.json']) {
  const before = await readFile(resolve(root, 'output/proofs/important-family-validation-2026-10-13/p013-block_41/snapshot/pages/page_013', name));
  assert.equal(sha256(before), pageAssets[name], `p.13 source ${name} differs from the already validated callout snapshots`);
}

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(translationResponse.ok, `Read-only Payload translation GET failed: ${translationResponse.status}`);
const allTranslations = (await translationResponse.json()).docs ?? [];
const currentTranslations = allTranslations.filter(doc => String(doc.spanKey ?? '').startsWith('page_13_'));
const expectedExistingIds = new Set(['197', '205', '206', '207', '208', '209', '210', '211', '212', '215', '245', '246', '325']);
assert.deepEqual(new Set(currentTranslations.map(doc => String(doc.id))), expectedExistingIds,
  'The p.13 Payload record set changed; preserve it and rebuild from current state');

const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[pageNumber][equals]', String(page));
framesUrl.searchParams.set('limit', '100');
const frameResponse = await fetch(framesUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(frameResponse.ok, `Read-only Payload frame GET failed: ${frameResponse.status}`);
const currentFrames = (await frameResponse.json()).docs ?? [];
assert.deepEqual(new Set(currentFrames.map(frame => frame.unitKey)), new Set([
  'page_13_block_5', 'page_13_unit_p13-new-story-flag-body', 'page_13_block_8',
]), 'The p.13 frame set changed; stop and reassess before generating a snapshot');

const blocks = dom.blocks;
const blockByIndex = index => {
  const block = blocks[index];
  assert.ok(block, `Missing p.13 block index ${index}`);
  return block;
};
const unitFor = (blockIndex, id) => {
  const unit = (blockByIndex(blockIndex).typographicUnits ?? []).find(candidate => candidate.id === id);
  assert.ok(unit, `Missing p.13 unit ${id}`);
  return unit;
};
const sourceTextForLines = lineIds => lineIds.map(id => {
  const line = blocks.flatMap(block => block.lines).find(candidate => candidate.id === id);
  assert.ok(line, `Missing source line ${id}`);
  return line.spans.map(span => span.text).join('');
}).join('');
const normalize = value => value.replace(/[\r\n\t ]+/gu, ' ').trim();

const normal = (text, font = 'OptimaLTStd', size = 10) => ({ text, font, size, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true });
const bold = (text, font = 'OptimaLTStd-Bold', size = 10) => ({ text, font, size, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true });
const italic = (text, font = 'OptimaLTStd-Italic', size = 10) => ({ text, font, size, color: '#231f20', weight: 400, style: 'italic', disableLigatures: true });
const boldItalic = (text, font = 'OptimaLTStd-BoldItalic', size = 10) => ({ text, font, size, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true });

function parseMarkup(value, defaults = {}) {
  const font = defaults.font ?? 'OptimaLTStd';
  const size = defaults.size ?? 10;
  const result = [];
  const pattern = /(\{\{symbol:[a-z0-9.-]+\}\}|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/giu;
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > last) result.push(normal(value.slice(last, match.index), font, size));
    const token = match[0];
    if (token.startsWith('{{symbol:')) {
      const symbolId = token.slice(9, -2);
      const source = inline.elements.find(element => element.symbolId === symbolId);
      assert.ok(source, `Missing p.13 inline source for ${symbolId}`);
      result.push({
        text: '\uFFFC', symbolId, symbolMetrics: source.metrics,
        font, size: source.anchor?.sizePt ?? size, color: source.color ?? '#231f20',
        weight: 400, style: 'normal', disableLigatures: true,
      });
    } else if (token.startsWith('***')) result.push(boldItalic(token.slice(3, -3), font.endsWith('-BoldItalic') ? font : 'OptimaLTStd-BoldItalic', size));
    else if (token.startsWith('**')) result.push(bold(token.slice(2, -2), font.endsWith('-Bold') ? font : 'OptimaLTStd-Bold', size));
    else result.push(italic(token.slice(1, -1), font.endsWith('-Italic') ? font : 'OptimaLTStd-Italic', size));
    last = match.index + token.length;
  }
  if (last < value.length) result.push(normal(value.slice(last), font, size));
  return result.filter(segment => segment.text.length > 0);
}

const candidates = [];
function addCandidate({ key, blockIndex, unitId, text, font, size, segments, terms = [], replacesRecordId = null }) {
  const block = blockByIndex(blockIndex);
  const unit = unitId ? unitFor(blockIndex, unitId) : null;
  const lineIds = unit?.field?.lineIds ?? block.lines.map(line => line.id);
  const sourceText = normalize(sourceTextForLines(lineIds));
  const targetSegments = segments ?? parseMarkup(text, { font, size });
  const targetPlain = targetSegments.map(segment => segment.symbolId ? '' : segment.text).join('').replace(/\uFFFC/gu, '');
  const frame = unit?.field?.frame ?? null;
  const data = {
    schemaVersion: 2,
    segments: targetSegments,
    textAlign: frame?.textAlign ?? 'left',
    lineHeight: frame?.lineHeight ?? block.defaultLineHeight ?? 1,
    lineHeightMode: 'source',
    managedSourceSymbols: [...new Set(targetSegments.filter(segment => segment.symbolId).map(segment => segment.symbolId))],
  };
  const record = { spanKey: key, language: 'pt-BR', data };
  const candidate = {
    spanKey: key,
    blockIndex,
    blockId: block.id,
    unitId: unitId ?? null,
    sourceText,
    proposalText: targetPlain,
    proposalMarkup: text ?? null,
    terms,
    replacesExistingPayloadRecordId: replacesRecordId,
    sourceLineIds: lineIds,
    candidate: record,
  };
  candidates.push(candidate);
  return record;
}

// Missing page units are staged from the existing complete p.13 editorial draft.
addCandidate({ key: 'page_13_block_0__pt-BR', blockIndex: 0, text: 'Marcadores', font: 'Cinzel-Regular', size: 12 });
addCandidate({
  key: 'page_13_unit_p13-story-round-2-step-1__pt-BR', blockIndex: 9, unitId: 'p13-story-round-2-step-1',
  text: '1. **COMPRAR E TREINAR:** Durante esta Fase, os jogadores montam uma Loja e gastam o Ouro obtido para comprar Itens e Aprimoramentos de Item. Além disso, os Aventureiros podem gastar **XP** para aprender novas Disciplinas. Os jogadores também podem vender Itens, exceto Itens de História, por Ouro. Quando terminarem de gastar o Ouro e o **XP** que desejarem, passam à próxima Fase. Consulte ***Montar uma Loja***, pág. 13.',
  font: 'OptimaLTStd', size: 10,
  segments: [normal('1. ', 'OptimaLTStd', 9), bold('COMPRAR E TREINAR:', 'OptimaLTStd-Bold', 9), ...parseMarkup(' Durante esta Fase, os jogadores montam uma Loja e gastam o Ouro obtido para comprar Itens e Aprimoramentos de Item. Além disso, os Aventureiros podem gastar **XP** para aprender novas Disciplinas. Os jogadores também podem vender Itens, exceto Itens de História, por Ouro. Quando terminarem de gastar o Ouro e o **XP** que desejarem, passam à próxima Fase. Consulte ***Montar uma Loja***, pág. 13.', { font: 'OptimaLTStd', size: 10 })],
  terms: ['Adventure Mechanic → Mecânica da Aventura; revisar consistência em contexto.'],
});
addCandidate({
  key: 'page_13_unit_p13-story-round-2-step-2-body__pt-BR', blockIndex: 9, unitId: 'p13-story-round-2-step-2-body',
  text: '2. **EXPLORAR (MISSÕES SECUNDÁRIAS):** Durante esta Fase, os jogadores escolhem uma Missão Secundária em uma lista de opções. Cada missão só pode ser tentada uma vez. Ao concluí-la, na maioria dos casos retornam à Rodada de História e podem passar por todas as Fases novamente. Depois de tentarem todas as missões, ou decidirem não tentar uma, seguem para a próxima Fase.',
  font: 'OptimaLTStd', size: 10,
  segments: [normal('2. ', 'OptimaLTStd', 9), bold('EXPLORAR (MISSÕES SECUNDÁRIAS):', 'OptimaLTStd-Bold', 9), ...parseMarkup(' Durante esta Fase, os jogadores escolhem uma Missão Secundária em uma lista de opções. Cada missão só pode ser tentada uma vez. Ao concluí-la, na maioria dos casos retornam à Rodada de História e podem passar por todas as Fases novamente. Depois de tentarem todas as missões, ou decidirem não tentar uma, seguem para a próxima Fase.', { font: 'OptimaLTStd', size: 10 })],
  terms: ['Side Quest → Missão Secundária; revisar consistência em contexto.'],
});
addCandidate({
  key: 'page_13_unit_p13-story-round-2-step-3__pt-BR', blockIndex: 9, unitId: 'p13-story-round-2-step-3',
  text: '3. **AVENTURAR-SE:** Nesta Fase, os jogadores continuam a Aventura. Depois de **Aventurarem-se**, não poderão retornar à Rodada de História atual.',
  font: 'OptimaLTStd', size: 10,
  segments: [normal('3. ', 'OptimaLTStd', 9), bold('AVENTURAR-SE:', 'OptimaLTStd-Bold', 9), ...parseMarkup(' Nesta Fase, os jogadores continuam a Aventura. Depois de **Aventurarem-se**, não poderão retornar à Rodada de História atual.', { font: 'OptimaLTStd', size: 10 })],
});
addCandidate({ key: 'page_13_block_10__pt-BR', blockIndex: 10, text: 'Disciplinas e Itens de História', font: 'Cinzel-Regular', size: 12 });
addCandidate({
  key: 'page_13_unit_p13-block-29-paragraph-1__pt-BR', blockIndex: 11, unitId: 'p13-block-29-paragraph-1',
  text: 'Algumas Mecânicas da Aventura concedem recompensas, como Ouro, **XP**, novos Itens e Habilidades. As Disciplinas de História e os Itens de História são cartas que só podem ser adquiridas por meio das Mecânicas da Aventura ou das Regras Especiais de Encontro da Aventura a que pertencem. Todas ficam em baralhos de **Cartas Ocultas** no início da Aventura e só devem ser **Reveladas** quando houver instrução específica.',
  font: 'OptimaLTStd', size: 10,
  terms: ['Adventure Mechanic → Mecânica da Aventura; revisar consistência em contexto.'],
});
addCandidate({
  key: 'page_13_unit_p13-block-29-paragraph-2__pt-BR', blockIndex: 11, unitId: 'p13-block-29-paragraph-2',
  text: 'As Disciplinas de História são identificadas pela palavra “Story” no lugar do Nível (**LVL**) e do **Tier** que normalmente indicariam. Itens de História nunca podem ser vendidos durante a Fase de **Comprar e Treinar**, e Disciplinas de História nunca podem ser compradas com **XP**.',
  font: 'OptimaLTStd', size: 10, replacesRecordId: 325,
  terms: ['Tier mantido no original por falta de equivalência aprovada; substituiria o registro inglês salvo apenas no snapshot de proposta.'],
});
addCandidate({ key: 'page_13_block_12__pt-BR', blockIndex: 12, text: 'Finais', font: 'Cinzel-Regular', size: 12 });
addCandidate({
  key: 'page_13_block_13__pt-BR', blockIndex: 13,
  text: 'Cada Aventura de ***Middara*** tem vários Finais. Um Final é uma Cena especial que encerra a Aventura atual. A maioria das Cenas de Final resulta em **Fim de Jogo**. Nesse caso, os jogadores podem tentar novamente ou, se preferirem, recomeçar a Aventura.',
  font: 'OptimaLTStd', size: 10, terms: ['Game Over → Fim de Jogo; termo candidato, revisão humana pendente.'],
});
addCandidate({ key: 'page_13_block_14__pt-BR', blockIndex: 14, text: 'Montar uma Loja', font: 'Cinzel-Regular', size: 12 });
addCandidate({
  key: 'page_13_block_15__pt-BR', blockIndex: 15,
  text: 'A Loja é o conjunto de Cartas de Item que os Aventureiros podem comprar durante a Fase de **Comprar e Treinar** de uma Rodada de História ou quando receberem instruções para **Comprar e Treinar**.',
  font: 'OptimaLTStd', size: 10,
});
addCandidate({ key: 'page_13_block_16__pt-BR', blockIndex: 16, text: '**Por exemplo:** a Loja contém os seguintes Itens à venda:', font: 'OptimaLTStd', size: 10 });
addCandidate({ key: 'page_13_block_17__pt-BR', blockIndex: 17, text: 'TODOS OS ITENS MUNDANOS E COMUNS', font: 'OptimaLTStd-Bold', size: 9 });
addCandidate({
  key: 'page_13_block_18__pt-BR', blockIndex: 18,
  text: 'TODOS OS APRIMORAMENTOS LIBERADOS PELOS JOGADORES',
  font: 'OptimaLTStd-Bold', size: 9,
  terms: ['Mantém os jogadores como agentes de unlocked; copyfit precisa ser medido na moldura real.'],
});
addCandidate({ key: 'page_13_block_19__pt-BR', blockIndex: 19, text: '1 ITEM ÚNICO COMUM ALEATÓRIO (LIMITE: 1)', font: 'OptimaLTStd-Bold', size: 9 });
addCandidate({
  key: 'page_13_unit_p13-block-40-paragraph-1__pt-BR', blockIndex: 20, unitId: 'p13-block-40-paragraph-1',
  text: 'A maioria das Lojas terá 1 Item Único aleatório. Nesse caso, embaralhe todas as Cartas de Item Único Comum e compre uma do fundo do baralho.',
  font: 'OptimaLTStd', size: 10,
  terms: ['Draw → “compre” segue o glossário; distinguir compra de Item de retirar do baralho ainda aguarda reconciliação humana.'],
});
addCandidate({
  key: 'page_13_unit_p13-block-40-paragraph-2__pt-BR', blockIndex: 20, unitId: 'p13-block-40-paragraph-2',
  text: 'Esses Itens Únicos não são sorteados novamente e permanecem na Loja durante toda a Rodada de História em questão. Nenhum outro Item Único fica disponível para compra até a próxima Rodada de História nomeada, mesmo que o grupo compre este. Este Item também não fica disponível durante um Encontro em que se sorteie outro Item Único aleatório do mesmo **Tier**.',
  font: 'OptimaLTStd', size: 10, terms: ['Tier mantido no original por falta de equivalência aprovada.'],
});
addCandidate({
  key: 'page_13_block_22__pt-BR', blockIndex: 22, text: 'Recompensas', font: 'Cinzel-Regular', size: 12,
  terms: ['Bounty → Recompensa; candidato sem aprovação terminológica.'],
});
addCandidate({
  key: 'page_13_block_23__pt-BR', blockIndex: 23,
  text: 'Muitas Rodadas de História permitem tentar uma Missão Secundária especial: uma **Recompensa**. Cada **Recompensa** é um conjunto de Encontros tentado uma vez na Fase de ***Explorar*** de uma Rodada de História nomeada. Só é possível tentar uma **Recompensa** por Rodada de História nomeada. Se o grupo tiver mais de uma, escolha apenas **UMA** para tentar naquela Rodada de História.',
  font: 'OptimaLTStd', size: 10, terms: ['Bounty → Recompensa; candidato sem aprovação terminológica.'],
});
addCandidate({ key: 'page_13_block_24__pt-BR', blockIndex: 24, text: 'Rodadas de História especificam quais **Recompensas** podem ser tentadas, conforme', font: 'OptimaLTStd', size: 10, terms: ['Bounty → Recompensa; candidato sem aprovação terminológica.'] });
addCandidate({ key: 'page_13_block_25__pt-BR', blockIndex: 25, text: 'a dificuldade indicada pelo', font: 'OptimaLTStd', size: 10 });
addCandidate({ key: 'page_13_block_26__pt-BR', blockIndex: 26, text: '{{symbol:combat.skull}} símbolo. Não se pode tentar uma', font: 'OptimaLTStd', size: 10 });
addCandidate({
  key: 'page_13_block_27__pt-BR', blockIndex: 27,
  text: '**Recompensa** acima da dificuldade permitida pela Rodada de História (por exemplo, com mais caveiras).',
  font: 'OptimaLTStd', size: 10, terms: ['Bounty → Recompensa; candidato sem aprovação terminológica.'],
});
addCandidate({
  key: 'page_13_block_28__pt-BR', blockIndex: 28,
  text: 'Depois de concluir uma **Recompensa**, os Aventureiros nunca mais podem tentá-la naquela Aventura. Se perderem uma **Recompensa**, podem tentar concluí-la novamente na próxima Rodada de História nomeada que permita aquela dificuldade ou uma menor. Nesse caso, começam a **Recompensa** do início.',
  font: 'OptimaLTStd', size: 10, terms: ['Bounty → Recompensa; candidato sem aprovação terminológica.'],
});

const oldCalloutRecords = [
  ...sourceSnapshot.translations,
  ...sourceSnapshot52.translations,
];
assert.deepEqual(new Set(oldCalloutRecords.map(record => record.spanKey)), new Set([
  'page_13_block_21__pt-BR', 'page_13_block_29__pt-BR',
]));
for (const record of oldCalloutRecords) {
  candidates.push({
    spanKey: record.spanKey,
    blockIndex: Number(record.spanKey.match(/block_(\d+)/u)?.[1]),
    blockId: blocks[Number(record.spanKey.match(/block_(\d+)/u)?.[1])]?.id,
    unitId: null,
    sourceText: normalize(sourceTextForLines(blocks[Number(record.spanKey.match(/block_(\d+)/u)?.[1])].lines.map(line => line.id))),
    proposalText: record.data.segments.map(segment => segment.symbolId ? '' : segment.text).join('').replace(/\uFFFC/gu, ''),
    proposalMarkup: null,
    terms: ['Callout PT-BR reciclado da prova isolada validada; revisão terminológica humana continua pendente.'],
    replacesExistingPayloadRecordId: null,
    sourceLineIds: blocks[Number(record.spanKey.match(/block_(\d+)/u)?.[1])].lines.map(line => line.id),
    candidate: record,
  });
}

const replacement = candidates.find(candidate => candidate.replacesExistingPayloadRecordId === 325);
assert.ok(replacement, 'Missing isolated replacement for the existing English p.13 paragraph');
const existingByKey = new Map(currentTranslations.map(record => [record.spanKey, record]));
for (const candidate of candidates) {
  const existing = existingByKey.get(candidate.spanKey);
  if (existing && String(existing.id) !== String(candidate.replacesExistingPayloadRecordId)) {
    throw new Error(`Refusing to replace existing p.13 record ${existing.id} at ${candidate.spanKey}`);
  }
}
const candidateKeys = candidates.map(candidate => candidate.spanKey);
assert.equal(new Set(candidateKeys).size, candidateKeys.length, 'Duplicate candidate keys');

const candidateRecords = candidates.map(candidate => candidate.candidate);
const translationsByKey = new Map(currentTranslations.map(record => [record.spanKey, record]));
for (const candidate of candidateRecords) translationsByKey.set(candidate.spanKey, candidate);
const snapshot = structuredClone(sourceSnapshot);
snapshot.page = page;
snapshot.translations = [...translationsByKey.values()];
snapshot.layoutFrames = currentFrames;
snapshot.assetPages = [page];
snapshot.patched = true;
snapshot.verifyRenderedSnapshot = true;
assert.equal(new Set(snapshot.translations.map(record => record.spanKey)).size, snapshot.translations.length);
assert.ok(snapshot.translations.every(record => record.language === 'pt-BR' && !record.spanKey.includes('__en')));

await mkdir(resolve(snapshotDir, 'pages', pageId), { recursive: true });
for (const name of sourcePageFiles) {
  await copyFile(resolve(sourcePageDir, name), resolve(snapshotDir, 'pages', pageId, name));
  assert.equal(sha256(await readFile(resolve(snapshotDir, 'pages', pageId, name))), pageAssets[name], `Snapshot asset differs: ${name}`);
}
await newJson(snapshotPath, snapshot);
const proposal = {
  proposalId: 'page-013-full-page-text-proposal-2026-10-16-v2',
  page: 13,
  locale: 'pt-BR',
  status: 'isolated-full-page-proposal-v2-awaiting-viewer-pdf-and-editor-review',
  scope: 'All editable prose, headings, list entries, IMPORTANT callouts, story flag symbols and bounty skull on p.13; printed diagram/artwork remains English under current policy.',
  sourceHashes: { sourcePdfSha256: pdfHash, pageAssets },
  payloadBaseline: {
    readOnly: true,
    translationRecordCount: currentTranslations.length,
    translationRecordIds: currentTranslations.map(record => String(record.id)).sort(),
    layoutFrameCount: currentFrames.length,
    layoutFrameIds: currentFrames.map(frame => String(frame.id)).sort(),
    replacedInProposalSnapshotOnly: [{ id: '325', spanKey: replacement.spanKey, savedText: 'English text; preserved in Payload' }],
    payloadWrites: 0,
  },
  candidateCount: candidates.length,
  candidates,
  copyfit: { status: 'pending-real-Viewer-and-official-PDF-review', textUnitCount: candidates.length },
  terminology: {
    status: 'pending-human-review',
    issues: [...new Set(candidates.flatMap(candidate => candidate.terms))],
  },
  evidence: {
    snapshot: snapshotPath,
    snapshotTranslationCount: snapshot.translations.length,
    currentPayloadTranslationsPreserved: currentTranslations.length - 1,
    existingCalloutProposalsReused: oldCalloutRecords.map(record => record.spanKey),
    normalViewerScreenshot: null,
    pdf: null,
    independentPdfRender: null,
  },
  integrity: { payloadWritten: false, canonicalPageFilesWritten: false, humanTranslationOverwritten: false },
};
await newJson(proposalPath, proposal);
await newJson(resolve(proofDir, 'preflight.json'), {
  page,
  result: 'passed-read-only-preflight',
  sourcePdfSha256: pdfHash,
  pageAssetHashes: pageAssets,
  payloadTranslationRecordIds: proposal.payloadBaseline.translationRecordIds,
  payloadFrameIds: proposal.payloadBaseline.layoutFrameIds,
  candidateCount: candidates.length,
  snapshotTranslationCount: snapshot.translations.length,
  payloadWrites: 0,
  canonicalWrites: 0,
});
console.log(JSON.stringify({
  status: proposal.status,
  page,
  candidateCount: candidates.length,
  snapshotTranslationCount: snapshot.translations.length,
  currentPayloadRecords: currentTranslations.length,
  sourcePdfSha256: pdfHash,
  proposalPath,
  snapshotPath,
  payloadWrites: 0,
  canonicalWrites: 0,
}, null, 2));
