# Projeto Concluído: Extração e Modelagem do PDF para DOM

- **Status:** CONCLUÍDO
- **Escopo:** 102 páginas do livro oficial Middara Rulebook 1.2
- **Área:** Engenharia de Dados / Pipeline de Extração / Backend

---

## 1. Visão Geral

Para permitir a tradução, diagramação e visualização do livro de regras sem depender de capturas de tela ou recortes manuais, foi desenvolvido um pipeline de extração de dados brutos a partir do PDF vetorial original da Succubus Publishing.

O projeto transformou dados complexos de impressão em estruturas JSON padronizadas (`page_XXX_dom.json`) consumidas pela aplicação web e pelas ferramentas de edição e exportação.

---

## 2. O que foi Entregue

1. **Pipeline de Extração com PyMuPDF e pdfplumber:**
   - Extração estruturada de blocos de texto, parágrafos, cabeçalhos e caixas de anotação.
   - Identificação de coordenadas exatas de caixas de tinta (*ink bboxes*) em pontos tipográficos (pt).
   - Identificação de famílias tipográficas originais, corpos de fonte, pesos, cores e alturas de linha (*line-height*).

2. **Modelagem de Dados e Normalização de DOM (`apps/web/public/pages/page_XXX/`):**
   - Criação de arquivos de estrutura `page_XXX_dom.json` cobrindo todas as 102 páginas do manual.
   - Isolamento de imagens de fundo e componentes de arte (`background.webp`, recortes de cartas e componentes físicos).
   - Modelagem de unidades tipográficas editáveis (*typographic units*), preservando hierarquias de listas e tabelas.

3. **Imutabilidade da Evidência da Fonte:**
   - As *source ink bboxes* e os textos originais em inglês foram travados como referência imutável de fidelidade (sob a Regra 02 do projeto), garantindo que correções futuras de tradução nunca apaguem os dados oficiais originais.

---

## 3. Impacto no Sistema

- Forneceu a base de dados fundamental que sustenta o `PageRenderer`, o `RichSpanEditor`, a central de revisão e o pipeline de exportação de PDF.
