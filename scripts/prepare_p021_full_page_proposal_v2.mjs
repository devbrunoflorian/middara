#!/usr/bin/env node
/** Build p.21 copyfit revision v2 from the immutable v1 proposal and snapshot. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const page = 21;
const language = 'pt-BR';
const base = resolve(root, 'output/proofs/translation-readiness-2026-10-16');
const v1Dir = join(base, 'p021-full-page-proposal-v1');
const outDir = join(base, 'p021-full-page-proposal-v2');
const snapshotDir = join(outDir, 'snapshot');
const v1ProposalPath = resolve(root, 'docs/translations/proposals/page-021-full-page-proposal-2026-10-16-v1.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-021-full-page-proposal-2026-10-16-v2.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-021-full-page-proposal-2026-10-16-v2.md');
const snapshotPath = join(snapshotDir, 'snapshot.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

for (const path of [outDir, proposalPath, markdownPath]) {
  try {
    await access(path);
    throw new Error(`Refusing to overwrite existing artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const proposal = JSON.parse(await readFile(v1ProposalPath, 'utf8'));
const snapshot = JSON.parse(await readFile(join(v1Dir, 'snapshot/snapshot.json'), 'utf8'));
assert.equal(proposal.page, page);
assert.equal(snapshot.page, page);
assert.equal(snapshot.verifyRenderedSnapshot, true);
assert.equal(proposal.payloadWrites, 0);

const white = text => ({ text, font: 'OptimaLTStd', size: 9, color: '#ffffff', weight: 400, style: 'normal', disableLigatures: true });
const whiteBold = text => ({ text, font: 'OptimaLTStd-Bold', size: 9, color: '#ffffff', weight: 700, style: 'normal', disableLigatures: true });
const whiteBoldItalic = text => ({ text, font: 'OptimaLTStd-BoldItalic', size: 9, color: '#ffffff', weight: 700, style: 'italic', disableLigatures: true });
const label = text => whiteBold(text);

const replacements = new Map([
  ['page_21_block_5__pt-BR', {
    text: 'OBSTRUÍDO: Miniaturas não podem atravessar nem entrar em espaços de Terreno Obstruído. Não é possível traçar Linha de Visão por nenhuma parte dele (ex.: uma linha vermelha). Só se pode interagir com esses espaços ou contorná-los usando Habilidades que o indiquem especificamente (ex.: IMPARÁVEL; veja Marcadores, pág. 92). Habilidades que colocam Terreno Obstruído podem substituir qualquer Terreno, exceto o Perigoso. Se uma regra especial ou Habilidade colocar esse Terreno sobre uma Miniatura, ela deve fazer um Teste de Salto até o espaço vazio não Perigoso mais próximo ou será Derrotada, salvo indicação em contrário na regra ou Habilidade.',
    runs: [
      label('OBSTRUÍDO:'),
      white(' Miniaturas não podem atravessar nem entrar em espaços de Terreno Obstruído. Não é possível traçar Linha de Visão por nenhuma parte dele (ex.: uma linha vermelha). Só se pode interagir com esses espaços ou contorná-los usando Habilidades que o indiquem especificamente (ex.: '),
      whiteBold('IMPARÁVEL'),
      white('; veja '),
      whiteBoldItalic('Marcadores'),
      white(', pág. 92). Habilidades que colocam Terreno Obstruído podem substituir qualquer Terreno, exceto o Perigoso. Se uma regra especial ou Habilidade colocar esse Terreno sobre uma Miniatura, ela deve fazer um Teste de Salto até o espaço vazio não Perigoso mais próximo ou será Derrotada, salvo indicação em contrário na regra ou Habilidade.'),
    ],
    reason: 'v1 excedeu a moldura da coluna direita e invadiu os blocos Perigoso/Especial; texto condensado para copyfit, mantendo as condições e exceções da fonte.',
  }],
  ['page_21_block_6__pt-BR', {
    text: 'PERIGOSO: Miniaturas que encerrem o turno em um espaço Perigoso, terminem o Movimento nele ou saiam dele serão Derrotadas. Fichas movidas para espaços de Terreno Perigoso são descartadas. Habilidades que colocam Terreno Perigoso podem substituir qualquer Terreno, exceto o Obstruído.',
    runs: [label('PERIGOSO:'), white(' Miniaturas que encerrem o turno em um espaço Perigoso, terminem o Movimento nele ou saiam dele serão Derrotadas. Fichas movidas para espaços de Terreno Perigoso são descartadas. Habilidades que colocam Terreno Perigoso podem substituir qualquer Terreno, exceto o Obstruído.')],
    reason: 'copyfit condensado para a caixa fonte de quatro linhas; requer confirmação no PDF v2.',
  }],
  ['page_21_block_7__pt-BR', {
    text: 'ESPECIAL: Os efeitos deste Terreno variam conforme o Encontro. Cada Encontro especifica suas regras para esses espaços.',
    runs: [label('ESPECIAL:'), white(' Os efeitos deste Terreno variam conforme o Encontro. Cada Encontro especifica suas regras para esses espaços.')],
    reason: 'copyfit condensado para a caixa fonte de três linhas; requer confirmação no PDF v2.',
  }],
]);

for (const candidate of proposal.candidates) {
  const replacement = replacements.get(candidate.spanKey);
  if (replacement) {
    candidate.proposalText = replacement.text;
    candidate.data.segments = replacement.runs;
    candidate.diagnosticData = structuredClone(candidate.data);
    candidate.status = 'draft_v2_pending_visual_copyfit_and_human_review';
    candidate.technicalStatus = 'pending_visual_copyfit_viewer_and_pdf';
    candidate.diagnosticRendering = 'proposal';
    candidate.copyfitRevisionNote = replacement.reason;
  }
}

const resizeSingleRun = (spanKey, size, note) => {
  const candidate = proposal.candidates.find(item => item.spanKey === spanKey);
  assert.ok(candidate, `Missing title candidate ${spanKey}`);
  assert.equal(candidate.data.segments.length, 1, `Unexpected rich runs in ${spanKey}`);
  candidate.data.segments[0].size = size;
  candidate.diagnosticData = structuredClone(candidate.data);
  candidate.status = 'draft_v2_pending_visual_copyfit_and_human_review';
  candidate.technicalStatus = 'pending_visual_copyfit_viewer_and_pdf';
  candidate.diagnosticRendering = 'proposal';
  candidate.copyfitRevisionNote = note;
};
resizeSingleRun('page_21_block_14__pt-BR', 9.5,
  'Fonte de 12 pt quebrava o título em duas linhas e a segunda cruzava o filete; redução local proposta para caber em uma linha, confirmar visualmente.');
resizeSingleRun('page_21_block_28__pt-BR', 14,
  'Fonte de 18 pt quebrava o título em duas linhas e a segunda cruzava o filete; redução local proposta para caber em uma linha, confirmar visualmente.');

proposal.proposalId = 'page-021-full-page-proposal-2026-10-16-v2';
proposal.status = 'proposal-v2-pending-visual-copyfit-editor-and-human-review';
proposal.revision = {
  from: 'v1',
  evidence: 'v1 exported successfully but visual review found the Obstructing paragraph colliding with Dangerous/Special and both translated terrain headings crossing their rules.',
  changes: [...replacements.keys(), 'page_21_block_14__pt-BR', 'page_21_block_28__pt-BR'],
  diagnosticBlankPolicy: 'Keep a failed block blank in the isolated snapshot while retaining the complete proposal text separately.',
  visualValidation: 'pending v2 export and raster review',
};
proposal.counts.proposedInDiagnosticViewer = proposal.candidates.filter(item => item.diagnosticRendering === 'proposal').length;
proposal.counts.blankBlockedUnits = proposal.candidates.filter(item => item.diagnosticRendering === 'blank').length;
proposal.humanApproved = false;

const translationsByKey = new Map(proposal.candidates.map(candidate => [candidate.spanKey, candidate.diagnosticData]));
snapshot.translations = snapshot.translations.map(record => ({
  ...record,
  data: translationsByKey.get(record.spanKey) ?? record.data,
}));
assert.equal(snapshot.translations.length, 29, 'Unexpected snapshot record count.');
assert.equal(new Set(snapshot.translations.map(record => record.spanKey)).size, snapshot.translations.length, 'Duplicate snapshot keys.');

await mkdir(join(snapshotDir, 'pages'), { recursive: true });
await cp(join(v1Dir, 'snapshot/pages/page_021'), join(snapshotDir, 'pages/page_021'), { recursive: true, errorOnExist: true });
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' });
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });

const v1Hashes = JSON.parse(await readFile(join(v1Dir, 'source-hashes.json'), 'utf8'));
const snapshotBytes = await readFile(snapshotPath);
const v2Hashes = {
  ...v1Hashes,
  derivedFrom: 'p021-full-page-proposal-v1; canonical inputs reused without modification',
  snapshotSha256: sha256(snapshotBytes),
  v2CopyfitTargets: [...replacements.keys(), 'page_21_block_14__pt-BR', 'page_21_block_28__pt-BR'],
  payloadWrites: 0,
};
await writeFile(join(outDir, 'source-hashes-v2.json'), JSON.stringify(v2Hashes, null, 2) + '\n', { flag: 'wx' });

const markdown = [
  '# p.21 — proposta PT-BR integral v2', '',
  '**Estado:** proposta isolada. A v1 foi exportada, mas a inspeção raster encontrou colisão no texto de Obstruído com Perigoso/Especial e dois títulos quebrando sobre filetes. Esta versão encurta três parágrafos e reduz os títulos localmente; precisa de nova inspeção visual. Revisão editorial humana permanece pendente.', '',
  '## Revisão de copyfit', '',
  '- **Obstruído, Perigoso e Especial:** texto revisado com base na colisão observada no PDF v1; as traduções completas permanecem no JSON e no snapshot para exportação v2.',
  '- **Fichas de Terreno** e **Tipos de Terreno:** tamanho tipográfico reduzido somente nesta proposta para evitar quebra sobre o filete; confirmar legibilidade no PDF.',
  '- Os dois blocos de Terreno Difícil/Água continuam diagnosticamente em branco devido aos ícones vermelhos de Movimento sem mapeamento de ocorrência. Os textos PT completos permanecem separados no JSON.',
  '- Os seis grupos de rótulos embutidos na arte continuam intactos e bloqueados; o fundo original permanece visível.', '',
  '## Rastreabilidade', '',
  '- Origem: `docs/translations/proposals/page-021-full-page-proposal-2026-10-16-v1.json` e seu snapshot isolado.',
  '- Snapshot v2: `output/proofs/translation-readiness-2026-10-16/p021-full-page-proposal-v2/snapshot/snapshot.json`.',
  '- Hashes de entradas v1 e hash do novo snapshot: `output/proofs/translation-readiness-2026-10-16/p021-full-page-proposal-v2/source-hashes-v2.json`.',
  '- Sem gravação no Payload, sidecars canônicos ou tradução humana. Sem aprovação editorial.', '',
].join('\n');
await writeFile(markdownPath, markdown, { flag: 'wx' });

console.log(JSON.stringify({
  proposalId: proposal.proposalId,
  status: proposal.status,
  editableTargets: proposal.counts.editableTargets,
  proposedInDiagnosticViewer: proposal.counts.proposedInDiagnosticViewer,
  blankBlockedUnits: proposal.counts.blankBlockedUnits,
  artExceptionGroups: proposal.counts.artworkExceptionGroups,
  snapshotRecords: snapshot.translations.length,
  snapshotSha256: sha256(snapshotBytes),
  payloadWrites: 0,
  proposalPath,
  snapshotPath,
  outDir,
}, null, 2));
