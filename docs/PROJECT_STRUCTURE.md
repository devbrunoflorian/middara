# Estrutura do Projeto: Middara Rulebook App

## Estado Atual
**O que já funciona ponta a ponta hoje:**
- Extração bruta de PDF (`packages/ingest/extract_pdf.py`).
- Conversão da extração bruta em DOM JSON tipado (`packages/ingest/build_dom.ts`).
- Schema e modelagem de dados Zod estritos (`packages/schema`).
- Ingestão para o Payload CMS (`rulebook-blocks`).
- Renderização visual de alta fidelidade (frontend `web`) lendo blocos JSON, replicando fontes PUA.
- Edição "Rich Text" granular (`RichSpanEditor`) e persistência real traduzida (Caminho Feliz e Triste/Fallback) utilizando a coleção separada `Translations`.

**O que ainda NÃO funciona:**
- Reflow em mobile (o renderer desenha o DOM estático extraído, sem flexbox dinâmico).
- Exportação dos blocos traduzidos de volta para um novo PDF imprimível.
- As 92 páginas restantes (estamos rodando as páginas 1-10 ingeridas e homologadas).

---

## Estrutura Real do Repositório
Embora desenhado inicialmente para 3 apps, hoje o repositório opera de fato com 2 apps práticos servidos separadamente, pois o Payload CMS absorveu as funções de back-end/API. O `apps/api` (antigo Express + Drizzle) existe como artefato histórico, mas não está ativo.

```
Middara Rulebook App/
├── apps/
│   ├── admin/       # Backend (Payload CMS 3.x + Next.js App Router). Banco Postgres. Servidor da API REST.
│   ├── api/         # [DEPRECIADO] Código legado (Express + Drizzle + SQLite). Não usado.
│   └── web/         # Frontend SPA (React + Vite). Consome API do admin e renderiza o livro.
├── packages/
│   ├── ingest/      # Scripts Python de extração de PDF (PyMuPDF) e scripts TS construtores do DOM.
│   └── schema/      # Zod schemas compartilhados (tipos do bloco, página, imagem).
├── scripts/         # Scripts utilitários esporádicos (extração de fontes, manipulação de imagens isoladas).
└── docs/            # Documentação estrutural.
```

### Como Rodar Localmente
- **Payload CMS (Backend/API):**
  - **Onde:** `apps/admin`
  - **Comando:** `npm run dev -w apps/admin`
  - **Porta:** `:3000`
  - **Propósito:** Serve o Painel Admin do CMS (gerenciamento de conteúdo, verificação de traduções) e também é a **API REST principal** (`/api/rulebook-blocks`, `/api/translations`).
  
- **Frontend Renderer (Web):**
  - **Onde:** `apps/web`
  - **Comando:** `npm run dev -w apps/web`
  - **Porta:** `:8080` (geralmente; pode variar se ocupada).
  - **Propósito:** O app em React (Vite) que renderiza a interface WYSIWYG, onde as páginas ganham vida, leem os blocos do `/api` e salvam traduções usando os botões da UI.

---

## O Fluxo de Dados Completo
O ciclo de vida do texto, desde o PDF até a tela do navegador com a tradução salva:

1. **PDF Original** → O script `packages/ingest/extract_pdf.py` varre com PyMuPDF e despeja dicionários crus, com as bounding boxes, fontes (PUA inclusos) e tamanho exato de cada letra.
2. **Construção do DOM** → `packages/ingest/build_dom.ts` lê esse cru, agrupa letras em Spans, Spans em Linhas e Linhas em Blocos baseados na proximidade de Y e caixas de colisão.
3. **Payload CMS** → Os blocos em inglês caem nativamente na coleção `rulebook-blocks` como itens inalteráveis (Single Source of Truth do conteúdo base inglês).
4. **API REST** → O Frontend (`web`), no start da página, puxa a listagem estática do layout e chama `GET /api/translations?where[language]...` para buscar as traduções preexistentes.
5. **Editor** → Ao clicar em um Bloco, o `RichSpanEditor` abre os *Runs* (segmentos visuais formatados) originais em inglês (se não houver tradução) ou a versão traduzida (caso o override já exista).
6. **Save no Payload** → O `web` envia o JSON formatado em `POST /api/translations` (ou `PATCH`). O fluxo original do bloco (`rulebook-blocks`) não é machucado.
7. **Renderização** → O `SpanBlock` do frontend detecta se existe um "override". Se existir, abandona as linhas estáticas em inglês e cospe uma tag `<div style="white-space: pre-wrap">` contendo os *Runs* flexíveis um ao lado do outro, permitindo que as quebras de linha fluam naturalmente.

---

## Schema Atual da Coleção `Translations`
A coleção `Translations` (onde ficam as sobreposições em PT-BR) não carrega string bruta, mas carrega blocos ricamente parametrizados:

```typescript
{
  slug: 'translations',
  fields: [
    { name: 'blockId', type: 'text', required: true, unique: true }, // ex: "page_2_block_4"
    { name: 'language', type: 'text', required: true, defaultValue: 'pt-BR' },
    { 
      name: 'runs', 
      type: 'json', // JSON puro. Contém um array estrito da interface Segment:
                    // Array<{ text, font, size, color, weight, style }>
      required: true 
    },
  ]
}
```

---

## Skills e Regras Ativas (`.agents/rules/`)
Documentações que os agentes/IA devem ler e respeitar obrigatoriamente neste projeto:

- **01 Extracao PDF para Schema:** Mapeia a lógica de leitura do PyMuPDF, os desafios de extração visual e o build do DOM.
- **02 Schema e Modelagem:** A Regra de Ouro: "Blocos em Inglês são intocáveis". Traduções vão pra collections/fields de Overrides.
- **03 Motor de Renderizacao:** Regras de posicionamento absoluto (`left`/`top`), caixas de colisão originais e a importância do *font metrics*.
- **04 Arquitetura:** Overview do repo como monorepo Pnpm, e limites entre `ingest`, `admin` e `web`.
- **05 Validacao QA:** O roteiro de como provar e validar que uma conversão (física ou traduzida) deu certo visualmente.
- **06 Comportamento IA:** Regras rígidas de conduta: não usar placeholders, não esconder falhas, comprovar visualmente, pedir autorização antes de reestruturar.
- **07 Fantasmas:** A heurística de limpeza de texto vetorial invisível enterrado em Z-Index negativo e PDFs sujos gerados no InDesign.
- **08 Raio de Alcance:** "O que quebra lá, quebra aqui". Um fix global na renderização afeta dezenas de páginas. Modificar estilos base requer QA abrangente.
- **09 Granularidade do Editor:** O texto não pode perder a formatação rica ao ser traduzido. O fluxo deve preservar runs de texto negrito/itálico de fontes exóticas dentro do Block layout wrapper.
- **10 Métricas Verticais:** Como compensar os recuos naturais, entrelinhas estouradas de fontes PUA, garantindo sobreposição exata sem cortar o texto original em inglês.
