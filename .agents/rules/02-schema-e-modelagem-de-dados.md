# Skill: Schema e Modelagem de Dados

## Princípio central
O PDF não é o dado — é só uma representação. O dado real é a estrutura semântica:
```
Book → Chapter → Page → Block (text | image | vector | texture | group)
```
Qualquer decisão de modelagem deve proteger esse princípio: **o banco é a fonte de verdade**, o PDF e o app são visualizações/exportações dela.

## Regras de schema

1. **`assetId` é uma referência abstrata, nunca um caminho ou URL hardcoded.** Hoje o storage é local em disco; no futuro pode virar S3/R2/CDN. Se qualquer parte do código montar uma URL de asset fora da camada de storage (ex: `` `/uploads/${nome}.png` `` espalhado pelo front), a troca de storage no futuro vira uma refatoração gigante em vez de trocar um adapter.

2. **Todo bloco carrega `position` (fidelidade) E `readingOrder` (reflow) desde a primeira versão do schema.** Não adicionar `readingOrder` depois "quando precisar" — ele deve nascer junto, mesmo que a heurística de preenchê-lo melhore com o tempo.

3. **Cor sempre em RGB hex no schema**, nunca CMYK cru. A conversão é feita uma vez, na ingestão — não empurrar CMYK pro frontend.

4. **Erratas são entradas versionadas (`ErrataEntry`), nunca sobrescrita direta do bloco.** Cada mudança de conteúdo publicado gera uma entrada com `before`/`after`, versão do livro, e uma nota legível pro usuário final ("Corrigido erro na regra de Combate"). Sobrescrever o bloco sem esse rastro quebra o sistema de sincronização OTA — o cliente não tem como saber o que mudou.

5. **Tradução (`Translation`) é uma entidade separada do `Block`, referenciando por `blockId` + `locale`.** Nunca embutir o texto traduzido dentro do bloco original — isso trava o sistema assim que uma segunda língua for adicionada.

6. **Fonte é uma string livre no schema (`fontFamily`), resolvida para arquivo real na camada de design tokens**, não uma referência direta a caminho de arquivo. Isso permite trocar o arquivo de fonte (ex: subset → fonte completa licenciada) sem migrar dado nenhum.

## O que não fazer
- Não modelar página como HTML/JSON de layout específico de uma plataforma (ex: um JSON já pensado pra React). O schema é agnóstico de renderer — quem decide como desenhar é o `PageRenderer` de cada plataforma, lendo o mesmo dado.
- Não misturar dado de conteúdo com dado de apresentação de forma irreversível (ex: não "achatar" cor + fonte + texto numa string de HTML pronta). Cada propriedade (posição, cor, fonte, texto) fica separada e tipada.
- Não usar o GitHub como banco de dados de conteúdo. Isso foi cogitado na primeira versão do plano e foi abandonado: o backend com Postgres/CMS é a fonte de verdade; sync OTA é a API entregando diffs, não o app lendo arquivos crus de um repositório.
