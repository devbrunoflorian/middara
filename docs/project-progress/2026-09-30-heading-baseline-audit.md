# Tarefa: auditar o alinhamento vertical dos títulos decorativos

- **Status:** ajuste aplicado à fonte e ao override traduzido; usuário aprovou visualmente a página 2 em 2026-09-30. A regra é uma heurística e ainda precisa de avaliação individual nas outras páginas.
- **Data:** 2026-09-30.
- **Referência:** PDF original na página 2, título “Introduction”.

## Evidência e causa

- O PDF tem 102 páginas. Em `page_002_dom.json`, “Introduction” preserva a fonte `EsmeraldaPro`, tamanho 30 pt e bbox `[328.37, 56.13, 492.23, 96.99]`.
- PyMuPDF retorna os mesmos limites e a origem tipográfica do título `(328.37, 88.14)`. O extrator grava `bbox`, mas descarta `origin`; o renderer posiciona a linha pela bbox e o navegador alinha o texto pelas métricas internas da fonte.
- Isso explica a diferença vertical reportada: bbox de tinta e baseline/metrics da fonte não são a mesma referência. O mesmo padrão de título em Esmeralda aparece em outras páginas; a varredura dos 102 JSONs encontrou 17 candidatos de 30 pt mais quatro nomes/títulos grandes semelhantes. Artefatos `EsmeraldaPro-Identity-H` foram excluídos como fontes de glifos especiais.
- `.agents/skills/visual-fidelity-qa/SKILL.md` já descrevia esse problema e sugeria deslocamento local de 12–15%, mas o renderer não tinha a regra. O texto da skill estava incorreto ao afirmar que a correção já estava implementada.

## Mudança

Foi aplicada uma regra local e restrita no `LineRenderer`: spans `EsmeraldaPro` não-Identity-H com tamanho >=25 pt e bbox de altura >=1.25× o tamanho recebem `display: inline-block` e `translateY(12%)`. A mesma compensação é usada no preview traduzido quando o span de origem é um título com esse perfil e o segmento traduzido continua em Esmeralda. Isso limita o deslocamento a títulos grandes com métricas altas e não afeta Garamond, Cinzel, corpo ou glifos Identity-H.

A varredura dos 102 JSONs identificou 21 spans grandes de texto em Esmeralda (17 de 30 pt e quatro títulos/nomes entre 26–29 pt), além de sete glifos especiais `EsmeraldaPro-Identity-H` excluídos. Dezessete spans grandes aparecem em 13 páginas no topo como candidatos a heading. O ajuste foi baseado em classe tipográfica, não aplicado a todos os títulos indiscriminadamente.

## Limite de validação

A aba local 8080 está bloqueada por uma preferência de acesso salva no browser, então não foi feita inspeção automatizada do novo render. O usuário aprovou visualmente a página 2 após a compensação chegar também ao caminho de override traduzido; o percentual de 12% não deve ser copiado para outras famílias ou contextos sem verificar cada ocorrência.

## Revisão da abordagem CSS

A skill `modern-web-guidance` foi consultada. O guia `precise-text-alignment` descreve `text-box-trim` para remover o leading interno da fonte em headings e labels, mas isso alinha o texto às métricas tipográficas CSS — não reconstrói a baseline que o PyMuPDF reporta no PDF. O guia também registra suporte incompleto no Firefox. Portanto, não tratei essa propriedade como correção equivalente para a geometria do PDF. A compensação `translateY(12%)` é um ajuste visual heurístico, não prova matemática; a solução estrutural futura é preservar a origem/baseline tipográfica no JSON e renderizar com uma regra ancorada nela. Mantive o candidato restrito para permitir comparação da UX sem alterar o extrator em lote.

## Próximo passo

O build final `npm run build -w apps/web` passou; lint não teve erros (somente warnings já existentes), e `git diff --check` passou. O usuário aprovou a página 2. O ajuste estrutural futuro mais confiável ainda é exportar a baseline do PDF; até lá, qualquer ocorrência noutra página exige comparação própria e não herda automaticamente esta compensação.
