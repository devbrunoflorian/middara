# Projeto Pendente: Pré-carregamento por idioma e skeleton loaders

- **Status:** caminho de leitura validado em Chrome desktop e viewport móvel emulado. Medição em aparelho físico e revisão das invalidações permanecem abertas.
- **Prioridade:** ALTA após estabilizar a localização das páginas.
- **Área:** Performance do Viewer / experiência de navegação.
- **Objetivo:** evitar que cada navegação renderize a página do zero ou mostre primeiro o inglês enquanto a tradução PT-BR ainda carrega.

## Escopo

1. Pré-carregar e manter preparadas em cache as **10 páginas seguintes** no idioma atualmente selecionado. Ao avançar, a página deve aparecer já no idioma ativo sempre que estiver dentro da janela de cache.
2. Em uma falta de cache, usar as posições reais das linhas, molduras de texto e regiões de imagem no **skeleton da página**. Aplicar um brilho suave da esquerda para a direita, em ciclos de 1,2 s, com versão estática para movimento reduzido. Manter o idioma selecionado enquanto o conteúdo é preparado.
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

## Verificação no navegador — 28/11/2026

- A abertura da p.14 sem cache com atraso injetado de 520 ms mostrou o skeleton PT-BR. A tradução ficou visível em 1,05 s. As pp.15–24 foram requisitadas adiantadas. Três avanços com cache levaram 202, 328 e 631 ms até o primeiro texto PT-BR visível, numa execução local.
- O pré-carregamento usa o mesmo fundo que o Viewer exibe no idioma ativo. A p.101 solicitou `background-pt-BR.webp` ainda na p.100, tanto no desktop quanto no viewport emulado de 412 × 839. Atrasar os overrides PT-BR em 500 ms mostrou o skeleton durante a troca de idioma nos dois.
- O heap JS observado foi de 29 para 77 MiB no desktop e de 41 para 81 MiB no viewport emulado. A amostra inclui o render do Índice. Memória de imagens e GPU requer medição à parte.

## Trabalho restante

- Abrir o Viewer e confirmar navegação sequencial EN/PT-BR sem flash, skeleton em cache miss, links, zoom, edição de texto/símbolos, molduras e modo contínuo.
- Medir navegação e memória em desktop e dispositivo móvel. O limite de 12 entradas e a concorrência 2 são valores iniciais, ainda sem medição.
- Confirmar que mudanças de arte e símbolos em runtime invalidam o recurso correto. Até aqui, backgrounds usam o cache HTTP do navegador e a página antecessora prepara o asset; não há cache de DOM renderizado.
