# Registro obrigatório de progresso por tarefa

**Escopo: sempre.** Esta regra vale para qualquer IA e para toda tarefa do projeto, mesmo quando a execução muda automaticamente de uma tarefa para outra.

## Antes de retomar o projeto

- Qualquer pessoa desenvolvedora ou agente de IA deve ler `docs/project-progress/CONTINUE-HERE.md` antes de começar ou retomar trabalho no projeto. Esse handoff aponta o objetivo atual, decisões aceitas, evidências, riscos, estado do trabalho e os documentos que devem ser lidos para a tarefa.
- Depois, leia o registro da tarefa ativa e as regras/documentos específicos que o handoff indicar. Se o handoff estiver desatualizado, atualize-o como parte do registro de progresso antes de mudar o app.
- O handoff orienta a continuidade, mas não substitui as instruções do usuário, as regras do projeto ou as verificações exigidas.

## Antes de agir

1. Crie ou atualize um registro em `docs/project-progress/` antes da investigação ou implementação substancial.
2. Registre objetivo, escopo, método planejado, limites de segurança e como o resultado será verificado.
3. Adicione o registro ao índice `docs/project-progress/README.md`.

## Durante e ao encerrar

- Registre os passos realmente executados, evidências e descobertas; diferencie plano, hipótese e resultado confirmado.
- Registre correções de abordagem, bugs encontrados e tentativas que falharam, com o motivo e a solução adotada.
- Ao encerrar ou trocar de tarefa, anote arquivos alterados, testes/inspeções realizados, resultado, limitações, estado de commit/push e próximo passo.
- Abra o registro da próxima tarefa antes de começar essa tarefa. Não deixe uma transição automática sem registro.
- Se o trabalho for interrompido, deixe o registro com status `em andamento` e uma próxima ação concreta.

## Histórico e organização

- Mantenha os arquivos ativos em seus locais normais. Quando uma versão ativa for substituída ou aposentada, arquive a versão anterior em `icebox/` e explique o motivo no respectivo `README.md`.
- Atualize o índice de progresso conforme cada tarefa começa e termina. Mantenha os registros concisos, mas suficientes para retomar o trabalho sem depender do histórico do chat.
