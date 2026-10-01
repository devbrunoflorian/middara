# Project progress log

This folder records work by task, including the goal, method, files changed, evidence, corrections made during the task, current status, and next safe step. Records distinguish read-only investigation from changes to app code, production data, and the database.

**Start here when resuming work:** [`CONTINUE-HERE.md`](CONTINUE-HERE.md) is mandatory for every developer and AI agent. It summarizes the product goal, accepted decisions, evidence, active blocker, required reading, and safe next steps.

## Tasks

- [2026-09-30 — Amostra visual e patch inglês: páginas 6 e 101](2026-09-30-next-visual-sample-pages-6-101.md): restaurar a composição das cartas da página 6 por máscaras locais derivadas do PDF; confirmar no app e registrar que a inspeção estrutural da página 101 não é aprovação linha a linha.
- [2026-09-30 — Auditoria visual inglesa: página 5](2026-09-30-next-visual-audit-page-5.md): comparação do quadro inteiro e de regiões ampliadas; nenhum defeito visual confirmado e nenhuma correção generalizada aplicada.
- [2026-09-30–10-01 — Auditoria visual inglesa: página 7](2026-09-30-next-visual-audit-page-7.md): corrigir uma linha HTML duplicada sobre o background e recompor 20 caixas Zapf Dingbats localmente, com QA visual e sem mudança global de fonte.
- [2026-10-01 — Auditoria visual integral inglesa: página 6](2026-10-01-page6-fullpage-visual-audit.md): localizar e remover cinco backings residuais que deixavam molduras brancas sobre os cards; validar a página toda sem reaplicar o patch fora do escopo.
- [2026-10-01 — Auditoria visual inglesa: índice da página 101](2026-10-01-page101-index-visual-audit.md): revisar as três colunas em 200%; casos “Values / Back” e “Ending all Actions and Abilities” confirmados no PDF, sem defeito visual comprovado.
- [2026-10-01 — Auditoria visual integral inglesa: página 4](2026-10-01-page4-fullpage-visual-audit.md): corrigir os 14 headings e restaurar por máscara os três Combatant cards inclinados; validar texto, Nightingale Arsen e página inteira contra o PDF.
- [2026-10-01 — Auditoria visual integral inglesa: página 13](2026-10-01-page13-fullpage-visual-audit.md): revalidar a folga entre `Story Disciplines and Items` e `IMPORTANT`, além do peso visual dos headings, sem presumir que a reclamação anterior esteja fechada.
- [2026-09-30 — Feedback visual e auditoria das páginas 4/13/15](2026-09-30-feedback-audit-pages-4-13-15.md): implementar small caps em headings, restaurar texto vetorial dos cards e ocultar overlays duplicados na figura composta; build passou; aguarda validação visual e registra a colisão não confirmada da página 13.
- [2026-09-30 — Triagem estendida por amostragem](2026-09-30-extended-fidelity-sample.md): triagem read-only das páginas 3, 6, 15, 24 e 101; confirmou conteúdo legítimo em cartões, encontrou um possível falso positivo que oculta o marcador da página 15 e delimitou as próximas capturas do app.
- [2026-09-30 — Auditoria visual das páginas 4/13 e zoom inicial](2026-09-30-page4-13-visual-review-and-initial-zoom.md): verificar candidatos a fantasma nos componentes da página 4, confirmar os raios da página 13 e iniciar o viewer em 200% mantendo Fit to Screen em 100%.
- [2026-09-30 — Piloto de revisão visual das páginas 4 e 13](2026-09-30-pilot-visual-review-pages-4-13.md): preparar comparação PDF↔app em layouts de colunas/imagens e PUA; manter aprovação visual pendente até obter o render do app.
- [2026-09-30 — Integração de fontes locais fornecidas](2026-09-30-local-font-assets.md): comparar Aristelle Sans com a fonte incorporada ao PDF, adicionar seis fontes locais e mapear cada família sem confundir Wingdings3/Zapf Dingbats.
- [2026-09-30 — Auditoria de fidelidade inglesa do livro](2026-09-30-book-wide-english-fidelity-audit.md): transformar a página 2 em critérios verificáveis e uma fila não-uniforme para revisar todas as 102 páginas antes de expandir a tradução.
- [2026-09-30 — Resultados da triagem de fidelidade inglesa](2026-09-30-book-fidelity-scan.md): comparação read-only de spans PDF/JSON em todas as páginas, limites da prova, famílias tipográficas em risco e próxima fila visual; ver também a [matriz por página](book-fidelity-page-matrix.csv).

- [2026-09-30 — Overflow fora do Admin e títulos com alternates](2026-09-30-page2-overflow-and-title-alternates.md): corrigir a visibilidade do diagnóstico vermelho e investigar alinhamento/persistência de estilos nos glifos alternativos da página 2.

- [2026-09-30 — Auditoria do baseline dos títulos](2026-09-30-heading-baseline-audit.md): identificar por que os títulos Esmeralda desviam no eixo Y e registrar o limite da validação visual.

- [2026-09-30 — Salvamento Payload e proteção do reset PT](2026-09-30-payload-save-reset-safety.md): conectar o banco de schema atual sem mexer no legado e proteger reset/fechamento de rascunhos em PT.

- [2026-09-30 — Translation editor save point](2026-09-30-translation-editor-save-point.md): zoom/scroll, admin editing, local-first saves, live preview, and the visually approved page 2 frame pilot.
- [2026-09-30 — Sample layout extraction audit](2026-09-30-layout-sample-audit.md): reproducible read-only analysis of credits on page 2, contents entries on page 3, and index rows on page 101.
- [2026-09-30 — Progress documentation rule](2026-09-30-progress-documentation-rule.md): make this task-by-task record mandatory for future work and backfill today's completed tasks.

For new work, add a dated task record before implementation, update it as findings/corrections occur, and close it with the final verification result. Keep implementation-specific architecture decisions in `docs/architecture/` and link them from the task record.

- [2026-09-30 — Translation-key impact dry run](2026-09-30-translation-key-dry-run.md): completed read-only mapping from 253 representative semantic units to current editor keys, before any integration or migration.
- [2026-09-30 — Page 2 credit editor proof](2026-09-30-credit-editor-proof.md): local app servers are running; draft inspection remains blocked by the browser's saved access setting, and no integration has started.
- [2026-09-30 — Project continuation handoff](2026-09-30-project-handoff.md): consolidated the current project state into a required developer/agent handoff and recorded the post-reboot server restart.
- [2026-09-30 — Credit draft compatibility audit](2026-09-30-credit-draft-compatibility-audit.md): read-only source trace to determine whether new semantic credit keys can preserve existing drafts without browser storage access.
- [2026-09-30 — Promote overflow branch to master](2026-09-30-promote-overflow-to-master.md): user-requested replacement of remote `master` with the current feature branch, preserving the old master commit for recovery.
- [2026-09-30 — Broad project read-through](2026-09-30-project-readthrough.md): read-only repository review to explain the actual product, architecture, data flow, and current priorities.

- [2026-09-30 — Live preview e unidades dos créditos](2026-09-30-preview-fidelity-and-credit-units.md): investigar regressões de fidelidade no preview e granularidade de edição dos créditos; plano sem implementação.

- [2026-09-30 — Piloto de preview fiel e campos de crédito](2026-09-30-implement-preview-credit-pilot.md): corrigir no-op visual do editor e validar label/body como campos independentes na página 2; persistência no Payload ainda pendente.

- [2026-09-30 — Unidades independentes dos créditos da página 2](2026-09-30-page2-credit-units.md): ampliar o piloto Playtesters para as 17 categorias mantendo labels, corpos e fallback de chave legada.
