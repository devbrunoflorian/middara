# Exportação de uma página em PDF

**Status:** a exportação digital completa PT-BR foi concluída e verificada tecnicamente em 27/11/2026; a revisão visual integral e validação no Acrobat seguem abertas.
**Prova representativa:** 11/10/2026 — p. 13/24/42 em PT-BR e p. 78 em PT-BR/EN. **Amostra do PDF completo:** 27/11/2026 — comparação OG/PT-BR nas pp. 47, 52, 58, 84 e 100.
**API:** `POST /api/exports` cria um job assíncrono; `GET /api/exports/:id` acompanha o progresso e `GET /api/exports/:id/download` entrega o PDF concluído.

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

## Fluxo de produção atual

O job completo captura um snapshot imutável das traduções salvas, revisões, frames, aliases de símbolos, geometria do PDF-fonte e assets das páginas. Depois renderiza cada página por um processo Chromium isolado usando `scripts/export_page_pdf.mjs`, monta o PDF multipágina e verifica página, texto, geometria e raster antes de disponibilizar o download. O registro do job e seu log permitem localizar a página e a fase de uma falha; partes e snapshot incompletos são removidos pelo pipeline.

Para uma execução local em modo `next start`, configure `MIDDARA_SOURCE_PDF_PATH` e permita a origem do Viewer em `MIDDARA_EXPORT_ALLOWED_ORIGINS` (por exemplo, `http://127.0.0.1:8080,http://localhost:8080`). A configuração de exemplo está em [`apps/admin/.env.example`](../../apps/admin/.env.example). Sem a origem permitida, o endpoint responde 403 antes de criar o job. O endpoint valida se a fonte está legível, não vazia e tem assinatura `%PDF-` antes de enfileirar; se não estiver, retorna 503 sem criar um job com `0/102`. A captura do snapshot valida novamente a fonte e compara o hash antes e depois de ler a geometria. Mantenha o arquivo no mesmo caminho até o snapshot ser capturado.

**Falhas observadas e comportamento atual (2026-11-27):** o banco local registra 23 jobs completos e 8 falhos. Os dois mais recentes, em 24/11, foram um caminho antigo do PDF-fonte (`0/102`) e fechamento do Chromium na p.34 (`33/102`). Os seis anteriores incluem timeout ao selecionar idioma, reinício do backend durante job, falhas antigas de layout/print e perda do log do worker; esses artefatos expiraram, então os registros do job são a evidência restante. O código atual valida a fonte antes de criar o job e repete uma vez somente a página que recebe `Target page, context or browser has been closed`.

Em 27/11, confirmei que o Next local estava servindo um build de 03:20, apesar de o código de exportação ter sido atualizado às 08:25–08:27; por isso, as proteções existiam no código-fonte mas não estavam ativas no servidor. Recompilei e reiniciei o admin às 11:42, depois validei a checagem de fonte (5/5 casos) e fiz um smoke export da p.34, que passou a validação interna. O job completo existente continua em 102/102, download HTTP 200; não gerei outra cópia do PDF de 504 MB. Jobs em andamento não são retomados após reinício do backend, então evite reiniciá-lo durante uma exportação.

**Bloqueio local separado do backend:** o diálogo do Viewer bloqueia uma nova exportação se houver registros locais divergentes do Payload, pois o job usa o snapshot do servidor. O recovery mais recente disponível (27/11 06:28Z) registra 4 divergências PT-BR na p.64; o backup de 24/11 com 140 divergências é anterior e não descreve o último snapshot. Revise essas quatro entradas pelo controle existente antes de tratar um novo PDF como reflexo de todo o estado local; não contorne o bloqueio.

## Trabalho ainda aberto

1. concluir a revisão visual OG/Viewer/PDF de todas as páginas; a verificação técnica da exportação não certifica copyfit, símbolos ou alinhamento;
2. validar seleção e pequenas edições no Acrobat Pro, delimitando fontes instaladas, Type3 e PUA; a extração de texto não prova edição tipográfica confiável;
3. validar hyperlinks internos em um leitor de PDF; a exportação atual contém 40 bookmarks estruturais derivados do Sumário da p. 3;
4. manter a validação visual por página separada do preflight de gráfica, conforme [`final-output-print-and-app.md`](final-output-print-and-app.md).

## Critérios para aceitar a exportação individual

- caixas e composição de cada página comparadas com a fonte, sem cortes/faixas inesperadas;
- tamanho físico igual à geometria da página-fonte;
- uma página somente, com texto no idioma solicitado e acentos corretos ao copiar;
- fontes carregadas e artwork/componentes completos, sem texto HTML fantasma sobre eles;
- render do PDF comparado com o viewer e com a página original;
- arquivo identificado pela página, idioma e revisão persistida.

O uso para gráfica continua bloqueado até os critérios de impressão do roteiro em [`final-output-print-and-app.md`](final-output-print-and-app.md) serem atendidos.
