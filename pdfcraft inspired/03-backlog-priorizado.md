# Backlog priorizado para o Middara

Prioridade aqui significa utilidade para localização, fidelidade e export do rulebook, não paridade geral com Acrobat.

| Prioridade | Ideia | Valor para o Middara | Custo/risco | Próximo passo |
|---|---|---|---|---|
| P0 | Manifesto de caso fonte → viewer → export | reduz provas repetidas e torna a causa auditável | baixo; requer só convenção de artefatos | prototipar nos três tracers do harness |
| P0 | Registrar sempre a branch do renderer | evita comparar fluxo traduzido como se fosse geometria fonte | baixo | adicionar campo aos relatórios existentes |
| P0 | Ledger de evidência com contraexemplo | impede que adapter/teste isolado vire aceite da página inteira | baixo | reutilizar estados QA atuais e ligar cada caso a um arquivo |
| P1 | Oráculo estrutural independente | pega MediaBox, CropBox, páginas, texto e PDF vazio antes da revisão visual | médio; ferramentas externas devem ser opcionais | combinar verificadores atuais com qpdf/poppler quando presentes |
| P1 | Isolamento e timeout por página | limita custo e facilita localizar falha no export integral | médio; parte já existe no job sequencial | documentar limites e preservar retry por página |
| P1 | Corpus sintético de regressões | transforma ghosts, símbolos e copyfit difíceis em casos duráveis | médio; fixtures precisam ser pequenos | selecionar um caso por família, começando por p.102/p.22/p.57 |
| P2 | Tiles de renderização no viewer | pode melhorar zoom/performance em páginas grandes | alto; arquitetura atual usa fundo/overlays | só investigar se houver gargalo medido |
| P2 | Controle headless semelhante ao PdfCraft | útil para app nativo, mas não é necessário para o viewer web atual | alto e sujeito às regras de browser | não iniciar agora |

## Itens explicitamente fora do backlog

Não vale trazer para este objetivo forms/XFA, OCR, assinatura, Preflight, PDF/A, combine/split, shell de Acrobat ou um renderer alternativo. Eles podem ser úteis num produto PDF genérico, mas não resolvem as dificuldades atuais do Middara e aumentariam a superfície sem melhorar a prova de localização.

## Critério para promover um item

Um item só sai do backlog quando:

1. reduz uma dificuldade observada no handoff ou em uma prova existente;
2. tem um tracer e um contraexemplo;
3. preserva o PDF fonte e os dados canônicos;
4. valida viewer e export separadamente;
5. deixa rollback e evidência suficientes para revisão posterior.

