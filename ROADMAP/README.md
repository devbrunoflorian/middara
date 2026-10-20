# 🗺️ Roadmap Oficial do Projeto — Middara Rulebook PT-BR

Bem-vindo ao diretório oficial de governança e acompanhamento de projetos do **Middara Rulebook PT-BR**.

Este espaço consolida a evolução de engenharia, diagramação, tradução e distribuição do manual de regras oficial do jogo Middara (102 páginas, versão 1.2 da Succubus Publishing) em português brasileiro com fidelidade gráfica e tipográfica idêntica ao original.

---

## 📁 Estrutura de Diretórios

O roadmap é dividido em duas pastas principais, com cada iniciativa documentada em um arquivo individual em formato Markdown:

- [**`concluidos/`**](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos): Projetos, ferramentas e marcos entregues e validados em produção.
- [**`pendentes/`**](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes): Projetos em andamento, backlog prioritário e próximas fases de desenvolvimento.

---

## ✅ Projetos Concluídos

| # | Projeto | Área | Resumo da Entrega | Documentação |
|---|---------|------|-------------------|--------------|
| **01** | **Extração e Modelagem PDF para DOM** | Backend / Extração | Pipeline PyMuPDF/pdfplumber gerando `page_XXX_dom.json` para todas as 102 páginas com caixas de tinta imutáveis. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/01-extracao-e-modelagem-pdf-para-dom.md) |
| **02** | **Motor de Renderização e Fidelidade Visual** | Frontend / Canvas | `PageRenderer.tsx` com fontes autênticas (Optima, Garamond, Cinzel, Esmeralda), supressão de fantasma e fundos WebP. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/02-motor-de-renderizacao-e-fidelidade-visual.md) |
| **03** | **Sistema de Símbolos Inline e Máscaras Vetoriais** | Frontend / Tipografia | Catálogo `symbols.json` com 111+ ícones mapeados, máscaras SVG vetoriais e normalização de caracteres PUA. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/03-sistema-de-simbolos-inline-e-mascaras-vetoriais.md) |
| **04** | **Régua e Ferramentas de Diagnóstico Admin** | Ferramentas Admin | Régua calibrada em pontos tipográficos (pt), overlays de depuração e sincronização milimétrica de zoom. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/04-regua-e-ferramentas-de-diagnostico-admin.md) |
| **05** | **Editor de Texto Rico (RichSpanEditor)** | Frontend / UX | Editor inline com formatação de spans, atalhos, histórico undo/redo, rascunhos locais e dicas de glossário. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/05-editor-de-texto-rico-rich-span-editor.md) |
| **06** | **Central de Revisão e Aprovação de Traduções** | Gestão de Conteúdo | Painel lateral retrátil, toggle instantâneo EN/US ↔ PT/BR, fluxo de exceções e persistência direta no Payload CMS. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/06-central-de-revisao-e-aprovacao-de-traducoes.md) |
| **07** | **Pipeline Copyfit V3 e Equivalência de Linhas** | QA Tipográfico | Algoritmo matemático tri-estado (EXACT/UNDER/OVER), script de auditoria `measure_copyfit_all.mjs` com 837+ unidades medidas. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/07-pipeline-copyfit-v3-e-equivalencia-de-linhas.md) |
| **08** | **Padronização Terminológica e Glossário Canônico** | Editorial | Glossário consolidado, diretriz obrigatória de referências ("Veja", nunca "Consulte") e scripts de verificação regex. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/08-padronizacao-terminologica-e-glossario-canonico.md) |
| **09** | **Prova Representativa de Exportação de PDF Página Única** | Engenharia PDF | Script `export_page_pdf.mjs` e verificador PyMuPDF com prova de conceito em páginas complexas (2, 13, 24, 42, 78). | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/09-prova-representativa-exportacao-pdf-pagina-unica.md) |
| **10** | **Localização e Aprovação Integral das Páginas 1 a 12** | Tradução / Conteúdo | Páginas iniciais 100% traduzidas, revisadas e aprovadas no Payload (380+ blocos, zero overflow). | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/concluidos/10-localizacao-e-aprovacao-paginas-1-a-12.md) |

---

## ⏳ Projetos Pendentes e Backlog

| # | Projeto | Prioridade | Escopo Principal | Documentação |
|---|---------|------------|------------------|--------------|
| **01** | **Localização Integral das Páginas 13 a 102** | ALTA | Tradução, revisão e aprovação dos 3 lotes restantes (Lote 1: Combate 13-35, Lote 2: IA/Monstros 36-65, Lote 3: Campanha 66-102). | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/01-localizacao-integral-das-paginas-13-a-102.md) |
| **02** | **Editor Visual de Molduras de Layout** | MÉDIA-ALTA | Manipuladores visuais interativos (*drag-and-drop / resize handles*) para ajuste não-destrutivo de caixas de texto com margens apertadas. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/02-editor-visual-de-molduras-de-layout.md) |
| **03** | **Paleta Lateral Dedicada de Símbolos Admin** | MÉDIA | Gaveta lateral categorizada com busca rápida e inserção com 1 clique de todos os 111+ símbolos no cursor do editor. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/03-paleta-lateral-dedicada-de-simbolos-admin.md) |
| **04** | **Exportador do Livro Completo em PDF** | ALTA | Orquestrador automatizado (`export_full_book_ptbr.mjs`) compilando as 102 páginas, índice com bookmarks clicáveis e preflight. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/04-exportador-do-livro-completo-em-pdf.md) |
| **05** | **Saída para Gráfica (CMYK, PDF/X e Preflight)** | MÉDIA | Geração de PDF profissional para gráficas com sangria (3-5mm), marcas de corte, conversão de perfil CMYK e validação TAC <= 300%. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/05-saida-para-grafica-cmyk-pdfx-preflight.md) |
| **06** | **Banco de Conteúdo FAQ e Errata Integrado** | MÉDIA | Selos contextuais nas regras afetadas pela Errata 1.2 e FAQ oficial da Succubus Publishing, com visualizador integrado. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/06-banco-de-conteudo-faq-errata-integrado.md) |
| **07** | **Empacotamento App Desktop e Mobile (PWA / Offline)** | BAIXA | Suporte a PWA offline para mesa de jogo (iPad/Android), empacotamento desktop (Tauri) e busca rápida via Command Palette. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/07-empacotamento-app-desktop-e-mobile.md) |
| **08** | **Gerenciador de Decisões Linguísticas e Glossário Semântico** | ALTA | Arquitetura lean para registro de decisões, busca sob demanda de ocorrências sem indexação cega, controle otimista e consulta offline. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/08-gerenciador-de-decisoes-linguisticas-e-glossario.md) |
| **09** | **Auditoria de Métricas Tipográficas e Fidelidade de Cores** | MÉDIA | Investigação técnica de leading, baselines, tracking/advance de glifos, métricas de fontes e fidelidade cromática (sRGB/CMYK/antialiasing). | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/09-auditoria-de-metricas-tipograficas-e-fidelidade-de-cores.md) |
| **10** | **PUA, Fontes Especiais e Editabilidade no Adobe Acrobat Pro** | ALTA | Análise de caracteres PUA/Dingbats, resolução de quadradinhos (tofu), /ToUnicode CMap e viabilidade de edição externa profissional no Acrobat. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/10-pua-fontes-especiais-e-editabilidade-acrobat-pro.md) |
| **11** | **Modo Grimório, Pré-renderização e Efeitos Arcanos** | MÉDIA | Modo de leitura imersivo com física 3D de virada, scrub veloz, snapshots em cache, brilho azul reativo e desacoplamento do editor. | [Ver Projeto](file:///c:/Users/bruno/Middara/Rulebook%20App/ROADMAP/pendentes/11-modo-grimorio-pre-renderizacao-e-efeitos-arcanos.md) |

---

## 📊 Métricas Gerais do Projeto

- **Total de Páginas do Manual:** 102 páginas
- **Páginas 100% Concluídas e Aprovadas:** 12 páginas (11,8%)
- **Páginas com Propostas de Comunidade Mapeadas:** 74 páginas
- **Páginas de Regras sem Proposta (Tradução Direta):** 13 páginas
- **Páginas de Arte / Transição:** 3 páginas
- **Unidades Tipográficas Mapeadas:** 837+
- **Símbolos Vetoriais Inline:** 111+
