import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const apiBase = (process.env.MIDDARA_PAYLOAD_API || 'http://localhost:3000/api').replace(/\/$/u, '');
const snapshotPath = fileURLToPath(new URL('../docs/translations/recovery/semantic-glossary-before-implementation-2026-10-24.json', import.meta.url));
const baseline = JSON.parse(await readFile(snapshotPath, 'utf8'));

function normalize(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
}

function decisionKey(sourceTerm, targetTerm) {
  return `${normalize(sourceTerm)}=>${normalize(targetTerm)}`;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key])]));
}

function equalJson(left, right) {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right));
}

function protectedValueMatches(field, currentValue, originalValue) {
  if (field === 'decidedAt' && currentValue && originalValue) {
    return Date.parse(currentValue) === Date.parse(originalValue);
  }
  return equalJson(currentValue ?? null, originalValue ?? null);
}

function metadata(input) {
  return {
    decisionType: 'terminology',
    ...input,
    humanLocked: input.humanLocked ?? false,
    version: 1,
    updatedBy: 'semantic-glossary-pilot-2026-10-25',
    reconciliationStatus: input.reconciliationStatus ?? 'clear',
    ...(input.reconciliationNote ? { reconciliationNote: input.reconciliationNote } : {}),
  };
}

const enrichments = [
  {
    id: 7,
    semanticMetadata: metadata({
      category: 'component',
      context: 'Ficha de acompanhamento da Aventura; componente distinto do cartão de perfil individual do Aventureiro.',
      alternatives: ['Ficha da Aventura'],
      distinctFrom: [{ sourceTerm: 'Adventurer Card', preferredForm: 'Cartão de Aventureiro', relationship: 'distinct_from', note: 'O cartão apresenta o perfil do Aventureiro; a ficha registra o progresso da Aventura.' }],
      evidence: ['Payload decision id 7; official Markdown glossary; glossary-candidates.md records the source distinction on pp. 10 and 24.'],
      examples: [{ pageNumber: 10, sourceText: 'Adventure Sheet', targetText: 'Ficha de Aventura', note: 'Identidade preservada para o componente.' }],
      humanLocked: true,
    }),
  },
  {
    id: 12,
    semanticMetadata: metadata({
      category: 'game_entity',
      subtype: 'recompensa ou entidade obtida em regra de Encontro',
      context: 'Bounty e Reward podem compartilhar a forma portuguesa “Recompensa”, mas continuam conceitos separados; a forma alternativa “Caçada” permanece experimental.',
      alternatives: ['Caçada (experimental; não aplicar globalmente)'],
      distinctFrom: [{ sourceTerm: 'Reward', preferredForm: 'Recompensa', relationship: 'distinct_from', note: 'Equivalência PT coincidente não funde as duas mecânicas.' }],
      evidence: ['Payload decision id 12; editorial-casebook.md rows for Bounty/Bounties and Reward(s).'],
      humanLocked: true,
      reconciliationStatus: 'needs_review',
      reconciliationNote: 'O registro aprovado Bounty → Recompensa e o caso experimental Caçada convivem com texto humano divergente; preservar tudo até reconciliação contextual.',
    }),
  },
  {
    id: 42,
    semanticMetadata: metadata({
      category: 'component',
      context: 'Referência a cartas ocultas; o próprio campo targetTerm deste registro contém uma nota legada, não uma tradução válida.',
      distinctFrom: [{ sourceTerm: 'Hidden Card Decks', preferredForm: 'Baralhos Secretos', relationship: 'distinct_from', note: 'Cartas individuais e baralhos são conceitos físicos distintos.' }],
      evidence: ['Payload decision id 42 was preserved byte-for-byte in its source/target/status fields; editorial-casebook.md documents the human distinction.'],
      humanLocked: true,
      reconciliationStatus: 'needs_review',
      reconciliationNote: 'targetTerm legado: “Cartas Ocultas usa decisão terminológica prévia”. Não sobrescrever nem tratar como forma PT; reconciliar com o casebook sem duplicar decisão automaticamente.',
    }),
  },
  {
    id: 59,
    semanticMetadata: metadata({
      category: 'mechanic',
      context: 'Traçado/regra de visibilidade entre origem e alvo; não é o identificador especial de alcance SOI.',
      distinctFrom: [{ sourceTerm: 'SOI', relationship: 'distinct_from', note: 'SOI é um alcance especial de Feitiço que também exige Line of Sight.' }],
      evidence: ['Official Markdown glossary; Payload decision id 59; glossary-candidates.md distinction among Range, REACH and SOI.'],
      humanLocked: true,
    }),
  },
  {
    id: 64,
    semanticMetadata: metadata({
      category: 'game_mode',
      context: 'Modo de jogo chamado Crawl Mode; forma PT-BR escolhida expressamente pelo usuário, sem a preposição “de”.',
      alternatives: ['Modo Crawl (rejeitado)', 'Modo de Exploração (não preferido pelo usuário)'],
      distinctFrom: [{ sourceTerm: 'Crawl Book', preferredForm: 'Livro de Masmorras', relationship: 'distinct_from', note: 'Um é modo de jogo; o outro é um livro/componente.' }],
      evidence: ['Payload decision id 64; decisão expressa do usuário em 24/10/2026.'],
      humanLocked: true,
    }),
  },
  {
    id: 65,
    semanticMetadata: metadata({
      category: 'game_mode',
      subtype: 'variante épica de Crawl Mode',
      context: 'Composto de Crawl Mode; conservar o modificador Epic na forma PT-BR.',
      distinctFrom: [{ sourceTerm: 'Crawl Mode', preferredForm: 'Modo Exploração', relationship: 'related_to', note: 'Variante épica do modo, não do livro Crawl Book.' }],
      evidence: ['Payload decision id 65; texto-fonte e forma humana registrada na p. 9.'],
      humanLocked: true,
    }),
  },
  {
    id: 66,
    semanticMetadata: metadata({
      category: 'component',
      subtype: 'livro físico de regras de masmorra',
      context: 'Livro que detalha configuração inicial de Aventureiros; não designa o modo de jogo.',
      distinctFrom: [{ sourceTerm: 'Crawl Mode', preferredForm: 'Modo Exploração', relationship: 'distinct_from', note: 'Componente físico e modo de jogo têm identidades diferentes.' }],
      evidence: ['Payload decision id 66; decisão expressa do usuário em 24/10/2026; referência de uso na p. 24.'],
      examples: [{ pageNumber: 24, sourceText: 'Adventure Book or Crawl Book', targetText: 'Livro de Aventura ou Livro de Masmorras', note: 'Nomes de componentes paralelos.' }],
      humanLocked: true,
    }),
  },
];

const additions = [
  {
    sourceTerm: 'Adventurer Card',
    targetTerm: 'Cartão de Aventureiro',
    decisionStatus: 'hypothesis',
    decisionNote: 'Proposta de trabalho; aguarda confirmação terminológica. “Carta” e “Ficha” continuam alternativas, e nenhuma página foi harmonizada.',
    semanticMetadata: metadata({
      category: 'component',
      context: 'Cartão grande de perfil individual do Aventureiro, distinto da ficha de acompanhamento da Aventura.',
      alternatives: ['Carta de Aventureiro', 'Ficha de Aventureiro'],
      distinctFrom: [{ sourceTerm: 'Adventure Sheet', preferredForm: 'Ficha de Aventura', decisionId: 7, relationship: 'distinct_from', note: 'Não usar o termo da ficha para o cartão de perfil.' }],
      evidence: ['glossary-candidates.md cites the source component on pp. 10 and 24; awaiting PDF-level terminology confirmation.'],
      reconciliationStatus: 'needs_review',
      reconciliationNote: 'Proposta não aprovada; escolha final pendente do usuário.' ,
    }),
  },
  {
    sourceTerm: 'Hidden Card Decks',
    targetTerm: 'Baralhos Secretos',
    decisionStatus: 'approved',
    decisionNote: 'Estruturado no Payload a partir da decisão humana APROVADO registrada no editorial-casebook.md; não altera traduções.',
    semanticMetadata: metadata({
      category: 'component',
      context: 'Baralhos físicos de cartas ocultas; não são as cartas individuais.',
      distinctFrom: [{ sourceTerm: 'Hidden Cards', preferredForm: 'Cartas Ocultas', relationship: 'distinct_from', note: 'O casebook fixa explicitamente os dois conceitos separados.' }],
      evidence: ['editorial-casebook.md, approved case “Hidden Card Decks / Hidden Cards”; no page text was changed.'],
      humanLocked: true,
    }),
  },
  {
    sourceTerm: 'Terrain Tokens',
    targetTerm: 'Fichas de Terreno',
    decisionStatus: 'observed_standard',
    decisionNote: 'Forma observada nos drafts e referências editoriais das pp. 21 e 23; status não significa aprovação global da terminologia.',
    semanticMetadata: metadata({
      category: 'component',
      context: 'Ficha ou marcador associado a Terrenos; preservar as identidades de componentes da arte original.',
      distinctFrom: [{ sourceTerm: 'Tiles', preferredForm: 'Peças', relationship: 'distinct_from', note: 'Uma ficha de terreno não é a peça de tabuleiro Tile.' }],
      evidence: ['Localization progress records Terrain Tokens / Fichas de Terreno on pp. 21 and 23; linked page labels remain pending review.'],
      reconciliationStatus: 'needs_review',
      reconciliationNote: 'Padrão observado em unidades ainda não certificadas; manter o status e as propostas de página separados.',
    }),
  },
  {
    sourceTerm: 'Range',
    targetTerm: 'Alcance',
    decisionStatus: 'hypothesis',
    decisionNote: 'Proposta contextual para o termo geral Range; não define a tag impressa REACH nem o identificador SOI.',
    semanticMetadata: metadata({
      category: 'mechanic',
      context: 'Termo geral para distância/alcance em regras; verificar o escopo na frase antes de traduzir.',
      alternatives: ['Manter Range (em identificadores físicos, se necessário)'],
      distinctFrom: [
        { sourceTerm: 'REACH', relationship: 'distinct_from', note: 'REACH é uma Tag impressa; Range é o conceito geral de distância.' },
        { sourceTerm: 'SOI', relationship: 'related_to', note: 'SOI é um alcance especial de Feitiço que também exige Line of Sight.' },
      ],
      evidence: ['glossary-candidates.md records the unresolved p. 17 unit and the distinction from REACH/SOI.'],
      reconciliationStatus: 'needs_review',
      reconciliationNote: 'Termo contextual pendente; não aplicar globalmente nem em Tags.',
    }),
  },
  {
    sourceTerm: 'Combatant Loot Card',
    targetTerm: 'Cartão de Saque de Combatente',
    decisionStatus: 'hypothesis',
    decisionNote: 'Hipótese literal para consulta editorial; o nome PT-BR do componente ainda não foi aprovado.',
    semanticMetadata: metadata({
      category: 'component',
      context: 'Componente físico associado a loot de um combatente; não é o conceito abstrato Loot/Saque.',
      alternatives: ['Carta de Saque de Combatente', 'Cartão de Loot de Combatente'],
      distinctFrom: [{ sourceTerm: 'Loot', preferredForm: 'Saque', relationship: 'distinct_from', note: 'Nome de componente não deve colapsar no conceito abstrato da mecânica.' }],
      evidence: ['Explicit distinction supplied in the user-provided semantic glossary specification; printed component and PT form still need source review.'],
      reconciliationStatus: 'needs_review',
      reconciliationNote: 'Rótulo PT-BR é apenas hipótese; confirmar nome e política de identificador no PDF original.',
    }),
  },
  {
    sourceTerm: 'DOUBLE',
    targetTerm: 'DOUBLE',
    decisionStatus: 'hypothesis',
    decisionNote: 'Conservar o identificador impresso enquanto Tag; hipótese contextual, não regra para todo uso de “double”.',
    semanticMetadata: metadata({
      category: 'keyword_tag',
      subtype: 'Tag impressa em componente',
      context: 'Identificador de Tag em maiúsculas; seu escopo deve ser validado no componente.',
      printedIdentifierPolicy: 'Preservar DOUBLE no componente até confirmação de que o identificador pode ser localizado.',
      distinctFrom: [{ sourceTerm: 'Double Encounter', preferredForm: 'Encontro Duplo', relationship: 'distinct_from', note: 'Tag de componente não é a mecânica/estrutura de Encontro Duplo.' }],
      evidence: ['glossary-candidates.md distinguishes the printed DOUBLE tag from Double Encounter; status remains a hypothesis pending PDF confirmation.'],
      reconciliationStatus: 'needs_review',
      reconciliationNote: 'O termo genérico “double” pode aparecer fora da Tag; esta entrada só se aplica ao identificador de Tag.',
    }),
  },
];

async function request(pathname, init) {
  const response = await fetch(`${apiBase}/${pathname}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${pathname}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const result = await request('translation-glossary-decisions?limit=5000&sort=createdAt');
if (!Array.isArray(result.docs) || result.totalDocs > result.docs.length) throw new Error('Payload não retornou todas as decisões; nenhuma alteração foi feita.');
const docs = result.docs;
const byId = new Map(docs.map(doc => [String(doc.id), doc]));
const byKey = new Map(docs.map(doc => [doc.decisionKey, doc]));
if (new Set(docs.map(doc => doc.decisionKey)).size !== docs.length) throw new Error('Há decisionKey duplicada no Payload.');

const protectedFields = ['id', 'decisionKey', 'sourceTerm', 'targetTerm', 'normalizedSourceTerm', 'normalizedTargetTerm', 'decisionStatus', 'occurrences', 'decisionNote', 'decidedAt'];
for (const original of baseline.decisions) {
  const current = byId.get(String(original.id));
  if (!current) throw new Error(`A decisão existente id ${original.id} sumiu; nenhuma alteração foi feita.`);
  for (const field of protectedFields) {
    if (!protectedValueMatches(field, current[field], original[field])) throw new Error(`A decisão id ${original.id} diverge do snapshot em ${field}; nenhuma alteração foi feita.`);
  }
}

let enriched = 0;
let created = 0;
let unchanged = 0;
for (const seed of enrichments) {
  const current = byId.get(String(seed.id));
  if (!current) throw new Error(`Não encontrei a decisão preexistente id ${seed.id}.`);
  if (current.semanticMetadata != null) {
    if (!equalJson(current.semanticMetadata, seed.semanticMetadata)) throw new Error(`id ${seed.id} já tem metadados diferentes; preservados sem sobrescrita.`);
    unchanged += 1;
    continue;
  }
  const saved = await request(`translation-glossary-decisions/${seed.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semanticMetadata: seed.semanticMetadata }) });
  if (!saved?.doc || String(saved.doc.id) !== String(seed.id) || !equalJson(saved.doc.semanticMetadata, seed.semanticMetadata)) throw new Error(`Payload não confirmou metadata do id ${seed.id}.`);
  byId.set(String(seed.id), saved.doc);
  byKey.set(saved.doc.decisionKey, saved.doc);
  enriched += 1;
}

for (const seed of additions) {
  const key = decisionKey(seed.sourceTerm, seed.targetTerm);
  const current = byKey.get(key);
  if (current) {
    if (current.sourceTerm !== seed.sourceTerm || current.targetTerm !== seed.targetTerm || current.decisionStatus !== seed.decisionStatus || !equalJson(current.semanticMetadata, seed.semanticMetadata)) {
      throw new Error(`A chave ${key} já existe com outro conteúdo; preservada sem sobrescrita.`);
    }
    unchanged += 1;
    continue;
  }
  const now = new Date().toISOString();
  const saved = await request('translation-glossary-decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decisionKey: key,
      sourceTerm: seed.sourceTerm,
      targetTerm: seed.targetTerm,
      normalizedSourceTerm: normalize(seed.sourceTerm),
      normalizedTargetTerm: normalize(seed.targetTerm),
      decisionStatus: seed.decisionStatus,
      semanticMetadata: seed.semanticMetadata,
      occurrences: [],
      decisionNote: seed.decisionNote,
      decidedAt: now,
    }),
  });
  if (!saved?.doc || saved.doc.decisionKey !== key) throw new Error(`Payload não confirmou a nova decisão ${key}.`);
  byId.set(String(saved.doc.id), saved.doc);
  byKey.set(key, saved.doc);
  created += 1;
}

const reread = await request('translation-glossary-decisions?limit=5000&sort=createdAt');
if (reread.totalDocs !== baseline.decisionCount + additions.length) throw new Error(`Esperava ${baseline.decisionCount + additions.length} decisões após o piloto, recebi ${reread.totalDocs}.`);
if (new Set(reread.docs.map(doc => doc.decisionKey)).size !== reread.totalDocs) throw new Error('O piloto gerou chaves duplicadas.');
for (const original of baseline.decisions) {
  const current = reread.docs.find(doc => String(doc.id) === String(original.id));
  if (!current || protectedFields.some(field => !protectedValueMatches(field, current[field], original[field]))) throw new Error(`A decisão existente id ${original.id} mudou nos campos protegidos.`);
}

console.log(JSON.stringify({ status: 'verified', before: baseline.decisionCount, after: reread.totalDocs, uniqueDecisionKeys: new Set(reread.docs.map(doc => doc.decisionKey)).size, enriched, created, unchanged, protectedExistingDecisionFields: protectedFields, translationCountInBaseline: baseline.translationCount, translationHashInBaseline: baseline.translationsCanonicalSha256 }, null, 2));
