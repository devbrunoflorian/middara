import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const v2Path = path.join(root, 'docs/translations/proposals/page-019-full-page-proposal-2026-10-16-v2.json');
const v3Path = path.join(root, 'docs/translations/proposals/page-019-full-page-proposal-2026-10-16-v3.json');
const markdownPath = v3Path.replace(/\.json$/u, '.md');
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');

const revisions = {
  'page_19_unit_p19-block-21-paragraph-3__pt-BR': {
    sourceLines: 6,
    text: 'Alguns Combatentes têm várias Cartas de Iniciativa. Se um Combatente tiver várias Cartas com o mesmo Número do Grupo e/ou nome, coloque todas as cartas com esse nome e/ou número na Trilha, como explicado acima. As Cartas de Iniciativa de cada Combatente sempre correspondem ao nome e ao(s) Número(s) do Grupo dele. Consulte Números de Ativação e Grupos, pág. 56.',
    richBoldTerm: 'com o mesmo',
    richTerm: 'Números de Ativação e Grupos',
  },
  'page_19_block_5__pt-BR': {
    sourceLines: 5,
    text: 'IMPORTANTE: Ao fazer surgir miniaturas que fazem parte do mesmo Grupo, os jogadores devem sempre começar pela miniatura disponível de menor número. Por exemplo, se as Cave Sickles 2 e 3 já estiverem na mesa e vocês receberem instruções para fazer surgir mais duas Cave Sickles, façam surgir a Cave Sickle 1 e a Cave Sickle 4.',
    importantCallout: true,
  },
  'page_19_unit_p19-block-27-paragraph-1__pt-BR': {
    sourceLines: 8,
    text: 'Middara tem muitos Combatentes que representam personagens da narrativa de Middara. Em geral, são Cartas Ocultas de chefes, Espers ou personagens aliados ou adversários dos jogadores. Em todo caso, essas Cartas de Combatente sempre têm nomes únicos e pelo menos uma Carta de Iniciativa correspondente. Elas são representadas por miniaturas únicas ou por miniaturas de papel exclusivas. Assim, salvo quando uma regra exigir esse controle, não é preciso acompanhar os componentes usando Presilhas de Base Coloridas ou Números de Ativação.',
  },
};

const requestedSpanKey = process.argv[2];
const revision = revisions[requestedSpanKey];
if (!revision) {
  throw new Error(`Pass one supported p.19 review span key. Available: ${Object.keys(revisions).join(', ')}`);
}

const proposal = JSON.parse(fs.readFileSync(fs.existsSync(v3Path) ? v3Path : v2Path, 'utf8'));
const candidate = proposal.candidates.find(item => item.spanKey === requestedSpanKey);
if (!candidate) throw new Error(`Candidate not found: ${requestedSpanKey}`);

const previousText = String(candidate.proposalText ?? '');
const previousSegments = candidate.data.segments;
const plainStyle = previousSegments.find(segment => typeof segment.text === 'string'
  && segment.text.length > 0 && !segment.symbolId && segment.weight !== 700 && segment.weight !== 900);
if (!plainStyle) throw new Error(`Missing plain text style for ${requestedSpanKey}`);

if (revision.richTerm) {
  const boldItalicStyle = previousSegments.find(segment => segment.style === 'italic' && segment.weight === 700);
  const termStart = revision.text.indexOf(revision.richTerm);
  if (!boldItalicStyle || termStart < 0) throw new Error(`Could not preserve rich term in ${requestedSpanKey}`);
  const termSegments = [
    { ...plainStyle, text: revision.text.slice(0, termStart) },
    { ...boldItalicStyle, text: revision.richTerm },
    { ...plainStyle, text: revision.text.slice(termStart + revision.richTerm.length) },
  ].filter(segment => segment.text.length > 0);
  if (revision.richBoldTerm) {
    const boldStart = revision.text.indexOf(revision.richBoldTerm);
    if (boldStart < 0 || boldStart >= termStart) throw new Error(`Could not preserve bold term in ${requestedSpanKey}`);
    const boldStyle = { ...plainStyle, style: 'normal', weight: 700 };
    candidate.data.segments = [
      { ...plainStyle, text: revision.text.slice(0, boldStart) },
      { ...boldStyle, text: revision.richBoldTerm },
      { ...plainStyle, text: revision.text.slice(boldStart + revision.richBoldTerm.length, termStart) },
      ...termSegments.slice(1, 2),
      { ...plainStyle, text: revision.text.slice(termStart + revision.richTerm.length) },
    ].filter(segment => segment.text.length > 0);
  } else {
    candidate.data.segments = termSegments;
  }
} else if (revision.importantCallout) {
  const semanticPrefix = previousSegments.slice(0, 3);
  const numberStyle = previousSegments.find(segment => /^\d$/u.test(segment.text ?? '') && segment.weight === 700);
  if (semanticPrefix[0]?.symbolId !== 'tag.important.icon' || !numberStyle) {
    throw new Error('The IMPORTANT marker and emphasized group numbers must remain semantic/rich text.');
  }
  const bodyText = revision.text.slice('IMPORTANTE: '.length);
  const emphasizedNumbers = bodyText.split(/(\b[1-4]\b)/gu);
  const bodySegments = emphasizedNumbers.filter(Boolean).map(part => /^\d$/u.test(part)
    ? { ...numberStyle, text: part }
    : { ...plainStyle, text: part });
  candidate.data.segments = [...semanticPrefix, ...bodySegments];
  candidate.data.managedSourceSymbols = ['tag.important.icon'];
} else {
  candidate.data.segments = [{ ...plainStyle, text: revision.text }];
}

candidate.proposalText = revision.text;
candidate.sourceLineCount = revision.sourceLines;
candidate.sourcePdfVisualLineCount = revision.sourceLines;
delete candidate.pageRendererVisualLineCount;
delete candidate.copyfitClassification;
delete candidate.copyfitLineCountClassification;
delete candidate.copyfitMeasurement;
candidate.technicalStatus = 'pending_live_viewer_copyfit_v3';
candidate.editorialStatus = 'pending_human_review';
candidate.status = 'proposal_pending_human_editorial_review';
candidate.diagnosticRendering = 'Pending Viewer Copyfit V3 measurement; preserve proposal data and keep editorial approval separate.';

proposal.proposalId = 'page-019-full-page-proposal-2026-10-16-v3';
proposal.version = 3;
proposal.status = 'copyfit-v3-review-queue-revisions-pending-live-validation';
proposal.validation = {
  date: '2026-10-17',
  revisedSpanKeys: [...new Set([...(proposal.validation?.revisedSpanKeys ?? []), requestedSpanKey])],
  payloadWrites: 0,
  humanApproved: false,
  note: 'A queued review candidate was revised locally. Viewer measurement and critical visual review are still required before recording the AI response.',
};
fs.writeFileSync(v3Path, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');

const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const relativeProposalPath = 'docs/translations/proposals/page-019-full-page-proposal-2026-10-16-v3.json';
queue.sourceProposals ??= [];
if (!queue.sourceProposals.includes(relativeProposalPath)) queue.sourceProposals.push(relativeProposalPath);
queue.updated = '2026-10-17';
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');

const markdown = [
  '# Page 19 full-page proposal — Copyfit V3 queue revisions',
  '',
  `Version 3 preserves the version 2 candidate set and revises only ${proposal.validation.revisedSpanKeys.length} queued unit(s).`,
  '',
  'No Payload translation, human approval, or canonical geometry was changed. PT-BR candidates remain review proposals.',
  '',
  ...proposal.candidates.map(item => [
    `## ${item.spanKey}`,
    '',
    `**EN source:** ${item.sourceText}`,
    '',
    `**PT-BR proposal:** ${item.proposalText}`,
    '',
    `**Visual source lines:** ${item.sourcePdfVisualLineCount ?? item.sourceLineCount ?? 'unrecorded'}; **PT-BR Viewer lines:** ${item.pageRendererVisualLineCount ?? 'pending live measurement'}.`,
    '',
    `**Review:** ${item.pendingTerms || 'Awaiting human editorial review.'}`,
    '',
  ].join('\n')).join('\n'),
].join('\n');
fs.writeFileSync(markdownPath, markdown, 'utf8');

console.log(JSON.stringify({
  proposal: relativeProposalPath,
  spanKey: requestedSpanKey,
  previousText,
  revisedText: candidate.proposalText,
  sourceVisualLines: revision.sourceLines,
  payloadWrites: 0,
}, null, 2));
