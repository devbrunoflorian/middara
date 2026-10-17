# Harness de fidelidade inspirado no PdfCraft

Este documento descreve um próximo passo de engenharia. Ele não autoriza mutações canônicas e não substitui a confirmação no viewer quando a prova depende de interação.

## Objetivo

Transformar uma prova manual repetida em um caso reproduzível que percorra:

```text
PDF oficial
  → extração/sidecars
  → snapshot imutável
  → viewer vivo
  → save/reload (se aplicável)
  → PDF exportado
  → verificação estrutural + crop alinhado
  → decisão com cobertura e contraexemplo
```

## Contrato mínimo do caso

Cada caso deve possuir os campos do template em [`caso-de-fidelidade-template.md`](caso-de-fidelidade-template.md). Os campos essenciais são:

| Campo | Motivo |
|---|---|
| `caseId`, página e unidade | identidade estável do problema |
| PDF fonte e caixas físicas | verdade geométrica |
| locale, host/API/mode do viewer | reprodutibilidade da captura |
| `rendererBranch` | distinguir `SOURCE GEOMETRY` de `TRANSLATED FLOW` |
| sidecars/adapters/overlays | proveniência da composição |
| hash do snapshot | garantir que viewer e export usam a mesma entrada |
| tolerância e sistema de coordenadas | impedir conclusões por screenshot solto |
| status e contraexemplo | separar defeito confirmado de triagem |

## Fases e gates

### Fase A — prova fonte

- guardar página, `MediaBox`, `CropBox`, rotação e coordenadas;
- capturar text trace, origens/baselines, desenhos e imagens relevantes;
- identificar se a tinta é texto, vetor, raster ou duplicata candidata;
- não alterar JSON de produção.

### Fase B — prova do viewer

- registrar o badge de host/API/locale/mode;
- registrar a branch real do renderer;
- comparar região física equivalente, com mesma escala e sem seleção azul do browser;
- conferir texto adjacente, quebras, listas, relações pai/filho e símbolos.

### Fase C — prova de persistência e export

- usar um snapshot local imutável;
- salvar/recarregar somente quando o caso exigir persistência;
- exportar a página pelo caminho atual;
- validar `MediaBox`, `CropBox`, número de páginas, texto esperado e raster alinhado;
- guardar o resultado do verificador junto com o crop.

### Fase D — decisão

Um caso só pode ser `confirmed defect` quando a primeira divergência foi localizada e a correção foi observada no viewer e no export. Um delta raster isolado permanece `candidate` ou `inconclusive` quando não distingue antialiasing, escala, arte ou estrutura.

## Três tracers que cobrem nossos riscos

| Tracer | O que exercita | Contraexemplo obrigatório |
|---|---|---|
| p.102, corpo de Conviction/ícone inline | avanço, bbox e reflow próximo a símbolo | uma linha sem símbolo que não pode receber a extensão |
| p.22, `block_11` | unidade que atravessa coluna/diagrama e copyfit | bloco vizinho que deve continuar selecionável |
| p.57, símbolo compartilhado | risco de transformar overlap em supressão global | texto ausente do background que precisa continuar vivo |

Os tracers devem consumir evidências já existentes no projeto. A proposta não é criar uma auditoria global nova nem reclassificar o livro inteiro.

## Saída esperada

Cada execução deve deixar uma pasta de caso com:

- `manifest.json` ou equivalente;
- snapshot de entrada e seu hash;
- referências para fonte, sidecars e adapters;
- captura viewer e PDF exportado;
- crops fonte/viewer/export na mesma caixa;
- resultado estrutural;
- decisão, tolerância, cobertura, contraexemplo e rollback.

## Regras de segurança

- O harness deve ser read-only por padrão.
- Nenhum resultado de comparação pode marcar `rasterizedDuplicate` automaticamente.
- Não alterar a regra global de fonte, line-height, letter-spacing ou `translateY` a partir de um caso.
- Não usar uma captura de viewport para certificar o PDF exportado.
- Se o caso entrar em `TRANSLATED FLOW`, registrar leading derivado do PDF ou uma decisão explícita de frame; nunca serializar `lineHeight: 1` como palpite.

## Implementação incremental sugerida

1. Reutilizar `scripts/lib/snapshot-render-verification.mjs`, `scripts/export_page_pdf.mjs`, `scripts/verify_page_pdf_export.py` e os verificadores de propostas existentes.
2. Criar um manifesto simples e um agregador de resultados, sem mudar o renderer.
3. Rodar somente os três tracers acima.
4. Medir se o manifesto elimina trabalho manual e se detecta regressão real.
5. Só então decidir se vale um comando de CLI ou uma coleção persistida no Admin.

