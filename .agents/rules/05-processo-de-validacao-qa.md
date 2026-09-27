# Skill: Processo de Validação e QA por Página

## Por que isso é uma skill separada
Numa migração data-driven de 102 páginas de um layout denso, o maior risco não é uma página sair errada — é um erro sistemático (heurística ruim, parâmetro de tolerância errado) se propagar silenciosamente pelas 102 antes de alguém notar. Esse processo existe para pegar isso cedo.

## Processo obrigatório para cada lote de páginas extraídas

1. **Gerar o render de referência** (raster do PDF original) para cada página do lote, antes de olhar o JSON.
2. **Checklist quantitativo** (ver Skill 01, Regra 3) — contagem de blocos por tipo é plausível?
3. **Inspeção visual de pelo menos 1 página "normal" e 1 página "atípica" do lote** (a que tiver mais imagens, mais colunas, ou mais elementos decorativos). Páginas atípicas escondem os bugs que páginas simples não revelam.
4. **Registrar limitações conhecidas por página** num arquivo simples (`data/legacy_extraction/known_issues.md` ou equivalente) — ex: "página 4: fotos de produto mescladas por cluster, pode ter pequenas imperfeições de recorte nas bordas; página 15: ordem de leitura não valida em duas colunas". Isso não é burocracia — é o que impede o mesmo problema de ser "redescoberto" e re-debugado do zero depois.
5. **Só aumentar o tamanho do lote depois que o lote atual passar no checklist.** Sequência sugerida: 5 páginas → revisar → 10 → revisar → 25 → revisar → 102.

## Critério de "página pronta" (Definition of Done)
Uma página só é considerada migrada quando:
- [ ] Renderiza no modo Fidelidade visualmente equivalente ao PDF original (comparação lado a lado feita, não assumida)
- [ ] Todo texto legível está presente e com a fonte/cor/tamanho corretos
- [ ] Nenhuma "explosão" de blocos sem explicação
- [ ] `readingOrder` foi conferido manualmente se a página tem mais de uma coluna
- [ ] Qualquer limitação conhecida está documentada, não escondida

## O que fazer quando um número parece errado
Nunca ajustar o pipeline "no escuro" pra fazer o número parecer melhor. Investigar a causa raiz primeiro (abrir o JSON, contar por tipo, olhar a imagem de referência, checar se é um padrão conhecido do PDF como malha de gradiente ou kerning agressivo) e só então decidir a correção. Aceitar um número estranho sem entender por quê é a forma mais comum desse tipo de projeto sair "quase certo" e demorar o dobro pra consertar depois.
