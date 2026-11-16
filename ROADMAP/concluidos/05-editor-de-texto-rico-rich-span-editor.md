# Projeto Concluído: Editor de Texto Rico (Rich Span Editor)

- **Status:** CONCLUÍDO
- **Escopo:** Componente `RichSpanEditor.tsx` / Edição de Spans / Formatação
- **Área:** Interface de Usuário / Edição WYSIWYG / Local-first

---

## 1. Visão Geral

O texto do Middara não é homogêneo: um mesmo parágrafo combina palavras em negrito, nomes de itens em itálico, números de dados coloridos, termos técnicos em caixa alta e símbolos embutidos. O `RichSpanEditor` foi desenvolvido para permitir edição granular de texto sem perder essa estrutura de estilos.

---

## 2. O que foi Entregue

1. **Edição Granular de Segmentos Ricos:**
   - Suporte a formatação run-by-run: família tipográfica, tamanho de fonte (pt), peso (*weight* 400 a 900), estilo (normal/itálico), cores hexadecimais e entrelinha (*line-height*).
   - Preservação de quebras de linha manuais e automáticas sem corromper a geometria do parágrafo.

2. **Integração de Símbolos e Marcadores:**
   - Barra de inserção de símbolos semânticos e tags (ex.: `[[dice.black]]`, `[[lightning]]`, `[[combat.skull]]`).
   - Mapeamento bidirecional entre texto plano marcado e árvore de segmentos ricos.

3. **Salvamento Local e Desfazer/Refazer (Undo/Redo):**
   - Histórico de edição em tempo real com controle total de `Ctrl+Z` / `Ctrl+Y`.
   - Armazenamento de rascunhos em memória de sessão e LocalStorage antes de submissão ao backend.
   - Sincronização segura com Payload CMS sem sobrescrever traduções alheias.

4. **Contexto de Glossário em Tempo Real:**
   - Exibição de termos aprovados do glossário oficial correspondentes ao texto em inglês selecionado, auxiliando o tradutor a manter consistência.

---

## 3. Impacto no Sistema

- Viabilizou a tradução humana e assistência de IA com fidelidade tipográfica integral parágrafo por parágrafo.
