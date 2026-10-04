# Roadmap: saída final para impressão e aplicativos

**Status:** objetivo final documentado; implementação adiada até a tradução PT-BR e a certificação visual do livro estarem concluídas.  
**Decisão de produto:** manter uma base de conteúdo e gerar saídas diferentes a partir dela: viewer interativo e PDF pronto para impressão.

## Objetivo

O Rulebook App deve conseguir entregar dois produtos coerentes:

1. um viewer web que preserve edição, hyperlinks, busca, áudio, voz e futuras animações;
2. um PDF fechado, previsível e validado para uma gráfica.

Um piloto separado de exportação de página individual já existe para investigar o caminho técnico. Seu processo e defeitos conhecidos estão em [`single-page-pdf-export.md`](single-page-pdf-export.md). Ele não altera a ordem do roadmap: terminar tradução e fidelidade vem antes da API de exportação ou da saída de gráfica.

O PDF de impressão não será uma captura de tela do browser. Ele deve ser composto a partir do mesmo modelo de página, com texto vetorial, fontes incorporadas, imagens rasterizadas na resolução final e regiões de componentes preservadas como imagens completas do PDF original. As cartas, tokens e outros componentes físicos continuam em inglês; a tradução PT-BR se aplica ao texto explicativo editável ao redor deles.

## O que a pesquisa confirmou

### CMYK é uma decisão de saída, não um formato universal

Uma gráfica precisa informar a condição de impressão: processo, papel, perfil ICC/output intent, sangria, marcas, limite total de tinta e requisitos de prova. Converter tudo para um CMYK genérico antes dessa informação pode mudar cores e produzir um arquivo que não corresponde ao equipamento real.

O perfil deve ser aplicado na exportação para aquela condição, mantendo o material-fonte em espaço de trabalho com maior alcance quando isso for útil. Perfis ECI, como PSO Coated v3 e PSO Uncoated v3, são referências possíveis, não uma escolha automática para esta obra.

### PDF/X é a família de entrega para gráfica

- **PDF/X-1a:** troca conservadora; aceita CMYK, tons de cinza e cores spot, exige fontes incorporadas e não aceita transparência viva. É uma opção de compatibilidade quando a gráfica pede um fluxo antigo ou explicitamente solicita X-1a.
- **PDF/X-4:** mantém transparência e recursos mais modernos, trabalha com fluxo gerenciado por ICC e exige output intent incorporado. É a opção inicial a avaliar para o exportador, desde que a gráfica confirme compatibilidade.
- O padrão escolhido, o perfil e a política de conversão serão parâmetros da exportação, nunca valores escondidos no código.

### Preflight precisa fazer parte do produto

Antes de entregar um arquivo, o sistema deve verificar fontes ausentes ou não incorporadas, texto estourado, imagens abaixo da resolução mínima definida para o tamanho final, sangria e marcas, espaços de cor misturados, output intent, transparência, sobreimpressão e limite de tinta. O resultado deve ser um relatório com erro, aviso ou aprovado por página e para o PDF completo.

### App e impressão têm requisitos diferentes

Hyperlinks, busca, áudio, leitura em voz alta e animações pertencem ao viewer. O PDF fechado precisa manter aparência estável mesmo sem JavaScript, rede ou fontes instaladas na máquina da gráfica. A mesma tradução e a mesma geometria de página alimentam os dois, mas cada saída tem seu próprio validador.

## Arquitetura planejada

### Fonte canônica

Preservar como dados versionados:

- geometria original do PDF e bboxes de tinta;
- texto EN, texto PT-BR e overrides por idioma;
- estilo e layout frame editável;
- sidecars `fidelity_overlays.json` e recortes de componentes;
- fontes licenciadas e metadados de origem;
- glossário e decisões de tradução.

Nenhum exportador deve reextrair o PDF nem inferir novamente quais cartas são imagens. A regra de componentes físicos em inglês continua sendo uma propriedade explícita dos overlays.

### Saídas

**Viewer web / PWA**

- HTML editável para texto explicativo;
- imagens de componentes em regiões protegidas;
- hyperlinks, busca, navegação e acessibilidade;
- camada opcional de voz, áudio e animações;
- dados locais e sincronização remota com estado explícito.

**Desktop e mobile**

- empacotar o mesmo viewer depois que a saída web estiver estável;
- escolher tecnologia de instalação e distribuição somente após medir offline, cache, tamanho e atualização;
- não duplicar conteúdo ou regras de tradução em cada plataforma.

**PDF para gráfica**

- tamanho físico do livro, sangria e marcas conforme o fornecedor;
- texto como vetor e fontes incorporadas;
- imagens com resolução adequada ao tamanho físico;
- componentes preservados como recortes originais;
- PDF/X, perfil ICC/output intent e conversão de cor escolhidos por preset de gráfica;
- relatório de preflight e prova rasterizada para comparação visual.

**Piloto de página individual (não é saída final)**

- usa o viewer e as traduções persistidas para imprimir uma página em PDF vetorial/raster;
- é uma ferramenta de investigação manual; não há endpoint nem exportação de livro completo;
- a primeira prova p. 2/PT-BR ainda tem uma borda preta à direita e embaixo e não está pronta para distribuição ou gráfica;
- corrigir geometria de impressão e finalizar a revisão visual do livro antes de transformar o processo em API.

## Fases

### Fase 0 — agora: conteúdo e fidelidade

- terminar a auditoria visual EN contra o PDF original;
- concluir a tradução PT-BR e o copyfit sem alterar componentes físicos;
- estabilizar o banco, salvamento local e sincronização;
- manter cada correção visual documentada por página, região e evidência;
- não iniciar conversão CMYK nem gerar um “PDF final” antes de existir uma especificação da gráfica.

### Fase 1 — congelamento da tradução

Critério de entrada: todas as páginas PT-BR revisadas, glossário congelado e páginas visualmente aprovadas.

- criar uma versão imutável do conteúdo traduzido;
- registrar versão do glossário, fontes, overlays e layout frames;
- fechar pendências de overflow, fontes e arte;
- gerar uma prova de tela do livro completo para aprovação editorial.

### Fase 2 — piloto de impressão

Critério de entrada: uma gráfica ou fornecedor informa o briefing de produção.

- coletar formato, sangria, marcas, papel, processo, perfil ICC, limite de tinta e padrão PDF/X;
- produzir um preset nomeado e versionado;
- exportar poucas páginas representativas: página clara, página escura, cartas, transparências, diagramas e texto pequeno;
- executar preflight e comparar a rasterização do PDF exportado com o viewer e o PDF de origem;
- pedir prova física quando cor, preto, sobreimpressão ou detalhe fino não puderem ser validados apenas na tela.

### Fase 3 — exportação para gráfica

- exportar PDF por página e PDF completo com metadados de versão;
- incorporar fontes, output intent e informações de produção exigidas;
- registrar o preset, perfil, ferramenta, commit e relatório de preflight;
- bloquear a entrega se houver erro de preflight ou divergência visual conhecida;
- obter aceite da gráfica e arquivar o pacote reproduzível.

### Fase 4 — produto interativo

Depois da tradução e da entrega impressa estarem estáveis:

- PWA com cache/offline e instalação;
- instaladores para PC;
- empacotamento mobile;
- bookmarks, hyperlinks, busca avançada e navegação por referências;
- leitura em voz alta, narração e controles de acessibilidade;
- animações opcionais que não alterem a composição estática da página.

### Fase 5 — manutenção e novas edições

- cada idioma e cada saída recebe uma versão própria;
- mudanças de texto reabrem a revisão visual e o preflight;
- mudanças de gráfica podem exigir novo perfil, preset, piloto e prova;
- o PDF de impressão continua reproduzível mesmo que o viewer ganhe funções novas.

## Critérios de aceite do objetivo final

- O PDF exportado abre em um validador PDF/X e identifica o output intent esperado.
- Não há fontes ausentes, texto cortado, imagens abaixo do limite definido ou transparência incompatível com o preset.
- A cor foi convertida para o perfil fornecido pela gráfica; não foi usado CMYK genérico por conveniência.
- Uma rasterização do PDF final bate visualmente com a composição aprovada, respeitando as diferenças esperadas de prova de cor.
- Cartas, tokens e demais componentes físicos continuam peças completas do PDF original, sem HTML duplicado nem tradução indevida.
- O viewer continua com hyperlinks, voz e animações sem contaminar o artefato fechado para impressão.
- O pacote entregue registra fonte canônica, tradução, preset, perfil, ferramenta, commit e relatório de preflight.

## Riscos e decisões pendentes

- Sem briefing da gráfica, não escolher agora entre PDF/X-1a e PDF/X-4 nem fixar um perfil ICC.
- O piloto do browser não é CMYK e não certifica fontes/cores para gráfica; a página p. 2 também mantém uma faixa preta de impressão pendente.
- A conversão de RGB para CMYK pode reduzir saturação e alterar pretos; a decisão deve ser validada por prova.
- Transparências e blends podem exigir PDF/X-4 ou flattening controlado para X-1a.
- Componentes em alta resolução têm custo de arquivo; a resolução será verificada no tamanho físico, não pela dimensão em pixels isolada.
- A arquitetura atual atende ao viewer e à restauração visual. O exportador de produção será uma fase posterior e deve ser construído como pipeline separado, com preflight próprio.

## Fontes consultadas

- [Adobe: opções de exportação de PDF no InDesign](https://helpx.adobe.com/indesign/desktop/save-export-and-publish/save-and-export/adobe-pdf-export-options.html)
- [Adobe: exportar PDFs para impressão](https://helpx.adobe.com/indesign/desktop/save-export-and-publish/save-and-export/export-pdfs-for-printing.html)
- [Adobe: output intents e PDFs](https://helpx.adobe.com/ca/acrobat/using/output-intents-pdfs-acrobat-pro.html)
- [Adobe: preflight de documentos](https://helpx.adobe.com/ca/acrobat/using/analyzing-documents-preflight-tool-acrobat.html)
- [PDF Association: requisitos técnicos do PDF/X](https://pdfa.org/technical-side-and-requirements-of-pdfx)
- [PDF Association: padrões PDF/X](https://pdfa.org/pdf-standards/)
- [Ghent Workgroup: conformidade PDF/X-4](https://gwg.org/resources/ghent-pdf-output-suite/conformance-certification/)
- [ECI: perfis ICC para impressão](https://eci.org/doku.php_id%3Den_downloads.html)
