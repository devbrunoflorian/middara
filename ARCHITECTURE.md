# Middara Rulebook App — Arquitetura Técnica

> PDF de referência: `Rulebook 1.2` — 102 páginas, formato quadrado 820×820pt, InDesign 18.2.
> Objetivo: leitor digital multiplataforma (Web/Desktop/Mobile), fiel ao PDF original (tipografia, texturas, vetores, ilustrações), 100% data-driven a partir de um banco editável, com sync OTA de erratas.

---

## 1. Princípio arquitetural

O erro mais comum nesse tipo de projeto é tratar o "PDF" como o dado. Ele não é — ele é só uma **das representações** do conteúdo. O dado real é:

```
Livro → Capítulos → Páginas → Blocos (texto, imagem, vetor, textura, grupo)
```

Cada Bloco tem: posição, tamanho, estilo, conteúdo, e a que página/z-index pertence. O PDF vira apenas **um dos alvos de exportação** (junto com Web, Mobile, etc.), não a fonte.

Isso significa: o banco de dados guarda a **estrutura semântica** do livro, e cada plataforma renderiza essa estrutura do seu jeito (fidelidade total no desktop, reflow no mobile).

---

## 2. Monorepo — estrutura de pastas

pnpm workspaces + Turborepo (mais leve que Nx pra esse escopo, ótimo suporte a builds paralelos e cache):

```
middara-app/
├── apps/
│   ├── web/                 # Next.js (App Router) — leitor web + SSR/SEO se público
│   ├── desktop/              # Tauri (Rust shell) envolvendo o build do web/
│   ├── mobile/                # Capacitor envolvendo o build do web/ (iOS/Android)
│   ├── admin/                 # Payload CMS ou Directus (editor de conteúdo)
│   └── api/                   # Backend Node (Fastify/NestJS) — se não usar CMS headless puro
├── packages/
│   ├── schema/                # Tipos TypeScript + Zod dos Blocos/Páginas/Erratas (fonte única de verdade)
│   ├── renderer/               # <PageRenderer /> + componentes de bloco (React, agnóstico de app)
│   ├── design-tokens/           # Fontes (Cinzel/Optima/Esmeralda), cores, texturas — CSS vars + assets
│   ├── sync-engine/              # Cliente OTA: checa versão, baixa JSON, grava cache local
│   └── ingest/                    # Scripts de migração: JSON legado → banco novo
├── data/
│   └── legacy_extraction/          # Seus JSONs/imagens extraídos do PDF (input do ingest)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Por que isso funciona:** `apps/web` é o único app que realmente "roda" a UI. `desktop` e `mobile` são wrappers finos (Tauri/Capacitor) que empacotam o mesmo build do `web`. Você escreve a UI uma vez em `packages/renderer`, consumida por `web`.

---

## 3. Backend & banco: CMS headless em vez de admin do zero

Construir um painel de edição visual (drag de blocos, upload de imagem, editor de texto rico) do zero é meses de trabalho. Recomendação forte: **Payload CMS** (Node/TypeScript, Postgres, se integra nativamente com seu monorepo) ou **Directus** (se preferir algo mais "no-code" pro admin).

Com Payload você define **Collections** (o schema abaixo) e ganha de graça:

- Painel admin para editar qualquer Bloco/Página
- Versionamento de documentos (rascunho vs publicado) — essencial pra erratas
- API REST/GraphQL automática
- Upload e transformação de imagens (gera variantes/otimizações)
- Auth de editores/roles

O `apps/api` só seria necessário se você precisar de lógica de negócio custom (ex: cálculo de diffs de erratas, geração de PDF via Puppeteer). Pode rodar como plugin do próprio Payload.

---

## 4. Modelo de dados (schema TypeScript)

```typescript
// packages/schema/src/types.ts

export type BlockType = 'text' | 'image' | 'vector' | 'texture' | 'group';

export interface Position {
  x: number;        // em pt, relativo à página original (820x820)
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex: number;
}

export interface TextStyle {
  fontFamily: 'Cinzel' | 'Optima' | 'Esmeralda' | string;
  fontSize: number;
  fontWeight?: number | string;
  color: string;           // hex, resolvido de um design-token
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}

export interface Block {
  id: string;               // slug estável, ex: page_008_block_003
  type: BlockType;
  position: Position;
  // modo "reflow": ordem de leitura no fluxo vertical (mobile)
  readingOrder: number;
  // conteúdo varia por tipo:
  content: TextContent | ImageContent | VectorContent | TextureContent | GroupContent;
}

export interface TextContent {
  kind: 'text';
  markdown: string;          // texto (pt-BR e outras traduções via i18n abaixo)
  style: TextStyle;
}

export interface ImageContent {
  kind: 'image';
  assetId: string;           // referência a um Asset (armazenado no CMS/CDN)
  alt: string;
  fit: 'cover' | 'contain';
}

export interface VectorContent {
  kind: 'vector';
  assetId: string;           // SVG original
  tint?: string;             // permite reskin de cor sem novo asset
}

export interface TextureContent {
  kind: 'texture';
  assetId: string;
  repeat?: boolean;
  opacity?: number;
}

export interface GroupContent {
  kind: 'group';
  blockIds: string[];        // agrupamento (ex: ícone + legenda)
}

export interface Page {
  id: string;                 // page_008
  number: number;
  chapterId: string;
  backgroundAssetId?: string;  // pergaminho de fundo
  blocks: Block[];
  version: number;              // incrementa a cada errata publicada
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  pageIds: string[];
}

export interface Book {
  id: string;
  title: string;
  version: string;              // semver, ex: "1.2.4"
  chapters: Chapter[];
}

// --- Sistema de Erratas / OTA ---
export interface ErrataEntry {
  id: string;
  bookVersion: string;
  pageId: string;
  blockId?: string;
  changeType: 'text' | 'position' | 'asset' | 'new_block' | 'removed_block';
  before?: unknown;
  after: unknown;
  publishedAt: string;
  changelogNote: string;      // texto amigável mostrado ao usuário: "Corrigido erro na regra X"
}

// --- i18n (tradução, já que vocês têm .md traduzido) ---
export interface Translation {
  blockId: string;
  locale: string;              // 'pt-BR', 'en-US'
  markdown: string;
}
```

Isso vira as **Collections do Payload** quase 1:1 (Books, Chapters, Pages, Blocks, Assets, ErrataEntries, Translations).

---

## 5. Motor de renderização: dois modos

Esse é o ponto mais delicado do projeto.

### Modo Fidelidade (Desktop/Tablet — "olha e sente livro")

- Cada página renderiza como um **canvas de proporção fixa** (820×820 → escalado via CSS `aspect-ratio` + container query), com blocos posicionados via `position: absolute` usando `%` calculado a partir de `x/width original`.
- Fontes e texturas carregadas via `packages/design-tokens`.
- Zoom/pan tipo visualizador de PDF (pinch-zoom, scroll infinito entre páginas — pense em algo como o leitor da Adobe ou o Marvel Unlimited app).

### Modo Leitura (Mobile — reflow)

- Ignora `position` absoluto, usa `readingOrder` para empilhar os blocos em coluna única, com espaçamento responsivo.
- Imagens decorativas de fundo (texturas) viram apenas cor/gradiente sutil, não elemento posicionado.

```tsx
// packages/renderer/src/PageRenderer.tsx (rascunho)

type Mode = 'fidelity' | 'reflow';

export function PageRenderer({ page, mode }: { page: Page; mode: Mode }) {
  const blocks = mode === 'fidelity'
    ? page.blocks
    : [...page.blocks].sort((a, b) => a.readingOrder - b.readingOrder);

  return (
    <div
      className={`page page--${mode}`}
      style={mode === 'fidelity' ? { aspectRatio: '1 / 1' } : undefined}
    >
      {page.backgroundAssetId && mode === 'fidelity' && (
        <BackgroundTexture assetId={page.backgroundAssetId} />
      )}
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} mode={mode} />
      ))}
    </div>
  );
}

function BlockRenderer({ block, mode }: { block: Block; mode: Mode }) {
  const style = mode === 'fidelity'
    ? {
        position: 'absolute' as const,
        left: `${(block.position.x / 820) * 100}%`,
        top: `${(block.position.y / 820) * 100}%`,
        width: `${(block.position.width / 820) * 100}%`,
        height: `${(block.position.height / 820) * 100}%`,
        zIndex: block.position.zIndex,
        transform: block.position.rotation ? `rotate(${block.position.rotation}deg)` : undefined,
      }
    : { position: 'relative' as const };

  switch (block.content.kind) {
    case 'text':
      return <TextBlock style={style} content={block.content} />;
    case 'image':
      return <ImageBlock style={style} content={block.content} />;
    case 'vector':
      return <VectorBlock style={style} content={block.content} />;
    case 'texture':
      return <TextureBlock style={style} content={block.content} />;
    case 'group':
      return <GroupBlock style={style} blockIds={block.content.blockIds} />;
  }
}
```

Isso é deliberadamente simples — o ganho de "parecer Adobe" vem depois, em cima disso: micro-animações de virar página, sombra de profundidade no pergaminho, transições suaves de zoom.

---

## 6. Sincronização OTA (erratas)

Fluxo:

1. App consulta `GET /api/books/:id/version` no boot (ou periodicamente).
2. Se `remoteVersion > localVersion`, baixa `GET /api/books/:id/errata?since=localVersion` — retorna só o diff (lista de `ErrataEntry`).
3. `packages/sync-engine` aplica o diff no cache local (IndexedDB no web/desktop, SQLite via Capacitor plugin no mobile) e atualiza `localVersion`.
4. UI mostra notificação: *"Nova errata disponível — Regras de Combate corrigidas. Atualizar agora?"* (manual) ou aplica automático conforme preferência do usuário.

Você não precisa do GitHub como storage de conteúdo (como no prompt antigo) — o próprio backend/CMS já serve isso via API. Mantém tudo num lugar só, com controle de acesso e histórico.

---

## 7. Exportação futura para PDF

Como o dado é estrutural, gerar PDF depois é: renderizar cada `Page` em **modo Fidelidade** dentro de um Chromium headless (Puppeteer/Playwright) em resolução alta e exportar como PDF/imagem — sem precisar de nenhuma lógica nova, só reaproveitar o `PageRenderer`.

---

## 8. Plano de migração dos dados legados

Você já tem `page_XXX_dom.json` + `page_XXX_translated.md` + assets. O `packages/ingest` faz:

1. Lê cada `page_XXX_dom.json` → mapeia bounding boxes/fontes para o schema `Block[]` novo.
2. Casa cada bloco de texto com o markdown traduzido correspondente (por ordem/posição).
3. Sobe os assets (imagens/SVGs/texturas) para storage (S3/Cloudflare R2/local do CMS) e gera `Asset` com `assetId`.
4. Faz `POST` para o CMS/API criando `Book → Chapters → Pages → Blocks`.
5. Roda validação: compara contagem de blocos migrados vs. original, gera relatório de divergências pra revisão manual.

Esse script é o próximo grande entregável técnico — é ele que "traz o PDF pra dentro do banco".

---

## 9. Stack final recomendada

| Camada            | Escolha                                                 | Por quê                                                          |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Monorepo          | pnpm + Turborepo                                        | Leve, cache de build, ótimo com Next/Vite                        |
| Frontend core     | React + Vite (não Next, se não precisar SSR público) | Empacota melhor em Capacitor/Tauri                                |
| Desktop           | Tauri                                                   | Binário menor e mais rápido que Electron                        |
| Mobile            | Capacitor                                               | Reaproveita 100% do build web                                     |
| CMS/Backend       | Payload CMS (Postgres)                                  | Admin de graça + versionamento + API                             |
| Storage de assets | Cloudflare R2 ou S3                                     | Barato, CDN fácil                                                |
| Cache local       | IndexedDB (web/desktop) / SQLite via Capacitor (mobile) | Persistência offline-first                                       |
| Estilização     | CSS Modules ou Vanilla Extract                          | Controle total de texturas/temas, sem opinar layout como Tailwind |
| Animações       | Framer Motion                                           | Transições de página, zoom, dark mode                          |

---

## 10. Ordem de execução sugerida

1. Definir o `packages/schema` (contrato de dados) — trava tudo o resto.
2. Subir Payload CMS local com as Collections.
3. Escrever `packages/ingest` e migrar 3–5 páginas de teste (não as 102 de uma vez).
4. Construir `PageRenderer` em modo Fidelidade só pra essas páginas de teste, validar fidelidade visual.
5. Adicionar modo Reflow.
6. Só depois: wrappers Tauri/Capacitor, OTA sync, exportação PDF.
