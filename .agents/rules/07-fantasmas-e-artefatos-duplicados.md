# Skill: Textos Fantasmas e Artefatos Duplicados do InDesign

## O bug, na sua forma real (não na versão simplificada que foi "resolvida")
PDFs gerados por InDesign/Illustrator frequentemente deixam **texto vetorial esquecido por baixo de imagens** — versões antigas de rótulos, texto de posicionamento do designer, camadas de acessibilidade, ou simplesmente lixo de revisão que nunca foi apagado. O extrator (PyMuPDF/pdfplumber) lê esse texto como se fosse conteúdo real, porque tecnicamente ele está lá no PDF.

**Isso já apareceu duas vezes neste projeto, disfarçado de dois bugs "diferentes":**
1. Primeira vez: texto de tamanho microscópico (`size < 4.0`) brotando distorcido sobre capas de livro. Foi "corrigido" filtrando qualquer span com `size < 4.0`.
2. Segunda vez: nomes de personagem ("Remi Moretti", "Rook Lars") aparecendo **duplicados** — uma vez como rótulo legível normal, outra vez como um "fantasma" sobreposto na carta, em tamanho de fonte perfeitamente legível. **O filtro de tamanho não pegou esse caso, porque o glifo não é microscópico.**

## A lição
O filtro de `size < 4.0` tratou o **sintoma mais fácil de perceber** (tamanho pequeno), não a **causa real** (texto duplicado/leftover embutido atrás de uma imagem). Isso é exatamente o padrão que a Skill 06 pede pra evitar: corrigir o caso que você conseguiu ver, sem generalizar pra a classe real do problema.

## Heurística de detecção correta (root cause, não sintoma)
Um bloco de texto é candidato a "fantasma/leftover" quando:
- **Seu bounding box está significativamente coberto por um bloco de imagem com z-index igual ou maior** (ou seja, uma imagem foi desenhada por cima dele na mesma região) — isso indica que o texto foi deixado *por baixo* de arte que deveria escondê-lo completamente.
- **Seu conteúdo textual é idêntico (ou quase) a outro bloco de texto legível já extraído na mesma página/região próxima** — duplicata literal do mesmo nome/rótulo em posição ligeiramente diferente é um sinal forte de leftover, independente do tamanho da fonte.
- (O filtro de tamanho continua válido como **sinal adicional**, não como critério único — some com os dois acima, não substitui.)

## O que fazer na extração
1. Pra cada bloco de texto, verificar sobreposição de bbox com blocos de imagem de z-index maior na mesma página. Se a cobertura for >80% da área do texto, marcar como `suspectedGhost: true` no JSON de extração — não decidir sozinho se apaga, só marcar.
2. Rodar uma checagem de duplicata textual por página (mesmo texto normalizado, bounding boxes próximas) e marcar os pares como candidatos.
3. **Nunca decidir automaticamente "isso é lixo, deleto"** — marcar e deixar pra revisão humana no lote de QA (Skill 05). Apagar automaticamente é arriscado igual "consertar às cegas": pode ser um efeito de sombra/profundidade legítimo do design, não necessariamente erro.
4. No `PageRenderer`, blocos marcados `suspectedGhost` não renderizam por padrão, mas ficam disponíveis no modo Admin/QA pra inspeção (não deleta o dado, só não exibe).

## Atualização — por que a heurística original não deu pra implementar como escrita
Na tentativa real de implementação, as duas pernas da heurística original falharam por motivos estruturais legítimos (não preguiça):
1. **"Sobreposição com imagem de z-index maior" não discrimina nada quando o fundo da página inteira já é uma imagem.** Se o background da página é extraído como uma imagem cobrindo ~100% da área, todo texto tecnicamente "sobrepõe uma imagem" — o critério vira sempre-verdadeiro e não separa fantasma de texto legítimo.
2. **"Duplicata textual" não existe nesses casos**, porque o nome legível (ex: "Zeke Jeong") está *rasterizado dentro da própria arte da carta* (é pixel, não texto) — só o fantasma existe como texto extraível. Não há duas instâncias de texto pra comparar, só uma (a errada).

### Critério corrigido
Em vez de comparar contra "qualquer imagem da página", comparar a sobreposição especificamente contra **imagens que NÃO cobrem a maior parte da página** (ou seja, excluir a textura/pergaminho de fundo do cálculo, e comparar só contra assets de conteúdo — arte de carta, ilustração, retrato — que tipicamente ocupam uma fração pequena/média da página). Um bloco de texto cuja bbox está quase inteiramente (>90%) contida dentro do bbox de uma dessas imagens de conteúdo é um forte candidato a fantasma, **mesmo sem duplicata textual** — o critério de duplicata vira reforço opcional, não obrigatório.

Isso é mais barato e mais confiável do que o atalho de tamanho (`size < 7.0`), que é frágil (qualquer legenda pequena legítima de verdade cairia no filtro) e não generaliza — o próprio Gemini já reportou que teve que subir o limiar de 4.0 pra 7.0 na prática, sinal de que o número foi ajustado no olho pra cobrir os casos vistos, não derivado de uma regra real.

## Por que isso importa mais do que parece
Esse padrão (corrigir o sintoma que aparece na tela agora, sem generalizar a causa) já consumiu várias rodadas de correção nesta sessão. Sempre que aparecer um bug "parecido mas não igual" a um já resolvido, é sinal de que a correção anterior foi de sintoma, não de causa — voltar e generalizar, não empilhar mais um filtro específico.
