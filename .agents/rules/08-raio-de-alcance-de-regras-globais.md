# Skill: Raio de Alcance de Regras Globais (CSS e Lógica de Fonte)

## O padrão que se repetiu MAIS vezes nesta sessão
Praticamente toda regressão visual grave veio da mesma causa: **uma regra escrita pra corrigir UM problema específico (uma fonte, um título) foi aplicada de forma global/ampla demais, e quebrou outra coisa que compartilhava a mesma condição.** Lista real do que já aconteceu:

- `font-feature-settings: "swsh" 1` aplicado **globalmente** → quebrou a Adobe Garamond Pro Italic do corpo de texto inteiro (ela também tem swash caps).
- `fontWeight: 700` forçado pra **"toda fonte Cinzel"** → quebrou títulos que deveriam ser Cinzel-Regular, esmagando letras fora da bbox.
- `transform: translateY(12%)` aplicado a **"toda fonte decorativa (Cinzel e Esmeralda)"** → descolou texto invisível (mas corretamente posicionado) de cima de artes de capa, revelando artefatos.
- `display: inline-block` vazado de forma ampla → afetou spans microscópicos que deveriam ficar invisíveis, forçando tamanho mínimo de fonte do navegador e espalhando lixo vetorial pela tela.

## A regra
**Toda correção de estilo nasce escopada ao caso exato que está quebrado — nunca à categoria inteira — e só é ampliada depois de confirmar, um por um, que os outros membros da categoria não têm comportamento diferente.**

Concretamente:
1. Antes de escrever uma regra tipo "toda fonte X faz Y", pergunta: **essa fonte X é usada em mais de um contexto no documento?** (Cinzel aparece em título grande E em texto pequeno de carta — são contextos diferentes, tratamento pode precisar ser diferente.)
2. Se a resposta for sim, a regra tem que ser escopada por contexto também (ex: `fontFamily === 'Cinzel' && role === 'title'`), não só pelo nome da fonte.
3. Depois de aplicar qualquer regra nova, **revisita explicitamente as outras páginas/blocos que usam a mesma fonte/propriedade** antes de considerar terminado — não só a página que motivou a mudança. Isso é literalmente o item 3 do "Fluxo Base de Revisão" que o próprio projeto já escreveu (`visual-fidelity-qa/SKILL.md`) — mas que continuou sendo pulado na prática (o bug do Cinzel bold e do translateY aconteceram exatamente por pular esse passo).

## "Magic numbers" de CSS são débito técnico, não solução
Valores como `letter-spacing: -0.015em`, `translateY(12%)`, `lineHeight: 1.1307` calculado manualmente — são compensações matemáticas pra um problema de fundo (métrica de fonte web ≠ métrica do PDF/Adobe). Isso é aceitável como solução **temporária**, mas:
- Todo "magic number" desses precisa de um comentário no código explicando de onde veio o número e qual bug ele compensa — não só o valor solto.
- Se o mesmo tipo de "magic number" aparece uma segunda vez pra uma fonte diferente (ex: precisar de um `translateY` diferente pra cada fonte decorativa nova), é sinal de que o problema é sistêmico (métrica de em-box vs bbox extraída) e merece uma solução estrutural — ex: calcular o offset automaticamente a partir dos metadados reais da fonte (`hhea`/`OS/2` ascent/descent via fontTools na extração), não caçar o número certo por tentativa e erro pra cada fonte nova.
