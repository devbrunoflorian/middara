# Entrevista de design: editor de layout de texto

- **Status:** entrevista de requisitos iniciada; nenhuma implementação ou mudança de schema.
- **Data:** 2026-10-02.
- **Branch:** `codex/book-visual-batch-audit`.
- **Pedido do usuário:** avaliar um editor acessível em modo Admin para ajustar boxes/blocos de texto manualmente e persistir layouts de inglês e PT separadamente.

## Requisitos já declarados

- Um controle para editar a box deve aparecer apenas em modo Admin.
- O usuário quer poder ajustar posição/dimensões, rotação de 0° a 360° e quebra de linha, inclusive em textos diagonais raros que seriam trabalhosos de modelar à mão durante a extração.
- Layouts precisam persistir no banco, com configuração inglesa e portuguesa independente; inglês serve de base/padrão para PT.
- Preservar a experiência de edição existente, conteúdo já salvo e as regras de granularidade do projeto.
- O usuário autorizou concluir e publicar o trabalho pendente anterior antes desta entrevista. Não autorizou ainda implementação, migração ou alteração de schema do editor.

## Método

1. Ler o modelo atual de unidades editáveis, preview, idioma e persistência no Payload; responder pelo código ao que já for conhecido.
2. Identificar as decisões de produto com maior efeito no modelo de dados e no fluxo de edição.
3. Conduzir a entrevista `Grill Me` em texto, uma pergunta focada por vez, com recomendação e motivo.
4. Ao obter entendimento compartilhado, registrar fluxo, propriedades editáveis, herança EN→PT, salvamento, compatibilidade com drafts/chaves existentes, critérios de aceite e limites.
5. Somente depois de fechar a entrevista, propor um tracer bullet vertical pequeno antes de expandir a ferramenta.

## Limites de segurança

- Não abrir nem controlar o Chrome; a experiência de série do usuário é prioridade neste período.
- Não tocar drafts, traduções, dados do banco ou `localStorage` durante a inspeção.
- Não alterar schema, payload, renderer ou interface até terminar a entrevista e documentar as decisões aceitas.
- Preservar a hierarquia tipográfica original como base, sem forçar todas as boxes a terem as mesmas propriedades.

## Critério de encerramento da entrevista

Há acordo explícito sobre unidade editável/alvo de seleção, propriedades de layout por idioma, modelo de herança EN→PT, preview e salvamento, interação Admin e tratamento de compatibilidade/migração. As perguntas cuja resposta já está determinada pelo código ou por decisões anteriores são respondidas pelo agente, não devolvidas ao usuário.

## Próximo passo

Inspecionar `CONTINUE-HERE.md`, as regras de granularidade/schema/renderer/persistência e o fluxo atual do editor no código. Em seguida perguntar a decisão de produto ainda não resolvida com maior impacto.
