# Projeto Pendente: Pré-carregamento por idioma e skeleton loaders

- **Status:** PRIMEIRA FATIA IMPLEMENTADA; validação visual e medição de desempenho pendentes.
- **Prioridade:** ALTA após estabilizar a localização das páginas.
- **Área:** Performance do Viewer / experiência de navegação.
- **Objetivo:** evitar que cada navegação renderize a página do zero ou mostre primeiro o inglês enquanto a tradução PT-BR ainda carrega.

## Escopo

1. Pré-carregar e manter preparadas em cache as **10 páginas seguintes** no idioma atualmente selecionado. Ao avançar, a página deve aparecer já no idioma ativo sempre que estiver dentro da janela de cache.
2. Em uma falta de cache, renderizar um **skeleton loader de página** — preservar proporção e estrutura visual aproximada enquanto o conteúdo é preparado. Não mostrar spinner nem trocar temporariamente para EN quando PT-BR está selecionado.
3. Manter editáveis texto, símbolos, seleção e ferramentas administrativas; o cache não pode achatar o Viewer em uma imagem sem interação.
4. Invalidar ou atualizar a entrada correspondente quando tradução, moldura de layout, símbolo ou arte mudar. Evitar servir uma versão antiga após salvar e manter um limite de memória previsível com descarte das páginas mais distantes.
5. Tratar troca de idioma explicitamente: preparar dados e recursos do idioma de destino antes de substituir a página visível; em caso de cache miss, manter o skeleton até a página desse idioma estar pronta.

## Critérios de aceite

- Com EN ativo, a navegação sequencial mantém as 10 próximas páginas preparadas em EN; com PT-BR ativo, faz o mesmo em PT-BR.
- Uma página PT-BR nunca pisca para EN durante carregamento. Se ainda não estiver pronta, o skeleton ocupa o mesmo espaço da página e não causa salto de layout.
- Salvar tradução, frame, símbolo ou arte invalida a página afetada sem limpar desnecessariamente as outras páginas em cache.
- Medir latência de navegação antes/depois e memória usada em desktop e dispositivos móveis; ajustar a janela se os dados mostrarem pressão de memória.
- Verificar que zoom, navegação contínua, leitura de texto, acessibilidade e ferramentas Admin continuam funcionando.


## Dependência

O PDF digital completo foi montado e os problemas imediatos das pp.33, 41 e 101 foram corrigidos. A revisão visual integral e a saída para gráfica continuam como trilhas separadas; esta otimização não altera o PDF entregue.

## Implementação inicial — 2026-11-28

- `PageData` usa cache LRU de 12 páginas; a página ativa prepara até 10 páginas seguintes, em lotes concorrentes de no máximo duas páginas, depois que o conteúdo visível aparece. Requisições duplicadas compartilham a mesma promessa e os sidecars de cada página são lidos em paralelo.
- Os backgrounds seguintes são requisitados com prioridade baixa. Dados de página são independentes de idioma; os overrides do servidor ficam em cache separado por idioma por 30 segundos e são invalidados quando chega um evento de persistência local.
- Cache miss mostra skeleton com a mesma proporção e escala calculada pelo viewport. Durante uma troca de idioma, o PageRenderer cobre a página até os overrides daquela língua estarem prontos; isso evita exibir brevemente os overrides da língua anterior. Falha de carregamento da página oferece nova tentativa.
- A rolagem contínua substitui os blocos pretos por skeletons e revela cada página conforme termina de carregar. Ao sair desse modo, a fila para de atualizar o estado da tela.
- Uma alteração de moldura invalida somente a entrada da página atual; outras páginas permanecem no cache. Texto, símbolos, ferramentas Admin e layout editável continuam no PageRenderer.
- **Validação feita:** `npm run build -w apps/web` passou em 2026-11-28. Nenhuma suíte de testes nem comparação visual/runtime foi executada nesta fatia. O build manteve o aviso existente de `/texture.png` e do bundle principal acima de 500 kB.

## Trabalho restante

- Abrir o Viewer e confirmar navegação sequencial EN/PT-BR sem flash, skeleton em cache miss, links, zoom, edição de texto/símbolos, molduras e modo contínuo.
- Medir navegação e memória em desktop e dispositivo móvel. O limite de 12 entradas e a concorrência 2 são valores iniciais, ainda sem medição.
- Confirmar que mudanças de arte e símbolos em runtime invalidam o recurso correto. Até aqui, backgrounds usam o cache HTTP do navegador e a página antecessora prepara o asset; não há cache de DOM renderizado.
