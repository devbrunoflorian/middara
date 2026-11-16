import type { CollectionConfig, Where } from 'payload'

const categories = [
  'Modos de jogo e campanha',
  'Preparação, Encontros e Urgência',
  'Turnos, SP e Habilidades',
  'Movimento, Terrenos e Elevação',
  'Ataques, Esquiva, Contra-ataque e flanqueamento',
  'Alcance, Linha de Visão, Feitiços e Follow Up',
  'Equipamentos, Itens, Disciplinas e Aprimoramentos',
  'Saques, Ouro e recompensas',
  'Combatentes Inteligentes, grupos e IA',
  'Espers, Familiares e Conduítes',
  'Efeitos, limites e regras gerais',
  'Regras especiais e variantes opcionais',
]

const pageNumbers = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => typeof item === 'number' ? item : typeof item === 'object' && item !== null && 'page' in item ? Number(item.page) : NaN)
    .filter(page => Number.isInteger(page) && page >= 1 && page <= 102)
}

const hasAuthenticatedUser = ({ req }: { req: { user?: unknown } }) => Boolean(req.user)

export const EditorialFaqs: CollectionConfig = {
  slug: 'editorial-faqs',
  admin: {
    useAsTitle: 'question',
    group: 'Editorial',
    defaultColumns: ['faqId', 'question', 'category', 'primarySourcePage', 'reviewStatus', '_status', 'updatedAt'],
    listSearchableFields: ['faqId', 'question', 'category', 'sourcePageSearch'],
    description: 'FAQ editorial PT-BR do Rulebook 1.2. Não é FAQ nem errata oficial. Revise o conteúdo antes de publicar.',
    pagination: { defaultLimit: 50, limits: [25, 50, 100, 200] },
  },
  access: {
    read: ({ req }): boolean | Where => req.user ? true : ({
      spoilerLevel: { equals: 'none' },
    }),
    create: hasAuthenticatedUser,
    update: hasAuthenticatedUser,
    delete: hasAuthenticatedUser,
    readVersions: hasAuthenticatedUser,
  },
  versions: {
    drafts: { autosave: false, validate: true },
    maxPerDoc: 100,
  },
  hooks: {
    beforeChange: [({ data, originalDoc, req }) => {
      const next = { ...data }
      const pages = pageNumbers(next.sourcePages ?? originalDoc?.sourcePages)
      next.primarySourcePage = pages[0] ?? null
      next.sourcePageSearch = pages.join(' ')

      const trackedFields = ['question', 'answer', 'englishQuestion', 'englishAnswer', 'category', 'sourcePages', 'keywords', 'synonyms', 'ruleScope', 'spoilerLevel']
      const contentChanged = Boolean(originalDoc) && trackedFields.some(field =>
        next[field] !== undefined && JSON.stringify(next[field]) !== JSON.stringify(originalDoc?.[field]),
      )

      if (originalDoc?.reviewStatus === 'reviewed' && contentChanged) {
        next.reviewStatus = 'pending'
        next.reviewedAt = null
        next.reviewedBy = null
      } else if (next.reviewStatus === 'reviewed' && originalDoc?.reviewStatus !== 'reviewed') {
        next.reviewedAt = new Date().toISOString()
        next.reviewedBy = String(req.user?.email ?? req.user?.id ?? '')
      } else if (next.reviewStatus === 'pending') {
        next.reviewedAt = null
        next.reviewedBy = null
      }

      return next
    }],
  },
  fields: [
    { name: 'faqId', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true, description: 'ID estável da fonte editorial.' } },
    {
      name: 'language', type: 'select', required: true, defaultValue: 'pt-BR',
      options: [{ label: 'Português (Brasil)', value: 'pt-BR' }],
    },
    { name: 'question', type: 'text', required: true },
    { name: 'answer', type: 'textarea', required: true, admin: { description: 'Markdown simples; HTML arbitrário não é renderizado no Viewer.' } },
    { name: 'englishQuestion', type: 'text', admin: { description: 'Versão em inglês. O Viewer em EN não faz fallback para o conteúdo PT-BR.' } },
    { name: 'englishAnswer', type: 'textarea', admin: { description: 'Versão em inglês. Só aparece quando este campo e a pergunta em inglês estiverem preenchidos.' } },
    { name: 'category', type: 'select', required: true, index: true, options: categories.map(value => ({ label: value, value })) },
    { name: 'sourceVersion', type: 'text', required: true, defaultValue: 'Middara Rulebook 1.2 / 2023' },
    {
      name: 'sourcePages', type: 'array', required: true, minRows: 1, maxRows: 20,
      admin: { description: 'Páginas impressas 1–102; intervalos da fonte são expandidos em páginas individuais.' },
      fields: [{ name: 'page', type: 'number', required: true, min: 1, max: 102 }],
    },
    { name: 'primarySourcePage', type: 'number', index: true, admin: { readOnly: true, description: 'Primeira página de origem; útil para busca e filtro no Admin.' } },
    { name: 'sourcePageSearch', type: 'text', index: true, admin: { hidden: true, readOnly: true } },
    {
      name: 'sourceUnitIds', type: 'array', admin: { description: 'Só preencher após confirmar o vínculo no DOM de origem.' },
      fields: [{ name: 'id', type: 'text', required: true }],
    },
    { name: 'keywords', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },
    { name: 'synonyms', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },
    {
      name: 'ruleScope', type: 'select', required: true, defaultValue: 'base', index: true,
      options: [
        { label: 'Regra padrão', value: 'base' },
        { label: 'Variante opcional', value: 'optional_variant' },
      ],
    },
    {
      name: 'spoilerLevel', type: 'select', required: true, defaultValue: 'none', index: true,
      options: [
        { label: 'Sem spoiler', value: 'none' },
        { label: 'Spoiler', value: 'spoiler' },
      ],
    },
    {
      name: 'reviewStatus', type: 'select', required: true, defaultValue: 'pending', index: true,
      label: 'Revisão editorial',
      options: [
        { label: 'Pendente', value: 'pending' },
        { label: 'Revisada', value: 'reviewed' },
      ],
      admin: { description: 'A revisão editorial é independente do estado de publicação nativo do Payload.' },
    },
    { name: 'reviewedAt', type: 'date', admin: { readOnly: true } },
    { name: 'reviewedBy', type: 'text', admin: { readOnly: true } },
    { name: 'sourceEntryHash', type: 'text', admin: { hidden: true, readOnly: true } },
    { name: 'importedContentHash', type: 'text', admin: { hidden: true, readOnly: true } },
  ],
}
