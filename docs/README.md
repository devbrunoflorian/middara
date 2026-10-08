# Documentação do projeto

Este índice aponta para os contratos atuais. Registros em `project-progress/` e documentos marcados como históricos guardam evidência e decisões passadas; eles não substituem os contratos abaixo.

## Como usar as instruções do projeto

Responsabilidades: **rules** definem políticas e invariantes obrigatórias; **skills** descrevem procedimentos operacionais que aplicam essas rules; **docs** explicam arquitetura e rationale e guardam exemplos, ADRs, lições, estado e evidência. Uma skill não redefine uma rule `ACTIVE`.

Precedência: (1) instrução explícita atual do usuário; (2) `PROJECT-HANDOFF.md` / `PROJECT_STATE.md`, quando aplicáveis; (3) rules `ACTIVE`; (4) skills; (5) docs de arquitetura/QA; (6) histórico, ADRs e relatórios datados. Em conflito entre skill e rule ativa, a rule vence. Material `DEPRECATED`, `SUPERSEDED` ou `HISTORICAL` não é instrução ativa.

## Retomada rápida

- [Estado atual](PROJECT_STATE.md) — o que funciona, o que está aberto e o próximo estágio.
- [Handoff operacional](../PROJECT-HANDOFF.md) — estado do workspace, inicialização e evidências recentes.
- [Mapa do repositório](PROJECT_STRUCTURE.md) — localização dos sistemas e dados.

## Arquitetura

- [Visão geral](architecture/overview.md) — extração, estrutura, edição, persistência, renderização e export.
- [Modelo editorial](architecture/editorial-model.md) — unidades traduzíveis, relações entre parágrafos, listas, chamadas e cartões.
- [Símbolos inline](architecture/inline-symbols.md) — identidade, arte, métricas tipográficas e compatibilidade.
- [Inventário histórico de dados de tradução](architecture/translation-data-schema-and-symbol-catalog.md) — propostas antigas e catálogo; invariantes ativos estão na [rule 02](../.agents/rules/02-schema-e-modelagem-de-dados.md).
- [ADRs](architecture/decisions/README.md) — decisões arquiteturais aceitas e suas consequências.
- [Motor reutilizável de localização de PDF](architecture/pdf-localization-engine.md) — guia independente de Middara.

## Operação e qualidade

- [Estados de QA e evidência](QA/acceptance.md) — vocabulário de classificação e interpretação subordinados à rule 05.
- [Fidelidade visual](QA/FIDELITY_QA_PROCESS.md) — entrada curta para o processo de QA atual.
- [Princípios de debugging](debugging-principles.md) — investigação de layout sem ajustes por palpite.
- [Regras do projeto](../.agents/rules/00-README.md) e [skills](../.agents/skills/README.md) — contratos normativos, procedimentos ativos, precedência e dependências.
- [Glossário PT-BR](translations/glossary.md) e [fluxo editorial](translations/production-workflow.md) — trabalho de tradução.

## Histórico e evidência

- [Abordagens abandonadas e evolução](history/architecture-dead-ends.md) — o que falhou, sintomas, causa conhecida e alternativa atual.
- [Índice de progresso](project-progress/README.md) — registros datados; são evidência de escopo, não estado global por si só.
- [Status/disposição documental](history/documentation-dispositions.md) — arquivos obsoletos, consolidados e preservados.
- [Auditoria estrutural p. 40 e 49–102](project-progress/2026-10-07-source-structure-audit-and-doc-consolidation.md) — medições A–D e limites do censo atual.

## Leitura de status

Para cobertura de página/família, `VALIDATED` vale apenas para o escopo registrado; `PARTIAL` limita-se ao subconjunto testado; `OPEN` requer análise; `OUTLIER` indica estrutura confirmada sem família aprovada. Os rótulos de ocorrência (`candidate`, `confirmed defect`, `false positive`, `known exception`, `outlier`, `inconclusive`) são definidos em [QA acceptance](QA/acceptance.md). Não confunda candidato geométrico com defeito nem cobertura parcial com certificação do livro.
