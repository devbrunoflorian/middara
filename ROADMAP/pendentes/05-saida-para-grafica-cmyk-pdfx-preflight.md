# Projeto Pendente: Saída para Gráfica e Preflight

- **Status:** PENDENTE; levantamento inicial concluído em 27/11/2026
- **Prioridade:** depois da revisão visual integral e do recebimento do preset da gráfica
- **Escopo:** Produzir um PDF de impressão a partir do livro PT-BR, preservando a paginação e comparando cor e geometria com o OG
- **Área:** Exportação / Pré-impressão

## Evidência já levantada

- O OG tem 102 páginas, PDF 1.6, e não declara OutputIntent nem identificação PDF/X.
- O OG usa majoritariamente imagens `DeviceCMYK`, além de uma parcela pequena de imagens com perfil ICC. Sem o perfil de origem do conteúdo CMYK, os valores não identificam uma condição de impressão única.
- O PDF digital PT-BR atual (28/11/2026) tem 102 páginas, 351.566.784 bytes, SHA-256 `b5f2e2563a7ceda0ebef9d66184505d669b451d8cbdde40365b4af7b17c15333`, texto selecionável nas 102 páginas, 40 bookmarks e 232 links internos. As caixas das 102 páginas foram verificadas contra o OG. Relatório atual: `output/pdf/jobs/final-2026-11-28/final-pdf-verification.json`; a revisão visual integral ainda está em andamento.
- A inspeção integral desse PDF encontrou 0 tokens `/DeviceCMYK`, 243 `/DeviceRGB`, 1.034 `/ICCBased` e nenhum OutputIntent ou declaração PDF/X. Não deve ser enviado à gráfica como se já fosse CMYK/PDF/X.
- A geometria do OG reserva aproximadamente 5 mm entre TrimBox e a borda externa (BleedBox/MediaBox). CropBox e BleedBox ocupam a página externa. Não adicionar outra sangria ou marcas automaticamente; confirmar se a gráfica quer marcas e como interpreta essas caixas.
- A exportação Chromium não escolhe uma condição CMYK de impressão. A conversão precisa ser uma etapa posterior com perfil e parâmetros explícitos, seguida de inspeção das separações e comparação visual.
- **Resolução das imagens de fundo (27/11):** medi as 102 `background.webp` usados pelas páginas. 98 têm 1710×1710 px (~150 dpi no tamanho físico do livro), p.1 tem 1709×1709 (~150 dpi), p.12 tem 1024×1024 (~90 dpi), p.53 tem 3282×3282 (~288 dpi) e p.67 tem 3419×3419 (~300 dpi). Nenhum WebP tem perfil ICC embutido. Na p.47, o OG contém uma imagem `DeviceCMYK` de 3235×2481 px colocada em ~808,8×824,4 pt (~288×217 dpi); o fundo usado no Viewer é 1710×1710 (~150 dpi). Isso sinaliza possível perda de detalhe na camada de fundo e precisa de comparação em escala real no piloto, sem declarar defeito de impressão antes da inspeção visual.
- Consequência: converter o PDF digital inteiro para CMYK não recupera canais CMYK do OG nem detalhe reduzido no raster. Antes do PDF/X, o piloto deve comparar a composição atual com uma saída de impressão que mantenha a arte OG no tamanho efetivo original ou recrie os fundos limpos a partir da fonte em resolução adequada; texto PT-BR continua vetorial.
- Na comparação OG × PDF completo da p.12 (27/11), o fundo decorativo do export coincide com `background.webp` RGB sem ICC, mas diverge do OG `DeviceCMYK` renderizado pelo mesmo MuPDF. Em uma amostra 11×11 px a 72 dpi, na coordenada (810,80), OG = RGB (102,4; 57,7; 13,3) e export = (83,3; 69,2; 34,6). Isso confirma uma diferença visual neste caminho de renderização, não a cor física de impressão: o OG não declara perfil/OutputIntent. Não corrigir a matiz localmente por tentativa; tratar no piloto global com o ICC/preset da gráfica.
- **Falha de exportação resolvida (27/11):** o `ENOENT` apontava para o caminho antigo do PDF em Downloads, embora o arquivo-fonte já tivesse sido movido. `MIDDARA_SOURCE_PDF_PATH` agora aponta para a cópia disponível; a pré-validação introduzida no commit `d42dd9ae` recusa iniciar jobs se a origem estiver ausente, vazia ou não for PDF. Um job posterior concluiu 102/102 páginas, com texto selecionável em 102/102 e 40 bookmarks; o `verification.json` marcou a verificação como técnica, não visual. O PDF digital atual está em `output/pdf/middara-rulebook-pt-BR.pdf`.
- **Estado local de edição (27/11):** snapshots sucessivos na pasta Downloads caíram de quatro divergências para uma. A mais recente é `page_64_block_5`: o rascunho do navegador usa `WHITE/PURPLE`, enquanto o Payload já contém `BRANCO/ROXO` e texto traduzido completo. O PDF usa o Payload salvo; não substituir esse texto pelo rascunho antigo. Como o snapshot não prova o estado atual do navegador, o botão pode continuar exigindo resolução local.
- **Editabilidade no Acrobat:** o PDF tem texto selecionável em todas as páginas, mas a inspeção estrutural encontrou 804 fontes Type3 e 34 Type0. Isso comprova texto/forma vetorial selecionável, não edição de prosa como texto normal no Acrobat. A edição no Acrobat Pro ainda não foi testada; validar “Editar PDF” em uma página representativa antes de chamar o arquivo de totalmente editável.

## Preflight da montagem atual — 28/11/2026

O PDF digital atual tem 102 páginas, 352.886.495 bytes, SHA-256 `6a7e81fc54c4eccfde147a4855c8c8e025384cb95d6d3c5604e904ecd9cf1c40`, 40 marcadores e 232 destinos internos válidos. As cinco caixas de todas as páginas coincidem com as do OG. Foi confirmado o corte de 279,4 mm e a sangria de 5 mm nas pp.1, 54 e 101.

O PDF segue sem OutputIntent. No arquivo montado, os rasters de fundo amostrados têm cerca de 90 dpi na p.12, 150 dpi nas pp.47/54/68 e 300 dpi na p.67. A p.101 contém camadas de página inteira com cerca de 79 e 150 dpi. Compare essas amostras à resolução mínima que a gráfica fornecer. A prova CMYK depende dessa especificação e do preset/ICC de destino.

## Próximo fluxo

1. Obter da gráfica o preset ou especificação: perfil ICC de saída, PDF/X aceito, tamanho de corte, sangria/caixas, marcas, limite total de tinta (TAC), resolução mínima e regras de preto/transparência.
2. Fazer uma prova de cor com páginas que combinem ilustração, áreas escuras, texto pequeno, símbolos e caixas. Comparar OG, PDF digital, prova convertida e soft proof no perfil informado.
3. Converter o PDF completo para a condição indicada, preservando texto vetorial e fontes quando o fluxo permitir. Verificar preto de texto pequeno em K, TAC, transparências, sobreimpressão, perfis, fontes, imagens em resolução efetiva e todas as caixas de página.
4. Gerar o formato PDF/X solicitado e validar conformidade/preflight no Acrobat Pro ou ferramenta equivalente. O OutputIntent precisa descrever a condição de saída; sozinho ele não converte o conteúdo.
5. Só então gerar o pacote final para a gráfica, sem sobrescrever o PDF digital pesquisável.

### Escolha do padrão PDF/X

- Não escolher PDF/X só pelo rótulo “CMYK”. Se a gráfica aceitar PDF/X-4, ele mantém transparências vivas e permite fluxo gerenciado por ICC; a conversão de cor continua dependendo das opções de saída e do perfil escolhido.
- Usar PDF/X-1a apenas quando a gráfica pedir/aceitar esse fluxo CMYK fechado. Ele requer cores de processo em CMYK/cinza/cores especiais e achata transparências, então a prova deve revisar gradientes, sombras, caixas e fundos antes da conversão do livro todo.
- Confirmar se a gráfica aceita RGB com conversão no RIP. Se aceitar, pedir que informe o perfil de simulação/prova e a política de conversão; não converter para um CMYK genérico só para que o arquivo “pareça CMYK”.
- No Acrobat Pro, fazer a prova com Output Preview e a conversão com Convert Colors/Preflight usando o perfil aprovado. Checar Preserve Black para texto pequeno quando apropriado e validar as separações; não presumir que o OutputIntent realizou a conversão.

## Critérios de aceite

- O perfil, preset, PDF/X, TAC, marcas e sangria correspondem às instruções da gráfica escolhida; nenhum perfil genérico é presumido.
- Páginas finais preservam TrimBox e BleedBox previstos pelo OG, sem sangria dupla nem corte de conteúdo.
- Preflight não encontra fontes não incorporadas, imagens abaixo do limite acordado, caixas inválidas, OutputIntent ausente ou violações PDF/X/TAC.
- Separações confirmam preto de texto pequeno e áreas compostas conforme a especificação da gráfica.
- Uma prova representativa foi comparada visualmente com OG e export digital antes da conversão completa.

## Limites conhecidos

- Ainda não há gráfica, preset nem perfil de saída definidos. ISO Coated/FOGRA39, GRACoL e limites fixos de TAC não são defaults aprovados para este livro.
- O OG não informa OutputIntent; portanto, a aparência impressa de seus valores `DeviceCMYK` não pode ser reconstruída com precisão sem perfil ou orientação do fornecedor.
- Não foi feita conversão CMYK nesta etapa para evitar assumir uma condição de impressão e alterar cores às cegas.

## Referências técnicas

- Adobe, [Output intents in PDFs](https://helpx.adobe.com/acrobat/using/output-intents-pdfs-acrobat-pro.html): OutputIntent descreve o destino e, por si só, não converte as cores.
- Adobe, [Adobe PDF export options in InDesign](https://helpx.adobe.com/indesign/desktop/save-export-and-publish/save-and-export/adobe-pdf-export-options.html): conversão de cores, perfil de destino, marcas, sangria e OutputIntent são configurações distintas.
- Adobe, [Produce print-ready PDF files](https://helpx.adobe.com/be_en/indesign/desktop/print/print-production-and-file-creation/produce-print-ready-pdf-files.html): usar o perfil fornecido pelo prestador e validar fontes, resolução e sangria.
- Adobe, [Adobe PDF presets in Illustrator](https://helpx.adobe.com/illustrator/desktop/save-and-export/export-files-to-different-formats/adobe-pdf-presets.html): PDF/X-4 mantém transparência viva; PDF/X-1a usa CMYK e achata transparências.
- Adobe, [Color conversion and ink management in Acrobat Pro](https://helpx.adobe.com/in/acrobat/using/color-conversion-ink-management-acrobat.html): converter para perfil de destino e preservar preto pode ser configurado separadamente do OutputIntent.
