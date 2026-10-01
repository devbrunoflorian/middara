# Critérios compartilhados para concluir a fidelidade inglesa

- **Status:** decisões de aceite alinhadas; execução continua na branch `codex/book-visual-batch-audit`.
- **Objetivo:** terminar a fidelidade inglesa nas 102 páginas com um método replicável, sem assumir que todos os problemas se repetem em todas as páginas.
- **Método acordado:** varrer todas as páginas com verificadores específicos por classe; comparar com o PDF os candidatos sinalizados; inspecionar no app todas as exceções/de alto risco e uma amostra de cada tipo de layout. Uma ausência de sinal automático não é, sozinha, prova de fidelidade visual.

## Decisões do usuário na sessão Grill Me

1. **Fantasmas confirmados:** usar supressão automática conservadora apenas quando houver evidência confirmada — marcação explícita revisada ou duplicata textual exata, na mesma região de artwork, dentro de um padrão já validado. Sobreposição, ordem de pintura, similaridade aproximada e `suspectedGhost` isoladamente são sinais de triagem, nunca autorização para ocultar.
2. **Casos ambíguos:** manter visíveis, registrar numa fila conjunta de revisão e continuar o trabalho seguro em paralelo. Agrupar decisões para revisão em lotes em vez de interromper o progresso a cada ocorrência.
3. **Portão de conclusão:** um candidato ambíguo ainda sem decisão permanece como pendência; a página não pode ser marcada fiel enquanto houver essa pendência. A fila deve guardar evidência suficiente (página, texto, bbox, recorte PDF/fundo/app quando disponível e razão da incerteza).

Essas escolhas consolidam feedbacks anteriores: tamanho de fonte diferente define fronteira de edição; manter peso, itálico, fonte, alternates e bbox provenientes do PDF; medir eixo/gutter `x₀` em layouts de colunas; arte composta fica intacta na v1. As correções são locais e manifestadas quando a evidência não autoriza regra geral.

## Tracer executado: fila por região de artwork

- O gerador anterior sinalizou 5.088 linhas em 78 páginas. Ampliei `scripts/audit_artwork_text_overlays.py` com `--regions-out`: agrupa por página/operação/bbox de artwork, conta evidências e exemplos textuais, mas não decide nem oculta nada.
- O passe inteiro preservou os mesmos 5.088 candidatos e produziu 488 regiões: 480 ainda precisam de comparação visual e oito já contêm apenas linhas com a marca explícita de duplicata revisada. A p. 56 caiu de 90 linhas para 13 regiões (duas regiões só com linhas já confirmadas); a p. 13 mantém quatro regiões como pendentes. A p. 74 tem nove regiões, oito com conteúdo ainda não confirmado.
- Tracer p. 13 (controle conhecido) + p. 56 (caso positivo): 117 linhas em 17 regiões. Nenhuma linha não revisada ganhou status de confirmação; as linhas explícitas p. 56 continuaram distinguidas. `py_compile` e `git diff --check` passaram. A saída completa está em `tmp/ghost-audit/all-regions-v2.csv` (ignorada pelo Git).

## Próxima fatia verificável

Produzir comparações visuais compactas por grupo (PDF, fundo do viewer e bboxes dos candidatos), revisar regiões em lotes com positivos e controles existentes e registrar cada resolução. `suspectedGhost`, interseção com imagem, ordem de pintura e similaridade aproximada não são prova suficiente. Manter as supressões confirmadas das p. 56/74 locais. Nenhuma regra desta triagem pode alterar artwork, drafts, localStorage ou banco.

## Verificação e limites

- Esta atualização registra decisões e plano; ainda não altera app, dados das páginas ou detector.
- O scanner/agrupamento foi salvo separadamente em `b3027f5` (`feat: group artwork ghost review candidates`). O commit documental desta rodada registrará a evidência e o handoff; a branch será publicada por push normal, sem force-push, sob autorização prévia do usuário.
- Não declarar o livro concluído por scanner, build ou amostragem isoladamente. Cada padrão automatizado exige um tracer end-to-end e contraexemplos antes de expansão.
- Depois de cumprir a fidelidade inglesa, revisar/adaptar rules e skills preservando princípios úteis; só então iniciar a estrutura do glossário e dos drafts de tradução, conforme pedido anterior.
