# Projeto Concluído: Padronização Terminológica e Glossário Canônico

- **Status:** CONCLUÍDO
- **Escopo:** Diretrizes Editoriais Oficiais, Glossário de Termos de Jogo e Validação Automatizada
- **Área:** Tradução / Localização / Consistência Editorial

---

## 1. Visão Geral

Estabelecer a Bíblia de Tradução e o Glossário Canônico do Middara em português brasileiro, eliminando discrepâncias históricas entre traduções independentes e unificando termos mecânicos, palavras-chave e referências cruzadas em todo o livro de regras.

---

## 2. O que foi Entregue

1. **Glossário Canônico Consolidado (`packages/glossary/` ou base integrada):**
   - Mapeamento e fixação de terminologia de mecânicas de jogo essenciais:
     - `Refresh Phase` → **Fase de Manutenção**
     - `Exhaust` → **Exaustar** (nunca "Esgotar")
     - `Crawl` → **Rastreio**
     - `Combatant` → **Combatente**
     - `Bounty` → **Recompensa**
     - `Tier` → **Tier** (mantido conforme uso consagrado e mecânica de itens)
     - `Action` / `Encounter` / `Initiative` e dezenas de outros termos-chave.

2. **Diretriz Editorial Obrigatória de Referências Cruzadas:**
   - Padronização estrita de chamadas e referências a seções e páginas:
     - Uso obrigatório de **"Veja"** (ex: `Veja Livro de Diagramas, pág. 19.`, `Veja pág. 37.`, `Veja Combatentes.`).
     - Banimento definitivo de **"Consulte"** ou **"Veja em"** para referências editoriais internas, assegurando concisão e economia de espaço tipográfico.

3. **Scripts de Verificação e Auditoria Automatizada:**
   - Desenvolvimento de rotinas em Node.js (`find_tier_mismatches_all.mjs`, `check_db_reviews.mjs`, scripts de busca regex) para auditar toda a base contra o glossário e apontar desvios.
   - Integração com o `RichSpanEditor` para destacar termos do glossário e sugerir a tradução canônica durante a digitação.

---

## 3. Impacto no Sistema

- Garante que múltiplos tradutores e revisores trabalhem sob um mesmo padrão coeso e profissional.
- Evita retrabalho decorrente de divergências de terminologia entre páginas distintas do livro.
