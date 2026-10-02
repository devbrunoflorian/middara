# Ghost text review batch: page 20

- **Status:** próximo tracer após correção localizada da página 16; sem correção de dados na p. 20 até agora.
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

## Achados intermediários

- A fila p. 20 contém 37 regiões e 100 linhas em cartões repetidos de Combatant Loot Deck Setup. Folhas de todas as 37 regiões mostram caixas candidatas sobre marcas/textos correspondentes nas imagens dos cartões; as classes incluem cartas de peito, Item Loot, Monster Loot e Unique Loot.
- Browser em 225% e DOM confirmam que 36 das 100 linhas candidatas têm pelo menos um span >=4 pt e estão presentes como texto HTML; as outras 64 são spans microscópicos, já filtrados pelo renderer. Isso evita inferir visibilidade apenas do CSV do detector.
- Algumas linhas numéricas contêm dois spans com o mesmo texto e bbox, um preto e outro branco. A sequência parece reproduzir duas passagens do PDF (possível tratamento de contorno), mas a estrutura HTML usa spans irmãos em fluxo; isso pode ser uma inconsistência tipográfica compartilhada e não deve ser confundido com duas palavras independentes.
- As folhas PDF/background não conseguem distinguir arte tipográfica desenhada dentro de Form XObjects de uma cópia raster real. O screenshot de leitura não é suficiente para decidir se remover o overlay deixa a página mais fiel. Nenhuma linha foi suprimida nem JSON alterado.

## Retomada após a entrevista sobre fantasmas (2026-10-01)

- As cinco folhas de contato (`tmp/ghost-audit/page20-contact/`) e uma captura read-only do viewer inglês em 200–400% mostram as cartas repetidas e seus rótulos, mas não alinham prova suficiente para classificar os 37 grupos. Nenhum dado da p. 20 foi alterado.
- Aplicar decisões aceitas: spans ambíguos ficam visíveis e a página não pode ser certificada; decidir por span/região; cores coincidentes podem ser passes intencionais; comparar o render final do PDF com o viewer; validar positivo e contraexemplo difícil antes de propagar um padrão; guardar página, região, texto, bbox, regra e referência de evidência por supressão.
- A p. 16 produziu o primeiro tracer após essa política: 48 overlays legíveis foram confirmados como ausentes do PDF final e sobrepostos a painéis vermelhos na arte; dois spans co-localizados `55` ficaram pendentes. Isso orienta o método, mas não autoriza aplicar a regra da p. 16 às cartas de loot.
- Próxima ação: reconstruir a decisão das 37 regiões de forma visível e por classe de carta, usando render PDF, background e viewer alinhados; não usar `3x ABSOLUTE DIFF` como critério. Manter itens ambíguos sem mutação e documentar um controle negativo difícil antes de qualquer lote.

## Próxima verificação

O scanner book-wide apontou 514 grupos de spans com bboxes coincidentes em 94 páginas, incluindo 56 grupos na página 16 e 25 na página 20. A revisão localizada da p. 16 foi fechada no tracer [`2026-10-01-ghost-review-page16.md`](2026-10-01-ghost-review-page16.md); retomar agora o lote da p. 20. Não alterar a página 20 até resolver separadamente sobreposição de cor/contorno e texto rasterizado; se o padrão de spans coincidentes for global, abrir um tracer tipográfico antes de mudar o renderer.
