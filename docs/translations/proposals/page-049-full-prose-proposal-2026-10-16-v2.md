# p.49 — proposta parcial de prosa v2 (7 unidades editáveis)

Esta proposta cobre sete unidades isoladas. Ela permanece pendente de revisão humana e não conclui a página nem certifica a fidelidade inglesa da fonte.

## Unidades incluídas

### `page_49_block_0__pt-BR`

**EN:**

```text
If a figure Attacks a target and the Attack misses or deals no Final Damage, the target may use the COUNTER Ability during the Check if the Target Counters step of the Attack. See The Attack Action Pg. 41.
```

**Rascunho PT-BR:**

```text
Se uma miniatura atacar um alvo e o Ataque errar ou não causar Dano Final, o alvo pode usar a Habilidade CONTRA-ATACAR durante a etapa Verifique o Contra-ataque do Ataque. Consulte Ação de Ataque, p. 41.
```

### `page_49_block_1__pt-BR`

**EN:**

```text
Adventurers and Command Combatants may use the COUNTER Ability for 2 SP. However, if they successfully Dodged the Attack being Countered, they may reduce the cost of the Counter by 1 SP. Some Items and Disciplines also have the COUNTER Tag listed as an Ability. In cases where there is an SP cost on a COUNTER Tag this SP cost may also be reduced by 1. Intelligent Combatants will only COUNTER if their Combatant Card instructs them to.
```

**Rascunho PT-BR:**

```text
Aventureiros e Combatentes de Comando podem usar CONTRA-ATACAR por 2 SP. Se esquivarem com sucesso do Ataque, podem reduzir o custo do Contra-ataque em 1 SP. Alguns Itens e Disciplinas também listam a Tag CONTRA-ATACAR como Habilidade. Se houver custo de SP nessa Tag, ele também pode ser reduzido em 1. Combatentes Inteligentes só usam CONTRA-ATACAR se a Carta de Combatente instruir.
```

### `page_49_block_2__pt-BR`

**EN:**

```text
To COUNTER, the target being Attacked must have Line of Sight and be within Range of the figure making the Attack Action. If the initial figure that made the Attack Action is blocked by a different opposing figure, that figure may be chosen as the target of the Counter instead. If these requirements are met, the current Attack Action immediately ends and the target being Attacked makes an Attack Action targeting the Attacker.
```

**Rascunho PT-BR:**

```text
Para CONTRA-ATACAR, a miniatura atacada precisa ter Linha de Visão e estar ao Alcance da miniatura que realiza a Ação de Ataque. Se uma miniatura adversária diferente bloquear a miniatura que iniciou a Ação de Ataque, ela poderá ser escolhida como alvo do Contra-ataque. Se esses requisitos forem atendidos, a Ação de Ataque atual termina imediatamente, e a miniatura atacada realiza uma Ação de Ataque contra o atacante.
```

### `page_49_block_3__pt-BR`

**EN:**

```text
It is possible for some back and forth to occur when a figure makes a COUNTER during the Check if the Target Counters step of another figure's COUNTER. In these cases, after resolving all Attacks granted by the COUNTER Ability, the figure whose turn it was when the initial Action was made, would resume their turn.
```

**Rascunho PT-BR:**

```text
Uma miniatura pode CONTRA-ATACAR na etapa Verifique o Contra-ataque do Contra-ataque de outra miniatura, gerando uma sequência. Após resolver todos os Ataques concedidos por essa Habilidade, a miniatura cujo turno estava ativo ao início da Ação de Ataque inicial retoma seu turno.
```

### `page_49_block_4__pt-BR`

**EN:**

```text
[[symbol:tag.important.icon]]
IMPORTANT: Choosing to Counter or using an Ability that 
gives you a Counter will interrupt and cancel any other Action 
or Ability that is currently occurring other than the Ability that 
gave you the Counter. Meaning, that the Attacker who was 
Countered never reaches the "Use Follow Up Abilities" step of 
an attack.
```

**Rascunho PT-BR:**

```text
[[symbol:tag.important.icon]]IMPORTANTE: Escolher Contra-atacar ou usar uma Habilidade que conceda um Contra-ataque interrompe e cancela qualquer outra Ação ou Habilidade em andamento, exceto a que concedeu o Contra-ataque. Assim, o atacante contra-atacado nunca chega à etapa “Usar Habilidades de Acompanhamento” do Ataque.
```

Estado local: draft-pending-human-mechanics-review.

### `page_49_block_7__pt-BR`

**EN:**

```text
Counter
```

**Rascunho PT-BR:**

```text
Contra-ataque
```

Estado local: draft-pending-human-term-and-title-fit-review.

### `page_49_block_8__pt-BR`

**EN:**

```text
Example: Rook is Attacked by an adjacent Cave Sickle. The Cave Sickle rolls a 10, which hits Rook for 1 PHYSICAL DMG. However, Rook's SHIELD gives him +1 Armor and reduces the Damage to 0. Since Rook was not dealt Damage from the Attack, Rook can Exhaust his SHIELD to COUNTER the Attack.
```

**Rascunho PT-BR:**

```text
Exemplo: Uma Cave Sickle adjacente ataca Rook e rola 10, acertando-o e causando 1 de DANO FÍSICO. Porém, o ESCUDO de Rook concede +1 de Armadura e reduz o Dano a 0. Como o Ataque não causou Dano, Rook pode exaustar o ESCUDO para CONTRA-ATACAR.
```

Estado local: draft-pending-human-terminology-review.

## O que foi verificado

- As sete chaves e textos do snapshot foram reconhecidos no Editor somente leitura (7/7); Cancel foi usado em cada unidade; zero registros Payload antes e depois, sem requests de escrita.
- Os hashes dos 17 assets da p.49 continuam iguais ao manifesto da proposta; as sete chaves do snapshot correspondem exatamente às sete unidades listadas.
- O exportador oficial reexportou somente a p.49 pelo snapshot e confirmou os sete registros e `pdfVerification: true`.
- O Viewer e o PDF isolado foram comparados em zoom normal; o PDF foi renderizado independentemente com Poppler e inspecionado. Não foram vistas colisões ou cortes nos sete alvos nessa prova.
- Recibo consolidado: `output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2/closeout-receipt-v2.json`.

## Limites mantidos

- O segundo IMPORTANT (override `page_49_block_5__pt-BR`, correspondente ao bloco de origem 25) segue no fallback inglês após exceder o limite de três tentativas de copyfit; nenhuma nova redação foi iniciada.
- A carta de Combatente e seus rótulos continuam em inglês como arte de componente. A proposta não reconstrói essa arte.
- Counter / Counter Ability / Countered, Follow Up Abilities, Physical DMG, Cave Sickle e o título Counter ainda exigem revisão humana de terminologia e mecânica.
- English fidelity permanece `not_certified`; não se declara a página completa nem a suíte do aplicativo aprovada.
- Nenhum Payload, sidecar canônico, PDF-fonte, `background.webp` ou tradução humana foi alterado. Não houve commit nem push.

Provas raster: `output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2/viewer-pt-BR-v2.png` e `output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2/pdf-render-recheck-v1.png`.
