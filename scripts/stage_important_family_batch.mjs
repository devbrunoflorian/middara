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
  { id: 'p013-block_52', body: 'Recompensas recebidas durante uma **Bounty** ficam com os Aventureiros, mesmo que eles fracassem na Bounty. Ou seja, as recompensas recebidas até aquele momento são mantidas.', terms: ['Bounty: termo experimental/conflitante; mantido no original.'] },
  { id: 'p014-block_18', body: 'As fichas de *Habilidade* não são removidas durante esta Fase.', terms: ['Ability token: equivalente provisório “ficha de Habilidade”.'] },
  { id: 'p014-block_40', body: 'Leia as Recompensas antes de encerrar o Encontro. Algumas Recompensas podem revelar novas surpresas que dão continuidade ao Encontro atual e até acrescentar novas Condições Finais.', terms: ['“cleaning up the Encounter” foi vertido como “encerrar o Encontro”; revisar o contexto da sequência.'] },
  { id: 'p017-block_124', body: 'Antes do **1º** turno de um Encontro, todos os jogadores devem entender quando e como cada *Objetivo* é ativado. Se uma ficha de Objetivo não indicar quando é ativada, o Texto Oculto de outra ficha poderá fazer referência a ela.', terms: ['Hidden Text → “Texto Oculto” é provisório.'] },
  { id: 'p017-block_190', body: 'Aventureiros podem ativar fichas de *Saque* ao realizar uma Ação de Encontro quando estiverem adjacentes ao espaço da ficha de *Saque* ou ocupando esse mesmo espaço.', terms: ['Encounter Action → “Ação de Encontro” é provisório.'] },
  { id: 'p017-block_200', body: 'Itens Únicos só são adquiridos quando uma Mecânica de Aventura instrui especificamente um jogador a adquirir um item “Único” de um Tier específico.', terms: ['“Gained/adquirir” e “Adventure Mechanic/Mecânica de Aventura” são provisórios.', 'Tier mantido no original, sem equivalência inventada.'] },
  { id: 'p018-block_19', body: 'Jogadores nunca devem ler o texto oculto, a menos que recebam instruções para isso.', terms: ['Hidden Text → “texto oculto” é provisório.'] },
  { id: 'p018-block_134', body: '**NÃO** revele nenhuma das **Cartas Ocultas** até receber instruções para fazê-lo.', terms: [] },
  { id: 'p019-block_22', body: 'Se um jogador não puder fazer surgir uma miniatura porque o espaço está ocupado por outra miniatura, ela surgirá no espaço ou nos espaços **não Perigosos** desocupados mais próximos. Veja ***Miniaturas de Base Grande*** para exceções, pág. 71.', terms: ['Large Based Figures → “Miniaturas de Base Grande” é provisório.'], refs: ['See → Veja (decisão aprovada).'] },
  { id: 'p019-block_23', body: 'Ao fazer surgir miniaturas que pertencem ao mesmo Grupo, os jogadores sempre começam pela miniatura disponível de menor número daquele Grupo. Por exemplo, se Cave Sickle **2** e **3** já estiverem na mesa e houver instrução para fazer surgir mais duas Cave Sickles, faça surgir Cave Sickle **1** e **4**.', terms: ['Group/Grupo e nomes Cave Sickle mantidos como candidatos sujeitos ao glossário oficial.'] },
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
const batchRecord = { id: 'batch-001-pages-13-19', occurrenceIds: batch.map(item => item.id), status: 'proposals-staged; PageRenderer validation pending' };
manifest.processing ??= {};
manifest.processing.batches = [...(manifest.processing.batches ?? []).filter(item => item.id !== batchRecord.id), batchRecord];
manifest.processing.proposalDraftCount = manifest.occurrences.filter(item => item.proposal?.targetText).length;
manifest.processing.completedProposalCount = 0;
manifest.processing.editoriallyApprovedProposalCount = 0;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ staged, proposalDraftCount: manifest.processing.proposalDraftCount }, null, 2));
