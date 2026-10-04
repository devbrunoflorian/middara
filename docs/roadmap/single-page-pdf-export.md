# Exportação de uma página em PDF

**Status:** piloto técnico; ainda não é exportação de produção.
**Primeira página produzida:** p. 2, PT-BR.
**API:** não implementada; este documento prepara o fluxo para uma API futura.

## Resultado do piloto

O arquivo [page-002-pt-BR-editavel.pdf](../../output/pdf/page-002-pt-BR-editavel.pdf) foi impresso pelo Chromium a partir do viewer, usando a tradução salva no Payload. Ele tem uma página com texto vetorial selecionável e arte/composição raster preservada como imagem. A extração de texto confirmou os acentos do texto corrido; o título decorativo usa glifos PUA da fonte e pode ser copiado como caracteres de uso privado. Isso é esperado no arranjo tipográfico atual e precisa ser tratado antes de prometer edição semântica perfeita.

O usuário observou uma borda/faixa preta à direita e embaixo. Ela foi confirmada na captura do PDF. É um defeito conhecido do protótipo de impressão, ainda sem correção: não entregar este piloto como arquivo de gráfica. A geometria do palco do viewer, do contêiner da página e do `@page` precisa ser alinhada e comparada de novo antes de expor o processo como API.

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

- O arquivo atual é RGB gerado pelo browser. Não tem perfil CMYK/output intent, padrão PDF/X, sangria nem marcas de corte; essas escolhas ficam para a fase de impressão após a tradução e o briefing da gráfica.
- O texto aparece como objetos de texto/vetores e pode ser selecionado. A edição direta num editor de PDF é limitada pelos recortes de fonte e pela estrutura do viewer; cartas, tokens, artwork e fundo são imagens completas e não devem ser convertidos em HTML editável.
- O título da p. 2 usa caracteres PUA para reproduzir a forma decorativa. O piloto não tem caracteres U+FFFD, mas copiar o título pode retornar os codepoints PUA em vez de `Introdução`.
- A borda preta à direita/embaixo é um defeito visual conhecido. O código mantém explicitamente a proporção de palco do piloto para facilitar a reprodução do estado; essa proporção é provisória e não deve virar contrato da futura API.
- O PDF não captura rascunhos não salvos do editor. A fonte deve ser o conteúdo persistido no Payload; a página precisa ser conferida no viewer antes da impressão.

## Preparação para a futura API

A API ainda não deve existir como parte deste piloto. Quando for criada, ela deverá chamar a mesma rotina de exportação isolada (em processo/worker Chromium), recebendo pelo menos número da página e idioma. Deve usar uma revisão persistida das traduções, validar que o idioma pedido foi aplicado, guardar o PDF com identificação dessa revisão e retornar falhas explícitas de tradução, fonte ou renderização. Não deve aceitar uma captura de tela do browser como substituto do PDF.

Antes de implementar a API:

1. resolver a borda preta e calibrar tamanho/fonte do PDF contra viewer e PDF-fonte;
2. decidir como o texto decorativo PUA terá semântica adequada ao copiar/editar;
3. conferir links internos e sua navegação no PDF;
4. definir autenticação, fila, armazenamento, retenção e nome/versionamento de arquivos;
5. manter a validação visual por página como etapa obrigatória e separada do preflight de gráfica.

## Critérios para aceitar a exportação individual

- nenhuma faixa preta, corte ou espaço inesperado em torno da página;
- tamanho físico igual à geometria da página-fonte;
- uma página somente, com texto no idioma solicitado e acentos corretos ao copiar;
- fontes carregadas e artwork/componentes completos, sem texto HTML fantasma sobre eles;
- render do PDF comparado com o viewer e com a página original;
- arquivo identificado pela página, idioma e revisão persistida.

O uso para gráfica continua bloqueado até os critérios de impressão do roteiro em [`final-output-print-and-app.md`](final-output-print-and-app.md) serem atendidos.
