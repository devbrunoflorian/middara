# Página 101 — Índice

- **Estado:** 198/198 unidades registradas no Payload estão aprovadas e publicadas. O título aparece como “Índice”. A revisão de 2026-11-20 corrigiu 19 entradas que divergiam de decisões do glossário, nomes impressos de Tags ou nomes de componentes; a publicação anterior de cada uma foi preservada no histórico.
- **Termos corrigidos:** `Counter` → **Revide**; `Stamina Point(s) (SP)` → **Ponto(s) de Stamina (SP)**; `Flanking` → **Flanqueio**; `Gigas Grip` → **Empunhadura Gigas**; `Scaling Icons` → **Ícones de Escala**. Nomes impressos de componentes e Tags foram mantidos em inglês.
- **Copyfit:** as 19 alterações mantêm uma linha, EXACT, em 100% e 200%, usando as fontes, pesos, cores e molduras existentes.
- **Fonte:** a segunda leitura conferiu 193/193 referências impressas de destino numérico contra o OG. A referência literal **“Back”** na entrada “Values” é uma linha estática da fonte, fora das 198 unidades traduzíveis existentes; permanece visível em inglês e precisa de uma unidade/overlay de localização própria.
- **Validação:** o export de 2026-11-21 confirmou a presença e a ordem dos 198 registros do snapshot e verificou a geometria do PDF. Esse teste não cobre a referência estática “Back”, que ainda aparece na captura de impressão.
- **Reprodução:** com `--snapshot`, o export lê `contents_rows.json` e os demais arquivos da página da pasta `pages/` ao lado do snapshot. Alterações feitas apenas no checkout aparecem no Viewer local, mas não entram nesse export. Gere um snapshot novo após mudar um arquivo da página e confira o trecho afetado no PDF.
- **Limite:** este registro fecha a revisão das entradas do índice cobertas pelas unidades atuais; não certifica a fidelidade integral de toda a extração-fonte da página nem conclui o livro.
