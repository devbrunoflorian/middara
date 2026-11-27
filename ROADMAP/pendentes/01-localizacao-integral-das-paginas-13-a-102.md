# Projeto Pendente: Localização Integral das Páginas 13 a 102

- **Status:** TRADUÇÃO PT-BR DAS 102 PÁGINAS EXPORTADA; REVISÃO VISUAL FINAL EM ANDAMENTO
- **Prioridade:** ALTA (Caminho Crítico)
- **Escopo:** Páginas 13 a 102 do Livro de Regras Oficial Middara 1.2
- **Área:** Tradução / Revisão Editorial / Copyfit QA

---

## 1. Visão Geral

Em 27/11/2026, o Payload contém 2.443 traduções PT-BR persistidas, sem propostas provisórias na exportação. As páginas 31, 88 e 99 não têm prosa editável e são arte/fólio. O PDF digital completo de 102 páginas foi exportado para `output/pdf/middara-rulebook-pt-BR.pdf`. A tradução de regras está preenchida no livro; o trabalho pendente deste projeto é revisar o PDF contra o OG, resolver os alertas reais de geometria e fechar a certificação página a página. A lista de páginas ainda sem certificação está em [`docs/translations/page-status.csv`](../../docs/translations/page-status.csv).

Os três lotes abaixo registram o plano original de cobertura e servem como contexto. Eles não representam páginas ainda sem tradução.

---

## 2. Estrutura de Entregas por Lotes

Para garantir entregas incrementais contínuas e controle de qualidade rigoroso, o restante do livro está dividido em três lotes estratégicos:

### Lote 1: Mecânicas Centrais de Jogo e Combate (Páginas 13 a 35)
- **Foco:** Estrutura da Rodada, Fase de Manutenção, Movimento, Ações Básicas e Ataques.
- **Desafios:** Alto volume de termos técnicos com símbolos inline (`[dice_red]`, `[sp]`, `[exhaust]`, `[bounty]`).
- **Páginas Chave:**
  - Página 13: Estrutura do Turno e Recompensas (*Bounties*).
  - Páginas 14 a 22: Linha de Visão, Movimentação e Terrenos.
  - Páginas 23 a 35: Resolução de Combate, Dados de Defesa, Dano e Armaduras.

### Lote 2: IA de Inimigos, Efeitos e Habilidades (Páginas 36 a 65)
- **Foco:** Algoritmos de Comportamento dos Monstros, Diagramas de Fluxo de IA, Condições de Status e Disciplinas.
- **Desafios:** Tabelas complexas com restrições rígidas de diagramação onde o texto traduzido precisa manter alinhamento milimétrico com setas de fluxo.

### Lote 3: Campanha, Apêndices e Índice Remissivo (Páginas 66 a 102)
- **Foco:** Regras de Campanha, Melhorias entre Encontros, Glossário Final e Índice Remissivo Completo.
- **Desafios:** Ajuste das 13 páginas de regras que atualmente não possuem propostas da comunidade (tradução do zero) e sincronização do índice com a nova paginação/terminologia em PT-BR.

---

## 3. Critérios de Aceite e Qualidade

1. **Paridade Copyfit:** 100% dos blocos avaliados no padrão `EXACT` ou `UNDER` controlado via `measure_copyfit_all.mjs`.
2. **Conformidade com o Glossário:** Zero desvios de termos consagrados (ex: "Fase de Manutenção", "Exaustar", "Veja pág. X").
3. **Persistência no Payload:** Todas as propostas revisadas integradas no banco e marcadas como aprovadas.
