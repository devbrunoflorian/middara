# Ghost text review batch: page 20

- **Status:** em andamento.
- **Data:** 2026-10-01.
- **Branch:** `codex/book-visual-batch-audit`.
- **Prerequisite:** aceitação híbrida e regras registradas em [`2026-10-01-grill-me-fidelity-acceptance.md`](2026-10-01-grill-me-fidelity-acceptance.md); comparador read-only em `scripts/audit_artwork_region_visuals.py`.

## Objetivo

Aplicar o fluxo por regiões a uma página densa inteira, com controle do PDF original, do `background.webp` e da página no viewer. A p. 20 tem 37 grupos candidatos, a maior contagem por página na triagem atual. Determinar quais são duplicatas raster comprovadas, quais são vetores legítimos e quais permanecem ambíguos, sem assumir que uma página inteira compartilha um único resultado.

## Plano de revisão

1. Congelar os 37 IDs de região e a contagem de linhas a partir de `tmp/ghost-audit/all-regions-v2.csv` e `all-pages-v2.csv`.
2. Gerar/abrir as folhas PDF/background com bboxes candidatas; revisar cada região e registrar razões/evidências. O CSV de pixel diff é apenas auxiliar, nunca critério decisório.
3. Conferir no browser as regiões com maior risco/ambiguidade e amostra representativa por classe, comparando a renderização inglesa com o PDF na mesma escala.
4. Só marcar duplicata quando a presença visual e o alinhamento do texto raster/overlay forem confirmados. Preservar texto visível no PDF sem cópia no fundo. Manter casos incertos visíveis.
5. Aplicar supressão apenas se um padrão repetido estiver comprovado e o patch for localizado, reversível e não atingir texto adjacente. Se qualquer caso relevante continuar ambíguo, não certificar a página.

## Limites de segurança

- Não tocar no PDF original, artwork, traduções, drafts, `localStorage`, Payload ou banco.
- Nenhum filtro por `suspectedGhost`, tamanho, bbox, similaridade de pixels ou paint order pode decidir sozinho.
- Nenhuma regra desta página será expandida a outra página antes de validar positivos e contraexemplos nela.

## Critério de verificação

- IDs analisados totalizam exatamente as 37 regiões da fila p. 20; cada uma recebe disposição explícita `confirmed duplicate`, `legitimate vector` ou `ambiguous`, com evidência citada.
- Se houver correção, validar antes/depois no viewer contra o PDF e conferir que nenhum conteúdo vizinho desapareceu.
- Registrar capturas/crops e limites; manter página pendente se restar ambiguidade.

## Resultado

Pendente — investigação ainda não começou nesta fatia. Atualizar esta seção e o handoff antes de commit/troca de etapa.
