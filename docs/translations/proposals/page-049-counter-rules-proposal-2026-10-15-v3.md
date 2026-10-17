# p.49 — regras de Contra-ataque, proposta v3

A revisão v3 ajusta somente os parágrafos 2 e 4 após a reconciliação v2 encontrar overflow de 1,1 pt à direita no bloco 1 e uma linha adicional no bloco 3. Não houve redução de fonte, mudança de frame ou alteração dos quatro placements inline.

## Resultado

O exportador oficial gerou um PDF isolado e verificou os quatro overrides. Contagem de linhas-fonte/alvo: {"page_49_block_0":4,"page_49_block_1":7,"page_49_block_2":7,"page_49_block_3":5} / {"page_49_block_0":4,"page_49_block_1":7,"page_49_block_2":7,"page_49_block_3":5}. Ajuste aos frames-fonte: passou nos quatro blocos. Colisões entre unidades: 0.

- Bloco 0: Se uma miniatura atacar um alvo e o Ataque errar ou não causar Dano Final, o alvo pode usar a Habilidade CONTRA-ATACAR durante a etapa Verifique o Contra-ataque do Ataque. Consulte Ação de Ataque, p. 41.
- Bloco 1: Aventureiros e Combatentes de Comando podem usar CONTRA-ATACAR por 2 SP. Se esquivarem com sucesso do Ataque, podem reduzir o custo do Contra-ataque em 1 SP. Alguns Itens e Disciplinas também listam a Tag CONTRA-ATACAR como Habilidade. Se houver custo de SP nessa Tag, ele também pode ser reduzido em 1. Combatentes Inteligentes só usam CONTRA-ATACAR se a Carta de Combatente instruir.
- Bloco 2: Para CONTRA-ATACAR, a miniatura atacada precisa ter Linha de Visão e estar ao Alcance da miniatura que realiza a Ação de Ataque. Se uma miniatura adversária diferente bloquear a miniatura que iniciou a Ação de Ataque, ela poderá ser escolhida como alvo do Contra-ataque. Se esses requisitos forem atendidos, a Ação de Ataque atual termina imediatamente, e a miniatura atacada realiza uma Ação de Ataque contra o atacante.
- Bloco 3: Uma miniatura pode CONTRA-ATACAR na etapa Verifique o Contra-ataque do Contra-ataque de outra miniatura, gerando uma sequência. Após resolver todos os Ataques concedidos por essa Habilidade, a miniatura cujo turno estava ativo ao início da Ação de Ataque inicial retoma seu turno.

A revisão terminológica de CONTRA-ATACAR, Combatentes de Comando, Combatentes Inteligentes, Ataque e Tag continua pendente. A proposta não autoriza aplicação canônica nem afirma que a p.49 inteira esteja pronta.

## Provas

- PDF isolado: `output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v3/page-049-pt-BR-counter-rules-proposal-v3.pdf` (SHA-256 `1d9fde566f89ec87ddeb01dcc8d364fb15a9b4e9b553d9a338b26d830d012579`).
- Comparação fonte EN / Viewer PT-BR / PDF: `docs/project-progress/evidence/2026-10-15-p049-counter-rules-v3/source-viewer-pdf-crop.png`.
- Reconciliação independente de copyfit: `docs/project-progress/evidence/2026-10-15-p049-counter-rules-v3/copyfit-reconciliation-v3.json`.
- Snapshot reproduzível: `output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v3/snapshot/snapshot.json`.
