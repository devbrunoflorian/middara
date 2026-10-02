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

Revisar as folhas restantes em lotes por classe de layout, registrar cada resolução por linha/região e verificar no browser as exceções e amostras de classe. As 480 folhas geradas não são 480 decisões: 26 regiões foram inspecionadas como calibração, e 454 folhas ainda não receberam revisão visual. `suspectedGhost`, interseção com imagem, ordem de pintura e similaridade aproximada não são prova suficiente. Manter as supressões confirmadas das p. 56/74 locais. Nenhuma regra desta triagem pode alterar artwork, drafts, localStorage ou banco.

## Verificação e limites

- Criei `scripts/audit_artwork_region_visuals.py`. Para cada região, gera uma folha com PDF original, `background.webp`, mapa de diferença e caixas candidatas numeradas, além de CSVs por linha e por região. Continua read-only: não modifica JSONs do livro.
- O comparador foi calibrado visualmente em 26 regiões das p. 13, 56 e 74, incluindo controles e linhas já confirmadas. Na p. 56, `Cave Sickle 1-3` aparece no PDF e no background (duplicata raster já confirmada); o heading `Cave Sickle` aparece no PDF mas não no background, então sua camada de texto deve ser preservada. Na p. 74, o texto de Summoning está no PDF e no background e segue com marca explícita já auditada. Na p. 13, os parágrafos perto de imagens aparecem no PDF mas faltam no background: são texto vetorial legítimo.
- Gerei folhas para as 480 regiões ainda pendentes em `tmp/ghost-audit/visual-review-all/` (ignorado pelo Git; ~63,5 MB). Isso torna a fila revisável, mas não significa que as 480 decisões estejam feitas. O CSV mantém os itens como `visual-review-required`.
- As diferenças de pixels se sobrepõem entre exemplos confirmados e texto legítimo; não há limiar seguro para ocultação automática. As folhas PDF/background também não substituem comparação final com a página renderizada no browser. Nenhuma supressão nova foi aplicada.
- `py_compile` passou para os scanners, o tracer gerou as 26 folhas esperadas e `git diff --check` passou. O agrupamento está publicado em `b3027f5`; o comparador foi commitado separadamente em `ac1e280` (`feat: render artwork ghost comparison sheets`). Este checkpoint documental será o commit seguinte.
- O comparador e o registro documental serão publicados por push normal, conforme autorização do usuário; sem force-push.
- Reexecutei o comparador nos positivos/controles das p. 13, 56 e 74: 26 folhas produzidas. Em p. 13, parágrafos e número da página aparecem no PDF, mas não em `background.webp`, confirmando que o fundo sozinho não determina se uma linha é ghost. A captura do viewer em 200% confirmou os cabeçalhos superiores `Adventure Mode Continued`, `Flags`, `Endings`, `Building a Store` e `Story Rounds`; a tentativa de avançar ao rodapé por `End` excedeu o tempo de interação, então esta captura não é QA integral da página.
- `python -m py_compile scripts/audit_artwork_region_visuals.py` passou; o tracer final gerou 26 folhas e seus CSVs em `tmp/ghost-audit/final-tracer-check/` (ignorado pelo Git). Nenhuma folha recebeu classificação automática nem nova supressão.
- Não declarar o livro concluído por scanner, build ou amostragem isoladamente. Cada padrão automatizado exige um tracer end-to-end e contraexemplos antes de expansão.
- Depois de cumprir a fidelidade inglesa, revisar/adaptar rules e skills preservando princípios úteis; só então iniciar a estrutura do glossário e dos drafts de tradução, conforme pedido anterior.

**Próxima ação:** revisar folhas em lotes por página/classe estrutural e registrar `confirmed duplicate`, `legitimate vector` ou `ambiguous` por linha/região. Só promover regras automáticas quando positivos e contraexemplos sustentarem a mesma decisão.
