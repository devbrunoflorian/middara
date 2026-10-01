# Detector de texto duplicado sobre artwork

- **Status:** correção visual localizada aplicada e comparada nas p. 56/74; scanner de 102 páginas implementado como triagem, precisão ainda insuficiente para mutação em lote.
- **Data/base:** 2026-10-01, branch `codex/book-visual-batch-audit`, criada de `master` atualizada em `33ee49f`.
- **Escopo inicial:** casos visuais das páginas 56 e 74, com controles nas páginas 4, 6, 7, 13 e 15.

## Objetivo e feedback do usuário

Identificar texto extraído do PDF que o viewer redesenha como HTML sobre texto já incluído em imagem/carta/arte, causando títulos e conteúdo duplicados ou embaralhados. O usuário estabeleceu esta como prioridade principal do processamento: encontrar, comparar e retirar da renderização os overlays indevidos, sem editar as imagens ou artwork na v1. As screenshots da p. 56 (cartas Combatant) e p. 74 (cartas/diagrama de personagem) são casos-alvo.

Regra 7 e auditorias anteriores mostram que falsos positivos são possíveis: texto legítimo ou parte do desenho pode ser marcado como `suspectedGhost`, e a p. 13 teve um heading real ocultado por engano. Portanto, nenhum sinal isolado nem `suspectedGhost` justifica ocultação automática.

## Método

1. Observar no PDF, no JSON e na implementação atual que texto/blocos correspondem às áreas sobrepostas nas p. 56 e 74.
2. Consultar PyMuPDF `Page.get_texttrace()` e `Page.get_bboxlog()` para obter sequência de pintura e bboxes de texto/imagens; medir a interseção, mas distinguir bbox geométrica de tinta realmente visível.
3. Comparar sequência texto/imagem, ordem dos objetos no PDF, presença de texto legível embutido na arte e screenshot do viewer. Tratar ordem anterior à imagem como indício de cobertura/rasterização, não prova suficiente.
4. Fazer inventário read-only nas 102 páginas. Saída: CSV/JSON em `tmp/` com página, bloco/linha/span, texto, bbox, objetos sobrepostos, sequência PDF, sinais, classificação/cautela e ação recomendada.
5. Calibrar positivos e controles: p. 56/74; texto legítimo e falsos positivos já documentados nas p. 4/6/7/13/15. Medir falsos positivos antes de qualquer mutação.
6. Somente após prova localizada, remover a linha HTML da camada de apresentação ou sinalizá-la como suprimida no viewer, mantendo fonte/dados de auditoria e texto selecionável no Admin segundo o fluxo existente. Não editar fundo PDF, raster, arte ou texto interno de carta na v1.

## Critérios de decisão

- **Duplicado confirmado:** conteúdo visível na imagem/arte coincide e está alinhado com a camada vetorial redesenhada pelo app, com comparação visual do PDF/app ou evidência de ordem/ocultação corroborante.
- **Candidato:** sobreposição ou similaridade textual sem prova visual conclusiva; permanece sem mutação e vai para revisão.
- **Texto legítimo:** aparece como conteúdo vetorial não coberto no PDF ou como legenda externa à imagem; preservar mesmo se estiver perto de artwork.
- Não generalizar correção de um tipo de carta para outras famílias de conteúdo. O lote encontra candidatos, revisão decide.

## Limites de segurança

- O script deverá ser read-only sobre PDF, JSON e banco. Resultados intermediários somente em `tmp/` ignorado.
- Não consultar nem modificar drafts, `localStorage` ou valores de tradução.
- Não gerar, retocar ou substituir artwork/imagens na v1.
- Sem push. A branch pode conter alterações locais para revisão; nenhuma supressão em lote será aplicada sem evidência e QA.

## Evidência, correções e resultados

- PyMuPDF 1.28.2 expõe `get_texttrace()` com `seqno` e `get_bboxlog()` com objetos `fill-image`, permitindo cruzar posição, ordem de pintura e texto sem alterar o PDF. Sequência depois de uma imagem local é indício, não prova; bbox de painel também cobre texto normal.
- Comparação headless PDF/app em escala igual confirmou p. 56: os títulos/rodapés das duas cartas inclinadas apareciam duas vezes no app e uma vez no PDF. Marquei quatro linhas em `page_056_dom.json` como `rasterizedDuplicate`; os dados continuam acessíveis no Admin, os cartões não foram alterados.
- Comparação igual confirmou p. 74: nomes/cópias da ficha da Nightingale e dos cards Summoning/Nirvana estavam impressos no fundo e redesenhados pela camada HTML, desalinhados. Marquei 95 linhas dentro dessas três artes em `page_074_dom.json`; mantive texto do app em cards Magic Staff, Cuirass e Zulfiqar e preservei as letras explicativas C/G/F e o D junto ao Cuirass. A captura final confirma títulos/nomes sem duplicação e conteúdo vetorial que ainda é necessário. O callout D à direita do card Nirvana permanece como retângulo preto, igual ao estado pré-correção; sua camada de fundo precisa de auditoria separada.
- Correção de abordagem documentada: um primeiro recorte amplo também suprimiu vetores legítimos nos cards Staff/Cuirass/Zulfiqar e ocultou letras de callout. A comparação com a referência mostrou esses falsos positivos; reduzi as regiões e incluí exclusões específicas antes de considerar a correção final. O script aplica flags de forma idempotente e limitada a regiões já verificadas.
- Adicionei `scripts/audit_artwork_text_overlays.py`, scanner read-only sobre 102 PDF/JSON, saída em `tmp/ghost-audit/all-pages.csv`. Resultado: 5.088 linhas candidatas em 78 páginas; 24 páginas sem candidato. Controles: p. 4 523, p. 6 111, p. 7 zero, p. 13 27, p. 15 48, p. 56 90 e p. 74 241. O grande volume e hits sobre painéis de fundo demonstram baixa precisão: não usar esses números para ocultar texto automaticamente.
- `textPaintedAfterImage` também tem estados `false/unknown`; mesmo o estado `true` gerou falsos positivos em parágrafos próximos a imagens compostas (p. 56). O CSV é uma fila de triagem, não um classificador concluído. A melhoria seguinte precisa classificar grupos/limites reais de artwork e correlacionar o raster presente com o conteúdo textual antes de reduzir a fila.
- `scripts/apply_audited_artwork_text_suppressions.py` registra/aplica apenas as caixas visuais confirmadas das p. 56/74. Nenhum artwork foi editado ou gerado. Não consultei drafts, localStorage ou valores de tradução.
- `npm run build -w apps/web` passou na verificação final e as quatro ferramentas Python passaram `py_compile`; `git diff --check` passou. Vite mantém o aviso conhecido de `/texture.png` (fica para resolução em runtime). Capturas headless finais p. 56/74 confirmaram nomes únicos e conteúdo necessário preservado. Artefatos comparativos estão em `tmp/ghost-audit/` (ignorado pelo Git).

## Próximo passo

Não generalizar os retângulos das p. 56/74. Melhorar o scanner para produzir grupos por imagem/região com uma fila menor e evidência visual; revisar primeiro as páginas com maior densidade de imagens/candidatos. Em tarefa separada, inventariar tipografia/hierarquia e regras de espaçamento. Manter artwork intocado na v1, sem push.
