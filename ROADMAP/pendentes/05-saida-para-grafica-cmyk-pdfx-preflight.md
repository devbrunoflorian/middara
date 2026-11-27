# Projeto Pendente: Saída para Gráfica e Preflight

- **Status:** PENDENTE; levantamento inicial concluído em 27/11/2026
- **Prioridade:** depois da revisão visual integral e do recebimento do preset da gráfica
- **Escopo:** Produzir um PDF de impressão a partir do livro PT-BR, preservando a paginação e comparando cor e geometria com o OG
- **Área:** Exportação / Pré-impressão

## Evidência já levantada

- O OG tem 102 páginas, PDF 1.6, e não declara OutputIntent nem identificação PDF/X.
- O OG usa majoritariamente imagens `DeviceCMYK`, além de uma parcela pequena de imagens com perfil ICC. Sem o perfil de origem do conteúdo CMYK, os valores não identificam uma condição de impressão única.
- O PDF digital PT-BR exportado em 27/11/2026 tem 102 páginas, 486.455.474 bytes, texto selecionável nas 102 páginas e 40 bookmarks. As caixas das 102 páginas coincidem com o OG.
- A inspeção integral desse PDF encontrou 0 tokens `/DeviceCMYK`, 243 `/DeviceRGB`, 1.034 `/ICCBased` e nenhum OutputIntent ou declaração PDF/X. Não deve ser enviado à gráfica como se já fosse CMYK/PDF/X.
- A geometria do OG reserva aproximadamente 5 mm entre TrimBox e a borda externa (BleedBox/MediaBox). CropBox e BleedBox ocupam a página externa. Não adicionar outra sangria ou marcas automaticamente; confirmar se a gráfica quer marcas e como interpreta essas caixas.
- A exportação Chromium não escolhe uma condição CMYK de impressão. A conversão precisa ser uma etapa posterior com perfil e parâmetros explícitos, seguida de inspeção das separações e comparação visual.
- Na comparação OG × PDF completo da p.12 (27/11), o fundo decorativo do export coincide com `background.webp` RGB sem ICC, mas diverge do OG `DeviceCMYK` renderizado pelo mesmo MuPDF. Em uma amostra 11×11 px a 72 dpi, na coordenada (810,80), OG = RGB (102,4; 57,7; 13,3) e export = (83,3; 69,2; 34,6). Isso confirma uma diferença visual neste caminho de renderização, não a cor física de impressão: o OG não declara perfil/OutputIntent. Não corrigir a matiz localmente por tentativa; tratar no piloto global com o ICC/preset da gráfica.
- **Falha de exportação resolvida (27/11):** o `ENOENT` apontava para o caminho antigo do PDF em Downloads, embora o arquivo-fonte já tivesse sido movido. `MIDDARA_SOURCE_PDF_PATH` agora aponta para a cópia disponível; a pré-validação introduzida no commit `d42dd9ae` recusa iniciar jobs se a origem estiver ausente, vazia ou não for PDF. Um job posterior concluiu 102/102 páginas, com texto selecionável em 102/102 e 40 bookmarks; o `verification.json` marcou a verificação como técnica, não visual. O PDF digital atual está em `output/pdf/middara-rulebook-pt-BR.pdf`.
- **Estado local de edição (27/11):** o snapshot mais recente aponta quatro divergências não confirmadas, todas na p.64. Elas não estão no PDF completo atual: a cópia do Payload coincide com as decisões documentadas para a página, enquanto as versões locais de três blocos revertem essas correções. O PDF atual representa a versão salva no servidor. O Viewer pode bloquear uma nova exportação até que essas quatro cópias locais sejam resolvidas para a versão do Payload; não as sincronizar para o servidor.
- **Editabilidade no Acrobat:** o PDF tem texto selecionável em todas as páginas, mas a inspeção estrutural encontrou 804 fontes Type3 e 34 Type0. Isso comprova texto/forma vetorial selecionável, não edição de prosa como texto normal no Acrobat. A edição no Acrobat Pro ainda não foi testada; validar “Editar PDF” em uma página representativa antes de chamar o arquivo de totalmente editável.

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
