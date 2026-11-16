# Revisão dirigida — exemplo de níveis de CRUOR (p. 32)

- Unidade: `p32-discipline-levels-example`, revisão da tradução previamente salva no Payload (`page_32_unit_p32-discipline-levels-example__pt-BR`).
- Evidência fonte: o PDF escreve `Level 3` por extenso e `LVL 1` / `LVL 2` abreviados. A tradução mantém “Nível 3” para a palavra por extenso e preserva as siglas `LVL 1` e `LVL 2`.
- Proposta PT-BR: `Exemplo: Um Aventureiro só pode aprender uma Disciplina CRUOR de Nível 3 se já tiver uma de LVL 1 e outra de LVL 2.` O segundo uso de “Disciplina CRUOR” fica recuperável pelo contexto; os spans em negrito de `LVL 1` e `LVL 2` permanecem.
- Estilos reconstruídos dos spans do PDF: `Exemplo:` em AGaramond Bold 12 pt; CRUOR e as duas ocorrências de LVL em Optima Bold 9 pt; os numerais 1 e 2 em Optima Bold 9 pt; o numeral 3 em Optima Bold 10 pt; demais palavras no peso e tamanho de origem.
- Copyfit real: **EXACT — 2 linhas no PDF / 2 no PageRenderer**, com fontes carregadas. A geometria foi lida da sobreposição PageRenderer da revisão pendente. As amostras renderizadas confirmam pesos regular e bold (400/700) em AGaramond/Optima. `LVL` e os numerais 1/2 continuam em spans separados e em negrito, com espaço visual entre sigla e número.
- **Estado histórico:** a unidade ficou pendente após a proposta inicial por conflito com a tradução humana existente; essa pendência foi encerrada em 2026-11-05. A review 639 foi aprovada e publicou a tradução humana #300, já revisada para seguir a decisão de `LVL`.
- A sigla `LVL → LVL` foi formalizada no glossário semântico Payload id 73, distinta de `Tier` id 58. Esta decisão não substitui outras ocorrências aprovadas de “Nível”.

**Resultado atual:** o PDF oficial usa `Level 3` por extenso e `LVL 1` / `LVL 2` como siglas. A tradução aprovada conserva `Nível 3` e `LVL 1` / `LVL 2`, com os spans tipográficos correspondentes. Review 639: aprovada; copyfit EXACT, 2 linhas no PDF-fonte e 2 no PageRenderer. A página completa foi conferida contra o PDF oficial, o Viewer EN/PT-BR e o print em 2026-11-13; ver `page-status.csv` e as evidências `tmp/page-by-page-audit/page-032-*`.
