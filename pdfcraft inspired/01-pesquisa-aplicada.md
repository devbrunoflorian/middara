# Pesquisa aplicada: o que do PdfCraft serve ao Middara

**Data da leitura:** 2026-10-16  
**Escopo:** pesquisa documental e mapeamento para os gargalos do Middara Rulebook App.

## Leitura correta do projeto externo

O PdfCraft se apresenta como uma reimplementação clean-room do Acrobat, mas isso não significa que ele tenha reproduzido internamente o Acrobat. As regras públicas dizem que o comportamento vem do padrão ISO 32000, documentação pública e observação black-box; também proíbem ler ou copiar o bundle do Acrobat. O README informa que o desenho das páginas ainda é feito pelo `hayro` enquanto o renderer próprio está em construção. A própria avaliação de paridade reconhece que ainda falta comparação lado a lado com o Acrobat.

Isso é relevante porque evita uma conclusão errada para o Middara: não há evidência pública para trocar nosso caminho de renderização por um suposto renderer “do Acrobat”. Há evidência, sim, de uma disciplina melhor para medir, registrar e reproduzir divergências.

## Observações que têm valor direto

### 1. Uma tabela de capacidades precisa exigir evidência

O PdfCraft mantém uma matriz de paridade e só considera uma funcionalidade `shipped` quando existe um comando, uma ferramenta ou um teste que sustenta a afirmação. A avaliação separa “quantas funções existem” de “quão pronto está para trabalho real”.

**Aplicação no Middara:** não contar um símbolo, uma unidade ou uma página como pronta só porque há um adapter, um teste isolado ou zero clipping. A unidade deve carregar o estado da evidência: `candidate`, `confirmed defect`, `false positive`, `known exception`, `outlier` ou `inconclusive`, com cobertura e tolerância declaradas. Essa regra já existe conceitualmente no QA; o ganho seria torná-la um registro uniforme por caso.

### 2. O motor é exercitado por uma superfície determinística

O PdfCraft expõe inspeção, extração, renderização e edição pela mesma tabela de ferramentas usada pela CLI e pelo MCP. O objetivo não é automatizar tudo com um agente, mas fazer com que a mesma operação tenha um caminho repetível fora da interface.

**Aplicação no Middara:** criar um manifesto de prova que invoque os scripts existentes com uma entrada imutável e registre as saídas. O manifesto deve apontar para a página, locale, modo, branch do renderer, snapshot e export, sem transformar o browser em autoridade única. Isso reduz a repetição manual nas provas de p. 18–25, p. 47, p. 52 e p. 102.

### 3. Fonte, render e export são superfícies diferentes

O projeto externo trata a robustez de abertura, a renderização e a edição/salvamento como gates separados. O nosso problema tem exatamente a mesma forma: um sidecar correto não garante viewer correto; um viewer correto não garante PDF exportado correto.

**Aplicação no Middara:** cada prova deve registrar explicitamente:

1. geometria e texto do PDF oficial;
2. sidecars e adapters usados;
3. caminho `SOURCE GEOMETRY` ou `TRANSLATED FLOW`;
4. captura viva do viewer com host/API/locale/mode;
5. save/reload quando houver persistência;
6. PDF exportado, `MediaBox`/`CropBox` e comparação raster.

Esse encadeamento é especialmente importante nos casos em que a tradução altera as quebras, nos símbolos inline e nos textos rasterizados dentro de cards.

### 4. Arquivo ruim vira regressão pequena

O PdfCraft relata uma varredura de corpus de 983 arquivos e transforma crashes, hangs e casos de reparo em testes sintéticos. A ideia útil não é importar o corpus inteiro: é guardar cada falha do Middara como um fixture pequeno, com uma expectativa clara.

**Aplicação no Middara:** quando uma página revelar ghost falso, símbolo faltante, baseline incorreta, overlay desalinhado ou export vazio, preservar um caso de regressão que exercite somente a família e o contraexemplo. O caso deve falhar se o sidecar fonte for alterado, se o objeto for pintado duas vezes ou se o PDF exportado não conservar a caixa física.

### 5. Isolamento por página e limites de recurso

O PdfCraft informa que páginas são renderizadas isoladamente e que tiles são usados em zoom profundo. Isso ajuda a limitar falhas e custo em documentos grandes.

**Aplicação no Middara:** manter a unidade de trabalho como uma página/prova isolada e reutilizar o worker de export já sequencial. Para o nosso viewer atual, tiles não são prioridade: o fundo de página e os overlays já têm outra arquitetura. Tiles só entram se o problema de zoom/performance voltar a ser um gargalo comprovado.

### 6. Salvamento seguro e reversível

O projeto externo destaca atualizações incrementais, escrita atômica, undo após save e recuperação após crash.

**Aplicação no Middara:** usar a mesma filosofia para provas e propostas: snapshot imutável antes do export, nenhum write canônico durante auditoria read-only, artefatos de prova separados e rollback explícito. Não é motivo para alterar agora o contrato do Payload; é uma regra para os novos harnesses.

## O que não serve ao nosso escopo atual

- Forms, XFA, OCR, assinatura institucional, Preflight e PDF/A/X/UA não resolvem o gargalo atual de localização e fidelidade de páginas.
- Combine/split/organize pages não atacam a geometria de texto, a classificação de artwork ou o copyfit PT-BR.
- Trocar o renderer por Hayro ou pelo renderer próprio do PdfCraft não é sustentado pela evidência pública; o próprio projeto declara que essa parte ainda está em evolução.
- Reproduzir a interface do Acrobat ou adotar screenshots do Acrobat como assets violaria o foco do projeto e não ajudaria a certificar nosso PDF.

## Conclusão operacional

O melhor empréstimo é um pequeno sistema de evidência: cada afirmação de fidelidade deve apontar para uma prova determinística e para um contraexemplo. Isso complementa o modelo atual do Middara sem enfraquecer suas regras de geometria fonte, semântica inline e classificação conservadora de duplicatas.

