#!/usr/bin/env node
// Copyfit-only revision of the two overflowing p.49 paragraphs. The other two
// candidate units and every canonical source asset are checked and preserved.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const sourcePdfPath = resolve(process.env.MIDDARA_SOURCE_PDF_PATH ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const page = 49;
const sourcePageDir = resolve(root, 'apps/web/public/pages/page_049');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v3');
const evidenceDir = resolve(root, 'docs/project-progress/evidence/2026-10-15-p049-counter-rules-v3');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages/page_049');
const snapshotPath = join(snapshotDir, 'snapshot.json');
const pdfPath = join(proofDir, 'page-049-pt-BR-counter-rules-proposal-v3.pdf');
const viewerPath = join(proofDir, 'viewer-pt-BR-v3.png');
const printPath = join(proofDir, 'print-pt-BR-v3.png');
const metricsPath = join(proofDir, 'metrics-v3.json');
const manifestPath = join(evidenceDir, 'copyfit-reconciliation-v3.json');
const comparisonScript = resolve(root, 'scripts/create_p049_counter_rules_comparison_v3.py');
const sourcePdfSha256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351';
const pageAssetHashes = {
  'background.webp': '7d6af89c2dfd36098072515d202219c09201ab9309943c40251c3eb4e4f11848',
  'fidelity_overlays.json': 'f02b83ded76bb5c1b53732fc4b6fd37fc59e4c6289639f19183642e498f737c5',
  'fidelity-overlay-source-vector-p049-d0118.svg': '96010acf4bdf551a7f917725887a1b2cbd8d3efeb5ce46f410856dcd0224d75f',
  'fidelity-overlay-source-vector-p049-d0120.svg': '676522b0ae0c97af55c2c059df6657a9de6573e1c9dc5f2642bd5173a9f44de8',
  'fidelity-overlay-source-vector-p049-d0152.svg': 'be740d560ac1aedbd32a00b192984fd8b4bd88722a95096594af8373bf0ce3b6',
  'fidelity-overlay-source-vector-p049-d0153.svg': '8d0c672cee8f4259836ce474fdfc0ba380fd8085cb318deb90e26899619b7d1d',
  'fidelity-overlay-source-vector-p049-d0165.svg': 'c2d2b66e22df4f4369ebd398f6a1131269ed0888232d763ac115e9cafdbd5a07',
  'fidelity-overlay-source-vector-p049-d0166.svg': 'a35dfd79d4b06401ba5bec06fce33919b02b537c9dd0061d3e6824edb74b4908',
  'fidelity-overlay-source-vector-p049-d0167.svg': 'a6fd74dd61233648d1de658433184bcd086f3b59276aa8f1e6f9154e996c46df',
  'fidelity-overlay-source-vector-p049-d0168.svg': 'e9c4b0b20e10063a4b2e5674384a6f81cbb65c5bf181202eccca75a8289a968b',
  'inline_elements.json': '6d41483875fe7c3f0a83e8337d60c1e16f7ede4997b030106385fdf065e498c5',
  'inline-element-mask-000.png': '80c392f806ac23ab69b3ed7d23e853a457b9b0eefe78552818ea0c0e4e05c79c',
  'inline-element-mask-001.png': '5f7acbe5f6ad0478a3592e1b6c376e650414c72b19d43259733c9882de688969',
  'inline-element-mask-002.png': '2898967983199cee924fca6b30fd17621530f0d76e5a51eff81c0896311665a8',
  'inline-element-mask-003.png': '2898967983199cee924fca6b30fd17621530f0d76e5a51eff81c0896311665a8',
  'layout_frames.json': '9e4928930dd5085f9e08e82427bcbde300f5b066acd480a3f4ce332d68764f08',
  'page_049_dom.json': 'bf7755a493cb02d63414a32f28fb225a01fe1673fbe71b9fca77e042be0f7041',
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => digest(await readFile(path));
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed proof: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
async function readOnlyJson(url) {
  const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Read-only GET failed (${response.status}): ${url}`);
  return response.json();
}
const text = (value, font = 'OptimaLTStd', size = 10, weight = 400, style = 'normal') => ({
  text: value, font, size, color: '#ffffff', weight, style, disableLigatures: true,
});
const regular = value => text(value);
const bold = value => text(value, 'OptimaLTStd-Bold', 10, 700);
const counter = () => text('CONTRA-ATACAR', 'OptimaLTStd-Bold', 9, 700);
const counterNoun = () => text('Contra-ataque', 'OptimaLTStd-Bold', 9, 700);
const boldIt = value => text(value, 'OptimaLTStd-BoldItalic', 10, 700, 'italic');

assert.equal(await hashFile(sourcePdfPath), sourcePdfSha256, 'Official source PDF changed');
const names = (await readdir(sourcePageDir)).sort();
assert.deepEqual(names, Object.keys(pageAssetHashes).sort(), 'p.49 canonical asset inventory changed');
for (const [name, expected] of Object.entries(pageAssetHashes)) assert.equal(await hashFile(join(sourcePageDir, name)), expected, `p.49 canonical asset changed: ${name}`);

const dom = JSON.parse(await readFile(join(sourcePageDir, 'page_049_dom.json'), 'utf8'));
const definitions = [
  {
    index: 0,
    source: 'If a figure Attacks a target and the Attack misses or deals no Final Damage, the target may use the COUNTER Ability during the Check if the Target Counters step of the Attack. See The Attack Action Pg. 41.',
    target: 'Se uma miniatura atacar um alvo e o Ataque errar ou não causar Dano Final, o alvo pode usar a Habilidade CONTRA-ATACAR durante a etapa Verifique o Contra-ataque do Ataque. Consulte Ação de Ataque, p. 41.',
  },
  {
    index: 1,
    source: 'Adventurers and Command Combatants may use the COUNTER Ability for 2 SP. However, if they successfully Dodged the Attack being Countered, they may reduce the cost of the Counter by 1 SP. Some Items and Disciplines also have the COUNTER Tag listed as an Ability. In cases where there is an SP cost on a COUNTER Tag this SP cost may also be reduced by 1. Intelligent Combatants will only COUNTER if their Combatant Card instructs them to.',
    target: 'Aventureiros e Combatentes de Comando podem usar CONTRA-ATACAR por 2 SP. Se esquivarem com sucesso do Ataque, podem reduzir o custo do Contra-ataque em 1 SP. Alguns Itens e Disciplinas também listam a Tag CONTRA-ATACAR como Habilidade. Se houver custo de SP nessa Tag, ele também pode ser reduzido em 1. Combatentes Inteligentes só usam CONTRA-ATACAR se a Carta de Combatente instruir.',
    segments: [
      regular('Aventureiros e Combatentes de Comando podem usar '), counter(),
      regular(' por '), text('2 SP', 'OptimaLTStd-Bold', 9, 700),
      regular('. Se esquivarem com sucesso do Ataque, podem reduzir o custo do Contra-ataque em '), text('1 SP', 'OptimaLTStd-Bold', 9, 700),
      regular('. Alguns Itens e Disciplinas também listam a Tag '), counter(), regular(' como Habilidade. Se houver custo de '),
      text('SP', 'OptimaLTStd-Bold', 9, 700), regular(' nessa Tag, ele também pode ser reduzido em '),
      text('1', 'OptimaLTStd-Bold', 9, 700), regular('. Combatentes Inteligentes só usam '), counter(),
      regular(' se a Carta de Combatente instruir.'),
    ],
  },
  {
    index: 2,
    source: 'To COUNTER, the target being Attacked must have Line of Sight and be within Range of the figure making the Attack Action. If the initial figure that made the Attack Action is blocked by a different opposing figure, that figure may be chosen as the target of the Counter instead. If these requirements are met, the current Attack Action immediately ends and the target being Attacked makes an Attack Action targeting the Attacker.',
    target: 'Para CONTRA-ATACAR, a miniatura atacada precisa ter Linha de Visão e estar ao Alcance da miniatura que realiza a Ação de Ataque. Se uma miniatura adversária diferente bloquear a miniatura que iniciou a Ação de Ataque, ela poderá ser escolhida como alvo do Contra-ataque. Se esses requisitos forem atendidos, a Ação de Ataque atual termina imediatamente, e a miniatura atacada realiza uma Ação de Ataque contra o atacante.',
  },
  {
    index: 3,
    source: "It is possible for some back and forth to occur when a figure makes a COUNTER during the Check if the Target Counters step of another figure's COUNTER. In these cases, after resolving all Attacks granted by the COUNTER Ability, the figure whose turn it was when the initial Action was made, would resume their turn.",
    target: 'Uma miniatura pode CONTRA-ATACAR na etapa Verifique o Contra-ataque do Contra-ataque de outra miniatura, gerando uma sequência. Após resolver todos os Ataques concedidos por essa Habilidade, a miniatura cujo turno estava ativo ao início da Ação de Ataque inicial retoma seu turno.',
    segments: [
      regular('Uma miniatura pode '), counter(), regular(' na etapa '), bold('Verifique o Contra-ataque'),
      regular(' do '), counterNoun(),
      regular(' de outra miniatura, gerando uma sequência. Após resolver todos os Ataques concedidos por essa Habilidade, a miniatura cujo turno estava ativo ao início da Ação de Ataque inicial retoma seu turno.'),
    ],
  },
];

const previousSnapshotPath = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v2/snapshot/snapshot.json');
const previousSnapshot = JSON.parse(await readFile(previousSnapshotPath, 'utf8'));
assert.equal(previousSnapshot.translations.length, 4, 'Previous isolated snapshot does not contain exactly four p.49 candidates');
const previousAssets = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v2/snapshot/pages/page_049');
for (const [name, expected] of Object.entries(pageAssetHashes)) {
  assert.equal(await hashFile(join(previousAssets, name)), expected, `Existing p.49 v2 snapshot has stale asset ${name}`);
}
const candidates = [];
for (const def of definitions) {
  const block = dom.blocks[def.index];
  assert.ok(block, `Missing source block ${def.index}`);
  const sourceText = normalize(block.lines.map(line => line.spans
    .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '').join('')).join(' '));
  assert.equal(sourceText, normalize(def.source), `Source text changed for p.49 block ${def.index}`);
  const key = `page_49_block_${def.index}__pt-BR`;
  const old = previousSnapshot.translations.find(doc => doc.spanKey === key);
  assert.ok(old && old.language === 'pt-BR', `Missing prior isolated candidate ${key}`);
  const segments = def.segments ?? old.data.segments;
  assert.equal(segments.map(segment => segment.text).join(''), def.target, `Rich segments do not match target for ${key}`);
  const data = {
    ...old.data,
    schemaVersion: 2,
    spanKey: key,
    segments: segments.map(segment => ({ ...segment, color: '#ffffff' })),
    textAlign: 'left',
    lineHeight: 1.1,
    lineHeightMode: 'custom',
    managedSourceSymbols: [],
  };
  candidates.push({ ...old, spanKey: key, language: 'pt-BR', data });
}
assert.equal(new Set(candidates.map(doc => doc.spanKey)).size, 4, 'p.49 candidate keys are duplicated');

const translations = await readOnlyJson(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=5000', apiUrl));
assert.ok((translations.docs ?? []).length >= Number(translations.totalDocs ?? 0), 'Payload translation GET is paginated');
const pageRecords = (translations.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_49_'));
assert.equal(pageRecords.length, 0, 'p.49 has saved PT-BR records now; stop to avoid hiding them');
const candidateKeys = candidates.map(doc => doc.spanKey);
assert.deepEqual((translations.docs ?? []).filter(doc => candidateKeys.includes(doc.spanKey)), [], 'A candidate key exists in Payload');
const payloadBaseline = pageRecords.map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt, sha256: digest(Buffer.from(stable(doc))) }));
const frames = await readOnlyJson(new URL('/api/layout-frames?where%5Band%5D%5B0%5D%5BpageNumber%5D%5Bequals%5D=49&limit=1000', apiUrl));
const layoutFrames = (frames.docs ?? []).filter(doc => Number(doc.pageNumber) === 49);
const aliases = await readOnlyJson(new URL('/api/symbol-alias-settings?limit=500', apiUrl));

await mkdir(snapshotPageDir, { recursive: true });
for (const name of names) await immutableWrite(join(snapshotPageDir, name), await readFile(join(sourcePageDir, name)));
const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, String(page)], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page-box extraction failed: ${boxes.stderr || boxes.stdout}`);
const snapshot = {
  translations: candidates,
  layoutFrames,
  symbolAliasSettings: aliases.docs ?? [],
  assetPages: [page],
  page,
  patched: true,
  verifyRenderedSnapshot: true,
  sourcePageBoxes: JSON.parse(boxes.stdout),
};
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'payload-baseline-v3.json'), `${JSON.stringify({ page, locale: 'pt-BR', pageRecords: pageRecords.length, candidateKeys, candidateKeysAbsent: true, payloadBaseline }, null, 2)}\n`);

const comparisonCropPath = join(evidenceDir, 'source-viewer-pdf-crop.png');
const proofFiles = [pdfPath, viewerPath, printPath, metricsPath, manifestPath, comparisonCropPath];
const proofPresence = await Promise.all(proofFiles.map(async path => {
  try { await access(path); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}));
const proofCount = proofPresence.filter(Boolean).length;
assert.ok(proofCount === 0 || proofCount === proofFiles.length,
  'Existing p.49 v3 evidence is partial; refusing to overwrite or mix proof generations');

if (proofCount === 0) {
  const exported = spawnSync(process.execPath, [
    resolve(root, 'scripts/export_page_pdf.mjs'), '--page', String(page), '--language', 'pt-BR', '--profile', 'visual',
    '--snapshot', snapshotPath, '--output', pdfPath,
    '--metrics-output', metricsPath, '--viewer-screenshot', viewerPath, '--print-screenshot', printPath,
    '--base-url', baseUrl, '--api-url', apiUrl, '--source-pdf', sourcePdfPath,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (exported.status !== 0) throw new Error(`Official p.49 PDF export failed: ${exported.stderr || exported.stdout}`);
  const comparison = spawnSync('python', [comparisonScript, sourcePdfPath, pdfPath, viewerPath, evidenceDir, manifestPath, snapshotPath], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (comparison.status !== 0) throw new Error(`Independent p.49 PDF comparison failed: ${comparison.stderr || comparison.stdout}`);
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const pdfMetrics = JSON.parse(await readFile(metricsPath, 'utf8'));
assert.equal(manifest.sourcePdfSha256, sourcePdfSha256, 'Evidence compares a different source PDF');
assert.equal(await hashFile(pdfPath), manifest.exportPdfSha256, 'Existing/exported PDF does not match its reconciliation receipt');
assert.equal(await hashFile(viewerPath), manifest.viewerScreenshotSha256, 'Viewer screenshot does not match its reconciliation receipt');
assert.equal(await hashFile(comparisonCropPath), manifest.comparisonCropSha256, 'Comparison crop does not match its reconciliation receipt');
assert.equal(pdfMetrics.page, page, 'Viewer metrics belong to a different page');
assert.equal(pdfMetrics.language, 'pt-BR', 'Viewer metrics belong to a different locale');
assert.deepEqual(manifest.sourceLineCounts, { page_49_block_0: 4, page_49_block_1: 7, page_49_block_2: 7, page_49_block_3: 5 });
assert.deepEqual(manifest.targetTextOccurrences, { page_49_block_0: 1, page_49_block_1: 1, page_49_block_2: 1, page_49_block_3: 1 });
assert.ok(Object.values(manifest.sourceFallbackOccurrences).every(count => count === 0), 'English source fallback appeared in the exported PDF');

const pdfVerifier = spawnSync('python', [
  resolve(root, 'scripts/verify_page_pdf_export.py'), pdfPath, '--page', String(page), '--contains', 'Se uma miniatura atacar um alvo',
], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (pdfVerifier.status !== 0) throw new Error(`Independent p.49 PDF verification failed: ${pdfVerifier.stderr || pdfVerifier.stdout}`);
const pdfVerification = JSON.parse(pdfVerifier.stdout);
assert.equal(pdfVerification.pages, 1, 'p.49 export must contain exactly one page');
assert.deepEqual(pdfVerification.pageSizePt, [820.346, 820.346], 'p.49 export MediaBox differs from the source');
assert.equal(pdfVerification.replacementCharacters, 0, 'p.49 PDF contains replacement characters');
await immutableWrite(join(evidenceDir, 'pdf-verification-v3.json'), `${JSON.stringify({
  page,
  locale: 'pt-BR',
  sourcePdfSha256,
  exportPdfSha256: manifest.exportPdfSha256,
  snapshotSha256: await hashFile(snapshotPath),
  expectedTranslationOccurrences: manifest.targetTextOccurrences,
  sourceFallbackOccurrences: manifest.sourceFallbackOccurrences,
  independentPdfVerifier: pdfVerification,
}, null, 2)}\n`);

const copyfitPass = manifest.allTextInsideSourceFrames && manifest.noInterUnitCollision;
const proposal = {
  proposalId: 'p049-counter-rules-2026-10-15-v3',
  page: 49,
  locale: 'pt-BR',
  family: 'four consecutive counter-rule paragraphs',
  status: copyfitPass ? 'isolated-copyfit-verified-pending-human-editorial-review' : 'copyfit-blocked-not-ready-for-approval',
  revision: 'v3 shortens only block_21 and block_23 after v2 copyfit measured 1.1 pt right overflow and one extra line; font, frames, symbol placements, and source art are unchanged.',
  units: candidates.map((doc, index) => ({
    key: doc.spanKey,
    sourceText: normalize(definitions[index].source),
    ptBR: definitions[index].target,
    segments: doc.data.segments,
    sourceLines: manifest.sourceLineCounts[`page_49_block_${index}`],
    exportedLines: manifest.targetLineCounts[`page_49_block_${index}`],
    frameFit: manifest.frameFitByUnit[`page_49_block_${index}`],
  })),
  terminologyPending: [
    'COUNTER → CONTRA-ATACAR / Contra-ataque (local proposal; glossary decision pending).',
    'Command Combatant / Intelligent Combatant / Combatant Card forms remain local proposals.',
    'Dodged / Attack / Line of Sight / Range terminology requires editorial consistency review.',
  ],
  copyfit: {
    status: copyfitPass ? 'pass-in-source-sized-frames' : 'failed-source-frame-fit',
    sourceLineCounts: manifest.sourceLineCounts,
    targetLineCounts: manifest.targetLineCounts,
    frameFitByUnit: manifest.frameFitByUnit,
    noInterUnitCollision: manifest.noInterUnitCollision,
    collisions: manifest.collisions,
  },
  verification: {
    officialPdfExported: true,
    translationTextManifestVerified: true,
    independentPdfVerification: true,
    pdfVerification,
    targetTextOccurrences: manifest.targetTextOccurrences,
    sourceFallbackOccurrences: manifest.sourceFallbackOccurrences,
    payloadPageRecordsBefore: pageRecords.length,
    payloadWriteRequests: 0,
    canonicalPageAssetsUnchanged: true,
    sourcePdfSha256: sourcePdfSha256,
    exportPdfSha256: manifest.exportPdfSha256,
  },
  evidence: {
    pdf: 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v3/page-049-pt-BR-counter-rules-proposal-v3.pdf',
    viewer: 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v3/viewer-pt-BR-v3.png',
    comparison: 'docs/project-progress/evidence/2026-10-15-p049-counter-rules-v3/source-viewer-pdf-crop.png',
    manifest: 'docs/project-progress/evidence/2026-10-15-p049-counter-rules-v3/copyfit-reconciliation-v3.json',
  },
  limits: [
    'This proposal covers only the four normal-text paragraphs in the left rules column; the IMPORTANT callout and physical-card components are excluded.',
    'Page-level structural readiness is not asserted; card-component text issues on p.49 remain separate.',
    'No translation was saved to Payload or canonical human translation files.',
  ],
};
const proposalPath = resolve(root, 'docs/translations/proposals/page-049-counter-rules-proposal-2026-10-15-v3.json');
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
const md = `# p.49 — regras de Contra-ataque, proposta v3\n\n`+
`A revisão v3 ajusta somente os parágrafos 2 e 4 após a reconciliação v2 encontrar overflow de 1,1 pt à direita no bloco 1 e uma linha adicional no bloco 3. Não houve redução de fonte, mudança de frame ou alteração dos quatro placements inline.\n\n`+
`## Resultado\n\n`+
`O exportador oficial gerou um PDF isolado e verificou os quatro overrides. Contagem de linhas-fonte/alvo: ${JSON.stringify(manifest.sourceLineCounts)} / ${JSON.stringify(manifest.targetLineCounts)}. Ajuste aos frames-fonte: ${copyfitPass ? 'passou nos quatro blocos' : 'ainda falha; proposta bloqueada para aprovação'}. Colisões entre unidades: ${manifest.collisions.length}.\n\n`+
`- Bloco 0: ${definitions[0].target}\n`+
`- Bloco 1: ${definitions[1].target}\n`+
`- Bloco 2: ${definitions[2].target}\n`+
`- Bloco 3: ${definitions[3].target}\n\n`+
`A revisão terminológica de CONTRA-ATACAR, Combatentes de Comando, Combatentes Inteligentes, Ataque e Tag continua pendente. A proposta não autoriza aplicação canônica nem afirma que a p.49 inteira esteja pronta.\n\n`+
`## Provas\n\n`+
`- PDF isolado: \`${proposal.evidence.pdf}\` (SHA-256 \`${manifest.exportPdfSha256}\`).\n`+
`- Comparação fonte EN / Viewer PT-BR / PDF: \`${proposal.evidence.comparison}\`.\n`+
`- Reconciliação independente de copyfit: \`${proposal.evidence.manifest}\`.\n`+
`- Snapshot reproduzível: \`output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v3/snapshot/snapshot.json\`.\n`;
const mdPath = resolve(root, 'docs/translations/proposals/page-049-counter-rules-proposal-2026-10-15-v3.md');
await immutableWrite(mdPath, md);

const progress = `# 2026-10-15 — p.49 regras de Contra-ataque, copyfit v3\n\n`+
`A v2 do snapshot isolado continha os quatro overrides corretos, mas falhava no frame do bloco 1 (1,1 pt à direita) e do bloco 3 (uma linha adicional; 10,14 pt abaixo do bbox). Esta v3 encurta somente esses dois textos; não reduz fonte nem altera frames, sidecars, assets ou símbolos.\n\n`+
`O exportador oficial verificou os quatro registros, e a comparação independente mede ${JSON.stringify(manifest.targetLineCounts)} linhas-alvo frente a ${JSON.stringify(manifest.sourceLineCounts)} linhas-fonte. Copyfit: **${copyfitPass ? 'PASS técnico nos quatro frames' : 'BLOQUEADO; ainda excede ao menos um frame'}**. Colisões: ${manifest.collisions.length}. PDF SHA-256: \`${manifest.exportPdfSha256}\`.\n\n`+
`A proposta é draft e aguarda revisão terminológica humana. O Payload p.49 tinha ${pageRecords.length} registros; nenhum foi criado. O PDF fonte e os hashes dos 17 assets p.49 conferem antes/depois. A família de cards físicos/IMPORTANT permanece fora do escopo.\n\n`+
`Proposta: [Markdown](../translations/proposals/page-049-counter-rules-proposal-2026-10-15-v3.md) · [JSON](../translations/proposals/page-049-counter-rules-proposal-2026-10-15-v3.json). Evidências isoladas em \`output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v3/\`.\n`;
await immutableWrite(resolve(root, 'docs/project-progress/2026-10-15-p049-counter-rules-copyfit-v3.md'), progress);

console.log(JSON.stringify({
  page,
  status: proposal.status,
  copyfit: proposal.copyfit,
  proposalPath,
  mdPath,
  pdfPath,
  exportPdfSha256: manifest.exportPdfSha256,
  translationTextManifestVerified: true,
  independentPdfVerification: true,
  payloadPageRecords: pageRecords.length,
  sourceAssetsUnchanged: true,
}, null, 2));
