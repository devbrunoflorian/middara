---
name: "Formatação de Comandos em Codebox"
description: "Sempre que for necessário fornecer um comando de terminal para o usuário executar, forneça-o obrigatoriamente dentro de um bloco de código (codebox) para facilitar cópia e cola."
---

# Regra 12: Formatação de Comandos em Codebox

Sempre que a IA precisar fornecer comandos de terminal, scripts, dependências para instalar, ou processos para rodar (ex: iniciar servidor, compilar projeto), **NUNCA** deixe o comando solto no meio do texto ou apenas formatado com inline code (crase única).

Os comandos devem ser **OBRIGATORIAMENTE** encapsulados em um bloco de código multi-linhas (codebox) com a respectiva linguagem definida (bash, sh, powershell, etc.), para que o usuário possa copiar com um único clique.

## Correto (Aceitável)
```bash
npm run dev -w apps/web
```

## Incorreto (Proibido)
Para rodar, digite `npm run dev -w apps/web` no seu terminal.
