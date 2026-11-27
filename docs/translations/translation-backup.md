# Backup portátil dos dados de tradução

## Banco do Payload no Git

As traduções publicadas, revisões, molduras e decisões ficam no SQLite do Payload; os sidecars de página no Git não substituem esses registros. O banco ativo `apps/admin/apps-admin.db` continua local e ignorado. Para manter o conteúdo restaurável junto com o projeto, o repositório versiona o snapshot filtrado `apps/admin/apps-admin-snapshot.sqlite`.

Gere ou atualize o snapshot antes de publicar mudanças no conteúdo:

```powershell
python scripts/snapshot_payload_db.py --force
```

O script copia o estado consistente do SQLite local e limpa contas/sessões, preferências locais, locks e registros de exportação (que podem conter caminhos da máquina). Ele preserva as coleções editoriais, traduções, revisões, pedidos de revisão, decisões do glossário, molduras e aliases. Não inclui alterações ainda não sincronizadas no localStorage do navegador.

Para usar o snapshot em um clone Windows, copie-o para o caminho ativo do Payload e configure o segredo local:

```powershell
Copy-Item apps/admin/apps-admin-snapshot.sqlite apps/admin/apps-admin.db
Copy-Item apps/admin/.env.example apps/admin/.env
```

Defina `PAYLOAD_SECRET` em `apps/admin/.env` antes de iniciar a API. O `.env` e o banco ativo continuam fora do Git; o snapshot é a cópia do estado compartilhável.

O backup CLI é uma cópia somente leitura dos registros de tradução confirmados pelo Payload. Ele não altera o editor, Payload, SQLite, localStorage, frames ou arquivos-fonte. Não é um importador nem um pacote para aplicar em outro projeto.

## Gerar

Com a API Payload acessível (por padrão em `http://localhost:3000`), execute na raiz do projeto:

```powershell
npm run backup:translations
```

O pacote inspecionável será criado numa nova pasta sob `output/backups/translations/`. Para outra origem ou destino:

```powershell
$env:MIDDARA_TRANSLATION_API_URL = 'http://localhost:3000'
npm run backup:translations -- --api-url $env:MIDDARA_TRANSLATION_API_URL
```

O export lê todas as páginas das coleções pela API, valida os totais e exige duas leituras completas consecutivas idênticas. Se dados forem salvos enquanto a captura está em andamento, a execução aborta sem publicar um pacote parcial; rode de novo depois do save.

## Formato

Cada backup contém:

- `manifest.json`: versão do formato, origem, projeto/documento, locale(s), totais, timestamps e SHA-256 dos arquivos;
- `translations.json`: registros Payload completos, rich segments, metadados e um índice auxiliar de keys/página/unidade quando identificável;
- `frames.json`: registros completos da coleção separada `layout-frames`;
- `symbol-alias-settings.json`: aliases preferidos dos símbolos;
- `metadata.json`: informação de geração, commit e limites de cobertura.

Os envelopes preservam os documentos Payload como recebidos, incluindo IDs, keys, locale, dados ricos e timestamps. Os índices são auxiliares: os registros completos continuam sendo a fonte para uma futura recuperação. Os arquivos JSON são UTF-8 e legíveis.

Verifique um pacote sem escrever em nenhum banco:

```powershell
node scripts/backup-translations.mjs --verify 'output/backups/translations/<id-do-backup>'
```

A verificação recalcula checksums, valida JSON, contagens, IDs/keys/locale, segmentos ricos, IDs semânticos e frames; compara índices e reconstrói as coleções em memória.

## O que entra e o que fica fora

Entram todos os documentos encontrados nas coleções `translations`, `layout-frames` e `symbol-alias-settings`. As traduções incluem texto/runs, estilos e `symbolId`s. Os frames ficam num arquivo separado porque são layout por unidade/idioma, independente do conteúdo. As preferências de aliases também são uma coleção Payload separada.

Não entram os sidecars/source JSON/PDFs, imagens, defaults de fonte e outros arquivos do projeto versionados ou regeneráveis; drafts ainda não salvos mantidos somente na sessão React; nem valores de browser localStorage. O pacote não executa nem documenta uma restauração na base real.

## Payload e localStorage

O editor lê overrides de `middara-lines-v2-en` e `middara-lines-v2-pt-BR` no localStorage, depois mescla os registros da coleção Payload; para keys iguais, os valores vindos do servidor substituem os locais. Ao salvar, ele grava primeiro no localStorage e tenta enviar o override ao Payload. Se a sincronização falhar, o texto pode continuar salvo apenas naquele navegador e o app informa que não sincronizou. Assim, o backup Payload preserva o trabalho confirmado no servidor, mas **não representa todo o trabalho salvo se houver overrides locais não sincronizados**.

Frames também têm cópias locais com chaves `middara-layout-frames-v1-<idioma>-page-<página>` e records Payload em paralelo. Aliases são salvos na coleção Payload `symbol-alias-settings`. Drafts de texto e layout ainda não salvos existem apenas na memória da sessão e são excluídos.

Esta versão da ferramenta não lê o browser. Antes de confiar em um backup como cópia completa, resolva no Admin qualquer aviso de save local/não sincronizado e confirme que o Payload contém o estado esperado. Um futuro pacote pode acrescentar captura local explícita e deduplicada; esta CLI não pretende inferir ou recolher esses dados.

## Limites

- Um backup representa uma leitura consistente das três coleções Payload; ele não captura uma transação multicoleta do banco. A repetição de duas leituras reduz o risco de salvar um snapshot durante mudanças, mas não é locking transacional.
- A recuperação testada é em memória, não é um restore, import ou validação contra outra instalação.
- A cópia local está sob `/output/`, ignorado pelo Git. Copie o diretório gerado para armazenamento independente para proteção contra falha/perda do workspace.
- Exportar os records não garante que outro projeto tenha os mesmos IDs editoriais, símbolos, sidecars, fonts ou versão do app necessários para renderizá-los.
- Backup de tradução é distinto de um pacote de locale portátil/importável. Não há importador de produção nesta tarefa.
