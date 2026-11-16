# Projeto Pendente: Pré-carregamento por idioma e skeleton loaders

- **Status:** BACKLOG PÓS-TRADUÇÃO.
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

Implementar depois da estabilização da tradução e das geometrias PT-BR. O cache precisa acompanhar o idioma e as revisões de conteúdo existentes; não deve esconder traduções ou molduras recém-salvas.
