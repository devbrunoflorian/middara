---
name: "Proibição de Browser Agent Autônomo para QA Visual"
description: "Regra estrita proibindo o uso do browser subagent para interações visuais demoradas. Define alternativas para validação visual (usuário testa ou script headless automatizado)."
---

# Regra 11: Proibição de Browser Agent Autônomo

O subagente de navegação autônoma (`browser_subagent`) frequentemente se perde ao tentar simular cliques e capturas em interfaces complexas ou WYSIWYG, resultando em perda drástica de tempo (às vezes 40+ minutos de execução) e frustração.

**É ESTRITAMENTE PROIBIDO usar o controle de navegador autônomo para QA visual ou validação de testes complexos de interface.**

Se for necessária uma prova visual ou teste de interação de UI, você tem apenas **duas alternativas permitidas**:
1. **Delegar ao Usuário:** Forneça o passo-a-passo exato (receita de bolo) do teste para o usuário executar na máquina dele e retornar o feedback visual/prints.
2. **Script Headless:** Escreva um script automatizado de verdade usando bibliotecas programáticas (Playwright, Puppeteer, Vitest headless) que manipulam o DOM/Network ou tiram screenshot de forma programática sem simular os movimentos complexos de mouse de um subagente genérico. Isso roda em segundos e é imutável.

Nunca mais envie o subagente autônomo do browser para clicar e validar fluxos WYSIWYG.
