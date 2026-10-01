# Auditoria visual integral inglesa: página 4

- **Status:** concluída; página inglesa revisada visualmente com duas correções locais; pronta para commit.
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

## Inspeção visual e diagnóstico (em andamento)

- PDF físico p. 4 renderizado novamente a 2× (`tmp/book-fidelity-audit/source-renders/page-004-2x.png`); app inglês comparado em Fit 100% e em escala de leitura 200–400%, com a página percorrida até o rodapé. Admin permaneceu desligado.
- No passe a 100–200%, a estrutura geral, duas colunas, ilustrações e fólio parecem acompanhar a referência. `Nightingale Arsen` aparece uma vez na arte da carta, sem cópia HTML evidente. A inspeção ampliada a 350% expôs que o texto extraído sobre os Combatant cards está na horizontal enquanto os cards são inclinados. O recorte de `background.webp` confirma que o texto foi removido dali; a referência PDF o mostra acompanhando a orientação dos cards. **Retiro a aprovação provisória dos cards:** o resultado atual não reproduz corretamente essa composição.
- **Discrepância confirmada:** os headings de seção aparecem com menos peso no app do que no PDF (ex.: `RULEBOOK`, `ADVENTURE BOOK`, `COMBATANT CARDS`). No PDF, os contornos estão visivelmente mais pesados. O JSON e `get_text('dict')` rotulam os spans `Cinzel-Regular`, 12 pt, flags 4; `mapPdfFont()` traduz isso para `fontWeight: 400` e `font-variant-caps: small-caps`. A inspeção visual prova que o nome/flags extraídos não bastam para inferir o peso que a reprodução deve usar.
- **Correção localizada em validação:** introduzi `renderWeightOverride` separado do campo `font` original e marquei somente os 14 headings verificados como peso 700. O build passou; o lint concluiu sem erros e repetiu sete warnings já existentes. A captura a 350% confirma que o peso visual agora se aproxima mais do PDF, sem deslocamento vertical aparente nos títulos visíveis; ainda falta concluir a verificação de largura/alinhamento na página toda.
- **Causa confirmada:** `get_texttrace()` mostra os microspans dos cards com direção `(0.9848, -0.1736)`, aproximadamente 10° inclinados. `LineRenderer` usa apenas bboxes axis-aligned e reescreve todos na horizontal. O fundo final contém os cards sem texto; por isso o app vê a composição deformada, não apenas uma duplicata simples. A extração atual não preserva a matriz/direção do texto e não consegue reconstruir esta tipografia de carta fielmente como HTML.
- **Plano da correção localizada:** gerar um patch transparente com os pixels originais do PDF dentro dos três polígonos de imagem transformados e escondê-los no modo EN normal. Marcar só as linhas HTML localizadas nesses cards como duplicatas do patch; manter os dados e revelar o HTML em Admin para inspeção/edição. Antes de aceitar, provar que as máscaras cobrem os três cards, sem afetar a coluna, validar o resultado contra o PDF e recarregar para evitar cache. Não aplicar filtro global de tamanho nem copiar coordenadas da página 6.
- Página 13 continua fora deste ajuste até uma confirmação visual da mesma discrepância ali; o fato de usar Cinzel não é autorização para propagar o override.

## Critério de encerramento

Marcar `visual-reviewed` somente se quadro inteiro e regiões criticamente ampliadas forem comparados com o PDF. Se ainda houver risco legível ou parte ilegível (p.ex. texto intrínseco a artwork), registrar e manter gate apropriado. Não ler storage/drafts nem abrir o editor durante esta QA.

## Resultado e verificação

- Corrigi o peso aparente dos 14 headings da página 4 com `renderWeightOverride: 700`, preservando `font: Cinzel-Regular` como proveniência e evitando qualquer regra global de Cinzel. A seleção inicial do Rich Span Editor também recebe esse peso override, para que uma edição futura não volte a 400. Na comparação depois da mudança, small caps, peso, posição e largura permaneceram compatíveis com o PDF.
- Corrigi os três Combatant cards inclinados através de `scripts/build_page_004_combatant_overlay.py`: o script valida os xrefs/bboxes/transformações já medidos, renderiza a página original no tamanho de `background.webp`, mascara os três polígonos e gera `fidelity-overlay-combatant-cards.png` + `fidelity_overlays.json`. Marcou 210 linhas vetoriais dessas cartas como `rasterizedDuplicate`; elas continuam nos dados e ficam disponíveis ao selecionar em Admin. O patch só aparece para inglês fora de Admin.
- A recaptura do app em EN, Admin desligado, foi comparada com o PDF a 100% (página inteira) e 200–350% (headings/cards, coluna inferior, carta Nightingale e rodapé). O texto impresso nas três cartas está alinhado à inclinação correta e completo. `Nightingale Arsen` aparece uma vez no artwork; as duas colunas, restante das imagens e fólio continuam íntegros. Página 4 agora pode receber status `visual-reviewed`.
- Verificação de código/dados: `npm run build -w apps/web` passou; `npm run lint -w apps/web` passou sem erros e repetiu sete warnings React preexistentes; `git diff --check` passou. O gerador reportou exatamente três placements e 210 linhas esperadas. Não li storage nem rascunhos; sem alterações na tradução PT.
- **Limite para tradução futura:** as linhas vetoriais dos cards mantêm conteúdo editável, mas o renderer não preserva direção/matriz de texto oblíqua. A correção confirma fidelidade inglesa via imagem local; traduzir texto miúdo dessas cartas exigirá arte localizada ou suporte a direção/transformação por linha. Não expandir essa técnica para outras páginas sem uma auditoria de seus assets/transformações.
- O material de processo atualizado fica em [regra 07](../../.agents/rules/07-fantasmas-e-artefatos-duplicados.md), [skill de QA visual](../../.agents/skills/visual-fidelity-qa/SKILL.md) e matriz de páginas. Próxima prioridade confirmada: a inspeção visual integral da página 13; página 15 continua uma composição-diagrama com etapa de localização própria antes de traduzir os textos embutidos.

### Arquivos alterados neste marco

- `apps/web/src/App.tsx`, `apps/web/src/components/PageRenderer.tsx` — carregar overlay da página 4 e respeitar override de peso apenas quando presente nos dados.
- `apps/web/public/pages/page_004/page_004_dom.json`, `fidelity_overlays.json`, `fidelity-overlay-combatant-cards.png` — overrides de 14 headings e linhas vetoriais de card cobertas pela versão original do PDF. `.gitignore` ganhou exceções apenas para os dois novos assets auditados.
- `scripts/build_page_004_combatant_overlay.py` — gerador local reprodutível e validado.
- `.agents/rules/07-fantasmas-e-artefatos-duplicados.md`, `.agents/skills/visual-fidelity-qa/SKILL.md`, `docs/project-progress/book-fidelity-page-matrix.csv`, índice e handoff — método, evidência e fila atualizados.
