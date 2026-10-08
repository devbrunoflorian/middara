# Documentação do projeto

Este índice aponta para os contratos atuais. Registros em `project-progress/` e documentos marcados como históricos guardam evidência e decisões passadas; eles não substituem os contratos abaixo.

## Retomada rápida

- [Estado atual](PROJECT_STATE.md) — o que funciona, o que está aberto e o próximo estágio.
- [Handoff operacional](../PROJECT-HANDOFF.md) — estado do workspace, inicialização e evidências recentes.
- [Mapa do repositório](PROJECT_STRUCTURE.md) — localização dos sistemas e dados.

## Arquitetura

- [Visão geral](architecture/overview.md) — extração, estrutura, edição, persistência, renderização e export.
- [Modelo editorial](architecture/editorial-model.md) — unidades traduzíveis, relações entre parágrafos, listas, chamadas e cartões.
- [Símbolos inline](architecture/inline-symbols.md) — identidade, arte, métricas tipográficas e compatibilidade.
- [Dados de tradução](architecture/translation-data-schema-and-symbol-catalog.md) — formato atual e histórico do schema; propostas antigas não são decisões vigentes.
- [ADRs](architecture/decisions/README.md) — decisões arquiteturais aceitas e suas consequências.
- [Motor reutilizável de localização de PDF](architecture/pdf-localization-engine.md) — guia independente de Middara.

## Operação e qualidade

- [Aceite estrutural e visual](qa/acceptance.md) — critérios, estados de auditoria e validação.
- [Fidelidade visual](QA/FIDELITY_QA_PROCESS.md) — entrada curta para o processo de QA atual.
- [Princípios de debugging](debugging-principles.md) — investigação de layout sem ajustes por palpite.
- [Regras do projeto](../.agents/rules/00-README.md) e [skills](../.agents/skills/README.md) — procedimentos ativos e status explícito.
- [Glossário PT-BR](translations/glossary.md) e [fluxo editorial](translations/production-workflow.md) — trabalho de tradução.

## Histórico e evidência

- [Abordagens abandonadas e evolução](history/architecture-dead-ends.md) — o que falhou, sintomas, causa conhecida e alternativa atual.
- [Índice de progresso](project-progress/README.md) — registros datados; são evidência de escopo, não estado global por si só.
- [Status/disposição documental](history/documentation-dispositions.md) — arquivos obsoletos, consolidados e preservados.
- [Auditoria estrutural p. 40 e 49–102](project-progress/2026-10-07-source-structure-audit-and-doc-consolidation.md) — medições A–D e limites do censo atual.

## Leitura de status

`VALIDATED` significa que a evidência passou exatamente no escopo registrado. `PARTIAL` limita-se ao subconjunto testado. `OPEN` precisa de análise; `OUTLIER` indica estrutura sem contrato aprovado. `CANDIDATE` é apenas uma pista geométrica. A ausência de um erro visual não certifica sozinha a classificação estrutural.
