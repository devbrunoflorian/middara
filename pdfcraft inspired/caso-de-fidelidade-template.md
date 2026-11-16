# Template de caso de fidelidade

Copie este arquivo para uma pasta de evidência datada. Preencha sem transformar suspeita em defeito.

## Identidade

- `caseId`:
- data:
- página física:
- `editorialUnitId` / símbolo / região:
- status: `candidate` | `confirmed defect` | `false positive` | `known exception` | `outlier` | `inconclusive`

## Fonte

- PDF oficial:
- `MediaBox` / `CropBox` / rotação:
- sistema de coordenadas:
- texto, desenho, imagem ou mistura:
- bbox de tinta:
- origem/baseline:
- avanço horizontal:
- ordem de pintura / evidência de raster:
- links para extração e crops:

## Composição do app

- locale:
- host/API/mode do viewer:
- branch: `SOURCE GEOMETRY` | `TRANSLATED FLOW`
- sidecars:
- adapters / overlays:
- snapshot e hash:
- estado de tradução/draft/Payload:
- texto adjacente e relação pai/filho:

## Comparação

- captura viewer:
- save/reload executado?:
- PDF exportado:
- `MediaBox`/`CropBox` exportados:
- crop fonte/viewer/export alinhado:
- tolerância declarada:
- clipping/collision/overflow:
- duplicação ou ausência:
- primeiro ponto de divergência:

## Contraexemplo

- caso difícil que impede generalização:
- a regra proposta afetaria o contraexemplo?:
- por que a alteração permanece local ou por que a família está comprovada:

## Decisão e rollback

- decisão:
- escopo da correção:
- arquivos alterados:
- teste/regressão:
- rollback:
- limitações que continuam abertas:

