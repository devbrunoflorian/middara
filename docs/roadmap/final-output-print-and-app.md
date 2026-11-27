# Roadmap: saída final para impressão e aplicativos

**Status:** PDF digital PT-BR de 102 páginas exportado e verificado tecnicamente em 27/11/2026; certificação visual integral, edição no Acrobat e saída para gráfica continuam abertas.
**Decisão de produto:** manter uma base de conteúdo e gerar saídas diferentes a partir dela: viewer interativo e PDF pronto para impressão.

## Objetivo

O Rulebook App deve conseguir entregar dois produtos coerentes:

1. um viewer web que preserve edição, hyperlinks, busca, áudio, voz e futuras animações;
2. um PDF fechado, previsível e validado para uma gráfica.

Uma prova representativa de cinco páginas exercitou o caminho técnico; desde então, o endpoint de exportação do livro completo foi implementado. O estado atual e os limites da exportação digital estão em [`single-page-pdf-export.md`](single-page-pdf-export.md) e no [Projeto 11 concluído](../../ROADMAP/concluidos/11-exportador-do-livro-completo-em-pdf.md). A revisão visual ainda precede qualquer conversão para gráfica.

O PDF de impressão não será uma captura de tela do browser. Ele deve ser composto a partir do mesmo modelo de página, com texto vetorial, fontes incorporadas, imagens rasterizadas na resolução final e regiões de componentes preservadas como imagens completas do PDF original. As cartas, tokens e outros componentes físicos continuam em inglês; a tradução PT-BR se aplica ao texto explicativo editável ao redor deles.

## O que a pesquisa confirmou

### CMYK é uma decisão de saída, não um formato universal

Uma gráfica precisa informar a condição de impressão: processo, papel, perfil ICC/output intent, sangria, marcas, limite total de tinta e requisitos de prova. Converter tudo para um CMYK genérico antes dessa informação pode mudar cores e produzir um arquivo que não corresponde ao equipamento real.

O perfil deve ser aplicado na exportação para aquela condição, mantendo o material-fonte em espaço de trabalho com maior alcance quando isso for útil. Perfis ECI, como PSO Coated v3 e PSO Uncoated v3, são referências possíveis, não uma escolha automática para esta obra.

### PDF/X é a família de entrega para gráfica

- **PDF/X-1a:** troca conservadora; aceita CMYK, tons de cinza e cores spot, exige fontes incorporadas e não aceita transparência viva. É uma opção de compatibilidade quando a gráfica pede um fluxo antigo ou explicitamente solicita X-1a.
- **PDF/X-4:** mantém transparência e recursos mais modernos e usa um output intent ICC incorporado para identificar a condição de saída. **PDF/X-4p** permite referenciar externamente o perfil, identificado sem ambiguidade; para uma entrega portátil, preferir X-4 com perfil incorporado quando a gráfica aceitar.
- PDF/X-4 não significa “converter tudo para CMYK”: RGB, CMYK, cinza e cores especiais podem coexistir num fluxo gerenciado. O output intent descreve a condição de reprodução, mas, sozinho, não converte os objetos. Se a gráfica pedir CMYK, a conversão deve usar o perfil de destino específico e ser conferida em prova.
- O padrão escolhido, o perfil e a política de conversão serão parâmetros da exportação, nunca valores escondidos no código.

### Estado medido do PDF digital — 27/11/2026

O job `e373dc13-053f-4473-9252-e85e7bcf735a` exportou o snapshot salvo no Payload e concluiu em 2h38m35s, incluindo snapshot, renderização das páginas, mesclagem e verificação. A saída inicial teve 102 páginas e 486.455.474 bytes; depois, o fundo corrigido da p.61 foi incorporado por atualização incremental do XObject, sem reexportar as outras páginas. O PDF final tem 504.004.016 bytes. O endpoint correto do job é `/api/exports/{id}` e o download final respondeu HTTP 200. O relatório técnico conferiu cada página renderizada contra sua parte individual, confirmou texto selecionável nas 102 páginas e nenhuma página em branco. A leitura do Sumário da p. 3 gerou 40 bookmarks hierárquicos. A checagem incremental comparou todas as caixas/textos do PDF final e conferiu o raster da p.61; uma amostra visual de p. 47, 52, 58, 84 e 100 foi comparada lado a lado com o OG. Isso não substitui a revisão visual integral. Em 27/11, salvei backups recuperáveis dos quatro conflitos locais da p.64 e apliquei as versões atuais do Payload somente ao navegador; a comparação final confirmou zero pendências. O PDF continua refletindo o snapshot do Payload já exportado.

- Todas as 102 páginas têm as mesmas caixas do OG: MediaBox/CropBox/BleedBox de 820,346 × 820,346 pt e TrimBox/ArtBox de 792 × 792 pt, recuado 14,173 pt de cada lado. A medição foi feita página por página.
- O PDF PT-BR tem 325.059 caracteres selecionáveis; nenhum `U+FFFD` foi encontrado no texto. Isso comprova extração/seleção, não edição com refluxo no Acrobat Pro. A amostra de páginas 2, 38, 49 e 100 identificou fontes Type3 associadas a spans de texto (nas pp.38, 49 e 100, só Type3; na p.2, Type0 e Type3). Portanto, a afirmação anterior de que o corpo usa subconjuntos TTF não está confirmada e é contrariada por essas páginas. No par OG/PDF da p.49, o OG usa Optima CFF/Type1 e Cinzel TrueType, enquanto o PDF final usa recursos Type3 com ToUnicode. A editabilidade externa continua sem teste no Acrobat.
- O catálogo do OG e o export PT-BR não declaram `/OutputIntents` nem PDF/X. A inspeção integral do PT-BR encontrou 0 tokens `/DeviceCMYK`, 243 `/DeviceRGB` e 1.034 `/ICCBased`; a exportação atual é RGB e não é arquivo pronto para gráfica. O OG usa majoritariamente imagens `/DeviceCMYK`, mas não declara o perfil que explica esses valores. Na amostra inspecionada, o perfil RGB de um XObject do export identifica o produtor Google/Skia, não a condição CMYK de uma gráfica.
- A amostra de p. 47 continua indicativa, não global: o preflight de gráfica deve medir cada imagem no tamanho colocado. Não se deve “corrigir” resolução por upsampling.
- A varredura das 102 imagens `background.webp` encontrou 98 fundos de 1710×1710 (~150 dpi), p.1 em 1709×1709 (~150 dpi), p.12 em 1024×1024 (~90 dpi), p.53 em 3282×3282 (~288 dpi) e p.67 em 3419×3419 (~300 dpi); nenhum tem ICC embutido. São medidas dos assets de fundo, não certificação de resolução de cada arte/componente separado.
- Na p.47, uma imagem `DeviceCMYK` do OG de 3235×2481 px é colocada em ~808,8×824,4 pt (~288×217 dpi), enquanto o fundo do Viewer mede 1710×1710 (~150 dpi). O piloto de impressão precisa comparar esse fundo a 100% com o OG e preservar/recriar a camada de arte na resolução original adequada. Não se deve corrigir por upsampling nem supor que a conversão CMYK restaura detalhe.
- Inspeção dos XObjects da p.47 no PDF PT-BR encontrou, além da imagem de página 1710×1710 (~150 dpi), uma imagem RGB 900×900 com soft mask, ocupando a página toda (~79 dpi). A origem e o efeito visual dessa camada não foram classificados; antes do preflight final, rastreá-la até a composição/overlay e verificar em prova a 100%. Se for conteúdo de impressão, usar a fonte limpa ou reconstruir a área na resolução nativa; upsampling não recupera detalhe.
- A saída de gráfica precisa converter os novos elementos RGB para a condição acordada, revisar transparências e sobreimpressão e preservar a geometria original. Um simples “salvar como CMYK” não determina perfil nem garante PDF/X.

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

**Exportação digital entregue; não é saída de gráfica**

- o endpoint atual exporta o livro completo a partir de um snapshot imutável do Payload;
- páginas e mesclagem passam por verificação técnica; o verificador compara o raster final com cada parte, valida caixa, texto extraível e páginas não vazias;
- a exportação digital não é CMYK/PDF/X, e a edição externa no Acrobat Pro não foi verificada;
- revisar visualmente todas as páginas e obter as especificações da gráfica antes de tratar o PDF como arquivo de impressão.

## Fases

### Fase 0 — agora: conteúdo e fidelidade

- terminar a auditoria visual EN contra o PDF original;
- concluir a tradução PT-BR e o copyfit sem alterar componentes físicos;
- estabilizar o banco, salvamento local e sincronização;
- manter cada correção visual documentada por página, região e evidência;
- manter o PDF digital pesquisável; não converter para CMYK nem gerar saída PDF/X antes de existir uma especificação da gráfica.

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

### Fase 3 — preflight e exportação para gráfica

- preparar uma saída de gráfica separada do PDF digital pesquisável, com metadados de versão;
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
- A exportação digital completa está implementada. O trabalho de produção para gráfica deve permanecer como pipeline separado, com perfil, preset e preflight próprios.

## Fontes consultadas

- [Adobe: opções de exportação de PDF no InDesign](https://helpx.adobe.com/indesign/desktop/save-export-and-publish/save-and-export/adobe-pdf-export-options.html)
- [Adobe: exportar PDFs para impressão](https://helpx.adobe.com/indesign/desktop/save-export-and-publish/save-and-export/export-pdfs-for-printing.html)
- [Adobe: output intents e PDFs](https://helpx.adobe.com/ca/acrobat/using/output-intents-pdfs-acrobat-pro.html)
- [ISO 15930-7:2010 — PDF/X-4 e PDF/X-4p](https://www.iso.org/standard/55843.html)
- [Adobe: preflight de documentos](https://helpx.adobe.com/ca/acrobat/using/analyzing-documents-preflight-tool-acrobat.html)
- [PDF Association: requisitos técnicos do PDF/X](https://pdfa.org/technical-side-and-requirements-of-pdfx)
- [PDF Association: padrões PDF/X](https://pdfa.org/pdf-standards/)
- [Ghent Workgroup: conformidade PDF/X-4](https://gwg.org/resources/ghent-pdf-output-suite/conformance-certification/)
- [ECI: perfis ICC para impressão](https://eci.org/doku.php_id%3Den_downloads.html)
