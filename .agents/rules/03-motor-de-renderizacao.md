# Skill: Motor de Renderização (`PageRenderer`)

## Dois modos, sempre os dois
Todo componente de renderização de bloco precisa suportar dois modos desde o início — não implementar só "fidelidade" e deixar "reflow" pra depois, porque isso normalmente força retrabalho de toda a árvore de componentes:

- **Fidelidade** (desktop/tablet): posição absoluta em `%`, calculada a partir da posição original em pt dividida pelo tamanho da página (`x / pageWidth × 100`). Nunca usar pixels fixos — a página tem que escalar mantendo proporção (`aspect-ratio` fixo).
- **Reflow** (mobile): ignora `position`, empilha os blocos em coluna única ordenados por `readingOrder`.

## Regras de posicionamento
1. **Nunca hardcode o tamanho da página** (ex: `820`) espalhado pelo código — ler de `page.pageSize`, porque nem toda página do documento necessariamente tem exatamente o mesmo tamanho (verificar, não assumir).
2. **z-index segue a ordem de desenho do PDF**, não uma ordem arbitrária. Background/textura sempre no fundo, vetores de moldura acima, texto por cima de tudo — mas dentro de cada categoria, respeitar a ordem original.
3. **Zoom e pan no modo fidelidade devem ser suaves e nativos da plataforma** (pinch-zoom em mobile/tablet, scroll com wheel+drag no desktop) — esse é o requisito de "parecer um livro arcano moderno", não estética decorativa isolada.

## O que NÃO reconstruir como geometria
Curvas ornamentais complexas (florões, bordas decorativas desenhadas em Bézier) vêm do schema como blocos de imagem/SVG, não como formas vetoriais reconstruídas primitiva por primitiva. Tentar recriar isso com `<path>` do zero é desperdício de esforço e risco de infidelidade visual — usar o asset extraído.

## Fontes no renderer
Toda fonte usada num bloco de texto deve estar disponível via `@font-face` **antes** do primeiro render daquela página — evitar FOUT (flash of unstyled text) em algo que precisa parecer um livro premium. Pré-carregar as fontes da página atual e da próxima (prefetch) no modo fidelidade.

## Validação obrigatória antes de considerar uma página "pronta"
Renderizar a página no modo fidelidade e comparar lado a lado com o render de referência do PDF original (gerado na extração). Isso não é opcional nem "depois eu confero" — é parte do Definition of Done de qualquer página migrada.

## Performance
Páginas com muitos blocos (uma página real deste documento já chegou a ~5.500 blocos numa extração naive antes de otimização) não podem re-renderizar tudo a cada interação. Usar virtualização/memoização por bloco (ex: `React.memo` em `BlockRenderer`) desde o início, não como otimização tardia.
