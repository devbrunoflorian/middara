# Página 003 — Contents

- **Origem EN:** extraída diretamente do PDF oficial, página impressa 3.
- **Fidelidade EN:** verificada em comparação de página inteira PDF↔app após o tracer tipográfico da p. 3; evidência e método em `docs/project-progress/2026-10-01-book-wide-typographic-units.md` e imagens locais `tmp/page3-{app,pdf}-after.png`.
- **PT-BR:** há um rascunho editorial dos 40 itens; ele ainda não foi importado como página completa nem aprovado no preview. O override de título `Índice` já existente no Payload é preservado e está em conflito com o rascunho `Sumário`.
- **Rechecagem da fonte (2026-10-04):** PDF original p. 3 tem os mesmos 40 títulos na mesma ordem e 40 números de destino; pareamento por linha/baseline confirmou 0 divergências.
- **Hierarquia:** o título usa EsmeraldaPro 30 pt com alternates no PDF; primeiro nível usa Cinzel-Regular 12 pt com peso visual 700 validado por override local; segundo nível usa OptimaLTStd-Bold 9 pt. Não colapsar níveis.
- **Texto não traduzível:** referências de páginas e líderes pontilhados são preservados como estrutura. O “3” do rodapé é número da página, não item do sumário.

## Título da página

**EN:** Contents

**PT-BR (rascunho):** Sumário

**Conflito de estado existente:** o Payload já contém `page_3_block_0`/PT-BR = “Índice”. Esse registro foi preservado e não foi sobrescrito. “Sumário” é o rascunho editorial para `Contents`; o título precisa ser reconciliado antes de salvar a tradução completa ou aprovar o preview PT.

**Layout/DTP:** EsmeraldaPro 30 pt. O PDF usa alternates nos caracteres `n` do original; ao renderizar `Sumário`, selecionar alternates adequados ao texto PT se disponíveis. Preservar o tamanho e a hierarquia do título; não reduzir para caber.

**Expansão:** -12%.

## Itens do sumário

### 01. Nível 1 — página 4

**EN:** **Summary of Components**

**PT-BR (rascunho):** **Resumo dos Componentes**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** +5% (EN 21 → PT 22).

---

### 02. Nível 1 — página 8

**EN:** **Choosing a Game Mode**

**PT-BR (rascunho):** **Escolher um Modo de Jogo**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** +20% (EN 20 → PT 24).

---

### 03. Nível 2 — página 9

**EN:** **CRAWL MODE**

**PT-BR (rascunho):** **MODO CRAWL**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +0% (EN 10 → PT 10).

---

### 04. Nível 2 — página 10

**EN:** **ADVENTURE MODE**

**PT-BR (rascunho):** **MODO AVENTURA**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -7% (EN 14 → PT 13).

---

### 05. Nível 1 — página 14

**EN:** **Playing Encounters**

**PT-BR (rascunho):** **Jogar Encontros**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** -17% (EN 18 → PT 15).

---

### 06. Nível 2 — página 14

**EN:** **READING ENCOUNTERS**

**PT-BR (rascunho):** **LENDO ENCONTROS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -17% (EN 18 → PT 15).

---

### 07. Nível 2 — página 21

**EN:** **TILES AND TERRAIN**

**PT-BR (rascunho):** **PEÇAS E TERRENOS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; `Tiles`/`Terrain` conforme glossário.

**Expansão por caracteres:** -6% (EN 17 → PT 16).

---

### 08. Nível 1 — página 24

**EN:** **Adventurers and Items**

**PT-BR (rascunho):** **Aventureiros e Itens**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** -5% (EN 21 → PT 20).

---

### 09. Nível 2 — página 24

**EN:** **PLAYING ADVENTURERS**

**PT-BR (rascunho):** **JOGAR COM AVENTUREIROS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +16% (EN 19 → PT 22).

---

### 10. Nível 2 — página 27

**EN:** **ITEM TIERS AND TYPES**

**PT-BR (rascunho):** **NÍVEIS E TIPOS DE ITEM**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +10% (EN 20 → PT 22).

---

### 11. Nível 2 — página 27

**EN:** **SELLING ITEMS**

**PT-BR (rascunho):** **VENDER ITENS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -8% (EN 13 → PT 12).

---

### 12. Nível 2 — página 28

**EN:** **ITEM UPGRADES**

**PT-BR (rascunho):** **APRIMORAMENTOS DE ITEM**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; termo oficial `Aprimoramento de Item`.

**Expansão por caracteres:** +69% (EN 13 → PT 22).

**Sinal de copyfit:** acima de 20%; manter esta tradução por enquanto e conferir a largura real até os líderes pontilhados no preview PT. O número sozinho não prova overflow; preservar a hierarquia/tamanho.

---

### 13. Nível 2 — página 30

**EN:** **ICONS, CONDITIONS, AND SYMBOLS**

**PT-BR (rascunho):** **ÍCONES, CONDIÇÕES E SÍMBOLOS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -7% (EN 30 → PT 28).

---

### 14. Nível 2 — página 92

**EN:** **TAGS**

**PT-BR (rascunho):** **TAGS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; nome de mecânica sem entrada oficial no glossário.

**Expansão por caracteres:** +0% (EN 4 → PT 4).

---

### 15. Nível 2 — página 32

**EN:** **DISCIPLINE TREES**

**PT-BR (rascunho):** **ÁRVORES DE DISCIPLINA**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +31% (EN 16 → PT 21).

**Sinal de copyfit:** acima de 20%; manter esta tradução por enquanto e conferir a largura real até os líderes pontilhados no preview PT. O número sozinho não prova overflow; preservar a hierarquia/tamanho.

---

### 16. Nível 2 — página 33

**EN:** **CONVICTION AND UPGRADES**

**PT-BR (rascunho):** **CONVICÇÃO E APRIMORAMENTOS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +13% (EN 23 → PT 26).

---

### 17. Nível 1 — página 36

**EN:** **An Adventurer's Turn**

**PT-BR (rascunho):** **Turno do Aventureiro**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** +0% (EN 20 → PT 20).

---

### 18. Nível 2 — página 36

**EN:** **THE INITIATIVE TRACK**

**PT-BR (rascunho):** **TRILHA DE INICIATIVA**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +0% (EN 20 → PT 20).

---

### 19. Nível 2 — página 37

**EN:** **PHASES OF AN ADVENTURER'S TURN**

**PT-BR (rascunho):** **FASES DO TURNO DO AVENTUREIRO**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -3% (EN 30 → PT 29).

---

### 20. Nível 2 — página 38

**EN:** **SPENDING STAMINA POINTS**

**PT-BR (rascunho):** **GASTAR PONTOS DE VIGOR**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -4% (EN 23 → PT 22).

---

### 21. Nível 2 — página 38

**EN:** **STANDARD ACTIONS AND ABILITIES**

**PT-BR (rascunho):** **AÇÕES PADRÃO E HABILIDADES**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -13% (EN 30 → PT 26).

---

### 22. Nível 2 — página 38

**EN:** **ALLIES, OPPONENTS, AND FIGURES**

**PT-BR (rascunho):** **ALIADOS, OPONENTES E MINIATURAS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; `Figures` conforme glossário.

**Expansão por caracteres:** +3% (EN 30 → PT 31).

---

### 23. Nível 2 — página 39

**EN:** **THE MOVE ACTION**

**PT-BR (rascunho):** **AÇÃO DE MOVIMENTO**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +13% (EN 15 → PT 17).

---

### 24. Nível 2 — página 41

**EN:** **THE ATTACK ACTION**

**PT-BR (rascunho):** **AÇÃO DE ATAQUE**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -18% (EN 17 → PT 14).

---

### 25. Nível 2 — página 46

**EN:** **THE RE-EQUIP ACTION**

**PT-BR (rascunho):** **AÇÃO DE REEQUIPAR**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -11% (EN 19 → PT 17).

---

### 26. Nível 2 — página 47

**EN:** **USING ABILITIES**

**PT-BR (rascunho):** **USAR HABILIDADES**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +7% (EN 15 → PT 16).

---

### 27. Nível 2 — página 53

**EN:** **SPELL ACTION**

**PT-BR (rascunho):** **AÇÃO DE FEITIÇO**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; `Spell` conforme glossário.

**Expansão por caracteres:** +25% (EN 12 → PT 15).

**Sinal de copyfit:** acima de 20%; manter esta tradução por enquanto e conferir a largura real até os líderes pontilhados no preview PT. O número sozinho não prova overflow; preservar a hierarquia/tamanho.

---

### 28. Nível 1 — página 56

**EN:** **Combatants**

**PT-BR (rascunho):** **Combatentes**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** +10% (EN 10 → PT 11).

---

### 29. Nível 2 — página 58

**EN:** **COMMAND COMBATANTS**

**PT-BR (rascunho):** **COMANDAR COMBATENTES**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +11% (EN 18 → PT 20).

---

### 30. Nível 2 — página 58

**EN:** **INTELLIGENT COMBATANTS**

**PT-BR (rascunho):** **COMBATENTES INTELIGENTES**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +9% (EN 22 → PT 24).

---

### 31. Nível 1 — página 68

**EN:** **Other Important Rules**

**PT-BR (rascunho):** **Outras Regras Importantes**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** +19% (EN 21 → PT 25).

---

### 32. Nível 2 — página 68

**EN:** **SKILL CHECKS**

**PT-BR (rascunho):** **TESTES DE HABILIDADE**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; `Skill Check` conforme glossário.

**Expansão por caracteres:** +67% (EN 12 → PT 20).

**Sinal de copyfit:** acima de 20%; manter esta tradução por enquanto e conferir a largura real até os líderes pontilhados no preview PT. O número sozinho não prova overflow; preservar a hierarquia/tamanho.

---

### 33. Nível 2 — página 69

**EN:** **BEING DEFEATED**

**PT-BR (rascunho):** **SER DERROTADO**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** -7% (EN 14 → PT 13).

---

### 34. Nível 2 — página 72

**EN:** **SCALING ICONS**

**PT-BR (rascunho):** **ÍCONES ESCALÁVEIS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; termo de mecânica ainda candidato.

**Expansão por caracteres:** +31% (EN 13 → PT 17).

**Sinal de copyfit:** acima de 20%; manter esta tradução por enquanto e conferir a largura real até os líderes pontilhados no preview PT. O número sozinho não prova overflow; preservar a hierarquia/tamanho.

---

### 35. Nível 2 — página 75

**EN:** **SPECIAL ASSEMBLAGE DISCIPLINES**

**PT-BR (rascunho):** **DISCIPLINAS ESPECIAIS DE ASSEMBLAGE**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; `Assemblage` preservado como nome próprio.

**Expansão por caracteres:** +17% (EN 30 → PT 35).

---

### 36. Nível 2 — página 78

**EN:** **SPECIAL MARTIAL DISCIPLINES**

**PT-BR (rascunho):** **DISCIPLINAS MARCIAIS ESPECIAIS**

**Estilo fonte:** OptimaLTStd-Bold 9 pt.

**Expansão por caracteres:** +11% (EN 27 → PT 30).

---

### 37. Nível 2 — página 79

**EN:** **ALTERNATE, VARIATIONS, AND LOOT LVL**

**PT-BR (rascunho):** **ALTERNATIVOS, VARIAÇÕES E NÍVEL DE SAQUE**

**Estilo fonte:** OptimaLTStd-Bold 9 pt; `Loot` conforme glossário.

**Expansão por caracteres:** +14% (EN 35 → PT 40).

---

### 38. Nível 1 — página 85

**EN:** **Abraxis Battle Dice**

**PT-BR (rascunho):** **Dados de Batalha de Abraxis**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** +42% (EN 19 → PT 27).

**Sinal de copyfit:** acima de 20%; manter esta tradução por enquanto e conferir a largura real até os líderes pontilhados no preview PT. O número sozinho não prova overflow; preservar a hierarquia/tamanho.

---

### 39. Nível 1 — página 86

**EN:** **Variants**

**PT-BR (rascunho):** **Variantes**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** +12% (EN 8 → PT 9).

---

### 40. Nível 1 — página 101

**EN:** **Index**

**PT-BR (rascunho):** **Índice**

**Estilo fonte:** Cinzel-Regular 12 pt; peso visual 700 confirmado localmente; small-caps do PDF.

**Expansão por caracteres:** +20% (EN 5 → PT 6).

---

## Termos sem entrada oficial

- **Crawl Mode → Modo Crawl:** manter como candidato local; o antigo rascunho p. 3 já usava “Modo Crawl”, mas não foi tratado como glossário oficial.
- **Tags:** mantido como empréstimo para o conceito formal do livro; revisar consistência quando páginas 91–92 forem auditadas.
- **Scaling Icons → Ícones Escaláveis:** candidato contextual; p. 72 descreve ícones cujo valor depende de outra carta/personagem.
- **Assemblage:** preservado sem tradução como nome próprio da árvore de disciplinas.
- **Alternate → Alternativos:** tradução provisória do tipo/tag de Combatant descrito na p. 79.

## QA PT pendente

- Resolver o conflito entre o título de origem `Contents`, o rascunho `Sumário` e o override já salvo `Índice` sem apagar conteúdo existente.
- Renderizar a coluna PT e conferir todos os títulos longos junto aos líderes/page refs, com foco em `ITEM UPGRADES`, `DISCIPLINE TREES`, `SPELL ACTION`, `SKILL CHECKS`, `SCALING ICONS` e `ABRAXIS BATTLE DICE`.
- Confirmar alternates Esmeralda para “Sumário” e se o render PT consegue preservar o mesmo tratamento do título.
- Conferir candidatos de terminologia com o restante do livro; esta lista não altera o glossário oficial.
- Validar no preview os caracteres acentuados e o peso bold sem usar o limite de 20% como teste de encaixe.
