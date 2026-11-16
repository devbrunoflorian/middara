# Arquitetura atual

> Esta página resume como o app transforma o PDF em conteúdo editável. Os [critérios de QA](../QA/acceptance.md) e o [manual do editor](../translations/manual-editor-workflow.md) descrevem como revisar as mudanças.

## Fluxo de dados

```text
PDF oficial
  → extração PyMuPDF e revisão estrutural
  → sidecars JSON por página (blocos, estilos, geometria, imagens)
  → adapters semânticos por ocorrência (símbolos, compostos, overlays, frames)
  → unidade editorial estável e editor rico
  → override Segment[] por idioma em draft/ Payload
  → PageRenderer: geometria fonte ou fluxo traduzido
  → viewer e export PDF
  → QA estrutural, tipográfico e visual contra o PDF
```

## Responsabilidades principais

- `apps/web/public/pages/page_NNN/`: `page_NNN_dom.json` e sidecars de ocorrência; `background.webp` e overlays compõem a imagem não textual da página.
- `apps/web/src/components/PageRenderer.tsx`: escolhe o caminho fonte ou traduzido, compõe texto, objetos semânticos e arte.
- `apps/web/src/symbols/`: registry central, codecs, renderização e compatibilidade dos símbolos.
- `apps/admin/`: Payload CMS e SQLite local. A coleção de traduções conserva chaves existentes; o valor `data` contém o envelope rico.
- `scripts/`: extração, enriquecimento exato a partir do PDF, inspeção, captura e exportação.
- `docs/translations/page-status.csv`: cobertura e status de revisão por página.

## SOURCE GEOMETRY e TRANSLATED FLOW

São dois contratos de composição, não duas maneiras intercambiáveis de configurar o mesmo CSS.

**SOURCE GEOMETRY** reproduz texto intacto pelas coordenadas extraídas do PDF. Quando disponíveis, `origin` fornece posição de origem/baseline; bbox valida a tinta; ordens e avanços vêm do PDF/text trace. `SourceGeometryBlock` só é usado quando o bloco satisfaz os dados exigidos. Fragmentos que pertencem a um mesmo span editorial podem ter `sourceGlyphRuns` em baselines diferentes: a chave tradutível permanece única enquanto a pintura fonte respeita cada fragmento.

**TRANSLATED FLOW** recompõe texto editado dentro de unidade/frame estrutural apropriado. Não reaproveita y absoluto de linhas inglesas após reflow. O espaçamento entre parágrafos é uma relação editorial; um gap fonte já representado não deve ser somado outra vez no EN. PT-BR pode precisar desse gap quando a quebra física inglesa desaparece.

## Texto, tinta e métricas

- **Ink bounds**: região realmente pintada pelo glifo ou vetor. Uma caixa de SVG pode incluir transparência.
- **Advance**: espaço horizontal reservado no fluxo.
- **Baseline anchor/offset**: referência que posiciona o desenho em relação à baseline.
- **Line metrics**: ascent/descent/leading usados para distribuir baselines de texto.

Esses campos não podem ser derivados uns dos outros por conveniência. A tinta vertical de um símbolo pode exceder a altura normal do texto sem aumentar o espaçamento entre baselines. No ramo `SemanticSymbol` de fluxo, a arte fica fora do slot vertical; isso não prova que todo caminho alternativo ou elemento legado tenha o mesmo contrato. Meça o ramo efetivamente usado.

## Semântica e estado

Uma ocorrência de desenho tem contexto e coordenadas próprias; o registry define identidade estável. Unidade de tradução não é sinônimo de linha física nem precisa ser um novo block persistido. Veja o [modelo editorial](editorial-model.md) e [símbolos](inline-symbols.md).

Os segmentos ricos guardam texto, fonte, tamanho, cor, peso/estilo e metadados compatíveis. Tradução é vinculada à chave editorial persistente e idioma. O estado de EN, o draft local e o registro Payload têm percursos diferentes; verificar qual deles está ativo pelo badge e pela resposta da API.

## Export

O export visual usa Chromium/Playwright e normaliza cada PDF de página às dimensões físicas e caixas da fonte. A integração cria um job no Payload, captura as entradas num snapshot por job e só disponibiliza o resultado depois da verificação e da montagem. Exportar páginas não certifica o livro inteiro; confira cada página contra o PDF original.

O raster `background.webp` é um derivado de composição; dimensões do asset precisam representar o limite físico da página sem a amostra extra que `ceil` pode criar. Compare cada alteração de asset com a arte original antes de salvar.

`MediaBox`, escala de impressão, clipping e correspondência de overlays devem ser medidos. Screenshot de viewport não certifica export.

Para revisar páginas, veja os [critérios de QA](../QA/acceptance.md). Para escolhas de arquitetura registradas, consulte os [ADRs](decisions/README.md).
