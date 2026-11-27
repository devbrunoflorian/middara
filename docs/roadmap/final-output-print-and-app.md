# Roadmap: saída final para impressão e aplicativos

**Status:** objetivo final documentado; implementação adiada até a tradução PT-BR e a certificação visual do livro estarem concluídas.  
**Decisão de produto:** manter uma base de conteúdo e gerar saídas diferentes a partir dela: viewer interativo e PDF pronto para impressão.

## Objetivo

O Rulebook App deve conseguir entregar dois produtos coerentes:

1. um viewer web que preserve edição, hyperlinks, busca, áudio, voz e futuras animações;
2. um PDF fechado, previsível e validado para uma gráfica.

Uma prova representativa de cinco páginas já exercitou o caminho técnico (EN/PT-BR, conteúdo enriquecido, símbolos e artwork) e seus limites estão em [`single-page-pdf-export.md`](single-page-pdf-export.md). Ela não altera a ordem do roadmap: terminar tradução e fidelidade vem antes da API de exportação ou da saída de gráfica.

O PDF de impressão não será uma captura de tela do browser. Ele deve ser composto a partir do mesmo modelo de página, com texto vetorial, fontes incorporadas, imagens rasterizadas na resolução final e regiões de componentes preservadas como imagens completas do PDF original. As cartas, tokens e outros componentes físicos continuam em inglês; a tradução PT-BR se aplica ao texto explicativo editável ao redor deles.

## O que a pesquisa confirmou

### CMYK é uma decisão de saída, não um formato universal

Uma gráfica precisa informar a condição de impressão: processo, papel, perfil ICC/output intent, sangria, marcas, limite total de tinta e requisitos de prova. Converter tudo para um CMYK genérico antes dessa informação pode mudar cores e produzir um arquivo que não corresponde ao equipamento real.

O perfil deve ser aplicado na exportação para aquela condição, mantendo o material-fonte em espaço de trabalho com maior alcance quando isso for útil. Perfis ECI, como PSO Coated v3 e PSO Uncoated v3, são referências possíveis, não uma escolha automática para esta obra.

### PDF/X é a família de entrega para gráfica

- **PDF/X-1a:** troca conservadora; aceita CMYK, tons de cinza e cores spot, exige fontes incorporadas e não aceita transparência viva. É uma opção de compatibilidade quando a gráfica pede um fluxo antigo ou explicitamente solicita X-1a.
- **PDF/X-4:** mantém transparência e recursos mais modernos, trabalha com fluxo gerenciado por ICC e exige output intent incorporado. É a opção inicial a avaliar para o exportador, desde que a gráfica confirme compatibilidade.
- O padrão escolhido, o perfil e a política de conversão serão parâmetros da exportação, nunca valores escondidos no código.

### Estado medido dos PDFs locais — 27/11/2026

Foi feita uma inspeção estrutural leve do OG configurado e do PDF PT-BR local existente, sem gerar outro arquivo pesado. O PDF PT-BR verificado foi gerado às 01:07 de 27/11, antes das correções locais mais recentes das pp. 83–84; ele não representa ainda o estado atual completo da tradução.

- Ambos têm 102 páginas. Na p. 47, OG e PT-BR usam as mesmas caixas: MediaBox/CropBox/BleedBox de 820,346 × 820,346 pt e TrimBox de 792 × 792 pt, recuado 14,173 pt de cada lado. O preset deve preservar essa geometria do OG e só acrescentar marcas/sangria se a gráfica pedir.
- O catálogo dos dois arquivos não tem `/OutputIntents`. Nas páginas amostradas do OG, imagens usam `/DeviceCMYK`; no PT-BR, imagens usam `/ICCBased` com perfil RGB de 3 canais. Assim, a exportação atual é uma prova visual RGB, não um PDF CMYK/PDF/X pronto para gráfica. A ausência de OutputIntent no OG também significa que não se deve presumir qual perfil CMYK descreve seus valores.
- Na p. 47, uma imagem do OG de 3235 × 2481 px é colocada a cerca de 216,7 ppi; no PDF PT-BR há uma imagem de página de 1710 × 1710 px a cerca de 150,1 ppi e uma textura de página a cerca de 79 ppi. Estes números descrevem só essa amostra, não o livro inteiro. O preflight precisa medir cada imagem no tamanho colocado; não se deve “corrigir” resolução por upsampling.
- A prova PT-BR continua com texto vetorial Type3 e composição do Viewer. A próxima saída de gráfica precisa preservar os objetos CMYK do OG quando forem reutilizados, converter cores RGB novas para a condição de saída acordada e verificar substituições de fundo, texto, transparências e sobreimpressão. Um simples “salvar como CMYK” não resolve a origem dos elementos nem a compatibilidade PDF/X.

**Decisão:** não converter o PDF atual nem escolher perfil/padrão por conta própria. Depois da revisão final do conteúdo, obter da gráfica o perfil ICC/output intent, processo/papel, PDF/X, limite de tinta, resolução mínima, sangria e marcas; então fazer um piloto pequeno e um preflight completo. Se a gráfica confirmar PDF/X-4, começar por esse preset e validar a conversão e a prova de cor. Se exigir PDF/X-1a, a etapa deve achatar transparências de forma controlada e comparar o resultado visual.

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

**Prova representativa no viewer (não é saída final)**

- usa o viewer e traduções persistidas para imprimir cinco páginas selecionadas como PDF com texto e imagens;
- é uma prova técnica; não há endpoint nem exportação de livro completo;
- a composição das amostras e as caixas de página passaram verificação, mas fontes Type3/PUA, Acrobat e resolução raster ainda limitam o aceite;
- concluir validação de edição no Acrobat e especificação de saída antes de transformar o processo em API ou gráfica.

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
- A prova do browser não é CMYK nem PDF/X e não certifica fontes/cores para gráfica; a camada raster chega a cerca de 79 ppi em partes da prova e requer revisão para o tamanho físico final.
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
