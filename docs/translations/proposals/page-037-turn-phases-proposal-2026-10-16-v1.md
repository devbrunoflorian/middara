# p.37 — Fases do Turno — proposta parcial v1

- **Status:** quatro unidades propostas; as duas unidades da Fase de Início do Turno foram traduzidas nesta fatia e as duas da Fase de Ação foram recuperadas da proposta anterior. Revisão humana pendente.
- **Fonte:** PDF EN oficial, p.37/102; SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.
- **Arquivo estruturado para revisão no app:** [`JSON v1`](page-037-turn-phases-proposal-2026-10-16-v1.json).
- **Persistência:** nenhuma gravação na coleção `translations`, no sidecar ou na tradução humana existente.

## Unidades propostas

| Unidade | Inglês da fonte | Proposta PT-BR |
|---|---|---|
| `p37-block-15-first-size-12pt` | `1. Start of Turn Phase:` | `1. Fase de Início do Turno:` |
| `p37-block-15-remaining-size-10pt` | `Resolve Abilities and Effects that occur at the start of a turn.` | Resolva as Habilidades e os Efeitos que ocorrem no início do turno. |
| `p37-block-21-heading-size-12pt` | `4. Action Phase:` | `4. Fase de Ação:` |
| `p37-block-21-body-size-10pt` | Texto completo da regra da Fase de Ação, com os dois `SP` em negrito. | Durante a Fase de Ação, um Aventureiro pode gastar **SP** para realizar Ações e/ou usar Habilidades. Quando decidir que não quer mais gastar **SP** nem realizar Ações ou usar Habilidades, o Aventureiro segue para a Fase de Fim do Turno. |

As fontes são blocos tipográficos independentes. Os tamanhos, fontes, cores, pesos, bboxes e níveis de linha de origem estão preservados no JSON. O par da Fase de Ação tem prova prévia no Viewer PT-BR, Editor read-only e PDF isolado; o novo par da Fase de Início ainda não foi validado tecnicamente neste ciclo.

## Limites desta fatia

- As traduções humanas existentes de heading/body do subpasso A da página 37 permanecem intactas e fora desta proposta.
- O callout IMPORTANT `block_19` segue excluído porque sua composição/copyfit continua bloqueada.
- As fases de Status, Refresh, subpasso B, Fim do Turno, Example, textos explicativos da coluna direita, callout e TIP ainda não estão traduzidos nesta fatia. A arte impressa nos cards continua separada da prosa.
- As escolhas “Fase de Início do Turno”, “Habilidade”, “Efeito” e “Resolver” são propostas locais, ainda não decisões globais do glossário.
- A fonte visual confirma a posição e a hierarquia do par proposto. Nenhuma validação PT-BR do par novo é reivindicada; a página completa segue sem certificação.

## Histórico e próxima fatia

A proposta anterior da Fase de Ação está em [`v1`](page-037-action-phase-v1.md), com comparação do PDF EN, Viewer EN, Viewer PT-BR e PDF PT-BR em [evidência visual](../../../output/proofs/translation-readiness-2026-10-15/p037-action-phase-v1/p037-action-phase-comparison-v1.png). A próxima fatia pode cobrir o Status Phase ou o exemplo de Refresh, mantendo o callout bloqueado fora da prova.
