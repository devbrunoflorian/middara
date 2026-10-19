# Projeto Pendente: Exportador do Livro Completo em PDF

- **Status:** PENDENTE
- **Prioridade:** ALTA
- **Escopo:** Pipeline Automatizado de Compilação das 102 Páginas em PDF Único
- **Área:** Pipeline de Exportação / Automação / Engenharia de PDF

---

## 1. Visão Geral

Com a validação da exportação de páginas individuais já concluída com sucesso (Projeto Concluído 09), o objetivo deste projeto é construir a esteira de orquestração automatizada que renderiza sequencialmente todas as 102 páginas do livro em português brasileiro, costura as páginas em um único volume mestre e gera uma publicação eletrônica e impressa completa.

---

## 2. Funcionalidades Planejadas

1. **Script de Orquestração Sequencial (`export_full_book_ptbr.mjs`):**
   - Execução em lote via Chromium headless com gerenciamento inteligente de memória (reaproveitamento de instâncias e limpeza de cache por página).
   - Renderização paralela ou semi-paralela configurável de acordo com os recursos da máquina de build.

2. **Costura de Páginas e Estruturação de Metadados com PyMuPDF:**
   - Unificação das 102 páginas em um arquivo `Middara_Rulebook_1.2_PTBR.pdf`.
   - Inserção de marcadores (*bookmarks / table of contents*) hierárquicos e clicáveis baseados no índice das páginas 2 e 3.
   - Preservação de numeração de páginas original nos metadados do leitor de PDF (numeração lógica coincidente com a física).

3. **Auditoria e Verificação Automatizada Pós-Build:**
   - Script de teste que varre o PDF gerado verificando:
     - Total exato de 102 páginas.
     - Nenhuma página com erro de renderização ou caixa em branco.
     - Preservação de textos como vetores pesquisáveis (não rasterizados).
     - Ausência de transbordamento visível de texto fora dos limites da página.

4. **Otimização de Tamanho de Arquivo:**
   - Compressão de streams de imagens sem perda de nitidez perceptível (WebP/JPEG de alta qualidade para fundos e ilustrações).

---

## 3. Critérios de Aceite

- Gerar o livro de regras completo em menos de 5 minutos via comando único no terminal (`npm run export:book`).
- O PDF gerado deve abrir instantaneamente em qualquer leitor padrão (Adobe Acrobat, Preview, navegadores) com índice funcional.
