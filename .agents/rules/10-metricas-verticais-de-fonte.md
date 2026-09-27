# Skill: Métricas Verticais de Fonte — a Causa Raiz do "Título Muito Alto"

## O sintoma que se repetiu
Títulos em fontes decorativas (Esmeralda Pro confirmada; checar Cinzel e qualquer outra fonte de título com o mesmo método) renderizam mais altos/deslocados que no PDF. A correção anterior (`transform: translateY(12%)` aplicada "pra toda fonte decorativa") foi um chute que:
1. Não tinha justificativa matemática (12% de onde?).
2. Tinha raio de alcance largo demais (Skill 08) e vazou pra texto fantasma que não devia nem renderizar.

## A causa raiz real (medida, não estimada)
Toda fonte tem duas tabelas de métrica vertical que podem divergir:
- **`hhea` (ascent/descent)**: geralmente a métrica "correta"/tight do desenho da fonte.
- **`OS/2` (`usWinAscent`/`usWinDescent`)**: historicamente usada pelo Windows/navegadores como fallback pra calcular `line-height: normal`, quando a fonte não sinaliza pra usar a métrica Typo.

Medido na `EsmeraldaPro.ttf` usada no projeto:
```
hhea ascent + descent  = 1000 unidades = 100% do em-square (bate com a tinta real dos glifos)
OS/2 win ascent+descent = 1362 unidades = 136.2% do em-square
fsSelection USE_TYPO_METRICS (bit 0x80): DESLIGADO
```
Como a flag `USE_TYPO_METRICS` está desligada, o navegador usa a métrica `OS/2 win` (136% do tamanho da fonte) pra calcular a altura da caixa de linha — 36% maior do que deveria. É por isso que qualquer título nessa fonte "cresce" verticalmente, mesmo com o `line-height` definido corretamente na intenção.

## A correção definitiva (uma vez, na fonte — não no CSS, não por título)
Usa `fontTools` pra normalizar as métricas verticais da fonte antes de gerar os arquivos web (`.woff2`/`.woff`/`.ttf`):

```python
from fontTools.ttLib import TTFont

f = TTFont('EsmeraldaPro.ttf')
os2 = f['OS/2']
hhea = f['hhea']

# alinha as métricas Win às métricas hhea (que já batem com a tinta real)
os2.usWinAscent = hhea.ascent
os2.usWinDescent = abs(hhea.descent)

# liga a flag que manda o navegador preferir a métrica Typo, não a Win
os2.fsSelection |= 0x80          # USE_TYPO_METRICS
os2.sTypoAscender = hhea.ascent
os2.sTypoDescender = hhea.descent
os2.sTypoLineGap = 0

f.save('EsmeraldaPro-normalized.ttf')
```

Depois disso, regenera os formatos web a partir desse arquivo normalizado (mesmo processo do Transfonter/fontTools já usado). **Remove qualquer `translateY`/offset manual aplicado a título em Esmeralda** — não deveria ser mais necessário.

## Regra geral (pra qualquer fonte decorativa nova que entrar no projeto)
Antes de usar qualquer fonte de título/decorativa no motor de renderização, roda esse diagnóstico nela (o script de medição, não o de correção) e decide:
- Se `hhea` e `OS/2 win` já batem (diferença < ~5%), não precisa de nada.
- Se divergem como no caso da Esmeralda, normaliza a fonte uma vez, do jeito acima, **antes** de qualquer CSS de ajuste fino. Só depois de normalizar a fonte é que faz sentido discutir se ainda sobra algum ajuste residual — e aí sim, se sobrar, o ajuste é pequeno e específico, não um chute de 12%.

## Por que isso é melhor que a solução anterior
Resolve a causa (arquivo de fonte com metadado incorreto) em vez do sintoma (título alto na tela). Não precisa de regra por fonte nem por bloco — depois de normalizada, a fonte se comporta certo em qualquer contexto (título, corpo, editor, qualquer navegador), eliminando de vez o conflito que causou o vazamento pro texto fantasma (Skill 07) quando a correção era feita via `transform` em vez de na fonte.
