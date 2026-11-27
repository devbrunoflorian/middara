# Projeto Pendente: Saída para Gráfica e Preflight

- **Status:** PENDENTE; levantamento inicial concluído em 27/11/2026
- **Prioridade:** MÉDIA, depois de estabilizar e fechar a revisão do conteúdo
- **Escopo:** Produzir um PDF de impressão a partir do livro PT-BR, preservando a paginação e comparando cor e geometria com o OG
- **Área:** Exportação / Pré-impressão

## Evidência já levantada

- O OG tem 102 páginas, PDF 1.6, e não declara OutputIntent nem identificação PDF/X.
- O OG usa majoritariamente imagens `DeviceCMYK`, além de uma parcela pequena de imagens com perfil ICC. Sem o perfil de origem do conteúdo CMYK, os valores não identificam uma condição de impressão única.
- O PDF digital PT-BR exportado em 27/11/2026 tem 102 páginas, 486.455.474 bytes, texto selecionável nas 102 páginas e 40 bookmarks. As caixas das 102 páginas coincidem com o OG.
- A inspeção integral desse PDF encontrou 0 tokens `/DeviceCMYK`, 243 `/DeviceRGB`, 1.034 `/ICCBased` e nenhum OutputIntent ou declaração PDF/X. Não deve ser enviado à gráfica como se já fosse CMYK/PDF/X.
- A geometria do OG reserva aproximadamente 5 mm entre TrimBox e a borda externa (BleedBox/MediaBox). CropBox e BleedBox ocupam a página externa. Não adicionar outra sangria ou marcas automaticamente; confirmar se a gráfica quer marcas e como interpreta essas caixas.
- A exportação Chromium não escolhe uma condição CMYK de impressão. A conversão precisa ser uma etapa posterior com perfil e parâmetros explícitos, seguida de inspeção das separações e comparação visual.

## Próximo fluxo

1. Obter da gráfica o preset ou especificação: perfil ICC de saída, PDF/X aceito, tamanho de corte, sangria/caixas, marcas, limite total de tinta (TAC), resolução mínima e regras de preto/transparência.
2. Fazer uma prova de cor com páginas que combinem ilustração, áreas escuras, texto pequeno, símbolos e caixas. Comparar OG, PDF digital, prova convertida e soft proof no perfil informado.
3. Converter o PDF completo para a condição indicada, preservando texto vetorial e fontes quando o fluxo permitir. Verificar preto de texto pequeno em K, TAC, transparências, sobreimpressão, perfis, fontes, imagens em resolução efetiva e todas as caixas de página.
4. Gerar o formato PDF/X solicitado e validar conformidade/preflight no Acrobat Pro ou ferramenta equivalente. O OutputIntent precisa descrever a condição de saída; sozinho ele não converte o conteúdo.
5. Só então gerar o pacote final para a gráfica, sem sobrescrever o PDF digital pesquisável.

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
