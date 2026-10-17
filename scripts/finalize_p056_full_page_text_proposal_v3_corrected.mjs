import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const proofRel = 'output/proofs/translation-readiness-2026-10-15/p056-full-page-v3-corrected';
const proofDir = resolve(root, proofRel);
const proposalPath = resolve(root, 'docs/translations/proposals/page-056-full-page-text-proposal-2026-10-15-v3-corrected.json');
const sourcePdfPath = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const fileSha = async path => sha256(await readFile(resolve(root, path)));

const proposal = await readJson(proposalPath);
const metrics = await readJson(resolve(proofDir, 'page-056-pt-BR-v3-metrics.json'));
const officialExport = await readJson(resolve(proofDir, 'official-export-verification-v3.json'));
const pdfCheck = await readJson(resolve(proofDir, 'independent-pdf-verification-v3.json'));
const editor = await readJson(resolve(proofDir, 'normal-editor-readonly-receipt-v3.json'));
const expectedSourcePdf = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';

assert.equal(proposal.page, 56);
assert.equal(proposal.candidates.length, 23);
assert.equal(proposal.candidates.find(candidate => candidate.blockId === 'block_104')?.proposalText, 'Tags de Combatente');
assert.equal(sha256(await readFile(sourcePdfPath)), expectedSourcePdf);
for (const [name, expectedHash] of Object.entries(proposal.sourceHashes.pageFiles)) {
  assert.equal(await fileSha(`apps/web/public/pages/page_056/${name}`), expectedHash, `Canonical p.56 source changed: ${name}`);
}
assert.equal(metrics.page, 56);
assert.equal(metrics.language, 'pt-BR');
assert.equal(officialExport.verifiedTranslationRecords, true);
assert.equal(officialExport.pdfVerification, true);
assert.equal(pdfCheck.allCandidateTextsFound, true);
assert.equal(pdfCheck.candidateCount, 23);
assert.equal(pdfCheck.mediaBoxAndCropBoxMatchSource, true);
assert.equal(pdfCheck.oldBlockedHeadingCandidateAbsent, true);
assert.equal(editor.candidateCount, 23);
assert.equal(editor.viewer.allCandidatesVisible, true);
assert.equal(editor.editor.allCandidatesMatchedAndEditable, true);
assert.equal(editor.editor.cancelClosedEveryDraft, true);
assert.equal(editor.isolatedFrame.measured.width, 136);
assert.equal(editor.blockedNonGetApiRequests.length, 0);
assert.deepEqual(editor.observedApiMethods, ['GET']);
assert.equal(editor.consoleErrors.length, 0);
assert.equal(editor.canonicalPageFilesUnchanged, true);
assert.deepEqual(editor.payloadPtBrRecordsBeforeAndAfter, { before: [], after: [] });

const visualPaths = {
  viewer: `${proofRel}/viewer-page-056-pt-BR-v3.png`,
  pdfRaster: `${proofRel}/pdf-page-056-pt-BR-v3-raster.png`,
  fullPageSourceViewerPdf: `${proofRel}/source-viewer-pdf-page-056-v3.png`,
  headingSourceExport: `${proofRel}/source-vs-export-tags-heading-v3.png`,
  normalAdminViewer: `${proofRel}/normal-admin-viewer-p056-pt-BR-v3-corrected.png`,
};
const visualHashes = Object.fromEntries(await Promise.all(Object.entries(visualPaths).map(async ([key, file]) => [key, await fileSha(file)])));
const pdfPath = `${proofRel}/page-056-pt-BR-full-text-v3.pdf`;
const pdfSha256 = await fileSha(pdfPath);

const visualReview = {
  schemaVersion: 1,
  status: 'passed for the complete editable-text proposal; human editorial review pending',
  page: 56,
  sourcePdfSha256: expectedSourcePdf,
  sourcePageAssetHashesMatch: true,
  candidateCount: 23,
  visualInspection: {
    sourceViewerAndExportFullPageCompared: true,
    pageContentAndArtworkPositionsPreservedInScope: true,
    allTextUnitsVisiblyPlaced: true,
    headingSingleLineBeforeDivider: true,
    visibleClippingOrCollision: false,
    neighboringComponentArtworkOccluded: false,
    intentionallyEnglishComponentArtworkPreserved: true,
    note: 'The heading uses the recurring proposed term “Tags de Combatente”; a PT-BR-only frame of 136 pt keeps Cinzel 12 pt and the source x/y/height while avoiding the prior wrap. The frame exists only in the isolated proposal snapshot.',
  },
  editor: {
    allTwentyThreeFieldsVisibleEditableAndCancelled: true,
    isolatedFrameLoadedInNormalAdminViewer: true,
    payloadWrites: 0,
    nonGetRequests: 0,
    consoleErrors: 0,
    canonicalPageFilesUnchanged: true,
  },
  pdf: {
    officialExporterVerificationPassed: true,
    independentTextAndGeometryVerificationPassed: true,
    pageCount: 1,
    mediaBoxAndCropBoxMatchSource: true,
    allTwentyThreeTargetTextsFound: true,
    oldHeadingCandidateAbsent: true,
    replacementCharacters: 0,
    sha256: pdfSha256,
  },
  persistence: { payloadWrites: 0, canonicalTranslationsWritten: false, humanTranslationsWritten: false, canonicalPageAssetsWritten: false },
  editorialLimits: [
    'Terminology choices remain proposals and await human review; no glossary or approved translation was changed.',
    'Physical component/card text remains English under project policy.',
    'This is a complete proposal for the 23 editable text candidates, not certification of p.56 English source fidelity or the whole 102-page book.',
  ],
  evidence: Object.fromEntries(Object.entries(visualPaths).map(([key, path]) => [key, { path, sha256: visualHashes[key] }])),
};
await writeFile(resolve(proofDir, 'visual-review-v3.json'), `${JSON.stringify(visualReview, null, 2)}\n`, { flag: 'wx' });

proposal.status = 'complete-editable-text-proposal-v3-ready-for-human-editorial-review';
proposal.layoutFrameProposal.status = 'visually-verified-in-isolated-proposal-only';
proposal.copyfit.status = 'PASS: all 23 editable text candidates verified in Viewer, normal Editor and isolated PDF';
proposal.copyfit.evidence = [
  ...(proposal.copyfit.evidence ?? []),
  `Official export and visual proof: ${pdfPath}`,
  `Independent PDF verification: ${proofRel}/independent-pdf-verification-v3.json`,
  `Normal Editor read-only receipt: ${proofRel}/normal-editor-readonly-receipt-v3.json`,
  `Visual review: ${proofRel}/visual-review-v3.json`,
];
proposal.visualReview = {
  status: visualReview.status,
  pdfSha256,
  editorReceipt: `${proofRel}/normal-editor-readonly-receipt-v3.json`,
  independentPdfReceipt: `${proofRel}/independent-pdf-verification-v3.json`,
  visualReviewReceipt: `${proofRel}/visual-review-v3.json`,
};
await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');

const finalization = {
  schemaVersion: 1,
  page: 56,
  status: 'complete-editable-text-proposal-ready-for-human-editorial-review',
  candidateCount: 23,
  includedInViewerEditorAndPdf: 23,
  excludedCandidates: 0,
  ptBrOnlyFrame: proposal.layoutFrameProposal.proposedFrame,
  sourcePdfSha256: expectedSourcePdf,
  exportPdfSha256: pdfSha256,
  editorReadOnlyPassed: true,
  independentPdfPassed: true,
  visualReviewPassed: true,
  terminologyReview: 'pending-human',
  englishFidelity: 'not-certified',
  componentArtwork: 'intentionally-remains-English-per-project-policy',
  persistence: { payloadWrites: 0, canonicalTranslationWrites: 0, canonicalFrameWrites: 0, humanTranslationWrites: 0 },
};
await writeFile(resolve(proofDir, 'proposal-finalization-v3.json'), `${JSON.stringify(finalization, null, 2)}\n`, { flag: 'wx' });

const failedV3Note = {
  status: 'superseded-invalid-candidate-snapshot; preserve for audit, do not use as final proof',
  reason: 'The first v3 generator changed the original proposal object instead of its cloned candidate; its exported snapshot still contains the earlier wording “Tags: Combatentes”. The frame-width experiment is retained, but that PDF does not prove the corrected term.',
  supersededBy: `${proofRel}/proposal-finalization-v3.json`,
  exportedPdfSha256: await fileSha('output/proofs/translation-readiness-2026-10-15/p056-full-page-v3/page-056-pt-BR-full-text-v3.pdf'),
};
const failedV3Path = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-full-page-v3/attempt-status.json');
try {
  await readFile(failedV3Path);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  await writeFile(failedV3Path, `${JSON.stringify(failedV3Note, null, 2)}\n`, { flag: 'wx' });
}

const progressRel = 'docs/project-progress/2026-10-15-p056-full-page-text-proposal-v3.md';
const progress = `# 2026-10-15 — p.56: texto editável completo, proposta v3\n\n## Resultado\n\nA proposta v3 cobre os **23 candidatos de texto editável** da página, sem excluir heading. O candidato final ` + '`page_56_block_36__pt-BR`' + ` usa “Tags de Combatente”, coerente com o corpo e com a terminologia proposta para o conceito. Seu frame PT-BR isolado tem 136 pt de largura; x, y, altura, Cinzel 12 pt e alinhamento fonte foram mantidos. O frame não foi gravado no sidecar nem no Payload.\n\nAs cartas, tags impressas, diagramas e demais textos incorporados às artes de componentes continuam em inglês conforme a política de componentes. A proposta técnica está pronta para revisão humana, mas a p.56 ainda tem ` + '`english_fidelity=not_certified`' + `, e nenhum termo foi aprovado ou escrito no glossário.\n\n## Verificações\n\n- O exportador oficial incluiu os 23 registros, confirmou ` + '`verifiedTranslationRecords=true`' + ` e ` + '`pdfVerification=true`' + `. O PDF tem uma página e MediaBox/CropBox iguais à fonte (` + '`820.346 × 820.346 pt`' + `). SHA-256: ` + '`' + pdfSha256 + '`' + `.\n- A extração independente encontrou todos os 23 textos-alvo; o heading PT aparece em uma linha, dentro da moldura proposta. Não há o heading-fonte na posição, a redação tentativa “Tags: Combatentes” nem U+FFFD. Contagens 3 para “Tags de Combatente” e 10 para “Combatentes” refletem ocorrências naturais em corpos/cross-references, não duplicação visual.\n- Comparação integral da fonte EN, Viewer e PDF exportado: [prancha](../../${visualPaths.fullPageSourceViewerPdf}) · recorte do heading [fonte/export](../../${visualPaths.headingSourceExport}). No zoom inspecionado, a linha termina antes da divisória; não cobre a carta logo abaixo nem colide com conteúdo vizinho.\n- O Editor Admin normal recebeu os 23 registros e o frame de 136 pt por overlays GET-only. Todos os campos mostraram o texto exato, permaneceram editáveis e foram cancelados. O frame observado no Viewer Admin mediu 136 pt. Zero requisições não-GET, zero erro de console, zero registro p.56 no Payload e hashes dos oito arquivos canônicos iguais antes/depois. Receipt: [Editor read-only](../../${proofRel}/normal-editor-readonly-receipt-v3.json).\n- [PDF rasterizado](../../${proofRel}/pdf-page-056-pt-BR-v3-raster.png) · [PDF](../../${pdfPath}) · [recibo independente](../../${proofRel}/independent-pdf-verification-v3.json) · [revisão visual](../../${proofRel}/visual-review-v3.json) · [fechamento](../../${proofRel}/proposal-finalization-v3.json).\n\n## Integridade e escopo\n\nO PDF-fonte, os oito assets canônicos de página, DOM, sidecar, frames e Payload estavam inalterados no preflight e após a prova. Nenhuma tradução humana foi modificada. As versões v1/v2 permanecem preservadas. O primeiro artefato chamado v3 também foi preservado e marcado inválido como prova final porque um bug no gerador manteve a redação anterior; a versão corrigida acima confirma o texto efetivamente renderizado.\n\nEsta é uma proposta completa para o texto editável da p.56, pronta para revisão editorial humana — não uma aprovação editorial, certificação estrutural da página ou conclusão do livro.\n`;
await writeFile(resolve(root, progressRel), progress, { flag: 'wx' });

const pageStatusPath = resolve(root, 'docs/translations/page-status.csv');
let csv = await readFile(pageStatusPath, 'utf8');
const lineEnding = csv.includes('\r\n') ? '\r\n' : '\n';
const csvLines = csv.split(/\r?\n/u);
const rowIndex = csvLines.findIndex(line => line.startsWith('56,56,'));
assert.notEqual(rowIndex, -1, 'Missing p.56 row in page-status.csv');
const statusPrefix = '56,56,raw_pdf_transcript_generated_unreviewed,not_certified,';
const newRow = `${statusPrefix}complete_editable_prose_proposal_v3_23_units_viewer_editor_pdf_verified_human_review_pending,"All 23 editable text candidates passed normal Viewer, normal Editor read-only and isolated PDF; PT-BR-only 136 pt heading frame remains a proposal. Component artwork remains English by policy. Terminology awaits human review; English fidelity remains not_certified. See docs/project-progress/${progressRel.split('/').at(-1)}"`;
if (!csvLines[rowIndex].startsWith(statusPrefix)) throw new Error('Unexpected p.56 status row; refusing to replace it');
csvLines[rowIndex] = newRow;
await writeFile(pageStatusPath, csvLines.join(lineEnding), 'utf8');

const readmePath = resolve(root, 'docs/project-progress/README.md');
let readme = await readFile(readmePath, 'utf8');
const v2Entry = readme.split(/\r?\n/u).find(line => line.includes('2026-10-15-p056-full-page-text-proposal.md'));
assert.ok(v2Entry, 'Missing historical p.56 v2 index entry');
const v2Historical = '- [2026-10-15 — p.56: proposta de texto integral v2 (histórica)](2026-10-15-p056-full-page-text-proposal.md): 22/23 unidades foram verificadas; o bloqueio de heading foi substituído pela proposta v3 isolada, que inclui 23/23. Use o relatório v3 como estado atual.';
readme = readme.replace(v2Entry, v2Historical);
const v3Entry = `- [2026-10-15 — p.56: proposta integral do texto editável v3](2026-10-15-p056-full-page-text-proposal-v3.md): 23/23 candidatos validados no Viewer, Editor read-only e PDF; pronta para revisão humana, sem escrita canônica.`;
const readmeEol = readme.includes('\r\n') ? '\r\n' : '\n';
if (!readme.includes('2026-10-15-p056-full-page-text-proposal-v3.md')) {
  readme = readme.replace(`# Project progress log${readmeEol}`, `# Project progress log${readmeEol}${readmeEol}${v3Entry}${readmeEol}`);
}
await writeFile(readmePath, readme, 'utf8');

const handoffPath = resolve(root, 'PROJECT-HANDOFF.md');
let handoff = await readFile(handoffPath, 'utf8');
const handoffEntry = '- **p.56:** proposta completa dos 23 textos editáveis validada no Viewer, Editor read-only e PDF isolado; o heading usa moldura PT-BR de 136 pt somente na proposta. Revisão terminológica pendente, `english_fidelity=not_certified`, componente-artes em EN por política e zero escrita canônica/Payload. Ver [fechamento v3](docs/project-progress/2026-10-15-p056-full-page-text-proposal-v3.md).';
if (!handoff.includes('2026-10-15-p056-full-page-text-proposal-v3.md')) {
  const handoffEol = handoff.includes('\r\n') ? '\r\n' : '\n';
  handoff = handoff.replace(`## Execução mais recente — 15/10/2026${handoffEol}`, `## Execução mais recente — 15/10/2026${handoffEol}${handoffEol}${handoffEntry}${handoffEol}`);
}
await writeFile(handoffPath, handoff, 'utf8');

const statePath = resolve(root, 'docs/PROJECT_STATE.md');
let state = await readFile(statePath, 'utf8');
const stateEntry = "- **p.56:** todas as 23 unidades textuais editáveis têm proposta PT-BR v3 validada em Viewer, Editor read-only e PDF. O heading `Tags de Combatente` usa frame PT-BR 136 pt apenas no snapshot; termos aguardam revisão e `english_fidelity=not_certified`. Component art continua em EN por política; sem escrita em Payload ou sidecars. Ver [relatório v3](project-progress/2026-10-15-p056-full-page-text-proposal-v3.md).\n";
if (!state.includes('2026-10-15-p056-full-page-text-proposal-v3.md')) {
  const stateEol = state.includes('\r\n') ? '\r\n' : '\n';
  state = state.replace(`## Atualização corrente — ativações técnicas e propostas (15/10/2026)${stateEol}`, `## Atualização corrente — ativações técnicas e propostas (15/10/2026)${stateEol}${stateEol}${stateEntry.replace(/\n/gu, stateEol)}`);
}
await writeFile(statePath, state, 'utf8');

console.log(JSON.stringify(finalization, null, 2));
