# Save point: editor de bloco, quebras de linha e rascunhos locais

## Por que esta etapa foi feita

O teste visual do editor na página 2 confirmou dois obstáculos para começar a tradução:

- O editor fixo cobria parte da página. A margem aplicada à página não recalculava o tamanho para a área que sobrava.
- Ao inserir uma quebra de linha no texto traduzido, as linhas ficavam excessivamente afastadas e podiam invadir o conteúdo abaixo.
- A API Payload em `localhost:3000` estava indisponível. O app mantinha o rascunho local, mas o apresentava como falha de salvamento e podia substituir o estado local por uma resposta vazia do servidor.

O objetivo do save point é permitir que o tradutor continue trabalhando e veja claramente quando uma edição ainda está apenas no navegador.

## O que mudou

### Página e editor

O painel do `RichSpanEditor` deixou de ser `position: fixed` sobre a página e passou a ocupar uma coluna lateral no layout do `PageRenderer`. A página fica dentro de `.page-stage`; a escala é calculada a partir do tamanho real dessa área. Assim, abrir o editor reserva espaço para ele e reduz a página proporcionalmente.

As chaves atuais dos blocos foram mantidas para preservar os rascunhos existentes. Esta etapa não altera o extrator, a ordem dos blocos nem o formato persistido.

### Zoom, scroll e edição do índice

O ajuste de escala agora observa o tamanho efetivo de `.page-stage` com `ResizeObserver`, então recalcula quando o painel do editor abre/fecha ou quando a área disponível muda sem um redimensionamento da janela. O zoom continua sendo um multiplicador do ajuste automático. Em ampliações maiores que a área visível, a página começa pelo canto superior esquerdo do viewport rolável para que as bordas não fiquem inacessíveis; quando cabe, as margens automáticas a mantêm centralizada.

No modo admin, as setas e Page Up/Down não acionam a navegação de páginas quando o foco está em `input`, `textarea`, `select` ou em conteúdo editável. Isso permite mover o cursor no texto sem trocar de página. Links internos do índice também passam a selecionar o bloco para edição no admin; fora dele, continuam navegando para a página de destino.

### Quebras de linha

O `:root` do app define `line-height: 145%`. O `.realbox` não declarava a própria altura de linha, então o preview traduzido herdava o valor global. Em tamanhos de fonte menores que o padrão do app, cada `Enter` deixava um vão grande demais.

O `.realbox` agora usa `line-height: 1`, a mesma proporção já usada nas linhas originais. Uma quebra manual continua sendo uma quebra de linha; não deve criar um espaçamento de parágrafo implícito.

### Prévia durante a edição do texto

O modo `Edit Text` atualizava somente o `textarea`; o renderer só recebia o conteúdo novo depois de clicar em `Confirm`. Agora, enquanto esse modo está aberto, cada alteração envia um segmento provisório ao `PageRenderer`, que atualiza o `.realbox` na posição e na largura reais do bloco. `Confirm` aplica o texto ao rascunho do editor; `Cancel` descarta o texto provisório e restaura a prévia anterior. Isso permite avaliar quebras e encaixe sem depender da caixa pequena do editor.

### Salvamento e sincronização

- O app grava em `localStorage` antes de tentar o Payload.
- Se a API falhar, o rascunho continua disponível neste navegador e o aviso informa explicitamente que não foi sincronizado.
- Ao carregar traduções, as entradas do Payload são combinadas com as locais. Uma resposta vazia do servidor não apaga rascunhos locais; se a mesma chave existir nos dois lugares, o valor do servidor prevalece.
- Busca, atualização e remoção no Payload usam `spanKey` e `language`, para não selecionar inadvertidamente uma tradução de outro idioma.

## Limites conhecidos

- Com a API offline, os rascunhos existem somente no `localStorage` do navegador atual. Ainda não há sincronização central nem cópia de segurança automática.
- A coleção Payload declara `spanKey` único globalmente. O filtro por idioma evita alterar um registro de outro idioma, mas a unicidade atual pode impedir criar a mesma chave para um segundo idioma. Resolver isso requer uma migração de schema deliberada.
- `line-height: 1` corrige o espaçamento causado por cada quebra manual; não resolve expansão de texto que exceda a altura original do bloco nem fusão semântica de blocos. O indicador de overflow continua avisando sobre esse caso.
- A configuração local precisa ser reconciliada: o arquivo `.env` usa `DATABASE_URI`, enquanto `payload.config.ts` lê `DATABASE_URL`. Esta etapa não iniciou o Payload nem escreveu no SQLite.

## Regras e QA aplicados

- `.agents/rules/02-schema-e-modelagem-de-dados.md`: preservação dos rascunhos locais e consultas por chave + idioma.
- `.agents/rules/03-motor-de-renderizacao.md`: altura de linha própria para o preview de texto do PDF.
- `.agents/rules/08-raio-de-alcance-de-regras-globais.md`: manter a alteração visual escopada a `.realbox` e conferir o alcance global.
- `.agents/skills/visual-fidelity-qa/SKILL.md`: validar o comportamento no render real da página 2 após o teste visual.
- `.agents/skills/layout-debugging/SKILL.md`: conservar o fluxo do texto no bloco real e diagnosticar sobreposição no renderer.

Verificações executadas: `npm run build -w apps/web` e `npm run lint -w apps/web` passaram. O lint ainda reporta avisos existentes em componentes não alterados; o build ainda reporta que `/texture.png` não foi encontrada durante o build.

Para a correção de zoom e atalhos de edição deste save point, `npm run build -w apps/web` passou em 2026-09-30. O build mantém o aviso já conhecido sobre `/texture.png`. A confirmação visual de zoom ampliado, rolagem até as bordas e seleção de links do índice no modo admin fica pendente no navegador.
