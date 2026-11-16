# Projeto Pendente: Paleta Lateral Dedicada de Símbolos Admin

- **Status:** PENDENTE
- **Prioridade:** MÉDIA
- **Escopo:** Catálogo Visual e Inserção Rápida de Símbolos para Tradutores e Editores
- **Área:** Frontend / Ferramentas Administrativas / UX Editorial

---

## 1. Visão Geral

O Middara possui mais de 111 símbolos e ícones gráficos exclusivos incorporados ao corpo do texto (dados, símbolos de ação, escudos de defesa, símbolos de dano, disciplinas, etc.). Atualmente, a inserção requer a memorização de códigos PUA Unicode ou shortcodes textuais. Este projeto implementará uma gaveta/paleta lateral expansível para busca, visualização em alta resolução e inserção com um clique diretamente no cursor do editor.

---

## 2. Funcionalidades Planejadas

1. **Navegação por Categorias Semânticas:**
   - **Dados:** Dados pretos, vermelhos, azuis, amarelos, verdes, roxos e faces individuais (escudos, corações, espadas).
   - **Ações e Recursos:** Pontos de Ação (`[ap]`), Pontos de Vigor (`[sp]`), Exaustar (`[exhaust]`), Recompensa (`[bounty]`).
   - **Disciplinas:** Crux, Assemblage, Martial, Subterfuge, Sanctus, etc.
   - **Tipos de Ataque e Dano:** Físico, Mágico, Verdadeiro, Alcance, Corpo a Corpo.
   - **Elementos de Tabuleiro:** Terrenos, Obstáculos, Portas, Marcadores de Objetivo.

2. **Campo de Busca Rápida com Auto-Foco:**
   - Filtro instantâneo por nome em inglês, nome em português ou abreviação (ex: digitar "defesa" ou "shield" filtra imediatamente os ícones correspondentes).

3. **Inserção com 1 Clique no Cursor:**
   - Ao clicar no símbolo da paleta, o caractere/shortcode correto é injetado no ponto exato onde o cursor está localizado no `RichSpanEditor`.

4. **Painel de Detalhes do Glifo:**
   - Ao passar o mouse sobre o ícone, exibir tooltip com: nome canônico, código PUA oficial, exemplo de uso e atalho de teclado correspondente.

---

## 3. Critérios de Aceite

- Tradutores conseguem localizar e inserir qualquer um dos 111+ símbolos em menos de 3 segundos sem consultar planilhas externas.
- Totalmente invisível e desativado para usuários comuns (modo visitante).
