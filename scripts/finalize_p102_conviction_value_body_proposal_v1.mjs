import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1');
const progressEvidenceDir = resolve(root, 'docs/project-progress/evidence/2026-10-15-p102-conviction-value-body-v1');
const proposalPath = resolve(root, 'docs/translations/proposals/page-102-conviction-value-body-proposal-2026-10-15-v1.json');
const proposalMarkdownPath = resolve(root, 'docs/translations/proposals/page-102-conviction-value-body-proposal-2026-10-15-v1.md');
const progressPath = resolve(root, 'docs/project-progress/2026-10-15-page102-conviction-value-body-proposal.md');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();

async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace divergent tracked evidence: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

const proofReport = JSON.parse(await readFile(join(proofDir, 'proof-report-v1.json'), 'utf8'));
const copyfit = JSON.parse(await readFile(join(proofDir, 'copyfit-reconciliation-v3.json'), 'utf8'));
const editor = JSON.parse(await readFile(join(proofDir, 'normal-editor-readonly-receipt-v1.json'), 'utf8'));
const snapshot = JSON.parse(await readFile(join(proofDir, 'snapshot/snapshot-p102-conviction-value-body-v1-export.json'), 'utf8'));
const targetKey = 'page_102_unit_p102-conviction-value-body__pt-BR';
const candidate = snapshot.translations.find(record => record.spanKey === targetKey);
assert.ok(candidate, 'The immutable snapshot is missing the p.102 body candidate');
assert.equal(snapshot.translations.filter(record => record.spanKey === targetKey).length, 1, 'Duplicate proposal key in snapshot');
assert.equal(copyfit.status, 'copyfit-pass-with-recorded-glyph-bbox-offset');
assert.equal(copyfit.fullTargetTextPresentOnce, true);
assert.equal(copyfit.completeEnglishBodyFallbackOccurrences, 0);
assert.equal(copyfit.copyfitChecks.sixLinesPreserved, true);
assert.equal(copyfit.copyfitChecks.noOverlapWithExample, true);
assert.equal(copyfit.exampleSourceTextUnchanged, true);
assert.equal(copyfit.followingParagraphSourceTextUnchanged, true);
assert.equal(editor.sourceTextMatched && editor.fieldEditable && editor.cancelRestoredEnglish && editor.reopenPreservedEnglish, true);
assert.equal(editor.canonicalPageFilesUnchanged, true);
assert.equal(editor.blockedWriteRequests.length, 0);

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const payloadResponse = await fetch(translationsUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(payloadResponse.ok, `Read-only Payload recheck failed: HTTP ${payloadResponse.status}`);
const payload = await payloadResponse.json();
const page102Records = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_102_'));
assert.equal(page102Records.some(record => record.spanKey === targetKey), false, 'Candidate was unexpectedly saved to Payload');
assert.deepEqual(page102Records.map(record => ({ id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt })),
  proofReport.preservedPayloadRecords.map(record => ({ id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt })),
  'Existing p.102 Payload records changed since the isolated export');

const sourceText = "Some Abilities, Conditions, or AI Steps may reference a figure's Conviction Value or Casting Value. The Conviction Value or Casting Value is calculated by adding the figure's best dice of the appropriate type according to the rating list on the left.";
const targetText = candidate.data.segments.map(segment => segment.text).join('');
const proposal = {
  schemaVersion: 1,
  page: 102,
  units: ['p102-conviction-value-body'],
  family: 'Conviction and Casting Value — body',
  status: 'isolated-proposal-copyfit-verified-pending-human-review',
  candidateKey: targetKey,
  sourceText: { en: sourceText, ptBR: targetText },
  candidateRecord: candidate,
  existingPayloadRecords: proofReport.preservedPayloadRecords,
  candidateKeyAbsentFromPayload: true,
  terminologyPendingHumanReview: [
    'Figures → Miniaturas follows the approved glossary. Habilidades and Condições are existing glossary forms.',
    'AI Steps → Etapas de IA, Conviction Value → Valor de Convicção, Casting Value → Valor de Conjuração, and rating list → lista de classificações are proposed local forms; do not promote them to global glossary terms without review.',
  ],
  richText: {
    sourceEmphasis: 'AI is bold in the source.',
    targetEmphasis: 'IA is preserved as a bold 10 pt Optima segment (weight 700) in the snapshot.',
    otherBodyText: 'Regular 10 pt Optima; source frame and line height 1.1 preserved.',
    exportedPdfFontMetadata: 'The PDF embeds translated spans as Type3 subsets; the extracted font label cannot independently identify the source family/weight. The bold target segment is confirmed in the snapshot and visually in Viewer/PDF evidence.',
  },
  copyfit: {
    sourceLines: 6,
    targetLines: copyfit.exportBodyLineCount,
    status: copyfit.status,
    sourceFramePt: copyfit.sourceBodyFramePt,
    exportedTextBboxPt: copyfit.exportBodyBboxPt,
    glyphBboxOverhangAboveFramePt: copyfit.targetOverhangAboveSourceFramePt,
    clearanceToExamplePt: copyfit.exportClearanceToExamplePt,
    differenceFromSourceClearancePt: copyfit.clearanceChangePt,
    conclusion: 'Pass: six lines are preserved; right and bottom remain within the frame; the preceding heading and Example do not collide; the source Example gap changes by only 0.128 pt. The 1.036 pt top glyph-bbox overhang is explicitly recorded and visually confirmed not to clip or collide.',
  },
  verification: {
    officialPdfExported: true,
    pageCount: copyfit.pageCount,
    pageSizePt: copyfit.pageSizePt,
    targetTextOccurrences: 1,
    englishBodyFallbackOccurrences: 0,
    replacementCharacterCount: 0,
    exampleTextUnchanged: copyfit.exampleSourceTextUnchanged,
    followingParagraphUnchanged: copyfit.followingParagraphSourceTextUnchanged,
    normalEditorSourceFieldEditable: true,
    normalEditorCancelAndReopenPreserveEnglish: true,
    normalEditorVerificationScope: 'Read-only source-field check; PT-BR proposal was not injected into Payload or saved in the Editor.',
    canonicalPageFilesUnchanged: editor.canonicalPageFilesUnchanged,
    payloadUnchanged: true,
    payloadWriteRequests: 0,
  },
  excludedFromThisProposal: [
    'The Example unit remains in English; its orange and red source dice icons have not been mapped to semantic inline elements.',
    'The following Since Casting paragraph remains in English; it was checked for preservation only.',
    'The chart labels, ratings list, page art, and page-level structural readiness are outside this unit proof.',
  ],
  hashes: {
    sourcePdf: proofReport.sourceHashes.sourcePdf,
    page102Assets: proofReport.sourceHashes.canonicalPageFiles,
    proposalPdf: copyfit.exportPdfSha256,
    snapshot: sha256(await readFile(join(proofDir, 'snapshot/snapshot-p102-conviction-value-body-v1-export.json'))),
    comparison: sha256(await readFile(join(proofDir, 'source-viewer-pdf-comparison-v3.png'))),
    editorReceipt: sha256(await readFile(join(proofDir, 'normal-editor-readonly-receipt-v1.json'))),
  },
  evidence: [
    'docs/project-progress/evidence/2026-10-15-p102-conviction-value-body-v1/source-viewer-pdf-comparison-v3.png',
    'docs/project-progress/evidence/2026-10-15-p102-conviction-value-body-v1/proposal-page-102-pt-BR.pdf',
    'docs/project-progress/evidence/2026-10-15-p102-conviction-value-body-v1/normal-editor-source-unit.png',
    'docs/project-progress/evidence/2026-10-15-p102-conviction-value-body-v1/normal-editor-after-cancel-reopen.png',
    'docs/project-progress/evidence/2026-10-15-p102-conviction-value-body-v1/copyfit-reconciliation-v3.json',
  ],
  note: 'This is a one-unit isolated proposal. It is not an approved human translation, does not change canonical page assets, and does not localize the page as a whole.',
};

const proposalMd = [
  '# p.102 — Conviction and Casting Value: corpo', '',
  '## Proposta isolada', '',
  `> ${targetText.replace('Etapas de IA', 'Etapas de **IA**')}`, '',
  '**Status:** copyfit verificado no Viewer e no PDF isolado; revisão terminológica humana pendente. Não foi salvo no Payload.', '',
  '## Verificação', '',
  '- O PDF real de uma página contém o override completo uma vez, zero fallback do corpo em inglês e zero U+FFFD.',
  '- A proposta mantém as seis linhas-fonte. A caixa horizontal e a margem inferior cabem; a distância para Example permaneceu em 3,043 pt, variação de apenas −0,128 pt em relação à fonte.',
  '- A medição registra que o bbox de glifo começa 1,036 pt acima do topo da caixa-fonte; a captura alinhada de PDF-fonte, Viewer normal e PDF exportado foi inspecionada e não mostra corte nem colisão.',
  '- O Example com os dados ORANGE/RED e o parágrafo seguinte permanecem inalterados em inglês.',
  '- No Editor normal, a unidade-fonte é única e editável; Cancel e reabertura restauram o inglês. O teste foi read-only; nenhuma tradução foi digitada ou salva.',
  '- O hash do DOM, fundo, frames e overlays da p.102 permaneceu igual antes/depois. Payload não foi alterado e não contém a chave candidata.', '',
  '## Revisão humana pendente', '',
  'Figures → Miniaturas segue o glossário. Etapas de IA, Valor de Convicção, Valor de Conjuração e lista de classificações são formas propostas localmente; a prova não as promove a termos globais.', '',
  '## Escopo que permanece em inglês', '',
  'O Example permanece em inglês porque os dados laranja/vermelho ainda não estão mapeados semanticamente. O parágrafo “Since Casting…” foi conferido como vizinho preservado, mas não traduzido. A página inteira não está declarada pronta.', '',
  '## Evidências', '',
  '- [Comparação PDF-fonte / Viewer / PDF](evidence/2026-10-15-p102-conviction-value-body-v1/source-viewer-pdf-comparison-v3.png)',
  '- [PDF isolado de uma página](evidence/2026-10-15-p102-conviction-value-body-v1/proposal-page-102-pt-BR.pdf)',
  '- [Recibo de copyfit](evidence/2026-10-15-p102-conviction-value-body-v1/copyfit-reconciliation-v3.json)',
  '- [Recibo read-only do Editor](evidence/2026-10-15-p102-conviction-value-body-v1/normal-editor-readonly-receipt-v1.json)',
  '- Prova reproduzível e snapshot imutável: output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1/.',
].join('\n');

const progressMd = [
  '# p.102 — proposta do corpo de Conviction and Casting Value (2026-10-15)', '',
  '## Resultado', '',
  'Preparei uma proposta PT-BR isolada para p102-conviction-value-body. O corpo fica em seis linhas, como a fonte. O PDF exportado contém o override pretendido uma vez, não contém o corpo EN como fallback e não tem U+FFFD.', '',
  'A comparação legível entre PDF-fonte, Viewer normal com snapshot isolado e PDF exportado mostra o corpo completo. O Example com os dados laranja/vermelho e o parágrafo seguinte continuam intactos em inglês, sem duplicação ou encobrimento.', '',
  '## Reconciliação do copyfit', '',
  'O primeiro medidor aplicou a borda superior da caixa-fonte como limite rígido e marcou falha por 1,036 pt. A reconciliação v3 compara a página efetivamente exportada: são seis linhas, a borda direita tem 0,356 pt de folga, a inferior 0,749 pt; há 31,954 pt até o heading acima e 3,043 pt até o Example seguinte. A distância do Example em relação à fonte varia −0,128 pt. A inspeção visual não mostra clipping ou colisão. O bbox superior foi mantido no recibo como observação explícita, não apagado.', '',
  '## Editor e integridade', '',
  'O Editor normal reconhece um único alvo editável para o corpo. Cancel e reabertura restauraram o conteúdo EN. A verificação permitiu somente GET, não clicou Save e não inseriu a proposta no Payload. Os hashes de DOM, fundo, frames e overlays conferem antes/depois; zero traduções PT-BR foram gravadas na p.102.', '',
  '## Limites', '',
  'A unidade está pronta para revisão humana de conteúdo/termos, não para ativação canônica. Etapas de IA, Valor de Convicção, Valor de Conjuração e lista de classificações permanecem candidatos locais. O Example segue em inglês porque seus dados ORANGE/RED não têm mapeamento semântico; a página 102 inteira não foi certificada. A extração do PDF usa subconjuntos Type3 e não expõe diretamente o rótulo de fonte/peso de IA; a segmentação rich do snapshot contém IA em Optima Bold 10 pt e a comparação visual confirma a ênfase.', '',
  '## Reprodução', '',
  '- Preparação e exportação isolada: scripts/prepare_p102_conviction_value_body_proposal_v1.mjs.',
  '- Reconciliação de geometria e comparação visual: scripts/reconcile_p102_conviction_value_body_v2.py.',
  '- Verificação read-only do Editor: scripts/verify_p102_conviction_value_body_editor_readonly_v1.mjs.',
  '- Relatório da proposta: [JSON](../translations/proposals/page-102-conviction-value-body-proposal-2026-10-15-v1.json) e [versão legível](../translations/proposals/page-102-conviction-value-body-proposal-2026-10-15-v1.md).',
].join('\n');

const evidenceFiles = [
  ['source-viewer-pdf-comparison-v3.png', 'source-viewer-pdf-comparison-v3.png'],
  ['page-102-pt-BR-proposal.pdf', 'proposal-page-102-pt-BR.pdf'],
  ['page-102-pt-BR-pdf-raster.png', 'pdf-raster-page-102-pt-BR.png'],
  ['viewer-page-102-pt-BR.png', 'isolated-viewer-page-102-pt-BR.png'],
  ['normal-editor-page-102-source-unit.png', 'normal-editor-source-unit.png'],
  ['normal-viewer-page-102-after-cancel-reopen.png', 'normal-editor-after-cancel-reopen.png'],
  ['copyfit-reconciliation-v3.json', 'copyfit-reconciliation-v3.json'],
  ['normal-editor-readonly-receipt-v1.json', 'normal-editor-readonly-receipt-v1.json'],
  ['pdf-verification.json', 'pdf-verification-v1-conservative-gate.json'],
  ['proof-report-v1.json', 'proof-report-v1-conservative-gate.json'],
];
for (const [sourceName, targetName] of evidenceFiles) {
  await immutableWrite(join(progressEvidenceDir, targetName), await readFile(join(proofDir, sourceName)));
}
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(proposalMarkdownPath, proposalMd);
await immutableWrite(progressPath, progressMd);
console.log(JSON.stringify({
  status: proposal.status,
  proposal: proposalPath,
  progress: progressPath,
  evidenceDirectory: progressEvidenceDir,
  candidateKeyAbsentFromPayload: true,
  existingPage102RecordsPreserved: page102Records.length,
  copyfit: copyfit.status,
  editorSourceCheck: editor.sourceTextMatched,
}, null, 2));
