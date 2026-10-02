# Entrevista de design: editor de layout de texto

- **Status:** entrevista concluída; roadmap documentado. Implementação, branch feature e mudança de schema adiadas.
- **Data:** 2026-10-02.
- **Branch:** `codex/book-visual-batch-audit`.
- **Pedido do usuário:** avaliar um editor acessível em modo Admin para ajustar boxes/blocos de texto manualmente e persistir layouts de inglês e PT separadamente.

## Requisitos já declarados

- Um controle para editar a box deve aparecer apenas em modo Admin.
- O usuário detalhou a ativação em camadas: entrar no modo de edição/Admin; então aparece um segundo botão flutuante no canto superior esquerdo; só ao clicar nele abre o ambiente de layout com régua e ferramentas.
- O usuário quer poder ajustar posição/dimensões, rotação de 0° a 360° e quebra de linha, inclusive em textos diagonais raros que seriam trabalhosos de modelar à mão durante a extração.
- Layouts precisam persistir no banco, com configuração inglesa e portuguesa independente; inglês serve de base/padrão para PT.
- Preservar a experiência de edição existente, conteúdo já salvo e as regras de granularidade do projeto.
- O usuário autorizou concluir e publicar o trabalho pendente anterior antes desta entrevista. Não autorizou ainda implementação, migração ou alteração de schema do editor.
- Antes de implementar, criar uma branch própria a partir da branch atual já publicada (`codex/book-visual-batch-audit`), mantendo o trabalho de fidelidade isolado. A branch do editor ainda não foi criada; esperar o fim da entrevista para não codificar com requisitos em aberto.
- **Escopo confirmado pelo usuário:** não construir agora; concluir o `Grill Me` e deixar a ferramenta documentada como roadmap/futuro.

## Clarificação do usuário e fatos encontrados no código

- O usuário esclareceu que a ferramenta serve para **diagramar a moldura**: mover a box para os lados, deixar limites/margens mais adequados ao texto e controlar as quebras, como num editor de página. É uma ferramenta visual de composição, além dos ajustes especiais de rotação para linhas diagonais.
- A ferramenta completa de layout deve ficar opt-in durante a edição, não cobrir a página continuamente: o botão flutuante abre/fecha o modo com régua e demais controles.
- Hoje `Block.bbox`/linha-fonte representa a tinta extraída do PDF; `LayoutFrame` descreve espaço de layout separado e só tem `x`, `width`, `textAlign` e `lineHeight`. A página 2 carrega um sidecar estático `layout_frames.json`; ele não é editável no app nem persistido no Payload.
- `SpanOverride` guarda segmentos, bbox e alinhamento, mas não rotação nem uma moldura completa com posição, largura e altura. O Payload guarda overrides com campo `language`, enquanto `Translations.spanKey` é atualmente único; units novos podem qualificar a chave pelo idioma. Qualquer extensão precisa preservar a compatibilidade das chaves legadas e drafts já existentes.
- O renderer seleciona units existentes (`block.editorKey`, linhas, créditos e runs tipográficos). Criar/mesclar/dividir conteúdo e ajustar a geometria da moldura são capacidades distintas e não devem ser presumidas como a mesma operação.
- **Decisão aceita na entrevista:** versão inicial transforma apenas a moldura da unidade já selecionada; criação, junção ou divisão de unidades de texto ficam fora do primeiro corte. O texto-fonte, sua bbox e a granularidade/key permanecem intactos.
- **Decisão aceita na entrevista:** frame PT herda o frame EN enquanto não tiver customização PT. No primeiro ajuste manual em PT, grava-se um override independente; alterações futuras em EN não substituem esse override. O comportamento de reset para voltar a herdar ainda pode ser definido por convenção de produto.
- **Decisão aceita na entrevista:** o preview da geometria atualiza ao vivo, mas persistir exige ação explícita Salvar; deve haver Descartar para abandonar a tentativa. O método de persistência (Payload + fallback local) e proteção contra falha devem respeitar o fluxo atual do editor.
- **Decisão aceita na entrevista:** redimensionar manipula somente a moldura e o reflow; família/tamanho/peso/itálico do texto não escalam. A edição tipográfica continua separada no rich-span editor.
- **Decisão aceita na entrevista:** persistir geometria numa coleção Payload própria de layouts, separada dos rascunhos de texto. Deve haver um registro associado à unidade editável e ao idioma; a consulta EN serve de base para PT sem colisão com keys legadas.
- **Decisão aceita na entrevista:** ativado o modo de layout, clique em uma moldura seleciona-a e mostra alças; o clique não abre o editor de texto até sair do modo de layout.
- **Decisão aceita na entrevista:** não iniciar implementação agora. Ao concluir o Grill Me, consolidar um documento de roadmap de produto/engenharia; criar branch dedicada e implementar só quando o usuário retomar essa iniciativa.
- As chaves legadas de block (`page_N_block_I`) não incluem idioma; o editor separa os mapas de `localStorage` por idioma, mas a Collection Payload marca `spanKey` como único e as gravações consultam `spanKey + language`. Units semânticas novas qualificam algumas chaves com `__en`/`__pt-BR`. A separação por idioma da geometria exige resolver isso sem colisão nem alteração destrutiva de drafts existentes.

## Método

1. Ler o modelo atual de unidades editáveis, preview, idioma e persistência no Payload; responder pelo código ao que já for conhecido. (Concluído.)
2. Identificar as decisões de produto com maior efeito no modelo de dados e no fluxo de edição.
3. Conduzir a entrevista `Grill Me` em texto, uma pergunta focada por vez, com recomendação e motivo.
4. Ao obter entendimento compartilhado, registrar fluxo, propriedades editáveis, herança EN→PT, salvamento, compatibilidade com drafts/chaves existentes, critérios de aceite e limites.
5. Somente depois de fechar a entrevista, converter o acordo em roadmap; implementação e tracer bullet ficam para uma solicitação futura.

## Limites de segurança

- Não abrir nem controlar o Chrome; a experiência de série do usuário é prioridade neste período.
- Não tocar drafts, traduções, dados do banco ou `localStorage` durante a inspeção.
- Não alterar schema, payload, renderer ou interface até terminar a entrevista e documentar as decisões aceitas.
- Preservar a hierarquia tipográfica original como base, sem forçar todas as boxes a terem as mesmas propriedades.

## Critério de encerramento da entrevista

Há acordo explícito sobre unidade editável/alvo de seleção, propriedades de layout por idioma, modelo de herança EN→PT, preview e salvamento, interação Admin e tratamento de compatibilidade/migração. As perguntas cuja resposta já está determinada pelo código ou por decisões anteriores são respondidas pelo agente, não devolvidas ao usuário.

## Resultado e localização

O usuário confirmou que resetar um frame PT customizado apaga só o override PT, pede confirmação e retorna à geometria EN atual. A entrevista fechou as decisões necessárias para um roadmap; nenhuma implementação, alteração de schema, branch feature, inspeção de traduções ou operação de banco foi feita.

O roadmap futuro está em [`../roadmap/translation-layout-editor.md`](../roadmap/translation-layout-editor.md). A branch dedicada deve ser criada da `codex/book-visual-batch-audit` publicada somente quando o usuário retomar a implementação.
