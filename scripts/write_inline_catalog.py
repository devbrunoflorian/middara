"""Write readable audit/usage matrices from the frozen audit and current adapters."""
from pathlib import Path
from collections import defaultdict
import json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/project-progress/evidence/2026-10-04-inline-elements'

def cell(value):
    return str(value).replace('|','\\|').replace('\n',' ↵ ').replace('\r','')

def table(headers,rows):
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(cell(v) for v in row)+' |' for row in rows])

def main():
    audit=json.loads((OUT/'inventory.json').read_text('utf8'))
    definitions=json.loads((ROOT/'apps/web/src/symbols/sourceSymbols.json').read_text('utf8'))
    uses=defaultdict(list)
    for path in sorted((ROOT/'apps/web/public/pages').glob('page_*/inline_elements.json')):
        dom=json.loads(next(path.parent.glob('page_*_dom.json')).read_text('utf8'))
        for element in json.loads(path.read_text('utf8'))['elements']:
            b=dom['blocks'][element['anchor']['blockIndex']]
            a=element['anchor'];ref=f"{a['lineId']}:{a['spanIndex']}"
            kind='span-unit' if any(ref in u['spanRefs'] for u in b.get('typographicSpanUnits',[])) else 'typographic-field' if b.get('typographicUnits') else 'credit-field' if b.get('creditUnits') or b.get('creditUnit') else 'paragraph'
            uses[element['symbolId']].append(dict(page=dom['page_number'],block=b['id'],line=a['lineId'],spanIndex=a['spanIndex'],blockType=kind,side=a['side'],bbox=element['bbox']))
    (OUT/'registry-usage.json').write_text(json.dumps(uses,ensure_ascii=False,indent=2)+'\n','utf8')
    text=['# Catálogo e mapa de uso de elementos especiais','',
      'Auditoria pré-implementação: 102 páginas, código ativo/legado e SQLite em leitura. Esta matriz enumera todos os **padrões candidatos detectados**, incluindo falsos positivos. O inventário não certifica semântica nem fidelidade do livro. Coordenadas, estilos, contexto completo, tratamento por span e referências de código estão em [inventory.json](inventory.json) e [occurrences.csv](occurrences.csv).',
      '', '## Contratos comuns: definição, armazenamento, editor e renderização','',
      table(['Família','Definição atual / representação visual','Significado','Persistência / parsing','Editor / renderer / inconsistências'],[
       ['Símbolo registrado','semanticSymbols.ts + sourceSymbols.json; SVG fonte ou raster Totem Azul','ID independente de idioma','Segment.text=U+FFFC + symbolId + symbolMetrics opcional; tokens EN/PT compartilhados','Paleta contextual e SemanticSymbol; ancoragem fonte explícita. Export e navegador pendentes'],
       ['Fonte de símbolos','DOM spans: text/font + metadados pictogram; glyph da fonte PDF','Cada codepoint exige prova visual; Wingdings U+0088 não equivale a F088 instalado','Texto legado continua válido; resolveLegacySymbol central para casos comprovados','Parte dos glyphs fonte suprimida/restaurada por overlay; só os registrados se tornam objetos'],
       ['PUA / alternância Esmeralda','displayOverride, pua_mapping.json e fonte PUA','Letra alternativa / tipografia, não ícone de jogo','Texto/metadata de origem e caracteres PUA em segmentos','Editor de alternates existente; não remapear família inteira nem converter letras em símbolos'],
       ['Label de regra','IMPORTANT, PASSIVE, STATUS, EXHAUST, DISCARD, COMMAND, INTELLIGENT etc.; fonte/cor/stroke e às vezes cápsula vetorial','Rótulo textual de regra','Runs estilizados JSON; label não é placeholder semântico','Texto segue editor; cápsulas compostas ainda exigem adaptação própria, não estão certificadas como objetos completos'],
       ['Letra A–M / quadrado / LVL / bullet','Span, SVG ou forma fixa com conectores/checklist','Marcador da página, fora do conteúdo traduzível quando furniture','DOM/sidecar fonte; não migra para Segment de prosa','Unidade read-only/linha estática; checklist registrado apenas como legado, excluído da paleta'],
       ['Unicode comum / controles','Sinais +, hífen, apóstrofo, quebralinhas, NBSP, operadores, letras enfatizadas','Texto ou formatação conforme contexto','Texto do run preservado; não há conversão global de Unicode','Sem inventar símbolo para pontuação; texto com U+FFFC sem ID não é remapeado silenciosamente'],
       ['Imagem pequena / path candidato','PDF image digest/xref ou assinatura de paths normalizados','Pode ser token inline, detalhe de carta, fragmento ou ornamento; semântica não comprovada automaticamente','Fonte/overlays; candidatos não viram registros por proximidade','169 grupos de imagens e 402 de vetores estão abaixo; os ativados exigem receita/âncora comprovada'],
       ['Arte física / furniture','Carta, diagrama, capa, token ilustrado completo, florão; fidelity_overlays.json','Ilustração fixa compartilhada EN/PT-BR','Arte fonte + flags de supressão, separada das traduções','Não inserir fragmentos extraídos como texto; sincronização EN/PT preservada'],
       ['ID desconhecido / token','⟦symbol:ID-percent-encoded⟧, token legível EN/PT','Objeto futuro ou indisponível','Codec retém ID, estilos e metadados no round-trip','Fallback visível acessível; literal desconhecido sem prefixo symbol: continua texto'],
      ]), '', '## Registry implementado e ocorrências adaptadas','',
      'Contextos reais: paragraph, typographic-field, span-unit e credit-field. Regras de inserção vêm do registry; não há CombatBlock/RuleBlock ativos. A mesma identidade atende editor, leitura e serialização. As ocorrências listadas são adaptações do texto-fonte, não traduções gravadas. [Mapa exato por bloco/linha/span](registry-usage.json).','',
      table(['ID / nome PT-BR','Representação textual','Visual / fonte','Block Types permitidos','Uso adaptado / páginas'],[
       [s['id']+' / '+s['labels']['pt-BR'],s['editorTokens']['pt-BR'],f"SVG fonte p{s['source']['page']}; {len(s['render']['paths'])} paths"+(' / glyph '+s['legacy']['font'] if s.get('legacy') else ''),', '.join(s['allowedBlockTypes']) or 'fixo; sem inserção',f"{len(uses[s['id']])}; "+', '.join(map(str,sorted({o['page'] for o in uses[s['id']]})))] for s in definitions
      ]+[['token.blue-totem / Totem Azul','⟦Totem Azul⟧','Raster circular fonte p83','Todos os contextos de texto','Piloto anterior; source adapter novo não aplicado']]),
      '', '## Todos os grupos de spans detectados','',
      'Número de grupo é apenas endereço do inventário auditado. Para cada ocorrência o JSON contém representação/codepoints, visual (fonte/cor/tamanho/bbox), contexto/significado a confirmar, página/bloco/linha/span, tipo, armazenamento e flags de renderer. Tratamento compartilhado está na matriz acima. Não é correto atribuir um significado único a uma frase inteira só porque contém um label de regra.','',
      table(['Grupo','Fonte / representação atual','Contagem / páginas','Block Types','Tratamento especial encontrado'],[
       [i,g['font']+' / '+g['representation'],str(len(g['occurrences']))+' / '+','.join(map(str,sorted({o['page'] for o in g['occurrences']}))),', '.join(sorted({o['blockType'] for o in g['occurrences']})),', '.join(sorted({key for o in g['occurrences'] for key in o['treatment']})) or 'texto/estilo legado'] for i,g in enumerate(audit['groups'])
      ]), '', '## Imagens candidatas — inventário completo','',
      'Cada digest identifica a imagem fonte; preview, bbox, tamanho, xref e contexto completo estão no inventário. Nenhuma imagem é um item de paleta só por ser pequena. Editor/armazenamento/render seguem a linha imagem/path da matriz comum até revisão semântica.','',
      table(['Grupo / digest','Ocorrências / páginas','Block Types próximos','Primeiro contexto'],[
       [i.__str__()+' / '+g['digest'],str(len(g['occurrences']))+' / '+','.join(map(str,sorted({o['page'] for o in g['occurrences']}))),', '.join(sorted({m['blockType'] for o in g['occurrences'] for m in o['matches']})),g['occurrences'][0]['matches'][0]['context'][:100]] for i,g in enumerate(audit['inlineImageCandidates'])
      ]), '', '## Vetores candidatos — inventário completo','',
      'A assinatura inicial pode representar apenas um círculo/fundo ou uma parte do desenho. O gerador compara os paths completos, incluindo desenho interno e tinta, antes de atribuir um ID. Espada, flecha e símbolo combinado jamais são classificados só pelo círculo preto.','',
      table(['Grupo / assinatura','Ocorrências / páginas','Block Types próximos','Primeiro contexto'],[
       [str(i)+' / '+g['signature'],str(len(g['occurrences']))+' / '+','.join(map(str,sorted({o['page'] for o in g['occurrences']}))),', '.join(sorted({m['blockType'] for o in g['occurrences'] for m in o['matches']})),g['occurrences'][0]['matches'][0]['context'][:100]] for i,g in enumerate(audit['inlineVectorCandidates'])
      ]), '', '## Código anterior auditado','',
      table(['Arquivo','Linhas com convenção/transformação/render especial'],[[r['path'],', '.join(str(h['line']) for h in r['hits'])] for r in audit['codeReferences']]),
      '', 'As linhas acima referem-se ao snapshot antes da implementação, não aos offsets atuais. Não remover helpers legados de arte/PUA ou BlockEditor sem provar que não são consumidores ativos. O codec de símbolos e previews do RichSpanEditor foram centralizados; renderer de arte fonte continua separado por fidelidade.','']
    (OUT/'catalog-and-usage.md').write_text('\n'.join(text),'utf8')
    print(json.dumps(dict(spanGroups=len(audit['groups']),imageGroups=len(audit['inlineImageCandidates']),vectorGroups=len(audit['inlineVectorCandidates']),definitions=len(definitions)+1,adapted=sum(map(len,uses.values())))))

if __name__=='__main__':main()
