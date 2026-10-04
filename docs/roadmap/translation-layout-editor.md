# Roadmap: editor visual de molduras de texto

- **Status:** requisitos entrevistados; primeira fatia retomada e implementada em 2026-10-04 após instrução posterior do usuário; consultar [registro do tracer](../project-progress/2026-10-04-admin-ruler-frame-tracer.md).
- **Decisões:** concluídas com o usuário em 2026-10-02 usando `Grill Me`.
- **Ponto de partida previsto:** branch nova criada da branch publicada `codex/book-visual-batch-audit`, antes de qualquer implementação.

O objetivo de saída posterior para impressão, viewer interativo e empacotamento desktop/mobile está documentado em [`final-output-print-and-app.md`](final-output-print-and-app.md). A entrevista adiou o recurso; a ordem mais recente do usuário retomou o roadmap e autorizou a implementação tracer. A ferramenta continua sem substituir a revisão da tradução e não inicia a fase de exportação para gráfica.

## Problema e resultado pretendido

O texto extraído do PDF tem uma bbox de tinta que descreve onde os glifos originais foram pintados. Essa bbox não é sempre a melhor moldura para compor uma tradução: linhas curtas, centralizadas e diagonais podem precisar de limites, posição, largura, altura e rotação próprios. Hoje a edição permite corrigir conteúdo/estilo, mas não diagramar livremente o frame da unidade na própria página.

O editor futuro permitirá ajustar visualmente o frame de uma unidade textual já editável, com preview imediato e salvamento por idioma. O enquadramento inglês serve como base. Português pode herdar o frame inglês e, quando for personalizado, manter sua própria configuração.

## Fluxo de edição decidido

1. O operador ativa o modo Admin/edição normal.
2. Nessa condição aparece um segundo botão flutuante no canto superior esquerdo.
3. Acionar esse botão abre/fecha o modo de layout e suas réguas/ferramentas. Fora desse modo, a visualização e o fluxo existente permanecem desimpedidos.
4. No modo de layout, clicar numa moldura seleciona-a e mostra alças. Arrastar move/redimensiona; os controles também permitem rotação precisa.
5. Alterações aparecem no preview, mas não são persistidas até **Salvar**. **Descartar** restaura o último estado salvo.
6. Sair do modo de layout devolve o clique à edição normal do conteúdo; a seleção da moldura não deve abrir acidentalmente o rich-span editor.

## Escopo da primeira versão

- Ajustar apenas o frame da unidade editável selecionada. Não criar, agrupar, mesclar ou dividir unidades de texto neste primeiro corte.
- Geometria manipulável: posição X/Y, largura, altura e rotação entre 0° e 360°. A largura determina reflow/quebras; altura define uma área visual de referência e diagnóstico.
- Redimensionar afeta só o frame. Preservar fonte, tamanho, peso, itálico, cores, texto-fonte, bbox de tinta e chave/granularidade da unidade.
- Rotação transforma o frame e todo o texto contido como uma unidade, sem alterar seus estilos. Usar pivô central como padrão inicial; testar linhas com uma orientação consistente antes de oferecer casos mistos.
- Régua e medidas devem seguir as dimensões reais da página e acompanhar zoom. Coordenadas internas permanecem nas unidades do PDF; conversão para unidades amigáveis à interface é uma escolha de implementação.
- Ajustes tipográficos continuam no editor rich-span. A ferramenta de layout não escala glifos.
- Overflow continua visível e diagnosticável: não recortar silenciosamente texto nem invadir colunas/arte protegidas. Altura do frame e colisão vertical são verificações separadas da largura/reflow.

## EN/PT, herança e persistência

- **Inglês é a base.** Sem override PT, o renderer usa a geometria EN atual.
- No primeiro salvamento geométrico em PT, criar um override independente. Mudanças futuras no frame EN não substituem um frame PT já personalizado.
- “Resetar layout PT” apaga só o override PT e retorna à herança EN atual; pedir confirmação. Nunca alterar o frame EN ou a bbox-fonte.
- Preview ao vivo é provisório. Salvar é explícito; Descartar, fechar ou trocar de página/idioma com mudanças pendentes deve avisar, seguindo as salvaguardas já usadas para rascunhos PT.
- Salvar localmente primeiro, sincronizar com Payload e distinguir claramente “gravado localmente, não sincronizado” de sucesso remoto. Nunca afirmar sincronização sem resposta bem-sucedida.
- O usuário escolheu uma coleção Payload própria para configurações de layout, separada do conteúdo/estilo da tradução. Proposta de identidade estável: chave da unidade editável + idioma (e associação da página para navegação/validação), com unicidade por unidade e idioma.
- PT sem registro próprio herda EN. Evitar criar registros de layout PT vazios.
- Preservar chaves legadas `page_N_block_I`, registros e drafts. Há incompatibilidade atual a resolver: a collection `translations` marca `spanKey` globalmente unique, enquanto algumas unidades legadas reutilizam a chave em idiomas distintos. A coleção nova deve evitar depender dessa unicidade; nenhuma migração de `translations` está autorizada por este roadmap.

## Fronteira de dados e renderer

- Manter **source ink bbox** imutável como evidência do PDF e referência de seleção/fidelidade.
- Manter **translation layout frame** independente, com ao menos `x`, `y`, `width`, `height`, `rotation`, `textAlign` e `lineHeight`. Confirmar necessidade de padding interno por lado num tracer, sem redefinir a bbox de tinta.
- Aplicar o frame à camada editável/renderizada do texto sem modificar o PDF de fundo, artwork, spans-fonte ou dados extraídos.
- Preservar a hierarquia e os runs mistos do texto dentro do frame. Não achatar um heading + corpo em estilo único.
- Preview e seleção devem manter a distinção: outline-fonte identifica a tinta original durante edição; handles do modo de layout representam o frame traduzido.

## Tracer bullet retomado

O usuário retomou esta iniciativa em 2026-10-04 e pediu execução autônoma sem novas aprovações rotineiras. Já foi implementada a régua Admin e o preview manipulável de um bloco padrão. Quando continuar:

1. Criar branch dedicada da branch publicada atual e reler handoff/rules.
2. Modelar a nova coleção e testar CRUD/local-first de uma única unidade EN/PT, sem mudar drafts de texto existentes.
3. Escolher um bloco normal na página 2 como tracer: mover X/Y, mudar largura e altura, verificar quebra/overflow, salvar, recarregar e comparar persistência EN/PT. PT deve herdar EN antes do primeiro ajuste e sobreviver a alterações posteriores no frame EN depois de ter override próprio.
4. Implementar os estados UI/Admin separados e Salvar/Descartar só depois de provar o round-trip do frame.
5. Validar um único caso diagonal real em que a unidade editável tenha orientação coerente. Se a unidade extraída misturar orientações, marcá-la como não suportada nessa fatia; não girar conteúdo vizinho nem expandir silenciosamente a granularidade.
6. Só ampliar a classes de página depois de evidência visual e de persistência do tracer.

## Critérios de aceite futuros

- Controles de layout aparecem somente em Admin e o modo completo fica fechado até o usuário acionar o botão flutuante.
- Selecionar/arrastar uma moldura não abre nem altera texto. Sair do modo de layout restaura os cliques de edição normal.
- Frame EN move/redimensiona/gira e altera a quebra sem mudar a bbox-fonte, texto ou estilos tipográficos.
- Preview reflete mudanças; Salvar persiste no banco e sobrevive a reload; Descartar restaura estado salvo; falha de rede deixa um estado local explícito.
- PT herda EN até personalização, preserva override local quando EN muda, e reset volta à geometria EN com confirmação.
- Conteúdo longo continua visível em overflow, com indicador claro; nenhum clipping silencioso.
- Rascunhos e keys existentes seguem intactos, sem conflito de idioma.
- Ao menos um frame normal e um caso diagonal são comparados com o PDF/app antes de declarar o primeiro corte concluído.

## Não objetivos deste roadmap

- Não traduzir ou corrigir o conteúdo do PDF.
- Não editar source bboxes, extração, PDF de fundo, cartas, imagens ou artwork.
- Não oferecer transformação de fonte nem reescrever a hierarquia tipográfica.
- Não resolver segmentação semântica global, criação/mesclagem/divisão de unidades, edição livre de arte ou alteração de 102 páginas em lote.
- Não migrar nem remover traduções existentes.
