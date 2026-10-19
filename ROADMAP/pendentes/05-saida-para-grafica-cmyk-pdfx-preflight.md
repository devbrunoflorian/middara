# Projeto Pendente: Saída para Gráfica (CMYK, PDF/X e Preflight)

- **Status:** PENDENTE
- **Prioridade:** MÉDIA
- **Escopo:** Preparação dos Arquivos para Impressão Gráfica Comercial Profissional
- **Área:** Engenharia de Impressão / Pré-Impressão / Gráfica

---

## 1. Visão Geral

Para permitir que a comunidade ou a editora imprima o livro de regras em gráficas profissionais (offset ou digital sob demanda), não basta um PDF digital RGB de tela. É necessário preparar um arquivo dentro dos rigorosos padrões industriais de pré-impressão: espaço de cores CMYK calibrado, sangria (*bleed*), marcas de corte e conformidade com a norma ISO PDF/X.

---

## 2. Funcionalidades Planejadas

1. **Margem de Sangria (*Bleed*) e Marcas de Corte:**
   - Adição configurável de sangria (3mm a 5mm além da borda de corte) para evitar bordas brancas após o refile na gráfica.
   - Geração de marcas de corte (*crop marks*) e marcas de registro centralizadas.

2. **Conversão de Cores e Perfis ICC (CMYK):**
   - Pipeline de conversão de imagens e vetores de sRGB para perfis gráficos padrão (ex: ISO Coated v2 / FOGRA39 para gráficas brasileiras/europeias ou GRACoL para gráficas americanas).
   - Conversão de textos em preto para Preto Puro (`K: 100%`, `C:0% M:0% Y:0%`) para evitar efeitos de fantasma (*registration black mismatch*) na impressão de pequenos corpos de texto.

3. **Conformidade PDF/X-1a e PDF/X-4:**
   - Validação de transparências, fontes 100% incorporadas e remoção de scripts ou anotações interativas incompatíveis com RIPs gráficos.

4. **Relatório Automatizado de Pré-Voo (*Preflight Report*):**
   - Verificação de TAC (*Total Area Coverage* / Cobertura Máxima de Tinta <= 300%).
   - Alerta para imagens com resolução inferior a 300 DPI na escala final de corte.

---

## 3. Critérios de Aceite

- Gerar um arquivo `Middara_Rulebook_1.2_GRAFICA_CMYK.pdf` aceito sem ressalvas em bureaus de impressão e gráficas de jogos de tabuleiro (Ludens Spirit, Copag, MakePlayingCards, etc.).
