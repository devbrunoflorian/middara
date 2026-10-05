import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContentsRowFlow } from '../src/components/ContentsRowFlow';
import { contentsRowKey, contentsRowUsesLegacy, contentsRowLine, contentsLeaderWidth, contentsLabelWidth, CONTENTS_LEADER_GAP_PT, type ContentsRowDefinition } from '../src/contentsRows';

const rows:ContentsRowDefinition[]=JSON.parse(readFileSync(new URL('../public/pages/page_003/contents_rows.json',import.meta.url),'utf8')).rows;
const source=JSON.parse(readFileSync(new URL('../public/pages/page_003/page_003_dom.json',import.meta.url),'utf8'));

test('all 40 source labels have independent stable keys and exact fixed destinations',()=>{
  assert.equal(rows.length,40);
  const targets=[4,8,9,10,14,14,21,24,24,27,27,28,30,92,32,33,36,36,37,38,38,38,39,41,46,47,53,56,58,58,68,68,69,72,75,78,79,85,86,101];
  assert.deepEqual(rows.map(r=>r.targetPage),targets);
  for(const lang of ['en','pt-BR'] as const)assert.equal(new Set(rows.map(r=>contentsRowKey(r,lang))).size,40);
  for(const row of rows) {
    const block=source.blocks[row.blockIndex];assert.equal(block.id,row.blockId);
    assert.deepEqual(contentsRowLine(block,row)?.bbox,row.labelBBox);
    assert.ok(row.numberBBox[0]>row.labelBBox[2]);
    assert.ok(row.leader.widthPt===1 || row.leader.widthPt===1.5);
  }
});

test('two persisted unit keys and all single-label block keys remain compatible',()=>{
  assert.equal(contentsRowKey(rows[3],'pt-BR'),'page_3_unit_p3-adventure-mode__pt-BR');
  assert.equal(contentsRowKey(rows[4],'pt-BR'),'page_3_unit_p3-playing-encounters__pt-BR');
  assert.equal(contentsRowKey(rows[2],'en'),'page_3_block_2');
  assert.notEqual(contentsRowKey(rows[0],'en'),contentsRowKey(rows[1],'en'));
  assert.equal(new Set(rows.slice(-3).map(r=>contentsRowKey(r,'pt-BR'))).size,3);
});

test('leaders yield width without moving numbers and stop at zero',()=>{
  const row=rows[0];const snapshot=structuredClone(row);
  const short=contentsLeaderWidth(row,100);const long=contentsLeaderWidth(row,200);
  assert.equal(short-long,100);assert.equal(contentsLeaderWidth(row,2000),0);
  assert.equal(short,contentsLabelWidth(row)-100-CONTENTS_LEADER_GAP_PT);
  assert.equal(contentsLabelWidth(row)+row.labelBBox[0],row.numberBBox[0]-CONTENTS_LEADER_GAP_PT);
  assert.deepEqual(row,snapshot);
});

test('translated row renders its native leader as noneditable decoration, with no page number inside the text',()=>{
  for(const text of ['', 'Resumo dos Componentes', 'Escolhendo um Modo de Jogo 🎲']) {
    const markup=renderToStaticMarkup(createElement(ContentsRowFlow,{
      row:rows[0],scale:2,isAdmin:true,text,
    },createElement('span',null,text)));
    assert.ok(markup.includes('class="contents-row-text"'));
    assert.ok(markup.includes(`aria-hidden="true"`));
    assert.ok(markup.includes(`stroke-dasharray="0 ${rows[0].leader.periodPt*2}"`));
    assert.ok(markup.includes(`stroke-width="${rows[0].leader.widthPt*2}"`));
    assert.ok(!markup.includes('contenteditable'));
    assert.ok(!markup.includes('targetPage'));
  }
});

test('old combined text is preserved as a whole, never split by guessed offsets',()=>{
  assert.equal(contentsRowUsesLegacy(rows.slice(0,2),'pt-BR',key=>key==='page_3_block_1'),true);
  assert.equal(contentsRowUsesLegacy(rows.slice(0,2),'pt-BR',key=>key===contentsRowKey(rows[0],'pt-BR')),false);
  assert.equal(contentsRowUsesLegacy(rows.slice(-4),'pt-BR',key=>key==='page_3_unit_p3-block-41-remaining-size-12pt__pt-BR'),true);
});
