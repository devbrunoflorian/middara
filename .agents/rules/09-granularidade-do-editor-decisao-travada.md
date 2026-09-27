# Skill: Granularidade do Editor de Tradução é Decisão Travada, Não Tentativa e Erro

## O que aconteceu (pra não esquecer o custo disso)
Nesta sessão, o sistema de edição de texto foi **completamente reescrito três vezes**, em produção, em tempo real, com o usuário testando cada versão quebrada:
1. Começou em nível de **Span** (linha/palavra individual) — `RichSpanEditor`.
2. Virou nível de **Bloco inteiro** (parágrafo) — `BlockEditor`, com fusão automática de blocos (`mergeBlocks`).
3. A fusão automática quebrou (juntou colunas inteiras erradas) → voltou pra nível de **Linha** (meio-termo).
4. No meio disso, ainda existiu uma tentativa de "Realbox" com `<p>` justificado, abandonada e revivida mais de uma vez.

Cada ida-e-volta exigiu reescrever `PageRenderer.tsx` inteiro, migrar o formato salvo no banco/localStorage (que ficou incompatível a cada mudança, apagando trabalho já feito), e o usuário ficou sem conseguir traduzir nada de verdade enquanto isso.

## Por que isso é um problema de processo, não só de código
Essa é exatamente a decisão que a **Skill 06, Regra 7** já pedia pra confirmar antes de implementar em escala ("decisões estruturais caras devem ser confirmadas antes"). A granularidade do editor é cara de reverter (muda o schema salvo, o componente de renderização, e a UX) — e mesmo assim foi decidida "no calor do momento", implementada, quebrada, revertida, reimplementada diferente, quebrada de novo.

## A regra daqui pra frente
**Granularidade de edição é uma decisão de arquitetura, e se toma UMA VEZ, por escrito, comparando as opções antes de escrever qualquer código:**

| Granularidade | Prós | Contras |
|---|---|---|
| Span/palavra | Fiel ao PDF, zero risco de estourar bbox | Tradutor não consegue reescrever a frase natural (idiomas têm ordem de palavra diferente) |
| Linha | Meio-termo, ainda amarrado à quebra de linha do PDF (que não faz sentido pra outro idioma) | Ainda quebra se a tradução for maior — obriga o tradutor a gerenciar quebra manual |
| Bloco/parágrafo | Tradutor escreve natural, o navegador cuida da quebra de linha | Precisa da "fusão de blocos" funcionar direito (o que quebrou), e a Realbox precisa calcular largura/altura reais |

**Decisão registrada agora, pra não reabrir esse debate implementando de novo:** a unidade certa é **Bloco/parágrafo**, porque é a única que sobrevive à tradução de verdade (frases mudam de tamanho entre idiomas — span e linha não aguentam isso). O problema da tentativa anterior não foi a escolha do Bloco, foi a **fusão automática de blocos ter sido malfeita** (juntou coisas que não deviam). A correção é consertar `mergeBlocks` (ou eliminar a necessidade dele extraindo blocos corretos desde a origem, ver Skill 01), não abandonar o nível de Bloco.

## Regra de processo pra evitar reincidência
Antes de reescrever a granularidade de qualquer sistema de edição/dado já em uso:
1. Escreve as opções e trade-offs num documento (como a tabela acima) **antes** de tocar no código.
2. Confirma a escolha com a pessoa responsável.
3. Só depois disso começa a implementar — e implementa pra terminar, não como experimento ao vivo que pode ser abandonado no meio.
