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
│   ├── admin/       # Backend (Payload CMS 3.x + Next.js App Router). Banco SQLite local (`apps-admin.db`). Atua simultaneamente como Painel Admin visual e **Servidor da API REST/GraphQL**.
│   ├── api/         # [DEPRECIADO] Código legado (Express + Drizzle). Mantido apenas para histórico. NÂO USAR.
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
  - **Porta:** `:8080` (React/Vite).
  - **Propósito:** O aplicativo cliente. Ele **não** tem banco de dados próprio. Ele consome as rotas REST expostas pelo `apps/admin` (ex: `http://localhost:3000/api/translations`) para renderizar a interface WYSIWYG, onde as páginas ganham vida e salvam as edições.

### Como as 3 coisas se entrelaçam?
- O `apps/api` está **morto**. Não se entrelaça em nada. O Payload (`apps/admin`) absorveu seu papel.
- O `apps/admin` e o `apps/web` funcionam numa arquitetura **Headless Client-Server**:
  - O `admin` (porta 3000) é o cérebro e o banco de dados (SQLite). Ele expõe endpoints estritos.
  - O `web` (porta 8080) é apenas uma "casca visual" burra que consome a porta 3000 via chamadas `fetch()`. Se o `admin` cair, o `web` continua rodando mas com erro de "Failed to fetch" ao tentar salvar ou carregar dados dinâmicos.

---

## O Fluxo de Dados Completo
O ciclo de vida do texto, desde o PDF até a tela do navegador com a tradução salva:

1. **PDF Original** → O script `packages/ingest/extract_pdf.py` varre com PyMuPDF e despeja dicionários crus, com as bounding boxes, fontes (PUA inclusos) e tamanho exato de cada letra.
2. **Construção do DOM** → `packages/ingest/build_dom.ts` lê esse cru, agrupa letras em Spans, Spans em Linhas e Linhas em Blocos baseados na proximidade de Y e caixas de colisão.
3. **Payload CMS** → Os blocos em inglês caem nativamente na coleção `rulebook-blocks` como itens inalteráveis (Single Source of Truth do conteúdo base inglês).
4. **API REST** → O Frontend (`web`), no start da página, puxa a listagem estática do layout e chama `GET /api/translations?where[language]...` no `admin` para buscar as traduções preexistentes em cache de memória (ou faz fallback pro `localStorage` se a API estiver fora do ar).
5. **Editor** → Ao clicar em um trecho específico de texto (Span), o `RichSpanEditor` intercepta o evento. A granularidade agora é a nível de linha/span (e não mais bloco inteiro).
6. **Save no Payload** → O `web` envia o JSON formatado dos segmentos daquele Span via `POST /api/translations` (ou `PATCH` caso já exista) para a porta 3000. O fluxo original do bloco (`rulebook-blocks`) **nunca é machucado**.
7. **Renderização** → O `PageRenderer` do frontend detecta se existe um "override" mapeado para aquela `spanKey`. Se existir, ele injeta os segmentos traduzidos perfeitamente por cima da imagem estática do PDF.

---

## Schema Atual da Coleção `Translations`
A coleção `Translations` (onde ficam as sobreposições em PT-BR) não carrega string bruta, mas carrega blocos ricamente parametrizados:

```typescript
{
  slug: 'translations',
  fields: [
    { name: 'spanKey', type: 'text', required: true, unique: true }, // ex: "page_6_block_87_line_line_108_0"
    { name: 'language', type: 'text', required: true, defaultValue: 'pt-BR' },
    { 
      name: 'data', 
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
