# Projeto Pendente: Editor Visual de Molduras de Layout

- **Status:** PENDENTE
- **Prioridade:** MÉDIA-ALTA
- **Escopo:** Ferramenta Interativa de Ajuste Fino de Caixas de Texto (Bounding Boxes)
- **Área:** Frontend / Ferramentas Administrativas / Layout Engine

---

## 1. Visão Geral

Embora a maioria das traduções em português se encaixe nas caixas de texto originais via Copyfit, algumas passagens com expansão natural do idioma português exigem microajustes nas molduras de texto (posição X/Y, largura, margens, altura de linha). Este projeto criará um manipulador visual interativo (*drag-and-drop / resize handles*) exclusivo para editores no modo Admin.

---

## 2. Funcionalidades Planejadas

1. **Manipuladores Visuais de Bounding Box:**
   - Ao selecionar uma unidade tipográfica em modo Admin, exibir guias e alças de redimensionamento nos 4 cantos e 4 lados da caixa.
   - Pré-visualização em tempo real do texto refluindo dentro da nova largura/altura.

2. **Ajustes Numéricos Finos via Painel Flutuante:**
   - Controles de passo para:
     - `x` e `y` em pontos tipográficos (pt).
     - `width` e `height` em pt.
     - `lineHeight` relativo ou absoluto.
     - `letterSpacing` (tracking) com resolução de 0.01em.
     - `padding` interno.

3. **Camada de Sobrecarga Não-Destrutiva (*Layout Overrides*):**
   - Os ajustes manuais serão salvos em uma camada de *overrides* no JSON da página (ex: `layout_overrides.json` ou campo específico no Payload), mantendo as coordenadas originais do PDF original 100% intocadas.
   - Botão de "Restaurar ao Padrão Original" para desfazer qualquer intervenção.

4. **Guias Magnéticas de Alinhamento (*Snapping*):**
   - Alinhamento automático às colunas originais do livro (grelha tipográfica de 2 colunas) e às caixas vizinhas.

---

## 3. Critérios de Aceite

- O editor deve conseguir ajustar a largura de um parágrafo que estouraria em 1 linha para eliminar a quebra sem tocar em código JSON manualmente.
- As mudanças devem ser imediatamente refletidas na exportação de PDF.
