#!/usr/bin/env node
/** Create a second, isolated copyfit candidate without replacing v1 evidence. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const v1Dir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v1');
const v2Dir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2');
const v1SnapshotPath = join(v1Dir, 'snapshot/snapshot.json');
const v2SnapshotPath = join(v2Dir, 'snapshot/snapshot.json');
const v1ProposalPath = resolve(root, 'docs/translations/proposals/page-049-full-prose-proposal-2026-10-16-v1.json');
const v2ProposalPath = resolve(root, 'docs/translations/proposals/page-049-full-prose-proposal-2026-10-16-v2.json');
const v1MarkdownPath = resolve(root, 'docs/translations/proposals/page-049-full-prose-proposal-2026-10-16-v1.md');
const v2MarkdownPath = resolve(root, 'docs/translations/proposals/page-049-full-prose-proposal-2026-10-16-v2.md');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = text => String(text).replace(/\s+/gu, ' ').trim();
for (const path of [v2Dir, v2ProposalPath, v2MarkdownPath]) {
  try { await access(path); throw new Error(`Refusing to overwrite existing v2 artifact: ${path}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const v1SnapshotBytes = await readFile(v1SnapshotPath);
const v1ProposalBytes = await readFile(v1ProposalPath);
const v1Snapshot = JSON.parse(v1SnapshotBytes);
const v1Proposal = JSON.parse(v1ProposalBytes);
assert.equal(v1Proposal.proposalId, 'page-049-full-prose-proposal-2026-10-16-v1');
assert.equal(v1Snapshot.translations.length, 7);
const oldExample = v1Snapshot.translations.find(doc => doc.spanKey === 'page_49_block_8__pt-BR');
assert.ok(oldExample);
assert.equal(oldExample.data.segments.map(segment => segment.text).join(''),
  'Exemplo: Uma Cave Sickle adjacente ataca Rook e rola 10, acertando-o e causando 1 de DANO FÍSICO. Porém, o ESCUDO de Rook concede +1 de Armadura e reduz o Dano a 0. Como Rook não sofreu Dano no Ataque, pode exaustar o ESCUDO para CONTRA-ATACAR.');

const makeSegment = (text, font, size, weight = 400, style = 'normal') => ({
  text, font, size, color: '#ffffff', weight, style, disableLigatures: true,
});
const regular = text => makeSegment(text, 'OptimaLTStd', 10);
const bold = text => makeSegment(text, 'OptimaLTStd-Bold', 10, 700);
const target = 'Exemplo: Uma Cave Sickle adjacente ataca Rook e rola 10, acertando-o e causando 1 de DANO FÍSICO. Porém, o ESCUDO de Rook concede +1 de Armadura e reduz o Dano a 0. Como o Ataque não causou Dano, Rook pode exaustar o ESCUDO para CONTRA-ATACAR.';
const segments = [
  makeSegment('Exemplo:', 'OptimaLTStd-Bold', 11, 700), makeSegment(' ', 'OptimaLTStd-Bold', 10, 700),
  regular('Uma Cave Sickle adjacente ataca Rook e rola '), bold('10'),
  regular(', acertando-o e causando '), bold('1'), regular(' de '), bold('DANO FÍSICO'),
  regular('. Porém, o '), bold('ESCUDO'), regular(' de Rook concede +'), bold('1'),
  regular(' de Armadura e reduz o Dano a '), bold('0'),
  regular('. Como o Ataque não causou Dano, Rook pode exaustar o '), bold('ESCUDO'),
  regular(' para '), bold('CONTRA-ATACAR'), regular('.'),
];
assert.equal(segments.map(segment => segment.text).join(''), target);
oldExample.data.segments = segments;
const v2Snapshot = { ...v1Snapshot, translations: v1Snapshot.translations.map(doc => doc.spanKey === oldExample.spanKey ? oldExample : doc) };
const v2Proposal = structuredClone(v1Proposal);
v2Proposal.proposalId = 'page-049-full-prose-proposal-2026-10-16-v2';
v2Proposal.status = 'isolated-prose-proposal-v2-pending-final-visual-export-and-human-review';
v2Proposal.supersedes = {
  proposalId: v1Proposal.proposalId,
  snapshotSha256: sha256(v1SnapshotBytes),
  status: 'preserved-failed-copyfit-candidate',
  reason: 'The final tag CONTRA-ATACAR split at the hyphen and left ATACAR alone on the last line.',
};
v2Proposal.revisionPolicy = { ...v2Proposal.revisionPolicy, candidateVersionsBeforeFreeze: 2, finalPermittedCandidate: true };
const exampleUnit = v2Proposal.units.find(unit => unit.key === oldExample.spanKey);
assert.ok(exampleUnit);
exampleUnit.targetText = target;
exampleUnit.status = 'draft-pending-human-terminology-review';
exampleUnit.copyfitRevision = 2;
v2Proposal.copyfit.status = 'pending-final-official-viewer-and-pdf-measurement';
v2Proposal.verification = { officialPdfExported: false, viewerCompared: false, pdfRenderedAndCompared: false, editorReadOnlyVerified: false, payloadWrites: 0 };
v2Proposal.evidence = {
  ...v2Proposal.evidence,
  proofDirectory: 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2',
  snapshot: 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2/snapshot/snapshot.json',
  supersededFailedCandidate: 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v1/page-049-pt-BR-full-prose-v1.pdf',
};

const v1AssetsDir = join(v1Dir, 'snapshot/pages/page_049');
const sourcePageNames = (await readdir(v1AssetsDir)).sort();
assert.equal(sourcePageNames.length, Object.keys(v1Proposal.source.pageAssetHashes).length);
for (const name of sourcePageNames) {
  assert.equal(sha256(await readFile(join(v1AssetsDir, name))), v1Proposal.source.pageAssetHashes[name], `p.49 asset hash changed: ${name}`);
}
await mkdir(dirname(v2SnapshotPath), { recursive: true });
await cp(v1AssetsDir, join(v2Dir, 'snapshot/pages/page_049'), { recursive: true, errorOnExist: true, force: false });
await writeFile(v2SnapshotPath, `${JSON.stringify(v2Snapshot, null, 2)}\n`, { flag: 'wx' });
await writeFile(v2ProposalPath, `${JSON.stringify(v2Proposal, null, 2)}\n`, { flag: 'wx' });
const v1Markdown = await readFile(v1MarkdownPath, 'utf8');
const v2Markdown = v1Markdown
  .replace('proposta de prosa completa v1', 'proposta de prosa completa v2')
  .replace('draft isolado; export e revisão humana pendentes.', 'v2 isolada; copyfit visual final e revisão humana pendentes.')
  .replace('Como Rook não sofreu Dano no Ataque, pode exaustar o ESCUDO', 'Como o Ataque não causou Dano, Rook pode exaustar o ESCUDO')
  .replace('## Integridade e reprodução', 'A v1 foi preservada como candidato reprovado: CONTRA-ATACAR quebrava no hífen e deixava ATACAR sozinho. A v2 usa a última revisão prevista antes de congelar o texto.\n\n## Integridade e reprodução')
  .replace('page-049-full-prose-v1', 'page-049-full-prose-v2');
assert.ok(v2Markdown.includes(target));
await writeFile(v2MarkdownPath, v2Markdown, { flag: 'wx' });
console.log(JSON.stringify({
  status: 'final-permitted-copyfit-candidate-created',
  version: 'v2',
  includedOverrides: v2Snapshot.translations.map(doc => doc.spanKey),
  exampleTarget: target,
  preservedV1SnapshotSha256: sha256(v1SnapshotBytes),
  snapshotPath: v2SnapshotPath,
  proposalPath: v2ProposalPath,
}, null, 2));
