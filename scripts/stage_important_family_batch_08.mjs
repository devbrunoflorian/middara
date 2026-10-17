#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const file = resolve('docs/translations/proposals/important-family-manifest-2026-10-13.json');
const manifest = JSON.parse(await readFile(file, 'utf8'));
const batch = [
  {
    id: 'p041-block_29',
    body: 'Algumas Armas exibem o dado **PRETO** [[symbol:dice.black]] como parte de seus Dados de Combate. Os Ataques feitos com essas Armas são sempre Potencializados. Da mesma forma, alguns Combatentes exibem o dado **PRETO** [[symbol:dice.black]] como parte de seus Dados de Combate. Os Ataques deles são sempre Potencializados. Veja ***Empower***, p. 52.',
    notes: ['BLACK die e Empowered dependem de validação terminológica; a tradução mantém a repetição dos dois símbolos.'],
  },
  {
    id: 'p089-block_24',
    body: 'Se, a qualquer momento, um Aventureiro estiver com Armas equipadas que não poderiam ser equipadas legalmente devido às limitações de Ícones listadas acima, esse Aventureiro deve encerrar imediatamente suas Ações e Habilidades atuais (se estiver realizando uma Ação ou Habilidade) e descartar as Armas equipadas ou movê-las para seu Pack até que estejam legais.',
    notes: ['Icon, Pack e a equivalência de “discard, or move” requerem revisão editorial; a proposta preserva ambas as opções e o requisito de encerrar imediatamente Ações/Habilidades.'],
  },
];

const styles = {
  normal: { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
  bold: { font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
  italic: { font: 'OptimaLTStd-Italic', size: 10, color: '#231f20', weight: 400, style: 'italic', disableLigatures: true },
  boldItalic: { font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true },
};
const tokenRE = /\[\[symbol:[^\]]+\]\]|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*/gu;

for (const item of batch) {
  const occurrence = manifest.occurrences.find(x => x.occurrenceId === item.id);
  if (!occurrence) throw new Error(`Unknown occurrence ${item.id}`);
  if (occurrence.proposal?.targetText) continue;
  if (occurrence.existingPT?.length) throw new Error(`Refusing to replace human PT in ${item.id}`);
  if (occurrence.symbols.filter(x => x.symbolId === 'tag.important.icon').length !== 1) throw new Error(`Expected one IMPORTANT icon in ${item.id}`);
  const label = occurrence.typography.labelRuns[0];
  const labelStyle = { font: label.font, size: label.size, color: label.color, weight: 900, style: 'normal', textStrokeWidthPt: label.renderTextStrokeWidthPt ?? 2, textStrokeColor: label.renderTextStrokeColor ?? '#fff', disableLigatures: true };
  const segments = [];
  const spans = [{ id: 'important-label', targetText: 'IMPORTANTE:', start: 0, end: 11, style: labelStyle, sourceSpanRefs: occurrence.typography.labelRuns.map(x => x.sourceSpanRef).filter(Boolean) }];
  const visible = [];
  let pos = 0, plain = '', symbolCursor = 0;
  for (const match of item.body.matchAll(tokenRE)) {
    if (match.index > pos) {
      const text = item.body.slice(pos, match.index);
      segments.push({ ...styles.normal, text }); visible.push(text); plain += text;
    }
    const token = match[0];
    if (token.startsWith('[[symbol:')) {
      const symbolId = token.slice(9, -2);
      const found = occurrence.symbols.filter(x => x.symbolId === symbolId);
      const source = found[symbolCursor++];
      if (!source) throw new Error(`Missing inline symbol ${symbolId} in ${item.id}`);
      segments.push({ ...styles.normal, text: '\uFFFC', symbolId, symbolMetrics: source.metrics, sourceAnchor: source.anchor });
      visible.push(token);
    } else {
      const isBI = token.startsWith('***');
      const text = isBI ? token.slice(3, -3) : token.slice(2, -2);
      const start = plain.length;
      segments.push({ ...(isBI ? styles.boldItalic : styles.bold), text }); visible.push(text); plain += text;
      spans.push({ id: `${isBI ? 'boldItalic' : 'bold'}-${spans.length}`, targetText: text, start, end: start + text.length, style: isBI ? styles.boldItalic : styles.bold });
    }
    pos = match.index + token.length;
  }
  if (pos < item.body.length) { const text = item.body.slice(pos); segments.push({ ...styles.normal, text }); visible.push(text); plain += text; }
  if (symbolCursor !== occurrence.symbols.length - 1) throw new Error(`Symbol count mismatch in ${item.id}`);
  segments.unshift({ text: '\uFFFC', symbolId: 'tag.important.icon', symbolMetrics: occurrence.symbols.find(x => x.symbolId === 'tag.important.icon').metrics, sourceAnchor: occurrence.symbols.find(x => x.symbolId === 'tag.important.icon').anchor, ...styles.normal });
  segments.splice(1, 0, { ...labelStyle, text: 'IMPORTANTE:' }, { ...styles.normal, text: ' ' });
  visible.unshift('[[symbol:tag.important.icon]]', 'IMPORTANTE: ');
  plain = `IMPORTANTE: ${plain}`;
  for (const span of spans.slice(1)) { span.start += 12; span.end += 12; }
  const technical = 'REVISÃO TÉCNICA';
  const editorial = item.id === 'p041-block_29' ? 'REVISÃO TERMINOLÓGICA' : 'REVISÃO MECÂNICA';
  occurrence.proposal = {
    proposalId: `${occurrence.source.editorialKey}__pt-BR__draft-2026-10-13-batch-008`,
    locale: 'pt-BR', version: 1,
    sourceBlockSha256: occurrence.source.blockSha256,
    sourcePageSidecarSha256: occurrence.source.pageSidecarSha256,
    targetText: visible.join(''), textWithSymbols: visible.join(''), targetPlainText: plain,
    segments, explicitRichSpans: spans,
    sourceUnitIds: [occurrence.source.editorialKey, ...(occurrence.source.relatedSourceUnitIds ?? [])],
    symbolIds: occurrence.symbols.map(x => x.symbolId), status: 'draft-pending-human-review',
    sourceContentComplete: true, containsFallbackEnglish: false,
    fit: { status: 'pending-PageRenderer-proof', measurements: null },
    editorialReview: { status: editorial, notes: item.notes },
    terminology: { status: 'pending-human-review', issues: item.notes.map(note => ({ note })) },
    copyfit: { revision: 0, revisionBudget: 3, notes: [] },
    provenance: 'Resumable isolated proposal only; no Payload, canonical text, sidecar, or geometry writes.',
    layoutFrame: null,
    reviewStates: { technical: { status: technical, evidence: ['New batch proposal staged; PageRenderer capture pending.'] }, editorial: { status: editorial, approved: false } },
  };
  occurrence.processing = { ...(occurrence.processing ?? {}), status: 'proposal-staged-batch-008-pending-render', technicalStatus: technical, editorialStatus: editorial, blockers: item.notes };
  occurrence.reviewStates = occurrence.proposal.reviewStates;
}

manifest.processing.batches = [...(manifest.processing.batches ?? []).filter(x => x.id !== 'batch-008-pages-41-89'), {
  id: 'batch-008-pages-41-89', occurrenceIds: batch.map(x => x.id), status: '2 proposals staged; PageRenderer and PDF proof pending',
}];
manifest.processing.proposalDraftCount = manifest.occurrences.filter(x => x.proposal?.targetText).length;
await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ staged: batch.map(x => x.id), drafts: manifest.processing.proposalDraftCount }, null, 2));
