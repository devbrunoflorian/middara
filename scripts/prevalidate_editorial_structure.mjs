import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeSourcePages } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const pages = [];
const missing = [];
for (let pageNumber = 1; pageNumber <= 102; pageNumber += 1) {
  const pageKey = String(pageNumber).padStart(3, '0');
  const path = resolve(root, `apps/web/public/pages/page_${pageKey}/page_${pageKey}_dom.json`);
  try {
    pages.push(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    missing.push({ page: pageNumber, error: error instanceof Error ? error.message : String(error) });
  }
}
if (missing.length) {
  console.error(`Pré-validação interrompida: ${pages.length}/102 sidecars lidos; ${missing.length} ausentes/inválidos.`);
  for (const entry of missing) console.error(`p.${entry.page}: ${entry.error}`);
  process.exitCode = 1;
} else {
  const report = analyzeSourcePages(pages);
  const pageBlock = (number, id) => report.pages.find(page => page.page === number)?.blocks.find(block => block.blockId === id);
  const calibrations = [
    ['p.14 · Fase 1', pageBlock(14, 'block_15')],
    ['p.14 · IMPORTANT (exceção)', pageBlock(14, 'block_16')],
    ['p.78 · bullet comum', pageBlock(78, 'block_15')],
    ['p.22 · fluxo hierárquico/misto', pageBlock(22, 'block_10')],
    ['p.34 · rótulo vertical rasterizado (falso positivo conhecido)', pageBlock(34, 'block_2645')],
  ];
  console.log('MIDDARA — pré-validação estrutural (sidecars fonte; não equivale a aceite visual/tradução)');
  console.log(`Cobertura: ${report.coverage.pagesRead}/102 páginas · ${report.coverage.blocksExamined} blocos lidos; ${report.renderedBlocksExamined} presentes no Viewer padrão; ${report.counts['not-rendered']} excluídos por PageRenderer.`);
  console.log(`Blocos renderizados por resultado: compatível ${report.counts.compatible}; suspeito ${report.counts.suspect}; revisão estrutural ${report.counts['review-required']}; exceção reconhecida ${report.counts.exception}.`);
  const markerCandidatesByFamily = {};
  for (const page of report.pages) for (const block of page.blocks) {
    if (block.role.includes('list') && block.markerCandidates) {
      markerCandidatesByFamily[block.role] = (markerCandidatesByFamily[block.role] ?? 0) + block.markerCandidates;
    }
  }
  const markerSummary = Object.entries(markerCandidatesByFamily)
    .map(([family, count]) => `${family}=${count}`).join('; ');
  console.log(`Linhas de marcador candidatas em blocos tipo-lista: ${report.markerCandidateRowCount} (${markerSummary || 'nenhuma'}); interseções texto↔texto candidatas: ${report.sourceTextOverlapCandidates.length}.`);
  console.log('Esta contagem agrupa blocos estruturais e não substitui o censo anterior de linhas reais do detector compartilhado.');
  console.log('Famílias de validação (ocorrências de bloco; “compatível” descreve somente a geometria EN do sidecar):');
  for (const [name, counts] of Object.entries(report.familyCounts).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`- ${name}: ${counts.examined} examinados · ${counts.compatible} compatíveis · ${counts.suspect} suspeitos · ${counts['review-required']} revisão necessária · ${counts.exception} exceções · ${counts['not-rendered']} não renderizados`);
  }
  console.log('Calibrações:');
  for (const [label, analysis] of calibrations) {
    console.log(`- ${label}: ${analysis ? `${analysis.status} (${analysis.role})${analysis.reasons.length ? ` — ${analysis.reasons.join('; ')}` : ''}` : 'ocorrência não encontrada'}`);
  }
  const suspectSamples = report.structuralReviewCandidates.filter(item => item.status === 'suspect').slice(0, 8);
  const reviewSamples = report.structuralReviewCandidates.filter(item => item.status === 'review-required').slice(0, 8);
  const overlapSamples = report.sourceTextOverlapCandidates.slice(0, 8);
  const compactNeighbors = report.pages.flatMap(page => page.blocks
    .filter(item => item.role.includes('list') && item.neighborClearancePt !== null && item.neighborClearancePt !== undefined)
    .map(item => ({ page: page.page, item })))
    .sort((a, b) => a.item.neighborClearancePt - b.item.neighborClearancePt)
    .slice(0, 5);
  console.log(`Candidatos geométricos que pedem confronto: ${suspectSamples.length ? suspectSamples.map(item => `p.${item.page}/${item.blockId}`).join(', ') : 'nenhum dentro das tolerâncias do sidecar'}${report.counts.suspect > suspectSamples.length ? '…' : ''}`);
  console.log(`Amostras estruturais inconclusivas: ${reviewSamples.length ? reviewSamples.map(item => `p.${item.page}/${item.blockId} (${item.role})`).join(', ') : 'nenhuma'}${report.counts['review-required'] > reviewSamples.length ? '…' : ''}`);
  console.log(`Interseções texto↔texto em bboxes (candidatas, não defeitos): ${report.sourceTextOverlapCandidates.length}; amostras ${overlapSamples.length ? overlapSamples.map(item => `p.${item.page}/${item.blocks.join('↔')} (${item.overlapXPt}×${item.overlapYPt} pt)`).join(', ') : 'nenhuma'}${report.sourceTextOverlapCandidates.length > overlapSamples.length ? '…' : ''}`);
  console.log(`Interseções de listas com imagens menores que fundo (candidatas a obstáculo; não colisões confirmadas): ${report.artworkObstacleCandidates.length}.`);
  console.log(`Menores espaços lista→próximo bloco no sidecar (triagem, sem limiar de falha): ${compactNeighbors.map(({ page, item }) => `p.${page}/${item.blockId}→${item.nextBlockId} ${item.neighborClearancePt}pt`).join(', ') || 'sem pares comparáveis'}.`);
}
