# Auditoria visual integral inglesa: página 4

- **Status:** aberta antes da nova inspeção; não presume que os reparos anteriores estejam aprovados como página inteira.
- **Data:** 2026-10-01.
- **Ponto de partida:** checkpoint `471753c` (`docs: complete page 101 visual audit`), branch `fix/pixel-render/overflow`, oito commits à frente do remoto, sem push. Páginas 5, 6, 7 e 101 estão em `visual-reviewed`.
- **Feedback/registro relacionado:** [`2026-09-30-feedback-audit-pages-4-13-15.md`](2026-09-30-feedback-audit-pages-4-13-15.md) contém os screenshots/perguntas do usuário sobre títulos, `Nightingale Arsen`, texto padrão das Combatant cards e figura composta da página 15. O usuário chamou a página 2 de impecável e definiu fidelidade ao PDF inglês como gate antes de ampliar tradução.
- **Seleção pela matriz:** 1.038 spans; 85 blocos com estilos mistos; 23 spans em risco de fonte; 10 candidatos de centralização; os contadores de imagens excepcionalmente altos devem ser lidos como sinal estrutural da extração, não como número de figuras.

## Objetivo

Comparar a página física 4 completa com a página 4 inglesa no app após os reparos anteriores: título/seções, três colunas, texto pequeno sobre os três Combatant cards, `Nightingale Arsen` rasterizado na carta, demais artefatos, limites e fólio. Determinar se a versão inglesa permanece fiel ao PDF e se uma unidade corrigida afeta vizinhas. Não traduzir nem alterar rascunhos.

## Método planejado

1. Reler `CONTINUE-HERE.md`, rules 00/06/07/13, a referência PDF visual e os relatórios ligados acima.
2. Renderizar/reutilizar a página física 4 e abrir no browser em EN/Admin desligado; comparar primeiro em Fit-to-Screen, depois percorrer as zonas em escala de leitura.
3. Conferir headings (sem impor bold quando o PDF usa Cinzel-Regular/small caps), o texto de cartas em escala ampliada, recuos/estilos inline, imagens, sobreposições, colunas e rodapé.
4. Para suspeita de ghost, checar separadamente os pixels do `background.webp`, ordem de pintura do PDF, linha HTML e contraste. A presença de nome dentro da carta não prova que seja duplicação a remover.
5. Em caso de discrepância nova, registrar evidência, causa e plano antes de tocar em código/dados. Depois da correção, validar página inteira e vizinhança e atualizar a matriz só com evidência.

## Critério de encerramento

Marcar `visual-reviewed` somente se quadro inteiro e regiões criticamente ampliadas forem comparados com o PDF. Se ainda houver risco legível ou parte ilegível (p.ex. texto intrínseco a artwork), registrar e manter gate apropriado. Não ler storage/drafts nem abrir o editor durante esta QA.
