# Página 12 — Estrutura da Cena

- **Fonte inglesa:** página 12 do PDF oficial (OG), comparada ao Viewer PT-BR e ao PDF impresso.
- **PT-BR:** os 7 registros de tradução existentes foram lidos do Payload e verificados no export.
- **Escopo da imagem:** o painel inserido mostra uma página do Adventure Book, um componente separado. Ele permanece igual ao original inglês; somente os rótulos e as explicações da página de regras ao redor do painel estão traduzidos. A imagem localizada anterior permanece no repositório, mas não está ativa no sidecar. O asset inglês está marcado `languageInvariant` para preservar o componente em todas as línguas do Viewer.
- **Exportação:** `verifiedTranslationRecords=true`, `pdfVerification=true`, MediaBox 820,346 × 820,346 pt; zero excesso medido à direita ou embaixo nos 7 alvos do Viewer e do PDF impresso.

## Título da página

**EN:** Scene Breakdown

**PT-BR (salvo):** Estrutura da Cena

**DTP:** Cinzel-Regular, 18 pt, branco, negrito, centralizado.

## A — Scene Name

**EN:** Scene Name: Unique name of the Scene in the Adventure Book.

**PT-BR (salvo):** **NOME DA CENA:** Nome exclusivo da Cena no Livro de Aventura.

**DTP:** rótulo Optima Bold 9 pt; corpo Optima 10 pt, branco. O rótulo ocupa uma linha e a explicação, duas, como no OG.

## B — Scene Narrative

**EN:** Scene Narrative: This section is meant to be read out loud. All Scenes have a narrative section.

**PT-BR (salvo):** **NARRATIVA DA CENA:** Esta seção deve ser lida em voz alta. Todas as Cenas possuem uma narrativa.

**DTP:** rótulo Optima Bold 9 pt; corpo Optima 10 pt, branco. O rótulo ocupa uma linha e a explicação, duas, como no OG.

## C — Adventure Mechanics

**EN:** Adventure Mechanics: When an Adventure Mechanic appears, stop and follow its instructions. Adventure Mechanics come in different varieties. See Adventure Mechanics Pg. 10.

**PT-BR (salvo):** **MECÂNICAS DE AVENTURA:** Quando uma Mecânica de Aventura aparecer, pare e siga suas instruções. Elas podem assumir diferentes formas. *Veja* ***Mecânicas de Aventura***, *pág. 10.*

**DTP:** rótulo Optima Bold 9 pt; corpo Optima 10 pt, branco. A explicação ocupa quatro linhas. A referência conserva o itálico e negrito do OG.

## Revisão visual e exportação — 2026-11-21

- Os 7 textos PT-BR aparecem no Viewer e no PDF impresso. As três explicações mantêm as contagens de linha do OG: A 2, B 2, C 4; os três rótulos cabem em uma linha.
- O painel do Adventure Book, incluindo a prosa de exemplo e o `Skill Check` impresso, usa o asset OG em inglês para manter o componente original. A página de regras mantém as explicações A/B/C em português.
- O PDF exportado reportou `verifiedTranslationRecords=true` e `pdfVerification=true`; a comparação visual com o OG não encontrou clipping, colisão ou desalinhamento. SHA-256 do PDF final: `6F8A4358EDC8878CF4CE720ED779543B8862DD92827B266EDCC6847869C8CB29`.
- A camada PT-BR anterior não foi apagada: ela permanece guardada nos assets locais, mas foi removida da lista ativa em `fidelity_overlays.json`. O asset original em inglês está marcado `languageInvariant` e reaproveita exatamente o recorte e a posição do OG.
- Evidências e sidecar anterior/final: `engineering-decisions/evidence/2026-11-21-page12/` no workspace privado.
- O texto editável continua no Payload; este Markdown registra o estado visual e a cobertura da página.
