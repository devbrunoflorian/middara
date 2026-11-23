# Projeto Concluído: Exportação do Livro Completo em PDF

- **Status:** ENTREGUE; PDF atualizado em 23/11/2026
- **Escopo:** exportar as 102 páginas PT-BR em um PDF pesquisável com a geometria do OG
- **Área:** Exportação / PDF

## Entrega

- PDF final local: `output/pdf/middara-rulebook-pt-BR-final-2026-11-23.pdf` (102 páginas; a versão de 22/11 foi preservada como rollback).
- Em 23/11, somente as páginas 13, 45 e 64 foram reexportadas após mudanças publicadas posteriores ao PDF de 22/11. As três passaram pela comparação OG/Viewer/print antes de substituir suas páginas; não foi repetida a renderização completa.
- 102 páginas. MediaBox, CropBox, BleedBox, TrimBox e ArtBox conferidos contra as 102 páginas do PDF-fonte; nenhuma diferença.
- 40 bookmarks hierárquicos derivados do Sumário da página 3, com destino validado.
- Exportação full-book reuniu 2.438 traduções PT-BR persistidas; o relatório registrou zero símbolos desconhecidos, zero elementos fora da página e zero páginas vazias de diagnóstico.
- Extração independente do PDF: 324.468 caracteres, nenhuma ocorrência de U+FFFD e nenhuma referência de fonte sem `/ToUnicode`.
- Após a atualização incremental, a extração do PDF final contém 324.305 caracteres selecionáveis em 102 páginas, sem U+FFFD; contagem de páginas, caixas, bookmarks e texto das páginas substituídas foi conferida após a montagem.
- Correção final da página 97 publicada pelo fluxo de aprovação e incorporada sem reconstruir as outras 101 páginas. A frase de Plank está completa, na mesma linha do OG.

## Limites e continuidade

- A renderização completa levou aproximadamente 7 minutos, acima da meta antiga de 5 minutos. Como esta entrega é um PDF comunitário e a compilação é pontual, a otimização fica como melhoria futura, sem bloquear o uso.
- O PDF contém texto pesquisável/selecionável, mas não tem campos de formulário. A edição de texto pelo Acrobat Pro não foi verificada: o Acrobat não está instalado neste ambiente. Esse teste segue no [projeto PUA e editabilidade no Acrobat](../pendentes/10-pua-fontes-especiais-e-editabilidade-acrobat-pro.md).
- A conclusão da exportação não fecha a revisão visual das 102 páginas. A p.64 ainda mostra o Optima regular mais pesado que no OG, tanto na reconstrução EN quanto na PT-BR; isso já aparecia no PDF de 22/11 e segue aberto para investigação tipográfica, sem compensação local de peso. O acompanhamento editorial continua no [status por página](../../docs/translations/page-status.csv), no projeto de [localização integral](../pendentes/01-localizacao-integral-das-paginas-13-a-102.md) e na [auditoria tipográfica](../pendentes/09-auditoria-de-metricas-tipograficas-e-fidelidade-de-cores.md).
