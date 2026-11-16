# Exportação de uma página em PDF

**Status:** prova visual representativa concluída; ainda não é exportação de produção.
**Prova mais recente:** 11/10/2026 — p. 13/24/42 em PT-BR e p. 78 em PT-BR/EN.
**API:** não implementada; este documento prepara o fluxo para uma API futura.

## Paridade visual representativa — 11/10/2026

O PDF de 10/10 foi reprovado visualmente e permanece apenas como histórico. O arquivo [middara-representative-export-visual-parity-2026-10-11.pdf](../../output/pdf/middara-representative-export-visual-parity-2026-10-11.pdf) contém cinco páginas impressas pelo Chromium a partir do Viewer: p. 13, 24 e 42 em PT-BR; p. 78 em PT-BR e EN. Ele preserva texto como objetos PDF, imagens e marcadores por página.

O flex encolhia `.page-stage` enquanto `.page-container` conservava seu tamanho CSS, causando escalas divergentes e reflow/overlap na impressão. O exportador mantém ambos coerentes e preserva o flex horizontal da shell, removendo apenas controles de navegação. Não foi necessário alterar `PageRenderer`, geometria da página ou conteúdo salvo.

Na revisão comparativa EN/PT-BR da p. 78, o Viewer PT-BR já mostrava um resíduo circular ao redor de algumas máscaras; o mesmo aparecia no PDF. Não era um defeito exclusivo de impressão, nem de tokenização, espaçamento, SVG, baseline ou advance. O patch de limpeza era limitado pelo bbox visível do SVG semântico, menor que a tinta circular do glifo raster original. `sourceMaskClipPath` agora cobre 49% do crop raster, centralizado no mesmo anchor (mantendo 1% de inset antialias). A correção remove o anel no Viewer e no PDF sem alterar conteúdo, bbox/advance dos símbolos, anchor ou formas canônicas. A comparação EN/PT-BR Viewer/PDF e a prova de cinco páginas estão em [p. 78 completo](../../output/pdf/middara-p78-en-ptbr-viewer-pdf-comparison-2026-10-11.png), [detalhe Gigas Grip](../../output/pdf/middara-p78-gigas-grip-en-ptbr-detail-2026-10-11.png) e [cinco páginas](../../output/pdf/middara-representative-five-page-viewer-pdf-comparison-2026-10-11.png).

Na captura estrutural, contagem de linhas, símbolos e imagens coincide entre Viewer e impressão nas cinco páginas. Os retângulos normalizados diferem até 0,02 pt nas linhas de quatro amostras e 0,79 pt na p. 78 EN; símbolos, até 0,56 pt; imagens, até 0,01 pt. O PDF final foi renderizado de volta para a comparação visual, não inferido apenas de texto extraído. Isto é uma amostra representativa, não certificação de todas as 102 páginas.

Fontes: parte dos textos usa fontes PDF Type3 com CharProcs vetoriais autocontidos; outras usam Type0 com programa incorporado. Todos os recursos tinham `/ToUnicode`, mas isso não equivale a incorporar uma face OpenType editável. Há glifos de símbolos/ornamentos em áreas PUA, que podem ser copiados como codepoints privados. Portanto, a prova demonstra texto real selecionável e extraível, não edição confiável de parágrafos no Acrobat nem compatibilidade com InDesign. O Acrobat Pro não está instalado neste ambiente e a edição direta não foi validada nele.

## Como reproduzir o piloto

Pré-requisitos:

- viewer acessível em `http://127.0.0.1:8080`;
- Payload/API acessível em `http://127.0.0.1:3000`;
- Playwright e Chrome/Chromium disponíveis no ambiente Node;
- PyMuPDF instalado para a conferência do arquivo.

Com os serviços locais ativos:

```powershell
node scripts/export_page_pdf.mjs --page 2 --language pt-BR --output output/pdf/page-002-pt-BR-editavel.pdf
python scripts/verify_page_pdf_export.py output/pdf/page-002-pt-BR-editavel.pdf --page 2 --contains "As árvores estavam nuas" --reject "The trees were barren"
```

O exportador lê largura e altura em pontos de `page_NNN_dom.json`, consulta as traduções persistidas em PT-BR, abre a página e o idioma no viewer, espera uma frase traduzida e as fontes, oculta a interface de navegação e usa o Chromium para imprimir somente a página. O verificador exige uma única página, tamanho próximo ao da geometria-fonte, texto selecionável, ausência de U+FFFD e as frases esperadas para o idioma.

Para outra página, troque `--page` e o nome de saída. `--language` aceita `en` ou `pt-BR`; `--base-url`, `--api-url` e `--browser` permitem apontar para outros serviços/instalações locais. Em PT-BR, o exportador interrompe a operação se a API não tiver traduções salvas para a página ou se não encontrar o texto traduzido visível no viewer; não deve gerar silenciosamente um PDF inglês como se fosse português.

## Limites conhecidos do método

- O arquivo atual é RGB gerado pelo browser. Não tem perfil CMYK/output intent, padrão PDF/X, sangria adicionada nem marcas de corte. Os page boxes foram copiados da fonte; isso não cria área de bleed. Essas escolhas ficam para a fase de impressão após o briefing da gráfica.
- O texto aparece como objetos de texto/vetores e a extração Unicode confirma a camada selecionável/copiável estruturalmente. A interação de seleção/clipboard e a edição direta em Acrobat não foram testadas; a edição é potencialmente limitada pelos recursos Type3/PUA e pela estrutura fragmentada em spans. Cartas, tokens, artwork e fundo são imagens/elementos vetoriais de página e não são objetos editoriais reestruturáveis.
- Nesta prova, a camada raster de página chega a aproximadamente 79 ppi efetivos em alguns elementos; outros componentes chegam a 631 ppi. Isso atende a uma prova de leitura em tela, mas não estabelece resolução adequada para impressão.
- O título da p. 2 usa caracteres PUA para reproduzir a forma decorativa. O piloto não tem caracteres U+FFFD, mas copiar o título pode retornar os codepoints PUA em vez de `Introdução`.
- O PDF não captura rascunhos não salvos do editor. A fonte deve ser o conteúdo persistido no Payload; a página precisa ser conferida no viewer antes da impressão.

## Editabilidade no Adobe — evidência estrutural; validação de interface pendente

O usuário informou em 05/10 que um PDF anterior aberto no Adobe não ficou editável como esperado. A prova atual responde apenas à camada estrutural: texto é extraível e selecionável, mas há fontes Type3/PUA e segmentos independentes. Acrobat Pro não está instalado neste ambiente, então não foi possível verificar visualmente a ferramenta Editar PDF. Adobe documenta que a edição com a face tipográfica original depende de a fonte estar instalada; uma fonte apenas incorporada pode permitir alterações limitadas. Veja [Adobe: edição de texto em PDF](https://helpx.adobe.com/acrobat/using/edit-text-pdfs1.html). Não declarar editabilidade tipográfica geral com base só na extração.

Na investigação futura:

1. identificar/recuperar o PDF anterior e registrar app/versão e a operação específica;
2. instalar/usar Acrobat Pro disponível para verificar seleção e pequenas alterações em pelo menos uma página simples e outra com símbolo/fonte decorativa;
3. inspecionar os objetos e fontes dessa edição e comparar aparência, seleção/cópia e round-trip;
4. só então decidir se o export precisa de outra forma de construir texto ou se o limite é inerente a correções locais em PDF.

O app agora tem uma prova auditável de cinco páginas em [`middara-representative-export-visual-parity-2026-10-11.pdf`](../../output/pdf/middara-representative-export-visual-parity-2026-10-11.pdf), além do piloto p. 2 e do artefato de 10/10 reprovados, mantidos como histórico. A extração/estrutura não substitui uma prova de edição no Acrobat e não autoriza modificar ou achatar PDFs-fonte.

## Preparação para a futura API

A API ainda não deve existir como parte deste piloto. Quando for criada, ela deverá chamar a mesma rotina de exportação isolada (em processo/worker Chromium), recebendo pelo menos número da página e idioma. Deve usar uma revisão persistida das traduções, validar que o idioma pedido foi aplicado, guardar o PDF com identificação dessa revisão e retornar falhas explícitas de tradução, fonte ou renderização. Não deve aceitar uma captura de tela do browser como substituto do PDF.

Antes de implementar a API:

1. validar seleção e pequenas edições no Acrobat Pro e delimitar fontes instaladas/Type3/PUA;
2. aumentar resolução efetiva de artwork de página onde o briefing de saída exigir;
3. decidir semântica de cópia para glifos PUA e comportamento dos símbolos inline;
4. conferir links internos e sua navegação no PDF;
5. manter validação visual por página separada do preflight de gráfica; definir autenticação/fila/armazenamento somente se a API for aprovada.

## Critérios para aceitar a exportação individual

- caixas e composição de cada página comparadas com a fonte, sem cortes/faixas inesperadas;
- tamanho físico igual à geometria da página-fonte;
- uma página somente, com texto no idioma solicitado e acentos corretos ao copiar;
- fontes carregadas e artwork/componentes completos, sem texto HTML fantasma sobre eles;
- render do PDF comparado com o viewer e com a página original;
- arquivo identificado pela página, idioma e revisão persistida.

O uso para gráfica continua bloqueado até os critérios de impressão do roteiro em [`final-output-print-and-app.md`](final-output-print-and-app.md) serem atendidos.
