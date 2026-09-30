# Skill: Comportamento Esperado da IA neste Projeto

Esta skill não é sobre código — é sobre como a IA (Gemini ou qualquer outra) deve se comportar trabalhando neste projeto especificamente, porque ele tem um risco real de "parecer certo mas não estar": dado complexo, layout denso, 102 páginas, e um usuário que não vai conferir célula por célula do JSON manualmente.

## Regra 1 — Testar pequeno antes de rodar grande, sempre
Nunca rodar uma operação nas 102 páginas de uma vez sem antes validar em uma amostra pequena (1 página de teste, depois 5-10). Isso vale para extração, para geração de componentes, para qualquer script em lote.

## Regra 2 — Números estranhos são bugs até prova em contrário
Se uma métrica sair muito fora do padrão esperado (uma página com 10x mais blocos que as vizinhas, um tempo de execução muito maior que o esperado, um arquivo muito maior/menor que o esperado), a IA deve **parar e investigar a causa antes de prosseguir ou de apresentar o resultado como pronto**. Não é aceitável reportar "extraí a página, deu 17 mil blocos" como se fosse um resultado normal.

## Regra 3 — Performance importa desde o protótipo
Antes de rodar algo em lote, considerar se a abordagem escala (ex: uma operação que demora 90 segundos numa página não escala para 102 páginas sem virar um problema prático). Preferir ferramentas rápidas (CLI nativa como `pdftoppm`) a bibliotecas Python de rasterização lenta quando o resultado é equivalente.

## Regra 4 — Limitações conhecidas se documentam, não se escondem
Toda heurística usada (ordem de leitura, conversão de cor, agrupamento de imagem) tem uma limitação conhecida. A IA deve declarar essa limitação explicitamente no momento em que a decisão é tomada, não deixar para o usuário descobrir depois que algo "não ficou perfeito".

## Regra 5 — Simplicidade antes de sofisticação
Preferir a solução mais simples que resolve o problema real (ex: CMS headless em vez de admin custom; retângulos simples como vetor, o resto como imagem) em vez de construir a solução mais "impressionante" ou "genérica possível". Complexidade se adiciona quando um caso real exigir, não antecipadamente.

## Regra 6 — Fidelidade visual se prova comparando, não se afirma
Nunca declarar que uma página "ficou idêntica ao original" sem ter de fato gerado o render de referência e comparado. Fidelidade é uma propriedade verificável, não uma expectativa.

## Regra 7 — Perguntar antes de assumir decisões estruturais caras
Decisões que são caras de reverter depois (schema de dados, escolha de CMS, formato de asset) devem ser confirmadas com o responsável do projeto antes de implementadas em escala — mesmo que a IA tenha uma opinião técnica forte sobre qual é a melhor escolha. Decisões baratas de reverter (nome de variável, organização de pasta interna) não precisam desse nível de confirmação.

## Regra 8 — Nenhuma tarefa é finalizada com erros de compilação ou lint pendentes
A IA NUNCA deve finalizar sua vez de fala, ou considerar uma tarefa concluída, deixando "problems" (erros de compilação TS/JS) ou "emphasized items" (warnings/erros de Linting) para trás nos arquivos recém-editados. Sempre execute verificações finais e garanta que não foram introduzidos novos bugs, erros de tipagem, ou imports não declarados. Se houver um problema no código que você escreveu, CONSERTE antes de enviar.
