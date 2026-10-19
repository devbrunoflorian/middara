# Projeto Pendente: Banco de Conteúdo FAQ e Errata Integrado

- **Status:** PENDENTE
- **Prioridade:** MÉDIA
- **Escopo:** Integração de Erratas Oficiais 1.2 e Esclarecimentos da Succubus Publishing
- **Área:** Gestão de Conteúdo / UX / Regras Avançadas

---

## 1. Visão Geral

Middara é um jogo de campanha extenso e detalhado, com centenas de dúvidas recorrentes da comunidade respondidas oficialmente pela Succubus Publishing em FAQs, tópicos do BoardGameGeek e erratas periódicas. Este projeto criará uma camada integrada de conhecimento de regras diretamente conectada ao texto das páginas correspondentes, permitindo ao jogador ou mestre de mesa consultar a regra oficial e os esclarecimentos associados sem sair da página.

---

## 2. Funcionalidades Planejadas

1. **Indicadores Contextuais de Errata no DOM:**
   - Pequenos selos gráficos discretos ao lado de parágrafos ou títulos que possuem errata oficial na versão 1.2 ou esclarecimento dos desenvolvedores.
   - Ao passar o mouse ou tocar no selo, abre-se um popover explicativo destacando a alteração de regra e a fonte oficial.

2. **Aba / Modal Geral de Perguntas Frequentes (FAQ):**
   - Seção dedicada de consulta rápida pesquisável por texto livre ou tags temáticas (ex: `Linha de Visão`, `Ataques Oportunos`, `Defesa de Monstros`).

3. **Modo Duplo de Exibição (Livro Puro vs. Livro Anotado):**
   - Opção nas configurações de visualização para alternar entre o "Livro Puro" (exatamente como impresso) e o "Livro Anotado" (com as notas de errata em destaque).

4. **Sincronização com o Payload CMS:**
   - Coleção `Errata` no Payload permitindo adicionar novas notas sem necessidade de recompilar a aplicação web.

---

## 3. Critérios de Aceite

- O jogador visualiza imediatamente se uma regra controversa possui nota oficial de esclarecimento na versão 1.2.
- O modo de exportação para PDF permite escolher se as erratas serão incluídas como notas de rodapé ou apêndice extra.
