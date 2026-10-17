#!/usr/bin/env node
/**
 * Rebuilds an isolated p.49 prose proposal from existing v3 work plus the
 * already-staged first IMPORTANT callout, page heading, and example.
 * It never writes to Payload or canonical page assets.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v1');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPath = join(snapshotDir, 'snapshot.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-049-full-prose-proposal-2026-10-16-v1.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-049-full-prose-proposal-2026-10-16-v1.md');
const sourcePageDir = resolve(root, 'apps/web/public/pages/page_049');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const priorProofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v3');
const importantProofDir = resolve(root, 'output/proofs/important-family-validation-2026-10-13/p049-block_24');
const priorProposalPath = resolve(root, 'docs/translations/proposals/page-049-counter-rules-proposal-2026-10-15-v3.json');
const importantManifestPath = resolve(root, 'docs/translations/proposals/important-family-manifest-2026-10-13.json');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fileHash = async path => sha256(await readFile(path));
const normalize = text => String(text)
  .replace(/\s+([,.;:!?])/gu, '$1')
  .replace(/(\+)\s+/gu, '$1')
  .replace(/\s+/gu, ' ')
  .trim();
const pathsToCreate = [proofDir, proposalPath, markdownPath];
for (const path of pathsToCreate) {
  try {
    await access(path);
    throw new Error(`Refusing to overwrite an existing result: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const officialPdfSha256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351';
assert.equal(await fileHash(sourcePdfPath), officialPdfSha256, 'Official EN source PDF changed');

const sourceDomPath = join(sourcePageDir, 'page_049_dom.json');
const sourceDomBytes = await readFile(sourceDomPath);
const sourceDomSha256 = sha256(sourceDomBytes);
assert.equal(sourceDomSha256, 'bf7755a493cb02d63414a32f28fb225a01fe1673fbe71b9fca77e042be0f7041', 'Canonical p.49 DOM changed');
const sourceDom = JSON.parse(sourceDomBytes);
assert.equal(sourceDom.page_number, 49);
assert.equal(sourceDom.blocks[6].suspectedGhost, true, 'Expected block_27 to remain the suppressed duplicate title');
assert.equal(sourceDom.blocks[7].lines[0].spans.map(span => span.text).join(''), 'Counter');

const priorProposal = JSON.parse(await readFile(priorProposalPath, 'utf8'));
const priorSnapshot = JSON.parse(await readFile(join(priorProofDir, 'snapshot/snapshot.json'), 'utf8'));
assert.equal(priorProposal.proposalId, 'p049-counter-rules-2026-10-15-v3');
assert.equal(priorSnapshot.translations.length, 4, 'Expected the frozen v3 package to contain only four paragraph proposals');
assert.deepEqual(
  priorSnapshot.translations.map(doc => doc.spanKey).sort(),
  [0, 1, 2, 3].map(index => `page_49_block_${index}__pt-BR`).sort(),
  'The prior four paragraph candidates changed; stop and reconcile before extending them',
);

const importantSnapshot = JSON.parse(await readFile(join(importantProofDir, 'snapshot/snapshot.json'), 'utf8'));
assert.equal(importantSnapshot.translations.length, 1, 'Expected one staged p.49 IMPORTANT candidate');
const importantTranslation = importantSnapshot.translations[0];
assert.equal(importantTranslation.spanKey, 'page_49_block_4__pt-BR');
assert.equal(importantTranslation.language, 'pt-BR');
const importantManifest = JSON.parse(await readFile(importantManifestPath, 'utf8'));
const importantOccurrence = importantManifest.occurrences.find(item => item.source?.editorialKey === 'page_49_block_4');
assert.ok(importantOccurrence, 'Missing existing source-verified p.49 IMPORTANT manifest occurrence');
assert.equal(importantOccurrence.proposal?.sourceBlockSha256, '122e5678b6c49d3e553b3fbb7f41988845ef1603a4b32c48017c9b529d4201db');
assert.ok(importantOccurrence.proposal?.targetText?.includes('Usar Habilidades de Acompanhamento'));

const oldBlockedOccurrence = importantManifest.occurrences.find(item => item.source?.editorialKey === 'page_49_block_5');
assert.ok(oldBlockedOccurrence, 'Missing historical p.49 second IMPORTANT record');
assert.equal(oldBlockedOccurrence.proposal?.reviewStates?.technical?.status, 'BLOQUEADO');
assert.equal(oldBlockedOccurrence.proposal?.copyfit?.revisionBudget, 3, 'The blocked callout has already exhausted its documented copyfit budget');

const normalizeBlockText = block => normalize(block.lines.flatMap(line => line.spans
  .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
  .map(span => span.text ?? '')).join(' '));
const sourceHeading = normalizeBlockText(sourceDom.blocks[7]);
const sourceExample = normalizeBlockText(sourceDom.blocks[8]);
assert.equal(sourceHeading, 'Counter');
assert.equal(sourceExample,
  "Example: Rook is Attacked by an adjacent Cave Sickle. The Cave Sickle rolls a 10, which hits Rook for 1 PHYSICAL DMG. However, Rook's SHIELD gives him +1 Armor and reduces the Damage to 0. Since Rook was not dealt Damage from the Attack, Rook can Exhaust his SHIELD to COUNTER the Attack.");

const priorBlockZero = priorSnapshot.translations.find(doc => doc.spanKey === 'page_49_block_0__pt-BR');
assert.ok(priorBlockZero, 'Missing prior proposal template');
const makeSegment = (text, font, size, weight = 400, style = 'normal', extra = {}) => ({
  text, font, size, color: '#ffffff', weight, style, disableLigatures: true, ...extra,
});
const headingKey = 'page_49_block_7__pt-BR';
const headingTarget = 'Contra-ataque';
const headingTranslation = {
  spanKey: headingKey,
  language: 'pt-BR',
  data: {
    ...priorBlockZero.data,
    schemaVersion: 2,
    spanKey: headingKey,
    segments: [makeSegment(headingTarget, 'Cinzel-Regular', 18)],
    textAlign: 'center',
    lineHeight: 1,
    lineHeightMode: 'source',
    managedSourceSymbols: [],
  },
};

const exampleKey = 'page_49_block_8__pt-BR';
const exampleTarget = 'Exemplo: Uma Cave Sickle adjacente ataca Rook e rola 10, acertando-o e causando 1 de DANO FÍSICO. Porém, o ESCUDO de Rook concede +1 de Armadura e reduz o Dano a 0. Como Rook não sofreu Dano no Ataque, pode exaustar o ESCUDO para CONTRA-ATACAR.';
const regular = text => makeSegment(text, 'OptimaLTStd', 10);
const bold = text => makeSegment(text, 'OptimaLTStd-Bold', 10, 700);
const exampleSegments = [
  makeSegment('Exemplo:', 'OptimaLTStd-Bold', 11, 700),
  makeSegment(' ', 'OptimaLTStd-Bold', 10, 700),
  regular('Uma Cave Sickle adjacente ataca Rook e rola '),
  bold('10'),
  regular(', acertando-o e causando '),
  bold('1'),
  regular(' de '),
  bold('DANO FÍSICO'),
  regular('. Porém, o '),
  bold('ESCUDO'),
  regular(' de Rook concede +'),
  bold('1'),
  regular(' de Armadura e reduz o Dano a '),
  bold('0'),
  regular('. Como Rook não sofreu Dano no Ataque, pode exaustar o '),
  bold('ESCUDO'),
  regular(' para '),
  bold('CONTRA-ATACAR'),
  regular('.'),
];
assert.equal(exampleSegments.map(segment => segment.text).join(''), exampleTarget, 'Example rich runs diverge from the exact proposal text');
const exampleTranslation = {
  spanKey: exampleKey,
  language: 'pt-BR',
  data: {
    ...priorBlockZero.data,
    schemaVersion: 2,
    spanKey: exampleKey,
    segments: exampleSegments,
    textAlign: 'left',
    lineHeight: 1.1,
    lineHeightMode: 'custom',
    managedSourceSymbols: [],
  },
};

const allTranslations = [
  ...priorSnapshot.translations,
  importantTranslation,
  headingTranslation,
  exampleTranslation,
];
const allKeys = allTranslations.map(doc => doc.spanKey);
assert.equal(allKeys.length, new Set(allKeys).size, 'Duplicate translation keys in the isolated package');
assert.equal(allKeys.length, 7, 'Expected four existing paragraph proposals plus three additions');
assert.ok(!allKeys.includes('page_49_block_5__pt-BR'), 'Do not reintroduce the blocked second IMPORTANT candidate');

const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const apiResponse = await fetch(`${apiUrl}/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=5000`, {
  method: 'GET', signal: AbortSignal.timeout(15000),
});
assert.ok(apiResponse.ok, `Read-only Payload GET failed: ${apiResponse.status}`);
const payload = await apiResponse.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload GET was paginated; refusing an incomplete baseline');
const currentPageRecords = (payload.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_49_'));
assert.equal(currentPageRecords.length, 0, 'Current Payload has p.49 PT records; preserve them and stop before creating an isolated snapshot');

const priorSnapshotPageDir = join(priorProofDir, 'snapshot/pages/page_049');
const priorPageNames = (await (await import('node:fs/promises')).readdir(priorSnapshotPageDir)).sort();
const sourcePageNames = (await (await import('node:fs/promises')).readdir(sourcePageDir)).sort();
assert.deepEqual(priorPageNames, sourcePageNames, 'Frozen v3 snapshot asset inventory differs from current canonical p.49');
const pageAssetHashes = {};
for (const name of sourcePageNames) {
  const sourceHash = await fileHash(join(sourcePageDir, name));
  const priorHash = await fileHash(join(priorSnapshotPageDir, name));
  assert.equal(sourceHash, priorHash, `Canonical p.49 source asset differs from the frozen v3 baseline: ${name}`);
  pageAssetHashes[name] = sourceHash;
}

await mkdir(dirname(snapshotPath), { recursive: true });
await cp(priorSnapshotPageDir, join(snapshotDir, 'pages/page_049'), { recursive: true, errorOnExist: true, force: false });
const snapshot = {
  ...priorSnapshot,
  translations: allTranslations,
  page: 49,
  patched: true,
  verifyRenderedSnapshot: true,
};
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });

const priorUnits = priorProposal.units.map(unit => ({ ...unit, provenance: 'Reused from p.49 v3 unchanged.' }));
const proposalUnits = [
  ...priorUnits,
  {
    key: importantTranslation.spanKey,
    sourceText: importantOccurrence.source.text,
    targetText: importantOccurrence.proposal.targetText,
    provenance: 'Reused from the already-rendered p.49 IMPORTANT draft; PDF parity is part of this v1 verification.',
    status: 'draft-pending-human-mechanics-review',
  },
  { key: headingKey, sourceText: sourceHeading, targetText: headingTarget, status: 'draft-pending-human-term-and-title-fit-review' },
  { key: exampleKey, sourceText: sourceExample, targetText: exampleTarget, status: 'draft-pending-human-terminology-review' },
];
const proposal = {
  proposalId: 'page-049-full-prose-proposal-2026-10-16-v1',
  page: 49,
  locale: 'pt-BR',
  family: 'Counter rules prose: left-column rules, first IMPORTANT, title, and example',
  status: 'isolated-prose-proposal-pending-visual-export-and-human-review',
  scope: {
    totalIncludedOverrides: proposalUnits.length,
    reusedV3Paragraphs: 4,
    additionsThisVersion: 3,
    sourceFallbackPreserved: ['page_49_block_5__pt-BR'],
    excluded: [
      'The second IMPORTANT (block_25) remains blocked after its three-attempt copyfit budget; no new wording attempt was started.',
      'The combatant-card image and its printed labels remain English component artwork pending an artwork-localization decision.',
      'Suppressed duplicate title block_27 remains untouched; the candidate uses only visible heading block_29.',
    ],
  },
  source: {
    pdfPath: sourcePdfPath,
    pdfSha256: officialPdfSha256,
    pageDom: 'apps/web/public/pages/page_049/page_049_dom.json',
    pageDomSha256: sourceDomSha256,
    pageAssetHashes,
  },
  payloadBaseline: { readOnly: true, page: 49, locale: 'pt-BR', existingPageRecords: 0, writeRequests: 0 },
  revisionPolicy: { fixedBudget: 2, candidateVersionsBeforeFreeze: 1, rationale: 'One copyfit revision remains available only if the measured first render fails.' },
  units: proposalUnits,
  terminologyPending: [
    'Counter / Counter Ability / Countered → CONTRA-ATACAR / Contra-ataque / contra-atacado are scoped candidates; no glossary decision exists.',
    'Follow Up Abilities → Habilidades de Acompanhamento is reused from a pending p.49 proposal.',
    'Physical DMG → DANO FÍSICO is consistent with nearby drafts but still requires human terminology review.',
    'Cave Sickle remains English as a proper creature name pending the existing creature-name decision.',
    'Title Counter → Contra-ataque is a local heading candidate, not a glossary decision.',
  ],
  copyfit: { status: 'pending-official-viewer-and-pdf-measurement', expectedPageSourceLines: { block_0: 4, block_1: 7, block_2: 7, block_3: 5, block_24: 7, title: 1, example: 5 } },
  verification: { officialPdfExported: false, viewerCompared: false, pdfRenderedAndCompared: false, editorReadOnlyVerified: false, payloadWrites: 0 },
  evidence: { proofDirectory: 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v1', snapshot: 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v1/snapshot/snapshot.json' },
  limits: [
    'This is a draft proposal, not a saved translation and not human-approved.',
    'It covers seven editable prose overrides; the second IMPORTANT, card artwork, and any remaining source-fidelity uncertainty keep the entire page open.',
    'No Payload record, canonical sidecar, source PDF, background image, or approved translation was changed.',
  ],
};

const markdown = `# p.49 — proposta de prosa completa v1 (isolada)\n\n`+
  + `**Status:** draft isolado; export e revisão humana pendentes. Nenhum conteúdo foi gravado no Payload ou nos sidecars canônicos.\n\n`
  + `A proposta reúne os quatro parágrafos já preparados em v3 e acrescenta o primeiro IMPORTANT, o título visível e o exemplo da coluna direita. O texto da carta de Combatente continua como arte de componente em inglês.\n\n`
  + `## Unidades incluídas\n\n`
  + proposalUnits.map(unit => `- \`${unit.key}\`\n  - EN: ${unit.sourceText}\n  - PT-BR draft: ${unit.targetText}`).join('\n')
  + `\n\n## Pendências preservadas\n\n`
  + `- O segundo IMPORTANT (block_25) continua bloqueado: três tentativas já excederam o limite inferior do frame. Ficou fora do snapshot desta versão.\n`
  + `- O título “Contra-ataque” e termos como Counter, Counter Ability, Countered, Follow Up Abilities, Physical DMG e Cave Sickle aguardam revisão terminológica humana.\n`
  + `- O card físico e seus rótulos permanecem em inglês; a arte não foi reconstruída como texto de prosa.\n`
  + `- A tradução completa da página ainda não está concluída.\n\n`
  + `## Integridade e reprodução\n\n`
  + `- PDF fonte SHA-256: \`${officialPdfSha256}\`.\n`
  + `- DOM p.49 SHA-256: \`${sourceDomSha256}\`.\n`
  + `- O snapshot reaproveita os assets congelados da v3 após comparar seus hashes com o sidecar canônico atual.\n`
  + `- Payload consultado por GET somente leitura: 0 registros PT-BR da p.49 no preflight; 0 requests de escrita.\n`
  + `- Próximo passo: executar \`scripts/export_page_pdf.mjs\` contra o snapshot e comparar Viewer/PDF, mantendo os bloqueios acima explícitos.\n`;

await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' });
await writeFile(markdownPath, markdown, { flag: 'wx' });
console.log(JSON.stringify({
  status: 'isolated-snapshot-and-proposal-created',
  proposalPath,
  markdownPath,
  snapshotPath,
  includedOverrides: allKeys,
  payloadPageRecords: currentPageRecords.length,
  payloadWrites: 0,
  sourcePdfSha256: officialPdfSha256,
  sourceDomSha256,
  pageAssetCount: Object.keys(pageAssetHashes).length,
}, null, 2));
