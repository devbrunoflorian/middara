# Projeto Pendente: Empacotamento App Desktop e Mobile (PWA / Offline)

- **Status:** PENDENTE
- **Prioridade:** MÉDIA-BAIXA (Fase Pós-Tradução)
- **Escopo:** Distribuição da Aplicação como Ferramenta de Mesa Offline
- **Área:** Engenharia de Software / PWA / Multiplataforma

---

## 1. Visão Geral

Durante as sessões de jogo de tabuleiro de Middara na mesa física, nem sempre há conexão estável à internet, e manusear um laptop pesado ou navegar por um navegador tradicional com abas distrativas prejudica a imersão. Este projeto adaptará a aplicação web para funcionamento 100% offline via PWA (*Progressive Web App*) e executável desktop/tablet leve (Tauri / Electron / Capacitor).

---

## 2. Funcionalidades Planejadas

1. **Suporte a PWA com Service Worker e Cache Offline:**
   - Armazenamento em cache local de todos os assets estáticos: imagens de fundo WebP de todas as 102 páginas, fontes, arquivos de DOM JSON e símbolos vetoriais.
   - Instalação direta no iPad / Android Tablet / Windows com tela cheia real (sem barra de endereços de navegador).

2. **Empacotamento Desktop Nativo (Tauri):**
   - Criação de instaladores para Windows (.exe / .msi) e macOS (.dmg) ultraleves, utilizando o motor WebView nativo do sistema operacional.
   - Desempenho nativo com consumo mínimo de memória RAM.

3. **Busca Rápida de Mesa (*Spotlight / Command Palette*):**
   - Tecla de atalho global (`Ctrl+K` ou `Cmd+K`) para pesquisar qualquer regra, palavra-chave, condição ou monstro em menos de 100ms e saltar instantaneamente para a página correspondente.

4. **Persistência de Estado Local:**
   - Modo de salvar o progresso da página atual, marcadores de favoritos pessoais e anotações do jogador no armazenamento local (*IndexedDB / LocalStorage*).

---

## 3. Critérios de Aceite

- A aplicação deve carregar todas as 102 páginas instantaneamente em modo avião (sem nenhuma conexão de rede).
- Execução suave a 60 FPS com zoom e navegação fluida em tablets de média especificação.
