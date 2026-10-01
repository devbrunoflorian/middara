# Tarefa: integrar fontes locais fornecidas para fidelidade tipográfica

- **Status:** concluído localmente; build e `git diff --check` passaram. Não commitado.
- **Data:** 2026-09-30.
- **Objetivo:** integrar os TTFs fornecidos pelo usuário em `apps/web/public/fonts`, associar cada família/peso pelo nome interno da fonte e reduzir dependências de fonte remota/sistema no renderer.
- **Contexto:** a triagem do livro identificou fontes `CinzelDecorative`, `Webdings`, `Wingdings`, `Wingdings3` e `AristelleSans-Regular` encaminhadas a fontes remotas ou ao fallback do Windows. O usuário forneceu três pesos de Cinzel Decorative, Webdings, Wingdings e `Aristelle Sans.woff.ttf`.
- **Escopo de segurança:** alterações apenas nos assets/font CSS e mapeamento de fontes. Não alterar JSONs de página, traduções, Payload, banco de dados ou rastreamentos da auditoria anterior.
- **Verificação prevista:** conferir existência dos seis arquivos anexados, validar `family`/`subfamily`/weight/cmap por metadados internos, confirmar os `@font-face` e o `mapPdfFont` para cada família; executar build e revisar `git diff --check`. Não declarar equivalência visual sem comparação com o PDF/app.

## Plano

1. Confirmar os arquivos anexados e ler as instruções de web/fidelidade visual e o handoff.
2. Procurar orientações atuais de uso de fontes locais no frontend e examinar a configuração presente.
3. Comparar a Aristelle fornecida com a fonte embutida no PDF (nomes internos, cobertura e inspeção visual ampliada de glifos do livro).
4. Copiar os assets correspondentes para `apps/web/public/fonts` com nomes estáveis, registrando qualquer família variante/inacessível em vez de inventar um substituto.
5. Adicionar faces locais de peso e estilo exatos; alterar o mapeamento React para não enviar `Webdings`, `Wingdings` e fontes de display a uma família incorreta.
6. Remover apenas os pedidos remotos que a cópia local substitui, mantendo outros imports Google ainda usados.
7. Verificar build, CSS, estado do repo e documentar limites visuais e próxima fonte faltante.

## Registro de execução

- A checagem de arquivos confirmou os seis arquivos enviados: três pesos de Cinzel Decorative, Webdings, Wingdings e Aristelle Sans.
- **Correspondência Aristelle confirmada para a variante Sans:** o PDF incorpora subconjuntos Type 1/CFF com nome PostScript `TRLTLR+AristelleSans-Regular`; o arquivo do usuário informa `AristelleSans-Regular` em nameID 6 e `Aristelle Sans` como nome completo/família. O nome-base da fonte incorporada e o PostScript do arquivo coincidem após remover o prefixo de subset `TRLTLR+`.
- A inspeção visual ampliada do rótulo `Pirate Wench` na página 85 do PDF coincide com o desenho da fonte fornecida. A amostra “Aristelle Script Regular” é outra variante (script cursiva) e **não** é a fonte nomeada no PDF. A evidência sustenta usar a Sans enviada, não afirma identidade byte a byte: o PDF incorpora subconjuntos e o arquivo fonte é TTF.
- Metadados de incorporação: `fsType=4` na Aristelle (Preview & Print) e `fsType=8` na Wingdings fornecida (Editable embedding). Esses bits foram registrados como indicação técnica, não como substituto dos termos de licença; o repositório não contém licença/autorização de redistribuição desses arquivos.
- Os arquivos enviados trazem cobertura de caracteres Webdings e Wingdings na área PUA, mas a família Wingdings fornecida não é Wingdings 3. A aplicação continuará tratando Wingdings3 e ZapfDingbats como famílias distintas, sem falsos aliases para Webdings/Wingdings.
- Os seis arquivos foram copiados para `apps/web/public/fonts/` com nomes estáveis. As exceções de `.gitignore` incluem somente esses seis arquivos, porque a regra geral `public/` ignorava os novos assets.
- `fonts.css` agora declara Cinzel Decorative nos pesos 400/700/900, Aristelle Sans 400, Webdings e Wingdings. `mapPdfFont` e o mapeamento de segmentos usam essas famílias locais; Wingdings3 e Zapf Dingbats não são apontadas para arquivos de outra família. Removido apenas Cinzel Decorative do pedido Google Fonts; Cinzel, EB Garamond e Inter permanecem remotos porque ainda são usados por outras áreas.
- Build de produção: `npm run build -w apps/web` passou (Vite 8.3.1; 1892 módulos). O build registrou o aviso preexistente sobre `/texture.png` não resolvido em build e preservado para runtime.
- `git diff --check` passou. Não foi feita confirmação visual dentro do navegador; a inspeção da Aristelle compara diretamente uma amostra ampliada do PDF com a renderização da fonte fornecida, sem validar o carregamento da UI no browser.
- **Limites e pendências:** o PDF usa `Wingdings3` e `ZapfDingbatsStd` em outros pontos; os assets corretos dessas famílias ainda faltam. A fonte `Aristelle Script Regular` mostrada na página do specimen não corresponde à fonte incorporada no PDF e não foi adicionada. Antes de distribuir o app publicamente, confirmar os termos de licença dos arquivos fornecidos, em particular Aristelle `fsType=4` (Preview & Print); o flag OpenType sozinho não concede direitos de redistribuição.
