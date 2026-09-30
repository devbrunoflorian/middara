# Tarefa: habilitar as 17 unidades de crédito da página 2

- **Status:** implementação concluída, QA estático passou e as unidades da página 2 estão cobertas pela aprovação visual do usuário em 2026-09-30.
- **Data:** 2026-09-30.
- **Objetivo:** fazer cada categoria do bloco visual de créditos ser editável separadamente, mantendo label em negrito, corpo regular e linhas de origem.

## Evidência existente

`docs/architecture/sample-layout-audit.md` e `tmp/layout-sample/sample-layout-audit.json` identificam 17 categorias por mudança para label em negrito terminada em dois-pontos. Há 3 colunas. As categorias 08–13 compartilham o mesmo bloco de origem `block_39` e atualmente colidem na chave legada `page_2_block_16`; por isso uma chave legacy não pode ser confundida com uma categoria. A unidade `Playtesters` já usa chaves semânticas `page_2_credit_playtesters_{label,body}__{language}` e essas chaves devem permanecer iguais.

## Método e limites

1. Representar vários `CreditUnitDefinition`s por bloco de origem; continuar aceitando o metadado singular antigo durante a transição.
2. Atualizar o sidecar da página 2 com todas as 17 categorias e validar IDs/linhas sem sobreposição entre campos.
3. Manter o fallback integral de uma chave de bloco legada quando ela existir, preservando a tradução já salva em vez de misturá-la às novas chaves.
4. Confirmar build, lint e consistência do JSON/lineIds. Comparar visualmente contra o PDF antes de considerar as 17 unidades aprovadas.
5. Não migrar os dois registros PT antigos do banco legado e não inspecionar o texto de rascunhos do navegador.

## Critério de aceite

No modo admin, clicar em cada label ou corpo deve selecionar apenas aquele campo. Os estilos originais permanecem em inglês até editar; label deve partir de Optima bold e corpo de Optima regular. A troca para o sidecar semântico deve ficar bloqueada quando existir override do bloco legado correspondente. As 17 unidades devem mapear exatamente às linhas de origem sem faltar nem repetir IDs.

## Próximo passo

O usuário aprovou visualmente a página 2. A fidelidade do texto-base em inglês continua como objetivo separado do trabalho em PT-BR e será auditada página a página antes de ampliar a tradução.

## Implementação e QA estático

- `Block` agora aceita múltiplas `creditUnits`; o loader mantém compatibilidade com o metadata singular anterior e com sidecars em objeto/lista.
- O sidecar da página 2 agora separa as 17 categorias em label/body distribuídos por 12 blocos de origem. Os seis itens do bloco central `block_39` não são colapsados numa única unidade.
- `Playtesters` conserva o mesmo `id`, portanto seus quatro spanKeys atuais (EN/PT, label/body) não mudam. Outros campos usam IDs estáveis derivados dos rótulos.
- Foram validados 68 spanKeys sem colisões, 62 IDs de linha de origem únicos e referências existentes no JSON de produção. Linhas label/body de cada categoria são disjuntas.
- Largura provisória de cada caixa foi calculada por coluna com a maior extensão de conteúdo fonte observada (limite `sourceBounds` do audit); isso dá margens consistentes dentro de cada coluna, mas não prova os limites de design. Comparação visual ainda pode justificar ampliar/reduzir as caixas.
- Se a chave legada de bloco da coluna existir, o renderer conserva o bloco legado inteiro; não mistura esse override com as chaves semânticas. Isso protege a translation existente e resolve os seis casos que colidem em `page_2_block_16`.
- Snapshot do sidecar Playtesters-only foi preservado em `icebox/2026-09-30-credit-units-v1-before-expansion/`.
- `npm run build -w apps/web` passou após a expansão. `npm run lint -w apps/web` terminou sem erros, com warnings React já existentes. O browser local está bloqueado por preferência salva; nenhum QA visual desta versão foi alegado.
