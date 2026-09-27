# Implementation Plan & Hard Rules: Realbox & Sidebar Editor

## Objetivo
Refatorar a engine de edição do Middara Rulebook App. O editor deixará de ser um Modal bloqueante e se tornará uma **Sidebar**, permitindo **Live Preview nativo** (a própria página reflete a edição em tempo real). O foco máximo é a retenção da grade exata do PDF.

## 🚫 Hard Rules & Lessons Learned (NÃO QUEBRAR)

### 1. Constraints over Freedom: Line-by-Line Editing
Nós tentamos fundir Blocos (PyMuPDF) em parágrafos contínuos. **Falhou miseravelmente**. O PyMuPDF agrupa colunas inteiras e headers distintos num mesmo "bloco" ("massaroca").
*   **Regra de Ouro:** NUNCA tentar fundir blocos do PyMuPDF ou ser mais inteligente que ele. A edição DEVE ser estritamente Linha por Linha (`LineRenderer`).
*   **Comportamento:** O usuário clica em uma `Line` e a edita. O texto não quebra automaticamente para formar parágrafos (usar `white-space: pre`). O usuário controla quebras cortando/colando na linha de baixo, mantendo a estrutura 1:1 original.

### 2. Vertical Overlap & Font Metrics (The "Adobe Garamond Pro" Bug)
Quando instalamos a fonte real "Adobe Garamond Pro", as linhas começaram a colidir/esmagar umas sobre as outras. Isso ocorreu porque a métrica CSS interna de `line-height` dessa fonte é colossal.
*   **Regra de Ouro:** `LineRenderer` DEVE sempre ter `lineHeight: 1` fixado. Isso obriga a caixa do CSS a ficar do tamanho da fonte (`13px`), impedindo o texto de vazar para cima e para baixo do seu `bbox` original do PDF.

### 3. Rendering Fidelity (Zero Shifts)
Quando substituímos o texto original pela tradução "Realbox", ele não pode pular de posição ("solavancos").
*   **Regra de Ouro:** O contêiner de uma linha ativa para edição DEVE manter exatamente as mesmas propriedades físicas que uma linha não editada: `height`, `width`, `top`, `left`, e `display: flex; align-items: baseline`. Não mudar para `height: auto` ou `display: block`.

### 4. Layout: The Sidebar Push
Abrir a Sidebar de edição não pode reduzir a escala (`scale`) da página, pois isso a torna ilegível.
*   **Regra de Ouro:** Não usar `Math.min` reduzindo o container width. Ao invés disso, aplique `marginLeft: 20px` na `page-container`. A página vai colar na borda esquerda da tela, o zoom fica preservado em 100%, e a direita acomoda a Sidebar. O conteúdo excedente ganha um `overflow-x: scroll` natural.

## Próximos Passos
- Concluir testes exaustivos na Página 2 (texto cursivo, títulos em PUA).
- Expandir fontes PUA para suportar acentuação pt-BR.
