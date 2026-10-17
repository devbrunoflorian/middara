#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Build a recoverable, immutable PT-BR proof snapshot for the editable prose
// on printed page 32. The existing human-authored Example record is read and
// carried through unchanged. Nothing is written to Payload or canonical page
// assets.
const root = process.cwd();
const page = 32;
const pageId = '032';
const language = 'pt-BR';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const canonicalPageDir = resolve(root, 'apps/web/public/pages', `page_${pageId}`);
const baseProofDir = resolve(root, 'output/proofs/important-family-validation-2026-10-13/p032-block_56');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p032-full-page-v1');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', `page_${pageId}`);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const normalize = value => String(value ?? '').replace(/[\s\u00a0]+/gu, ' ').trim();
async function writeImmutable(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  try {
    const old = await readFile(path);
    assert.deepEqual(old, Buffer.from(bytes), `Refusing to overwrite a different proof artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
const writeJson = async (path, value) => writeImmutable(path, `${JSON.stringify(value, null, 2)}\n`);
const hasFile = async path => { try { await access(path); return true; } catch { return false; } };

const base = (text, size = 10, extra = {}) => ({
  text, font: 'OptimaLTStd', size, color: '#231f20', weight: 400, style: 'normal',
  disableLigatures: true, ...extra,
});
const bold = (text, size = 10, extra = {}) => base(text, size, {
  font: 'OptimaLTStd-Bold', weight: 700, ...extra,
});
const italic = (text, size = 10, extra = {}) => base(text, size, {
  font: 'OptimaLTStd-Italic', style: 'italic', ...extra,
});
const boldItalic = (text, size = 10, extra = {}) => base(text, size, {
  font: 'OptimaLTStd-BoldItalic', weight: 700, style: 'italic', ...extra,
});
const cinzel = (text, size) => ({
  text, font: 'Cinzel-Regular', size, color: '#231f20', weight: 400, style: 'normal',
  disableLigatures: true,
});

const drafts = [
  {
    blockIndex: 23, unitId: 'block_54', label: 'Título da página',
    spanKey: 'page_32_block_23__pt-BR', lineHeight: 1,
    segments: [cinzel('Árvores de Disciplinas', 18)], pendingTerms: ['Discipline Tree → Árvore de Disciplinas: candidato local, sem aprovação global.'],
  },
  {
    blockIndex: 10, unitId: 'block_41', label: 'Introdução',
    spanKey: 'page_32_block_10__pt-BR', lineHeight: 1.1,
    segments: [
      base('Cartas de Disciplina contêm Habilidades que podem ser usadas em momentos diferentes, conforme suas Condições. Os Aventureiros aprendem Disciplinas ao gastar '),
      bold('XP', 9),
      base(' quando têm a oportunidade de '),
      bold('Comprar e Treinar'),
      base('. Veja '),
      boldItalic('Comprar Itens e Aprender Disciplinas'),
      base(', pág. 24.'),
    ],
    pendingTerms: ['Discipline/Ability/Condition → Disciplina/Habilidade/Condição: equivalentes contextuais propostos.'],
  },
  {
    blockIndex: 11, unitId: 'block_42', label: 'Custo de XP',
    spanKey: 'page_32_block_11__pt-BR', lineHeight: 1.1,
    segments: [
      base('O custo em '), bold('XP', 9),
      base(' de uma Disciplina aparece no canto superior esquerdo da carta. Esse custo aumenta em '),
      bold('+1 XP', 9),
      base(' para cada outra Disciplina do mesmo nível que o Aventureiro já tiver. O sinal “'),
      bold('+', 12),
      base('” aparece junto ao custo em '), bold('XP', 9),
      base(' como lembrete para os jogadores.'),
    ],
    pendingTerms: ['Discipline/Level → Disciplina/Nível: candidatos locais, sem aprovação global.'],
  },
  {
    blockIndex: 12, unitId: 'p32-discipline-levels-body', label: 'Regras de níveis — corpo',
    spanKey: 'page_32_unit_p32-discipline-levels-body__pt-BR', lineHeight: 1.1,
    segments: [
      base('As Disciplinas se dividem em '), bold('5'),
      base(' Árvores de Disciplinas; cada Árvore se divide em Níveis ('), bold('LVL', 9),
      base('). As Disciplinas podem ser combinadas para personalizar seu Aventureiro. Aventureiros podem aprender Disciplinas de '),
      bold('LVL 1', 9),
      base(' de qualquer Árvore, mas, para aprender Disciplinas de nível superior, precisam ter pelo menos '),
      bold('1', 9),
      base(' Disciplina de cada nível inferior da mesma Árvore.'),
    ],
    pendingTerms: ['Discipline Tree/Discipline/Level → Árvore de Disciplinas/Disciplina/Nível: candidatos locais.'],
  },
  {
    blockIndex: 24, unitId: 'block_56', label: 'IMPORTANTE',
    spanKey: 'page_32_block_24__pt-BR', lineHeight: 1.1,
    reuseValidatedImportant: true,
    pendingTerms: [],
  },
  {
    blockIndex: 18, unitId: 'block_49', label: 'Título Assemblage',
    spanKey: 'page_32_block_18__pt-BR', lineHeight: 1,
    segments: [cinzel('Assemblage', 12)], pendingTerms: ['Nomes das Árvores permanecem no original, pendentes de revisão editorial.'],
  },
  {
    blockIndex: 13, unitId: 'block_44', label: 'Texto Assemblage',
    spanKey: 'page_32_block_13__pt-BR', lineHeight: 1.1,
    segments: [
      base('Assemblage é a arte de sussurrar às coisas que caminham nos reinos além do nosso e de lidar com criaturas antigas que um dia estiveram além da nossa imaginação. As Habilidades de Assemblage costumam refletir um perfil versátil. Isso porque são tão diversas quanto as criaturas invocadas para realizá-las. Nos primeiros níveis de Assemblage, o jogador pode realizar uma ampla variedade de Ações, desde ganhar Ações extras até conceder '),
      italic('Efeitos Positivos'), base('.'),
    ],
    pendingTerms: ['Assemblage/Ability/Action/Positive Effects: formas locais propostas; nome de árvore pendente.'],
  },
  {
    blockIndex: 19, unitId: 'block_50', label: 'Título Cruor',
    spanKey: 'page_32_block_19__pt-BR', lineHeight: 1,
    segments: [cinzel('Cruor', 12)], pendingTerms: ['Nomes das Árvores permanecem no original, pendentes de revisão editorial.'],
  },
  {
    blockIndex: 14, unitId: 'block_45', label: 'Texto Cruor',
    spanKey: 'page_32_block_14__pt-BR', lineHeight: 1.1,
    segments: [base('Cruor é arriscada por natureza. Suas Habilidades podem ser muito poderosas, mas apenas se o conjurador estiver disposto a sacrificar um pouco de si. Ela se baseia no poder bruto do sacrifício para cumprir seu propósito. Cruor permite amaldiçoar os inimigos, reduzi-los a pó, adoecê-los, arruiná-los ou liquefazê-los. Quem segue Cruor pode esperar colher grandes recompensas, mas deve tomar cuidado para não se perder nesse processo.')],
    pendingTerms: ['Cruor/Ability: formas locais propostas; nome de árvore pendente.'],
  },
  {
    blockIndex: 20, unitId: 'block_51', label: 'Título Martial',
    spanKey: 'page_32_block_20__pt-BR', lineHeight: 1,
    segments: [cinzel('Martial', 12)], pendingTerms: ['Nomes das Árvores permanecem no original, pendentes de revisão editorial.'],
  },
  {
    blockIndex: 15, unitId: 'block_46', label: 'Texto Martial',
    spanKey: 'page_32_block_15__pt-BR', lineHeight: 1.1,
    segments: [
      base('Martial personifica o combate físico em '), boldItalic('Middara'),
      base('. Embora muitas Árvores de Disciplinas possam tornar os Ataques mais poderosos, Martial transforma o Aventureiro em uma potência em combate. Martial pode aprimorar Ataques à Distância ou Corpo a Corpo, e o jogador deve considerar ambas as opções em alguns casos. Algumas Armas, como a '),
      boldItalic('Kusarigama'),
      base(', podem ser usadas tanto em Ataques Corpo a Corpo quanto à Distância; assim, é possível usar com essa Arma Habilidades que funcionem para qualquer um dos dois tipos de Ataque.'),
    ],
    pendingTerms: ['Discipline Tree/Ability/Action/Ranged/Melee: candidatos locais; revisar capitalização dos nomes de regras.'],
  },
  {
    blockIndex: 21, unitId: 'block_52', label: 'Título Sanctus',
    spanKey: 'page_32_block_21__pt-BR', lineHeight: 1,
    segments: [cinzel('Sanctus', 12)], pendingTerms: ['Nomes das Árvores permanecem no original, pendentes de revisão editorial.'],
  },
  {
    blockIndex: 16, unitId: 'block_47', label: 'Texto Sanctus',
    spanKey: 'page_32_block_16__pt-BR', lineHeight: 1.1,
    segments: [
      base('Sanctus oferece muitas Habilidades poderosas e variadas. Pode conceder armaduras mágicas, asas temporárias ou permitir que os usuários evitem obstáculos. Com Sanctus, os jogadores podem redirecionar Dano, '),
      bold('CURAR', 9),
      base(' e até dobrar a realidade para teleportar a si mesmos ou outras pessoas. Sanctus pode complementar qualquer estilo de jogo Corpo a Corpo ou à Distância, mas se destaca especialmente entre personagens defensores e de suporte.'),
    ],
    pendingTerms: ['Ability/Damage/HEAL/Melee/Ranged: candidatos locais; revisar equivalentes e capitalização.'],
  },
  {
    blockIndex: 22, unitId: 'block_53', label: 'Título Subterfuge',
    spanKey: 'page_32_block_22__pt-BR', lineHeight: 1,
    segments: [cinzel('Subterfuge', 12)], pendingTerms: ['Nomes das Árvores permanecem no original, pendentes de revisão editorial.'],
  },
  {
    blockIndex: 17, unitId: 'block_48', label: 'Texto Subterfuge',
    spanKey: 'page_32_block_17__pt-BR', lineHeight: 1.1,
    segments: [
      base('Subterfuge é a arte dos ladinos e assassinos. A maioria das Habilidades de Subterfuge se concentra em causar muito Dano, mas algumas também maximizam o potencial defensivo ao permitir que os jogadores '),
      bold('ESQUIVEM', 9),
      base(', realizem Ações gratuitas e se movam sem sofrer penalidades. A Árvore incentiva a agilidade e o posicionamento para uma abordagem mais sutil, mas também inclui algumas Habilidades diretas.'),
    ],
    pendingTerms: ['Ability/Action/Damage/Dodge: candidatos locais; revisar equivalentes e capitalização.'],
  },
];

assert.equal(drafts.length, 15);
assert.equal(await hasFile(proofDir), false, `Proof package already exists: ${proofDir}`);
const sourcePdfBytes = await readFile(sourcePdfPath);
const sourcePdfHash = sha256(sourcePdfBytes);
const domPath = join(canonicalPageDir, `page_${pageId}_dom.json`);
const dom = JSON.parse(await readFile(domPath, 'utf8'));
assert.equal(dom.page_number, page);
assert.equal(dom.blocks.length, 26);
const oldSnapshot = JSON.parse(await readFile(join(baseProofDir, 'snapshot', 'snapshot.json'), 'utf8'));
const oldImportant = oldSnapshot.translations?.find(record => record.spanKey === 'page_32_block_24__pt-BR');
assert.ok(oldImportant, 'Previously validated p.32 IMPORTANT patch is missing.');
const importantText = oldImportant.data.segments.map(segment => segment.symbolId ? '' : segment.text).join('');
assert.ok(importantText.includes('Um Aventureiro pode aprender quantas Disciplinas puder pagar, mas nunca a mesma Disciplina duas vezes.'));

for (const draft of drafts) {
  assert.equal(draft.spanKey, `page_32_${draft.unitId === 'p32-discipline-levels-body' ? 'unit_' + draft.unitId : 'block_' + draft.blockIndex}__pt-BR`);
  assert.ok(dom.blocks[draft.blockIndex], `Missing source block at index ${draft.blockIndex}`);
}
assert.equal(new Set(drafts.map(draft => draft.spanKey)).size, drafts.length, 'Duplicate proposal spanKey.');

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', language);
translationsUrl.searchParams.set('limit', '5000');
const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(response.ok, `Read-only Payload GET failed: ${response.status}`);
const payload = await response.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload baseline is paginated.');
const existingPageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_32_'));
assert.equal(existingPageRecords.length, 1, `p.32 Payload changed; expected only the saved Example record, found ${existingPageRecords.length}.`);
const existingExample = existingPageRecords[0];
assert.equal(existingExample.id, 300);
assert.equal(existingExample.spanKey, 'page_32_unit_p32-discipline-levels-example__pt-BR');
assert.equal(existingExample.language, language);
assert.ok(normalize(existingExample.data?.segments?.map(segment => segment.text).join('')).includes('CRUOR de Nível 3'));
assert.ok(!drafts.some(draft => draft.spanKey === existingExample.spanKey));

const candidateRecords = drafts.map(draft => {
  const data = draft.reuseValidatedImportant ? oldImportant.data : {
    schemaVersion: 2,
    segments: draft.segments,
    textAlign: 'left',
    lineHeight: draft.lineHeight,
    lineHeightMode: 'source',
    managedSourceSymbols: [],
  };
  return {
    page: page,
    blockIndex: draft.blockIndex,
    unitId: draft.unitId,
    label: draft.label,
    spanKey: draft.spanKey,
    language,
    data,
    proposalText: data.segments.map(segment => segment.symbolId ? '' : segment.text).join(''),
    sourceText: draft.blockIndex === 12 && draft.unitId.startsWith('p32-')
      ? dom.blocks[12].typographicUnits[0].field.lineIds.map(lineId => dom.blocks[12].lines.find(line => line.id === lineId).spans.map(span => span.text).join('')).join('')
      : dom.blocks[draft.blockIndex].lines.flatMap(line => line.spans).map(span => span.text).join(''),
    status: 'proposal_pending_human_editorial_review',
    pendingTerms: draft.pendingTerms,
    semanticSymbols: draft.reuseValidatedImportant ? ['tag.important.icon'] : [],
  };
});
assert.equal(candidateRecords.length, 15);

const pageFiles = (await readdir(canonicalPageDir)).sort();
await mkdir(snapshotPageDir, { recursive: true });
const pageAssetHashes = {};
for (const name of pageFiles) {
  const bytes = await readFile(join(canonicalPageDir, name));
  await writeImmutable(join(snapshotPageDir, name), bytes);
  pageAssetHashes[name] = sha256(bytes);
}
const sourceRecord = {
  id: existingExample.id,
  spanKey: existingExample.spanKey,
  language: existingExample.language,
  updatedAt: existingExample.updatedAt,
  data: existingExample.data,
};
const snapshot = {
  translations: [
    ...candidateRecords.map(({ spanKey, language: recordLanguage, data }) => ({ spanKey, language: recordLanguage, data })),
    sourceRecord,
  ],
  layoutFrames: [],
  symbolAliasSettings: [],
  assetPages: [page],
  page,
  patched: false,
  verifyRenderedSnapshot: true,
  sourcePageBoxes: oldSnapshot.sourcePageBoxes,
};
await writeJson(join(snapshotDir, 'snapshot.json'), snapshot);
await writeJson(join(proofDir, 'proposal-candidates.json'), {
  status: 'full-editable-text-proposal-v1-copyfit-pending',
  page,
  scope: '15 proposed editable text units plus the pre-existing human-authored Example record carried unchanged. Five discipline-card art overlays remain as in the source; their embedded English text is not translated in this proposal.',
  candidates: candidateRecords,
  preservedExistingRecord: {
    ...sourceRecord,
    includedInSnapshot: true,
    overwritten: false,
    editorialApprovalStatus: 'unknown',
  },
  counts: { proposedUnits: candidateRecords.length, preservedHumanRecords: 1, snapshotRecords: candidateRecords.length + 1 },
});
await writeJson(join(proofDir, 'source-hashes.json'), {
  sourcePdf: sourcePdfHash,
  pageAssets: pageAssetHashes,
  apiRead: { recordId: existingExample.id, spanKey: existingExample.spanKey, updatedAt: existingExample.updatedAt,
    dataSha256: sha256(Buffer.from(JSON.stringify(existingExample.data))) },
});

const overlays = JSON.parse(await readFile(join(canonicalPageDir, 'fidelity_overlays.json'), 'utf8'));
const overlaySummary = Array.isArray(overlays) ? overlays.map(overlay => ({
  id: overlay.id, asset: overlay.src ?? overlay.asset ?? overlay.path, languageInvariant: overlay.languageInvariant,
})) : overlays;
await writeJson(join(proofDir, 'artwork-scope.json'), {
  status: 'source-artwork-preserved',
  overlays: overlaySummary,
  note: 'No card overlay image was edited. Embedded card lettering remains English in this editable-text proposal and requires a separate editorial/artwork scope decision before calling the physical page fully localized.',
});

console.log(JSON.stringify({
  status: 'p032-full-page-v1-snapshot-prepared',
  page,
  proposedUnits: candidateRecords.length,
  preservedHumanRecords: 1,
  snapshotRecords: snapshot.translations.length,
  duplicateSpanKeys: 0,
  payloadWrites: 0,
  sourcePdfSha256: sourcePdfHash,
  pageAssets: pageAssetHashes,
  snapshotPath: resolve(join(snapshotDir, 'snapshot.json')),
  proofDir,
}, null, 2));
