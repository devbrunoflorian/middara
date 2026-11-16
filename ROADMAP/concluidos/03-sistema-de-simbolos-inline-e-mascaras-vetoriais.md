# Projeto Concluído: Sistema de Símbolos Inline, Glifos PUA e Máscaras Vetoriais

- **Status:** CONCLUÍDO
- **Escopo:** Catálogo de Símbolos / Regra 14 / Renderização Vetorial
- **Área:** Design System / SVG / Tipografia Simbólica

---

## 1. Visão Geral

O Middara Rulebook possui uma quantidade massiva de símbolos embutidos no meio do fluxo do texto: dados coloridos (preto, vermelho, azul, verde, amarelo, roxo), faces de dados com valores, escudos, caveiras de combate, totens de várias cores, ícones de condição (**EXHAUST**, **DISCARD**), marcadores de referência alfabéticos em caixas quadradas e o raio de **IMPORTANT**.

Este projeto substituiu fontes PUA cruas e recortes isolados por um sistema unificado, semântico e robusto.

---

## 2. O que foi Entregue

1. **Catálogo Semântico Centralizado (`symbols.json`):**
   - Mais de 111 símbolos e variantes inventariados e mapeados por identificadores semânticos estáveis (ex.: `dice.black`, `combat.shield.solid`, `combat.skull`, `tag.important.icon`, `action.exhaust`, `token.blue-totem`).
   - Definição precisa de métricas tipográficas por símbolo: largura em em (`widthEm`), altura (`heightEm`), alinhamento vertical (`verticalAlignEm`), avanço horizontal e *baseline offset*.

2. **Renderização Vetorial e Eliminação de Bordas Parasitas:**
   - Vetores SVG precisos para componentes inline no PageRenderer e no RichSpanEditor.
   - Resolução definitiva de halos circulares e bordas raster residuais através do ajuste de `sourceMaskClipPath` e *inset antialias*.

3. **Compatibilidade e Transparência na Tradução:**
   - Os tradutores não precisam memorizar caracteres estranhos ou códigos hexadecimais: utilizam marcadores semânticos claros como `[[dice.black]]` ou selecionam diretamente no editor.

---

## 3. Impacto no Sistema

- Símbolos fluem perfeitamente dentro do texto traduzido sem quebrar linhas indevidamente ou sofrer distorções em zoom.
