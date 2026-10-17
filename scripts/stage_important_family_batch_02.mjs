#!/usr/bin/env node
/** Stage an explicitly authored, resumable batch of IMPORTANT proposals. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('docs/translations/proposals/important-family-manifest-2026-10-13.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const boldStyle = { font: 'OptimaLTStd-Bold', weight: 700, style: 'normal' };
const italicStyle = { font: 'OptimaLTStd-Italic', weight: 400, style: 'italic' };
const boldItalicStyle = { font: 'OptimaLTStd-BoldItalic', weight: 700, style: 'italic' };

const batch = [
  { id: 'p019-block_24', body: 'Combatentes têm um Loot **LVL** impresso na frente **e** no verso. Quando recebem instruções para fazer surgir Combatentes durante um Encontro, os jogadores sempre fazem surgir Combatentes cujo Loot Level indicado nas cartas corresponde ao Loot Level do Encontro atual. Veja ***Alternate, Variations, and Loot LVL***, pág. 79.', terms: ['Loot LVL/Loot Level e Combatant/Combatente ainda exigem conferência terminológica.'] },
  { id: 'p024-block_30', body: 'Quaisquer Itens Virados ou Exauridos movidos para seu Inventário permanecem Virados ou Exauridos. Esses Itens são desvirados e desexauridos como qualquer outra carta. Quaisquer fichas *Usadas* permanecem na carta e só são removidas quando os Aventureiros recebem instruções para Restaurar.', terms: ['Flip/Un-Flip, Exhaust/Un-Exhaust e Pack/Inventário são provisórios.'] },
  { id: 'p024-block_31', body: 'Um Aventureiro pode ter no máximo **1** cópia de cada **Relíquia**, equipada ou no Inventário, a qualquer momento. Ou seja, **não** pode ter mais de **1** **Relíquia** com o mesmo nome equipada **ou** no Inventário ao mesmo tempo. No entanto, os Aventureiros podem guardar quantas Relíquias quiserem no Baú do Grupo.', terms: ['Relic/Relíquia, Pack/Inventário e Party Stash/Baú do Grupo são provisórios.'] },
  { id: 'p024-block_35', body: 'Durante uma Rodada de História, **todos** os Itens Consumíveis que não forem vendidos nem equipados são descartados. Veja ***Venda de Itens***, pág. 27.', terms: ['Consumable Item/Item Consumível e Selling Items/Venda de Itens são provisórios.'] },
  { id: 'p024-block_53', body: 'Um Aventureiro não pode aprender a mesma Disciplina duas vezes.', terms: [] },
  { id: 'p038-block_25', body: 'Um Aventureiro deve concluir sua Ação atual antes de iniciar outra Ação.', terms: ['Action/Ação é candidato terminológico; a equivalência precisa de revisão de consistência.'] },
  { id: 'p029-block_50', body: 'Para fins de Aprimoramentos, Itens de Saque de História e de Monstros são considerados Itens do seu Loot **LVL** atual.', terms: ['Loot LVL e Story/Monster Loot ainda exigem decisão terminológica contextual.'] },
  { id: 'p029-block_51', body: 'Itens que têm a Tag **DOUBLE** possuem dois lados distintos. Se um lado for Aprimorado, o outro também será. Se o outro lado não for elegível para o Aprimoramento, o Aprimoramento não poderá ser usado, mas continuará anexado.', terms: ['DOUBLE Tag e Upgrade/Aprimoramento são candidatos terminológicos.'] },
  { id: 'p030-block_42', body: 'Normalmente, os Símbolos **só** podem ser gastos durante uma Ação de Ataque, embora algumas Habilidades permitam que os jogadores gastem Símbolos em rolagens que não sejam de Ataque.', terms: ['Symbol/Símbolo, Attack Action/Ação de Ataque e Ability/Habilidade pendem de consistência com o glossário mecânico.'] },
  { id: 'p032-block_56', body: 'Um Aventureiro pode aprender tantas Disciplinas quanto puder pagar; porém, não pode aprender a mesma Disciplina duas vezes.', terms: [] },
  { id: 'p037-block_19', body: 'Aventureiros **não** recebem **SP** durante a Fase de Manutenção do **1º** turno em um Encontro. Veja ***Fase de Preparação***, pág. 14.', terms: ['Prepare Phase → “Fase de Preparação” continua em revisão terminológica; Refresh Phase → Fase de Manutenção é decisão aprovada.'] },
];

function parseMarkup(markup) {
  const result = [];
  const pattern = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/gu;
  let last = 0;
  for (const match of markup.matchAll(pattern)) {
    if (match.index > last) result.push({ text: markup.slice(last, match.index), style: 'normal' });
    const token = match[0];
    result.push({ text: token.startsWith('***') ? token.slice(3, -3) : token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1), style: token.startsWith('***') ? 'boldItalic' : token.startsWith('**') ? 'bold' : 'italic' });
    last = match.index + token.length;
  }
  if (last < markup.length) result.push({ text: markup.slice(last), style: 'normal' });
  return result;
}

function styleFromSource(span) {
  const source = span.sourceStyle ?? {};
  return {
    font: source.font ?? 'OptimaLTStd', size: source.size ?? 10,
    color: source.color ?? '#231f20', weight: source.weight ?? ((source.flags & 16) ? 700 : 400),
    style: source.style ?? ((source.flags & 2) ? 'italic' : 'normal'), disableLigatures: true,
    ...(source.renderTextStrokeWidthPt ? { textStrokeWidthPt: source.renderTextStrokeWidthPt, textStrokeColor: source.renderTextStrokeColor } : {}),
  };
}

const staged = [];
for (const item of batch) {
  const occurrence = manifest.occurrences.find(entry => entry.occurrenceId === item.id);
  if (!occurrence) throw new Error(`Unknown occurrence ${item.id}`);
  if (occurrence.proposal?.targetText) {
    staged.push({ id: item.id, status: 'preserved-existing-proposal' });
    continue;
  }
  if (occurrence.existingPT?.length) throw new Error(`Refusing to replace existing human PT-BR content for ${item.id}`);
  if (occurrence.symbols.filter(symbol => symbol.symbolId === 'tag.important.icon').length !== 1) throw new Error(`Expected one tag.important.icon in ${item.id}`);
  const labelRun = occurrence.typography.labelRuns[0];
  const labelStyle = {
    font: labelRun.font, size: labelRun.size, color: labelRun.color, weight: 900,
    style: 'normal', textStrokeWidthPt: labelRun.renderTextStrokeWidthPt ?? 2,
    textStrokeColor: labelRun.renderTextStrokeColor ?? '#ffffff', disableLigatures: true,
  };
  const icon = occurrence.symbols.find(symbol => symbol.symbolId === 'tag.important.icon');
  const symbolSegment = {
    text: '\uFFFC', symbolId: 'tag.important.icon', symbolMetrics: icon.metrics,
    sourceAnchor: icon.anchor, font: 'OptimaLTStd', size: labelRun.size, color: '#231f20', weight: 400,
    style: 'normal', disableLigatures: true,
  };
  const runs = parseMarkup(item.body);
  const plain = item.body.replaceAll('**', '').replaceAll('*', '');
  const segments = [symbolSegment, { text: 'IMPORTANTE:', ...labelStyle }];
  const explicitRichSpans = [{ id: 'important-label', targetText: 'IMPORTANTE:', start: 0, end: 11, sourceSpanRefs: occurrence.typography.labelRuns.map(run => run.sourceSpanRef).filter(Boolean), style: labelStyle }];
  let richCursor = 0;
  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex];
    if (!run.text) continue;
    const sourceStyle = run.style === 'bold' ? boldStyle : run.style === 'italic' ? italicStyle : run.style === 'boldItalic' ? boldItalicStyle : {};
    const runText = runIndex === 0 ? ' ' + run.text : run.text;
    const base = { text: runText, font: 'OptimaLTStd', size: labelRun.size, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true, ...sourceStyle };
    segments.push(base);
    const runStart = plain.indexOf(run.text, richCursor);
    if (runStart < 0) throw new Error('Could not map rich run ' + run.text + ' in ' + item.id);
    if (run.style !== 'normal') explicitRichSpans.push({
      id: `${run.style}-${explicitRichSpans.length}`,
      targetText: run.text,
      start: 12 + runStart,
      end: 12 + runStart + run.text.length,
      style: { ...base, text: undefined },
    });
    richCursor = runStart + run.text.length;
  }
  const blockers = item.terms;
  const issueType = blockers.some(term => /ambig|referente|regra|contexto da sequência/iu.test(term)) ? 'REVISÃO MECÂNICA' : blockers.length ? 'REVISÃO TERMINOLÓGICA' : 'PROPOSTA COMPLETA';
  occurrence.proposal = {
    proposalId: `${occurrence.source.editorialKey}__pt-BR__draft-2026-10-13-batch-001`,
    locale: 'pt-BR', version: 1, sourceBlockSha256: occurrence.source.blockSha256,
    sourcePageSidecarSha256: occurrence.source.pageSidecarSha256,
    targetText: `[[symbol:tag.important.icon]]IMPORTANTE: ${plain}`,
    textWithSymbols: `[[symbol:tag.important.icon]]IMPORTANTE: ${plain}`,
    targetPlainText: `IMPORTANTE: ${plain}`,
    segments, explicitRichSpans, sourceUnitIds: [occurrence.source.editorialKey],
    symbolIds: ['tag.important.icon'], status: blockers.length ? 'draft-pending-review' : 'draft-complete-pending-human-approval',
    sourceContentComplete: true, containsFallbackEnglish: false,
    fit: { status: 'pending-real-PageRenderer-capture', measurements: null },
    editorialReview: { status: issueType, notes: blockers },
    terminology: { status: blockers.length ? 'pending-human-review' : 'no-known-blocker', issues: blockers.map(term => ({ term, source: term.split(' → ')[0], candidate: term.includes(' → ') ? term.split(' → ')[1] : null })) },
    copyfit: { revision: 0, revisionBudget: 3, notes: [] },
    provenance: 'Resumable manifest draft only; no Payload write or canonical page/sidecar/frame change.',
    layoutFrame: null,
    reviewStates: { technical: { status: 'REVISÃO TÉCNICA', evidence: ['Source hash, symbol inventory, rich-run structure checked; proposal-specific render pending.'] }, editorial: { status: issueType, approved: false } },
  };
  occurrence.processing = { ...(occurrence.processing ?? {}), status: 'proposal-staged-batch-001-pending-render-and-review', technicalStatus: 'REVISÃO TÉCNICA', editorialStatus: issueType, blockers };
  occurrence.reviewStates = occurrence.proposal.reviewStates;
  staged.push({ id: item.id, status: 'proposal-created', editorial: issueType, blockers: blockers.length });
}
const batchRecord = { id: 'batch-002-pages-19-37', occurrenceIds: batch.map(item => item.id), status: 'proposals-staged; PageRenderer validation pending' };
manifest.processing ??= {};
manifest.processing.batches = [...(manifest.processing.batches ?? []).filter(item => item.id !== batchRecord.id), batchRecord];
manifest.processing.proposalDraftCount = manifest.occurrences.filter(item => item.proposal?.targetText).length;
manifest.processing.completedProposalCount = 0;
manifest.processing.editoriallyApprovedProposalCount = 0;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ staged, proposalDraftCount: manifest.processing.proposalDraftCount }, null, 2));
