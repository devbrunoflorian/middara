# Skill: Arquitetura e Estrutura do Projeto

## Estrutura de monorepo (obrigatória, não sugestão)
```
middara-app/
├── apps/{web,desktop,mobile,admin,api}
├── packages/{schema,renderer,design-tokens,sync-engine,ingest}
├── data/legacy_extraction/
```
`web` é o único app que implementa UI de verdade. `desktop` (Tauri) e `mobile` (Capacitor) são wrappers finos do build de `web` — não duplicar componentes entre eles.

## Storage de assets: local agora, adapter trocável depois
Decisão confirmada com o responsável do projeto: por enquanto os assets ficam em disco local, não em S3/R2. Isso é aceitável **desde que**:
- O código nunca monte caminho de asset diretamente (`fs.readFileSync('/media/' + nome)`) fora de uma camada única de storage.
- O CMS/backend use seu mecanismo de adapter de storage nativo (ex: adapter local do Payload) em vez de lógica custom — trocar para R2/S3 depois deve ser configuração, não reescrita.

## Backend: CMS headless, não admin custom
Não construir painel de edição do zero (upload de imagem, editor de blocos, controle de rascunho/publicado). Usar um CMS headless (Payload CMS ou Directus) e modelar as Collections a partir do schema (`Book`, `Chapter`, `Page`, `Block`, `Asset`, `ErrataEntry`, `Translation`). Lógica de negócio custom (diff de erratas, geração de PDF) entra como plugin/rota adicional, não como substituto do CMS.

## Ordem de execução — não pular etapas
1. `packages/schema` primeiro — trava o contrato de dados antes de qualquer UI.
2. CMS local rodando com as Collections.
3. `packages/ingest` migrando **5 a 10 páginas de teste**, revisadas manualmente (ver Skill 01, Skill 05).
4. `PageRenderer` em modo Fidelidade só para essas páginas de teste.
5. Modo Reflow.
6. Só depois disso: wrappers Tauri/Capacitor, sync OTA, exportação PDF.

**Não começar pelo app multiplataforma.** É a armadilha mais comum nesse tipo de projeto — construir wrappers e infraestrutura antes de validar que uma única página renderiza fiel ao original.

## Exportação futura para PDF
Não é um subsistema novo: é o mesmo `PageRenderer` em modo Fidelidade, rodado dentro de um Chromium headless (Puppeteer/Playwright) e exportado como PDF/imagem em alta resolução. Se a exportação de PDF exigir lógica de renderização diferente da tela, isso é sinal de que o `PageRenderer` não está desacoplado o suficiente da plataforma — corrigir o renderer, não criar um segundo caminho de renderização.
