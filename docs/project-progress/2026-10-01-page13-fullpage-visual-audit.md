# Auditoria visual integral inglesa: página 13

- **Status:** aberta antes da inspeção; nenhum ajuste da página foi presumido ou aplicado nesta tarefa.
- **Data:** 2026-10-01.
- **Ponto de partida:** commit `20439b1` (`fix: restore page 4 fidelity and card text`), branch `fix/pixel-render/overflow`, dez commits à frente do remoto, sem push. Páginas 4, 5, 6, 7 e 101 estão `visual-reviewed`.
- **Feedback do usuário:** `docs/project-progress/2026-09-30-feedback-audit-pages-4-13-15.md` e captura da página 13: texto de `Story Disciplines and Items` parece invadir a caixa `IMPORTANT`; headings como `Story Disciplines and Items` e `Bounties` parecem estar sem peso suficiente.
- **Evidência anterior a revalidar:** a medição estática do PDF encontrou fim do texto em x≈406,7 pt e início do callout em x≈421,5 pt, distância aproximada 14,8 pt. Uma inspeção anterior no app anotou espaço visível, mas o status global da página permaneceu pendente. Não usar essa medida isolada para descartar a reclamação sem rever a captura atual.

## Objetivo

Comparar a página 13 inglesa completa com o PDF original e distinguir: (a) colisão real do texto da coluna esquerda com o callout da direita; (b) diferença de fallback/métrica entre o PDF e o browser; (c) peso/forma dos headings e demais diferenças locais. Não alterar traduções nem generalizar o override de peso da página 4.

## Método planejado

1. Reler este registro, o handoff, as regras 05/07/08/13 e o feedback p. 13; reutilizar ou gerar render do PDF físico 13 em escala suficiente.
2. Abrir app inglês, Admin desligado, comparar página inteira em Fit e percorrer as duas colunas em escala de leitura equivalente.
3. Examinar `Story Disciplines and Items`, a última baseline da coluna esquerda, margens, reticências/quebras e os quatro lados da caixa `IMPORTANT`; fazer a mesma comparação em `Bounties` e outros headings relevantes.
4. Para headings, registrar aparência do PDF e do app e metadados (fonte/flags) separadamente. Um `Cinzel-Regular` sem flag bold não decide o estilo visível; se houver diferença, aplicar apenas override(s) nos spans confirmados e validar largura/baseline.
5. Corrigir somente discrepância reproduzida no app; documentar tentativa/correção, atualizar matriz só se a página inteira passar. Executar build/lint se código mudar; registrar warnings existentes. Não abrir Admin/editor nem storage durante QA visual.

## Critério de encerramento

Marcar `visual-reviewed` apenas depois de comparar a página inteira e as regiões críticas em escala de leitura, confirmar que o texto conserva a folga do original, verificar headings/estilos e não afetar conteúdo vizinho. Caso haja limitação ou reclamação não reproduzida, registrar evidência e manter o status adequado.
