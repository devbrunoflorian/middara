# 🗺️ Roadmap do app comunitário — Middara Rulebook PT-BR

Este roadmap reúne ideias e melhorias para o app feito por fã. O trabalho mistura tradução, leitura e comparação com o PDF de referência; o status de cada página fica separado no [arquivo de acompanhamento](../docs/translations/page-status.csv).

O livro tem 102 páginas. A revisão continua em andamento, e nenhuma contagem antiga de blocos ou propostas deve ser lida como certificação visual do livro inteiro.

---

## 📁 Estrutura de Diretórios

O roadmap é dividido em duas pastas principais, com cada iniciativa documentada em um arquivo individual em formato Markdown:

- [**`concluidos/`**](concluidos): Projetos, ferramentas e marcos entregues e validados em produção.
- [**`pendentes/`**](pendentes): Projetos em andamento, backlog prioritário e próximas fases de desenvolvimento.

---

## ✅ Projetos Concluídos

| # | Projeto | Área | Resumo da Entrega | Documentação |
|---|---------|------|-------------------|--------------|
| **01** | **Extração e Modelagem PDF para DOM** | Backend / Extração | Pipeline PyMuPDF/pdfplumber gerando `page_XXX_dom.json` para todas as 102 páginas com caixas de tinta imutáveis. | [Ver Projeto](concluidos/01-extracao-e-modelagem-pdf-para-dom.md) |
| **02** | **Motor de Renderização e Fidelidade Visual** | Frontend / Canvas | `PageRenderer.tsx` com fontes autênticas (Optima, Garamond, Cinzel, Esmeralda), supressão de fantasma e fundos WebP. | [Ver Projeto](concluidos/02-motor-de-renderizacao-e-fidelidade-visual.md) |
| **03** | **Sistema de Símbolos Inline e Máscaras Vetoriais** | Frontend / Tipografia | Catálogo `symbols.json` com 111+ ícones mapeados, máscaras SVG vetoriais e normalização de caracteres PUA. | [Ver Projeto](concluidos/03-sistema-de-simbolos-inline-e-mascaras-vetoriais.md) |
| **04** | **Régua e Ferramentas de Diagnóstico Admin** | Ferramentas Admin | Régua calibrada em pontos tipográficos (pt), overlays de depuração e sincronização milimétrica de zoom. | [Ver Projeto](concluidos/04-regua-e-ferramentas-de-diagnostico-admin.md) |
| **05** | **Editor de Texto Rico (RichSpanEditor)** | Frontend / UX | Editor inline com formatação de spans, atalhos, histórico undo/redo, rascunhos locais e dicas de glossário. | [Ver Projeto](concluidos/05-editor-de-texto-rico-rich-span-editor.md) |
| **06** | **Central de Revisão e Aprovação de Traduções** | Gestão de Conteúdo | Painel lateral retrátil, toggle instantâneo EN/US ↔ PT/BR, fluxo de exceções e persistência direta no Payload CMS. | [Ver Projeto](concluidos/06-central-de-revisao-e-aprovacao-de-traducoes.md) |
| **07** | **Pipeline Copyfit V3 e Equivalência de Linhas** | QA Tipográfico | Algoritmo matemático tri-estado (EXACT/UNDER/OVER), script de auditoria `measure_copyfit_all.mjs` com 837+ unidades medidas. | [Ver Projeto](concluidos/07-pipeline-copyfit-v3-e-equivalencia-de-linhas.md) |
| **08** | **Padronização Terminológica e Glossário Canônico** | Editorial | Glossário consolidado, diretriz obrigatória de referências ("Veja", nunca "Consulte") e scripts de verificação regex. | [Ver Projeto](concluidos/08-padronizacao-terminologica-e-glossario-canonico.md) |
| **09** | **Prova Representativa de Exportação de PDF Página Única** | Engenharia PDF | Script `export_page_pdf.mjs` e verificador PyMuPDF com prova de conceito em páginas complexas (2, 13, 24, 42, 78). | [Ver Projeto](concluidos/09-prova-representativa-exportacao-pdf-pagina-unica.md) |
| **10** | **Primeiro lote de tradução (páginas 1 a 12)** | Tradução / Conteúdo | As traduções e decisões desse lote foram preservadas no estado local. A cobertura e a revisão visual atuais devem ser conferidas por página no arquivo de acompanhamento. | [Ver Projeto](concluidos/10-localizacao-e-aprovacao-paginas-1-a-12.md) |
| **11** | **Exportação do livro completo em PDF** | Exportação / PDF | PDF digital PT-BR entregue e rechecado em 28/11: 102 páginas, caixas iguais ao OG, texto selecionável, 40 bookmarks e 232 links internos válidos. Editabilidade no Acrobat segue no item 10; impressão CMYK/PDF/X segue no item 05. | [Ver Projeto](concluidos/11-exportador-do-livro-completo-em-pdf.md) |

---

## ⏳ Projetos Pendentes e Backlog

| # | Projeto | Prioridade | Escopo Principal | Documentação |
|---|---------|------------|------------------|--------------|
| **01** | **Revisão Final do Livro PT-BR (Páginas 1 a 102)** | ALTA | Tradução das regras e exportação completa entregues; fechar as pendências reais de comparação visual e certificação no controle por página. Os três lotes são histórico, não tradução restante. | [Ver Projeto](pendentes/01-localizacao-integral-das-paginas-13-a-102.md) |
| **02** | **Editor Visual de Molduras de Layout** | MÉDIA-ALTA | Manipuladores visuais interativos (*drag-and-drop / resize handles*) para ajuste não-destrutivo de caixas de texto com margens apertadas. | [Ver Projeto](pendentes/02-editor-visual-de-molduras-de-layout.md) |
| **03** | **Paleta Lateral Dedicada de Símbolos Admin** | MÉDIA | Gaveta lateral categorizada com busca rápida e inserção com 1 clique de todos os 111+ símbolos no cursor do editor. | [Ver Projeto](pendentes/03-paleta-lateral-dedicada-de-simbolos-admin.md) |
| **05** | **Saída para Gráfica (CMYK, PDF/X e Preflight)** | MÉDIA | Comparar OG e PDF digital; preservar a sangria já existente; converter e validar com o perfil, preset e especificações fornecidos pela gráfica. | [Ver Projeto](pendentes/05-saida-para-grafica-cmyk-pdfx-preflight.md) |
| **06** | **Banco de Conteúdo FAQ e Errata Integrado** | MÉDIA | Selos contextuais nas regras afetadas pela Errata 1.2 e FAQ oficial da Succubus Publishing, com visualizador integrado. | [Ver Projeto](pendentes/06-banco-de-conteudo-faq-errata-integrado.md) |
| **07** | **Empacotamento App Desktop e Mobile (PWA / Offline)** | BAIXA | Suporte a PWA offline para mesa de jogo (iPad/Android), empacotamento desktop (Tauri) e busca rápida via Command Palette. | [Ver Projeto](pendentes/07-empacotamento-app-desktop-e-mobile.md) |
| **08** | **Gerenciador de Decisões Linguísticas e Glossário Semântico** | ALTA | Próximo incremento: taxonomia validada por enums para componentes/cartas e política de localização por superfície; depois, busca sob demanda, controle otimista e consulta offline. | [Ver Projeto](pendentes/08-gerenciador-de-decisoes-linguisticas-e-glossario.md) |
| **09** | **Auditoria de Métricas Tipográficas e Fidelidade de Cores** | MÉDIA | PDF digital com peso da Optima regular ajustado sem alterar a arte. Paridade do Viewer e fidelidade de cores para impressão seguem em avaliação. | [Ver Projeto](pendentes/09-auditoria-de-metricas-tipograficas-e-fidelidade-de-cores.md) |
| **10** | **PUA, Fontes Especiais e Editabilidade no Adobe Acrobat Pro** | ALTA | Análise de caracteres PUA/Dingbats, resolução de quadradinhos (tofu), /ToUnicode CMap e viabilidade de edição externa profissional no Acrobat. | [Ver Projeto](pendentes/10-pua-fontes-especiais-e-editabilidade-acrobat-pro.md) |
| **11** | **Modo Grimório, Pré-renderização e Efeitos Arcanos** | MÉDIA | Modo de leitura imersivo com física 3D de virada, scrub veloz, snapshots em cache, brilho azul reativo e desacoplamento do editor. | [Ver Projeto](pendentes/11-modo-grimorio-pre-renderizacao-e-efeitos-arcanos.md) |
| **12** | **Pré-carregamento por idioma e skeleton loaders** | PÓS-TRADUÇÃO / ALTA | Janela de 10 páginas e skeleton confirmados no desktop. Fundo localizado do Índice entra no pré-carregamento. Medição em aparelho físico e revisão das invalidações continuam abertas. | [Ver Projeto](pendentes/12-pre-carregamento-por-idioma-e-skeleton-loaders.md) |

---

## Acompanhamento

Consulte o [status por página](../docs/translations/page-status.csv) para ver o que foi revisado, o que segue parcial e quais pontos ainda estão abertos. Os números antigos de propostas e unidades foram removidos daqui para evitar que pareçam uma medida de conclusão ou de fidelidade visual.
