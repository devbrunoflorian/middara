# p.49 — proposta de prosa completa v1 (isolada)

NaNA proposta reúne os quatro parágrafos já preparados em v3 e acrescenta o primeiro IMPORTANT, o título visível e o exemplo da coluna direita. O texto da carta de Combatente continua como arte de componente em inglês.

## Unidades incluídas

- `page_49_block_0__pt-BR`
  - EN: If a figure Attacks a target and the Attack misses or deals no Final Damage, the target may use the COUNTER Ability during the Check if the Target Counters step of the Attack. See The Attack Action Pg. 41.
  - PT-BR draft: undefined
- `page_49_block_1__pt-BR`
  - EN: Adventurers and Command Combatants may use the COUNTER Ability for 2 SP. However, if they successfully Dodged the Attack being Countered, they may reduce the cost of the Counter by 1 SP. Some Items and Disciplines also have the COUNTER Tag listed as an Ability. In cases where there is an SP cost on a COUNTER Tag this SP cost may also be reduced by 1. Intelligent Combatants will only COUNTER if their Combatant Card instructs them to.
  - PT-BR draft: undefined
- `page_49_block_2__pt-BR`
  - EN: To COUNTER, the target being Attacked must have Line of Sight and be within Range of the figure making the Attack Action. If the initial figure that made the Attack Action is blocked by a different opposing figure, that figure may be chosen as the target of the Counter instead. If these requirements are met, the current Attack Action immediately ends and the target being Attacked makes an Attack Action targeting the Attacker.
  - PT-BR draft: undefined
- `page_49_block_3__pt-BR`
  - EN: It is possible for some back and forth to occur when a figure makes a COUNTER during the Check if the Target Counters step of another figure's COUNTER. In these cases, after resolving all Attacks granted by the COUNTER Ability, the figure whose turn it was when the initial Action was made, would resume their turn.
  - PT-BR draft: undefined
- `page_49_block_4__pt-BR`
  - EN: [[symbol:tag.important.icon]]
IMPORTANT: Choosing to Counter or using an Ability that 
gives you a Counter will interrupt and cancel any other Action 
or Ability that is currently occurring other than the Ability that 
gave you the Counter. Meaning, that the Attacker who was 
Countered never reaches the "Use Follow Up Abilities" step of 
an attack.
  - PT-BR draft: [[symbol:tag.important.icon]]IMPORTANTE: Escolher Contra-atacar ou usar uma Habilidade que conceda um Contra-ataque interrompe e cancela qualquer outra Ação ou Habilidade em andamento, exceto a que concedeu o Contra-ataque. Assim, o atacante contra-atacado nunca chega à etapa “Usar Habilidades de Acompanhamento” do Ataque.
- `page_49_block_7__pt-BR`
  - EN: Counter
  - PT-BR draft: Contra-ataque
- `page_49_block_8__pt-BR`
  - EN: Example: Rook is Attacked by an adjacent Cave Sickle. The Cave Sickle rolls a 10, which hits Rook for 1 PHYSICAL DMG. However, Rook's SHIELD gives him +1 Armor and reduces the Damage to 0. Since Rook was not dealt Damage from the Attack, Rook can Exhaust his SHIELD to COUNTER the Attack.
  - PT-BR draft: Exemplo: Uma Cave Sickle adjacente ataca Rook e rola 10, acertando-o e causando 1 de DANO FÍSICO. Porém, o ESCUDO de Rook concede +1 de Armadura e reduz o Dano a 0. Como Rook não sofreu Dano no Ataque, pode exaustar o ESCUDO para CONTRA-ATACAR.

## Pendências preservadas

- O segundo IMPORTANT (block_25) continua bloqueado: três tentativas já excederam o limite inferior do frame. Ficou fora do snapshot desta versão.
- O título “Contra-ataque” e termos como Counter, Counter Ability, Countered, Follow Up Abilities, Physical DMG e Cave Sickle aguardam revisão terminológica humana.
- O card físico e seus rótulos permanecem em inglês; a arte não foi reconstruída como texto de prosa.
- A tradução completa da página ainda não está concluída.

## Integridade e reprodução

- PDF fonte SHA-256: `a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351`.
- DOM p.49 SHA-256: `bf7755a493cb02d63414a32f28fb225a01fe1673fbe71b9fca77e042be0f7041`.
- O snapshot reaproveita os assets congelados da v3 após comparar seus hashes com o sidecar canônico atual.
- Payload consultado por GET somente leitura: 0 registros PT-BR da p.49 no preflight; 0 requests de escrita.
- Próximo passo: executar `scripts/export_page_pdf.mjs` contra o snapshot e comparar Viewer/PDF, mantendo os bloqueios acima explícitos.
