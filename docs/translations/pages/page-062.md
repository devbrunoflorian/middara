# Página 62 — Combatentes Inteligentes (continuação)

- **Estado:** revisão visual rápida com o OG concluída em 22/11/2026; página ainda não certificada integralmente.
- **Cobertura:** 34 traduções PT-BR ativas; 8 recibos de revisão aprovados. Outras 26 traduções são registros legados sem recibo atual e ainda precisam de reconciliação/revisão.
- **Correção feita:** no bloco `Towards & Away`, foram restauradas as fronteiras de parágrafo da fonte e a quebra após “...na IA.” antes de “Esse movimento também não precisa ser em linha reta.”. Isso evita que a prosa comprimida deixe um vão antes da unidade seguinte. Moldura, geometria e estilos ricos foram preservados.
- **Medição:** no DOM do PageRenderer, o corpo corrigido ocupa 12 linhas, igual às 12 linhas do bloco-fonte. É uma medição visual desta revisão, não um recibo Copyfit V3 a 100%/200%.
- **Comparação:** OG, Viewer PT-BR e print/PDF foram conferidos lado a lado. Não foi observado clipping nem colisão nessa passagem. As cartas impressas continuam em inglês, conforme a decisão editorial.
- **Exportação:** exportação recente confirmou `verifiedTranslationRecords=true` e `pdfVerification=true`; a página mantém caixa de 820,346 × 820,346 pt. O PDF temporário foi removido após a conferência.
- **Entrelinha corrigida em 2026-11-23:** a unidade PT-BR `page_62_unit_p62-block-32-towards-away-body` tinha as mesmas 12 linhas do OG, mas `lineHeight=1` fazia o último verso terminar cerca de 15 pt antes do original. Ajustei apenas a entrelinha salva para `1.12`; texto, fonte, início da caixa e blocos seguintes foram preservados. No PDF de uma página, o último verso termina em y=308,71 pt e o parágrafo seguinte começa em y=311,96 pt; no OG, os valores correspondentes são y=310,13 e y=313,48 pt. A lacuna final agora mede 3,25 pt contra 3,35 pt no OG. Viewer e print/PDF foram conferidos após salvar; sem clipping nem colisão.
- **Cobertura pendente:** a correção é de composição local; os 26 registros legados sem recibo de revisão ainda precisam de reconciliação antes da certificação integral.
- **Evidência privada:** `engineering-labs/planning/engineering-decisions/evidence/2026-11-22-page62-paragraph-structure/` guarda OG, Viewer, print e métricas.
- **Fonte:** [transcrição bruta do PDF](../source-pages/page-062.md). As linhas extraídas não substituem a revisão semântica e estrutural.
