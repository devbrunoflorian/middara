import { createHash } from 'node:crypto'

export const FAQ_SOURCE_VERSION = 'Middara Rulebook 1.2 / 2023'

export const FAQ_SYNONYM_GROUPS: string[][] = [
  ['Break Attack', 'Ataque de Oportunidade'],
  ['Skill Check', 'Teste de Perícia'],
  ['Follow Up', 'FU'],
  ['Counter', 'Contra-ataque'],
  ['SOI', 'Esfera de Influência'],
]

export interface ParsedEditorialFaq {
  faqId: string
  language: 'pt-BR'
  question: string
  answer: string
  englishQuestion: string
  englishAnswer: string
  category: string
  sourceVersion: string
  sourcePages: number[]
  sourceUnitIds: string[]
  keywords: string[]
  synonyms: string[]
  ruleScope: 'base' | 'optional_variant'
  spoilerLevel: 'none' | 'spoiler'
  sourceEntryHash: string
  importedContentHash: string
}

export interface EditorialFaqParseResult {
  entries: ParsedEditorialFaq[]
  errors: string[]
  categories: string[]
  duplicateIds: string[]
  suspectedSpoilerIds: string[]
}

const normalizeSearchText = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/gu, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function contentHash(entry: Pick<ParsedEditorialFaq,
  'language' | 'question' | 'answer' | 'englishQuestion' | 'englishAnswer' | 'category' | 'sourceVersion' | 'sourcePages' | 'sourceUnitIds' | 'keywords' | 'synonyms' | 'ruleScope' | 'spoilerLevel'
>): string {
  return hash({
    language: entry.language,
    question: entry.question,
    answer: entry.answer,
    englishQuestion: entry.englishQuestion,
    englishAnswer: entry.englishAnswer,
    category: entry.category,
    sourceVersion: entry.sourceVersion,
    sourcePages: entry.sourcePages,
    sourceUnitIds: entry.sourceUnitIds,
    keywords: entry.keywords,
    synonyms: entry.synonyms,
    ruleScope: entry.ruleScope,
    spoilerLevel: entry.spoilerLevel,
  })
}

function extractPages(referenceText: string): number[] {
  const pages = new Set<number>()
  const refs = /\bpp?(?:ágs?)?\.?\s*((?:\d{1,3})(?:\s*[–—-]\s*\d{1,3})?(?:\s*,\s*\d{1,3}(?:\s*[–—-]\s*\d{1,3})?)*)/giu
  const pageOrRange = /(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?/gu
  for (const reference of referenceText.matchAll(refs)) {
    for (const match of reference[1].matchAll(pageOrRange)) {
      const first = Number(match[1])
      const last = Number(match[2] ?? match[1])
      if (last < first || last - first > 101) continue
      for (let page = first; page <= last; page += 1) pages.add(page)
    }
  }
  return [...pages].sort((a, b) => a - b)
}

function termIsPresent(text: string, term: string): boolean {
  const normalized = normalizeSearchText(text)
  const normalizedTerm = normalizeSearchText(term)
  if (!normalizedTerm) return false
  if (normalizedTerm === 'fu' || normalizedTerm === 'soi') {
    return new RegExp(`(?:^| )${normalizedTerm}(?:$| )`, 'u').test(normalized)
  }
  return normalized.includes(normalizedTerm)
}

function classifyRuleScope(question: string, answer: string): 'base' | 'optional_variant' {
  const q = normalizeSearchText(question)
  const a = normalizeSearchText(answer)
  if (/^nao pela regra padrao\b/u.test(a)) return 'base'
  if (/^(?:sim opcional\b|apenas como variante opcional\b|ha uma regra opcional\b)/u.test(a)) return 'optional_variant'
  if (q.includes('variante') && /^sim[.!]? a variante\b/u.test(a)) return 'optional_variant'
  if (/^esta regra e opcional\b/u.test(a)) return 'optional_variant'
  return 'base'
}

function classifySpoiler(question: string, answer: string): 'none' | 'spoiler' {
  const text = normalizeSearchText(`${question} ${answer}`)
  return /(?:solucao (?:do|de) cenario|resultado secreto|conteudo (?:da|de) carta oculta|revela (?:a|o) solucao)/u.test(text)
    ? 'spoiler'
    : 'none'
}

export function parseEditorialFaqMarkdown(markdown: string): EditorialFaqParseResult {
  const categoryHeadings = [...markdown.matchAll(/^##\s+\d+\.\s+(.+)\s*$/gmu)]
    .map(match => ({ index: match.index ?? 0, name: match[1].trim() }))
  const questionHeadings = [...markdown.matchAll(/^###\s+(FAQ-\d{3})\.\s+(.+?)\s*$/gmu)]
  const entries: ParsedEditorialFaq[] = []
  const errors: string[] = []
  const suspectedSpoilerIds: string[] = []
  const ids = new Set<string>()
  const duplicateIds = new Set<string>()

  for (let index = 0; index < questionHeadings.length; index += 1) {
    const heading = questionHeadings[index]
    const start = heading.index ?? 0
    const end = questionHeadings[index + 1]?.index ?? markdown.length
    const block = markdown.slice(start + heading[0].length, end).trim()
    const category = categoryHeadings.filter(item => item.index < start).at(-1)?.name
    const referenceMatch = [...block.matchAll(/^\*\*Referência:\*\*\s*(.+)$/gmu)].at(-1)
    const answer = (referenceMatch ? block.slice(0, referenceMatch.index) : block).trim()
    const sourcePages = extractPages(referenceMatch?.[1] ?? '')
    const faqId = heading[1]
    const question = heading[2].trim()

    if (ids.has(faqId)) duplicateIds.add(faqId)
    ids.add(faqId)
    if (!category) errors.push(`${faqId}: sem categoria`)
    if (!question || !answer) errors.push(`${faqId}: pergunta ou resposta vazia`)
    if (sourcePages.length === 0 || sourcePages.some(page => page < 1 || page > 102)) errors.push(`${faqId}: referência ausente ou fora de 1–102`)
    if (duplicateIds.has(faqId)) continue

    const searchable = `${question} ${answer} ${category ?? ''}`
    const synonyms = [...new Set(FAQ_SYNONYM_GROUPS
      .filter(group => group.some(term => termIsPresent(searchable, term)))
      .flat())]
    const keywords = [...new Set([
      ...FAQ_SYNONYM_GROUPS.flat().filter(term => termIsPresent(searchable, term)),
      ...['Bounty', 'Reward', 'Recompensa'].filter(term => termIsPresent(searchable, term)),
    ])]
    const ruleScope = classifyRuleScope(question, answer)
    const spoilerLevel = classifySpoiler(question, answer)
    if (spoilerLevel === 'spoiler') suspectedSpoilerIds.push(faqId)

    const entryBase = {
      faqId,
      language: 'pt-BR' as const,
      question,
      answer,
      englishQuestion: '',
      englishAnswer: '',
      category: category ?? '',
      sourceVersion: FAQ_SOURCE_VERSION,
      sourcePages,
      sourceUnitIds: [],
      keywords,
      synonyms,
      ruleScope,
      spoilerLevel,
    }
    const sourceEntryHash = hash(entryBase)
    const entry = { ...entryBase, sourceEntryHash, importedContentHash: '' }
    entry.importedContentHash = contentHash(entry)
    entries.push(entry)
  }

  for (const id of duplicateIds) errors.push(`${id}: ID duplicado na fonte`)
  const categories = [...new Set(categoryHeadings.map(item => item.name))]
  if (questionHeadings.length !== 176) errors.push(`Esperadas 176 perguntas; encontradas ${questionHeadings.length}`)
  if (categories.length !== 12) errors.push(`Esperados 12 temas; encontrados ${categories.length}`)

  return { entries, errors, categories, duplicateIds: [...duplicateIds], suspectedSpoilerIds }
}
