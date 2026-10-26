import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEditorialFaqMarkdown } from '../../src/faq/editorialFaqImport'

const adminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('editorial FAQ source importer', () => {
  it('parses 176 unique IDs, 12 categories, and valid source pages', async () => {
    const markdown = await readFile(path.join(adminDir, 'content/middara-faq-rulebook-1.2-pt-BR.md'), 'utf8')
    const result = parseEditorialFaqMarkdown(markdown)

    expect(result.errors).toEqual([])
    expect(result.entries).toHaveLength(176)
    expect(new Set(result.entries.map(entry => entry.faqId)).size).toBe(176)
    expect(result.categories).toHaveLength(12)
    expect(result.entries.every(entry => entry.sourcePages.length > 0 && entry.sourcePages.every(page => page >= 1 && page <= 102))).toBe(true)
    expect(result.entries.every(entry => entry.sourceUnitIds.length === 0)).toBe(true)
  })

  it('classifies scopes from answer content and preserves the standard AI rule', async () => {
    const markdown = await readFile(path.join(adminDir, 'content/middara-faq-rulebook-1.2-pt-BR.md'), 'utf8')
    const { entries } = parseEditorialFaqMarkdown(markdown)
    const byId = new Map(entries.map(entry => [entry.faqId, entry]))

    expect(byId.get('FAQ-136')?.ruleScope).toBe('base')
    for (const id of ['FAQ-173', 'FAQ-174', 'FAQ-175', 'FAQ-176']) expect(byId.get(id)?.ruleScope).toBe('optional_variant')
  })

  it('keeps the three required page references and search identities', async () => {
    const markdown = await readFile(path.join(adminDir, 'content/middara-faq-rulebook-1.2-pt-BR.md'), 'utf8')
    const { entries } = parseEditorialFaqMarkdown(markdown)
    const byId = new Map(entries.map(entry => [entry.faqId, entry]))

    expect(byId.get('FAQ-047')?.sourcePages).toContain(39)
    expect(byId.get('FAQ-083')?.sourcePages).toContain(42)
    expect(byId.get('FAQ-097')?.sourcePages).toContain(53)
    expect(byId.get('FAQ-083')?.synonyms).toEqual(expect.arrayContaining(['Break Attack', 'Ataque de Oportunidade']))
    expect(byId.get('FAQ-014')?.keywords).toEqual(expect.arrayContaining(['Bounty', 'Reward', 'Recompensa']))
  })

  it('reports duplicate source IDs instead of importing either copy twice', () => {
    const input = [
      '## 1. Tema',
      '### FAQ-001. Pergunta um?',
      'Resposta.',
      '**Referência:** Rulebook 1.2, pág. 1.',
      '### FAQ-001. Pergunta duplicada?',
      'Outra resposta.',
      '**Referência:** Rulebook 1.2, pág. 2.',
    ].join('\n\n')
    const result = parseEditorialFaqMarkdown(input)

    expect(result.duplicateIds).toEqual(['FAQ-001'])
    expect(result.errors).toContain('FAQ-001: ID duplicado na fonte')
    expect(result.entries).toHaveLength(1)
  })

  it('expands a range and multiple source pages to printed page numbers', () => {
    const result = parseEditorialFaqMarkdown([
      '## 1. Tema',
      '### FAQ-001. Pergunta?',
      'Resposta.',
      '**Referência:** Rulebook 1.2, págs. 50–51, 60.',
    ].join('\n\n'))

    expect(result.entries[0]?.sourcePages).toEqual([50, 51, 60])
  })
})
