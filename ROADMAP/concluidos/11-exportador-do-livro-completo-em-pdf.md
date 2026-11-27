# Projeto Concluído: Exportação do Livro Completo em PDF

- **Status:** PDF digital PT-BR entregue e verificado tecnicamente em 27/11/2026; revisão visual integral continua aberta.
- **Escopo:** exportar as 102 páginas PT-BR em um PDF pesquisável com a geometria do OG.
- **Área:** Exportação / PDF.

## Entrega

- PDF final local: `output/pdf/middara-rulebook-pt-BR.pdf` (102 páginas; 504.004.016 bytes após atualização incremental da imagem de fundo da p.61; 40 bookmarks).
- O job `e373dc13-053f-4473-9252-e85e7bcf735a` exportou um snapshot imutável do Payload. Do início à conclusão, levou 2h38m35s, incluindo snapshot, render das 102 páginas, mesclagem e verificação.
- A verificação final confirmou 102/102 páginas, ordem correta, render de cada página igual à sua parte individual, 102 páginas com texto selecionável, texto visível esperado nas 102 páginas e nenhuma página em branco.
- As cinco caixas de página foram comparadas contra o OG nas 102 páginas: nenhuma diferença. MediaBox/CropBox/BleedBox são 820,346 × 820,346 pt; TrimBox/ArtBox são 792 × 792 pt, recuados 14,173 pt.
- A extração contém 325.059 caracteres selecionáveis e nenhum `U+FFFD`.
- Quarenta bookmarks hierárquicos foram gerados a partir do Sumário da p. 3. A primeira mesclagem omitiu os bookmarks; foram adicionados ao PDF atual e o exportador/verificador foram corrigidos para preservá-los e validá-los nas próximas exportações.
- O endpoint local do PDF OG respondeu com a imagem da p. 1 (HTTP 200) em 27/11. O caminho atual de `MIDDARA_SOURCE_PDF_PATH` aponta para o original existente em `Middara/Rulebook 1.2`.
- O exportador agora valida antes de criar o job se o caminho configurado existe, pode ser aberto como arquivo regular e contém cabeçalho PDF. Um caminho antigo/inválido retorna erro 503 com instrução de configuração, sem criar job parcial. A validação isolada passou em cinco casos.
- Uma comparação visual reduzida lado a lado com o OG foi feita nas pp. 47, 52, 58, 84 e 100. Ela não substitui uma revisão visual integral.
- Em 27/11, o XObject de fundo da p.61 foi atualizado diretamente no PDF completo a partir do asset revisado, evitando repetir a renderização de 102 páginas. A checagem da saída confirmou raster idêntico ao patch esperado, texto preservado e nenhuma mudança fora da caixa local; a rechecagem estrutural confirmou caixas, texto e bookmarks nas 102 páginas. Evidência complementar: `output/pdf/jobs/e373dc13-053f-4473-9252-e85e7bcf735a/post-export-localized-patch-verification.json`.
- Em 27/11, o estado do job foi relido pelo endpoint `/api/exports/{id}` e o download `/api/exports/{id}/download` respondeu HTTP 200.
- A recuperação local mais recente disponível registra quatro conflitos de sincronização na p.64. A extração do PDF final corresponde às versões do Payload exportadas; as variantes divergentes do backup local não foram aplicadas.

## Limites e continuidade

- O job usou o snapshot salvo no Payload. O arquivo de recuperação local entregue em 24/11 não foi importado nem sobrescrito; alterações locais que ainda não tenham sido sincronizadas não fazem parte deste PDF.
- O PDF é uma exportação digital RGB. A inspeção integral encontrou 0 `/DeviceCMYK`, 243 `/DeviceRGB`, 1.034 `/ICCBased` e nenhum `/OutputIntents`. O OG usa majoritariamente imagens `/DeviceCMYK`, mas não declara OutputIntent nem perfil de saída. Este PDF não está pronto para gráfica; ver [Saída para Gráfica e Preflight](../pendentes/05-saida-para-grafica-cmyk-pdfx-preflight.md).
- O texto é selecionável; o PDF não tem campos de formulário. A edição de texto e o refluxo de parágrafos no Acrobat Pro não foram verificados porque o Acrobat não está instalado neste ambiente. O teste segue no [projeto PUA e editabilidade no Acrobat](../pendentes/10-pua-fontes-especiais-e-editabilidade-acrobat-pro.md).
- A verificação técnica e a comparação visual reduzida não certificam copyfit, símbolos, pesos tipográficos ou alinhamento das 102 páginas. A revisão página a página continua aberta no [status por página](../../docs/translations/page-status.csv), no projeto de [localização integral](../pendentes/01-localizacao-integral-das-paginas-13-a-102.md) e na [auditoria tipográfica](../pendentes/09-auditoria-de-metricas-tipograficas-e-fidelidade-de-cores.md). A diferença de peso do Optima regular observada na p. 64 também permanece para investigação.
