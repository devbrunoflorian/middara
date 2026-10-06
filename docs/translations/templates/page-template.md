# Página NNN — Título EN

- **PDF:** versão/nome, índice PDF e número de página impressa.
- **Estado:** SOURCE_PENDING | STRUCTURED_EN_PASS | PT_DRAFT | LANGUAGE_PASS | LAYOUT_PASS | READY | PARTIAL | BLOCKED.
- **Render fonte:** caminho da captura direta do PDF e resolução/data.
- **Mapa de leitura:** ordem de colunas/regiões e IDs de bloco/linha.
- **IDs semânticos:** IDs confirmados; faltas marcadas `UNMAPPED_INLINE`.
- **Exceções abertas:** nenhuma ou lista com evidência e próximo passo.

## Mapa visual e decisão

| Ordem | Ref. PDF (bloco/linha/bbox) | Região | Classe | Tratamento |
| ---: | --- | --- | --- | --- |
| 1 | `block_N / line_N` | coluna/região | texto / inline / tabela / furniture / arte / unknown | traduzir / token / preservar / revisar |

## Unidade EN → PT-BR

### Unit `pNNN:block_N`

**Região/fonte:** coluna, bbox e estilos/runs relevantes.

**EN:** texto estruturado igual ao PDF. Use `{{symbol:semantic.id}}` no lugar dos elementos inline.

**PT-BR (rascunho):** tradução correspondente, com o mesmo token semântico e função da ênfase.

## Não-texto, arte e incertezas

| Ref. PDF | Classe | Evidência visual/estrutural | Decisão/pergunta |
| --- | --- | --- | --- |

## Termos e copyfit

- Glossário oficial aplicado:
- `TERM_REVIEW`:
- Alertas de expansão:
- Molduras/pontos DTP para preview:
- Ação concreta, se não couber:

## Aceite

- EN↔PDF:
- PT linguístico/terminologia:
- Inventário inline:
- Preview PT:
- Exceções restantes:
- Estado final e evidência:
