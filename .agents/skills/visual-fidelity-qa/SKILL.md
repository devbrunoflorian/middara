---
name: visual-fidelity-qa
description: Cheatsheet iterativo de problemas comuns e soluções para a Fidelidade Visual do Middara.
---

# Visual Fidelity QA & Common Problems

Este documento serve como um log evolutivo de problemas de renderização encontrados no motor do Middara (PDF -> React) e qual foi a **Solução Ideal** encontrada, para poupar tempo de debugging no futuro.

## 1. O Texto Está "Vazando" do Limite da BBox (Direita)
**Problema:** O texto extraído (`page_dom.json`) tem uma largura X no Adobe PDF, mas no navegador as letras ficam pouca coisa mais "gordinhas", fazendo a linha acumular pixels extras e extrapolar a margem/box pela direita.
**Causa:** Os motores de renderização web lidam de maneira sutilmente diferente com o Tracking ("kerning" e espaço natural entre os caracteres) comparado ao Adobe PDF, especialmente em fontes Serif como a *Adobe Garamond Pro*. O uso indevido de Ligatures padrão pelo browser também afeta a largura total da palavra.
**Solução Ideal:**
- **Sempre desative as Ligatures do browser** aplicando CSS forçado na raiz da tag (`font-variant-ligatures: none; font-feature-settings: 'liga' 0, 'clig' 0;`).
- Aplique uma leve correção global no `letter-spacing` (ex: `-0.015em`) para comprimir fisicamente o texto e simular o Tracking real que existia no PDF.
*(Implementado no `PageRenderer.tsx` no `spanStyle`).*

## 2. Negritos Sumiram ou não Renderizam (Ex: Página 4)
**Problema:** Os subtítulos ou palavras-chave de uma página, que claramente estão em negrito no arquivo PDF original, estão renderizando com espessura de fonte "Regular" no front-end.
**Causa:** Isso ocorre por um de dois motivos na extração do PyMuPDF:
1. O PDF usa a fonte original mas apenas embute o "Bold" no nome e o script de extração ignorou isso (ex: `AGaramondPro-Bold` foi parseado só como `AGaramondPro`).
2. O PDF usa uma flag de `flags: 16` ou `flags: 20` (Bold) que o frontend não está respeitando na hora de definir o `fontWeight`.
**Solução Ideal / Check:**
- Inspecionar o `page_xxx_dom.json` correspondente.
- Verificar o nome extraído da fonte (`font` property) no objeto Span do JSON.
- Garantir que o nome da família de fonte declarado no `@font-face` engloba a palavra `Bold` ou que o React Engine aplica o `fontWeight: 'bold'` com base na flag extraída.
*(Atenção! Próximo alvo: Corrigir isso na página 4).*

## 3. Barras de Ferramentas / Controles Sobrepondo o Render
**Problema:** Botões fixos do layout (Header, Setas de navegação grandes) atrapalhando a leitura limpa da página (O clássico TOC do "cortando o single view").
**Solução Ideal:** 
- Evitar Headers horizontais absolutos num cenário de PDF view. Use layouts Flexbox robustos onde o PDF container ocupe a viewport descontando o menu lateral (Sidebar Vertical) ou crie overlays ocultáveis.

## 4. Altura dos Títulos (Desalinhamento Vertical / "Mais Alto")
**Problema:** Títulos em fontes decorativas (como `Cinzel` ou `Esmeralda`) ficam renderizados mais altos que no PDF original, muitas vezes não centralizando perfeitamente nas faixas/ribbons de fundo.
**Causa:** O PyMuPDF extrai a BBox baseada estritamente nos "pixels tintados" (inked pixels). No entanto, o navegador alinha o CSS baseado na "em-box" da fonte. Fontes decorativas possuem *ascenders* e *descenders* internos enormes (para acomodar acentos e swashes). Quando o CSS aplica `line-height: 1` e `align-items: baseline`, a em-box da fonte "empurra" o texto visual para cima dentro da BBox.
**Solução Ideal:**
- Para fontes de título identificadas (`Cinzel`, `Esmeralda`), aplicar um deslocamento vertical direto no span usando `transform: translateY(X%)` (ex: `12%` a `15%`). Isso força a em-box do navegador a descer, alinhando os pixels tintados de volta ao centro da BBox original sem quebrar o layout das outras fontes do corpo do texto (como `Optima`).
*(Implementado no `PageRenderer.tsx` na definição do `spanStyle`).*

## Fluxo Base de Revisão (QA Diário)
Sempre que resolvermos um bug visual específico:
1. Identificar se é uma anomalia isolada de 1 página, ou uma quebra sistêmica (regra de fonte/layout).
2. Se for sistêmica, atualizar **este documento** com o padrão.
3. Arrumar não apenas o componente, mas revisar as páginas adjacentes para garantir que a correção não gerou *Regressões Visuais* (Efeito borboleta do CSS).
