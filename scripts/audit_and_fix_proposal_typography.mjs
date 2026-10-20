import fs from 'node:fs';
import path from 'node:path';

const Database = (await import('better-sqlite3')).default;
let approvedKeys = new Set();
const dbPath = 'apps/admin/apps-admin.db';
if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  const reviews = db.prepare('SELECT span_key, approval_status FROM translation_reviews').all();
  reviews.filter(r => r.approval_status === 'approved').forEach(r => approvedKeys.add(r.span_key));
  const trans = db.prepare("SELECT span_key FROM translations WHERE language = 'pt-BR'").all();
  trans.forEach(t => approvedKeys.add(t.span_key));
  db.close();
}

const pageCache = new Map();
function getPageDom(pageNumber) {
  if (pageCache.has(pageNumber)) return pageCache.get(pageNumber);
  const pageDir = `page_${String(pageNumber).padStart(3, '0')}`;
  const filePath = path.join('apps/web/public/pages', pageDir, `${pageDir}_dom.json`);
  if (!fs.existsSync(filePath)) {
    pageCache.set(pageNumber, null);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  pageCache.set(pageNumber, data);
  return data;
}

function mapPdfFont(fontName) {
  const name = fontName || '';
  let weight = 400;
  let style = 'normal';
  if (name.includes('ExtraBlack')) weight = 950;
  else if (name.includes('Black')) weight = 900;
  else if (name.includes('DemiBold') || name.includes('Demi')) weight = 600;
  else if (name.includes('Medium')) weight = 500;
  else if (name.includes('Bold')) weight = 700;
  if (name.includes('Italic')) style = 'italic';
  return { weight, style };
}

function getExactUnitSpans(cand, pageNumber) {
  const page = getPageDom(pageNumber);
  if (!page || !Array.isArray(page.blocks)) return [];

  const keyBlockIndex = Number(cand.spanKey?.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u)?.[1]);
  const blockIndex = Number.isInteger(cand.blockIndex)
    ? cand.blockIndex
    : Number.isInteger(keyBlockIndex)
      ? keyBlockIndex
      : cand.sourceBlockId ? page.blocks.findIndex(b => b?.id === cand.sourceBlockId) : -1;

  const sourceBlock = blockIndex >= 0 && blockIndex < page.blocks.length ? page.blocks[blockIndex] : null;
  if (!sourceBlock || !Array.isArray(sourceBlock.lines)) return [];

  const sourceUnitKey = cand.spanKey?.match(/^page_\d+_unit_(.+?)(?:__pt-BR)?$/u)?.[1];
  const sourceUnitId = cand.sourceUnitId ?? sourceUnitKey;
  const sourceUnit = sourceUnitId && Array.isArray(sourceBlock?.typographicUnits)
    ? sourceBlock.typographicUnits.find(unit => unit?.id === sourceUnitId)
    : null;

  if (sourceUnit && Array.isArray(sourceUnit.spanRefs)) {
    const spans = [];
    for (const line of sourceBlock.lines) {
      if (!Array.isArray(line.spans)) continue;
      line.spans.forEach((span, idx) => {
        const ref = `${line.id}:${span.sourceSpanIndex ?? idx}`;
        if (sourceUnit.spanRefs.includes(ref) && !span.renderOnlyStrokePass) {
          spans.push(span);
        }
      });
    }
    if (spans.length > 0) return spans;
  }

  return sourceBlock.lines.flatMap(l => (l.spans || []).filter(s => !s.renderOnlyStrokePass));
}

const proposalsDir = 'docs/translations/proposals';
const proposalFiles = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));

let totalAnalyzed = 0;
let totalFixedFullBold = 0;
let totalFixedPrefixBold = 0;
let totalAmbiguousFlagged = 0;
let totalSkippedApproved = 0;

for (const file of proposalFiles) {
  const filePath = path.join(proposalsDir, file);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const pageNumber = Number(json.page ?? file.match(/page-(\d+)/iu)?.[1]);
  if (!pageNumber || !Array.isArray(json.candidates)) continue;

  let fileModified = false;

  for (const cand of json.candidates) {
    totalAnalyzed++;
    const spanKey = cand.spanKey ?? cand.spanKeys?.[0] ?? cand.candidate?.spanKey;
    if (!spanKey) continue;

    const isApproved = approvedKeys.has(spanKey) || cand.editorialStatus === 'approved';
    const sourceSpans = getExactUnitSpans({ ...cand, spanKey }, pageNumber);
    const targetData = cand.data ?? cand.candidate?.data;
    const targetSegments = targetData?.segments;

    if (!Array.isArray(sourceSpans) || sourceSpans.length === 0 || !Array.isArray(targetSegments) || targetSegments.length === 0) continue;

    const sourceWeights = sourceSpans.map(s => s.renderWeightOverride ?? mapPdfFont(s.font).weight);
    const sourceMinWeight = Math.min(...sourceWeights);
    const sourceMaxWeight = Math.max(...sourceWeights);
    const targetMaxWeight = Math.max(...targetSegments.map(s => s.weight));

    // Case 1: Entire source unit is bold (e.g. titles, headers), but target has NO bold segments
    if (sourceMinWeight >= 600 && targetMaxWeight < 600) {
      if (isApproved) {
        totalSkippedApproved++;
      } else {
        // Fix target segments
        for (const seg of targetSegments) {
          seg.weight = sourceMaxWeight;
          if (sourceSpans[0].font.includes('Cinzel')) {
            seg.font = sourceSpans[0].font;
          } else if (sourceSpans[0].font.includes('Optima') && !seg.font.includes('Bold')) {
            seg.font = sourceMaxWeight >= 700 ? 'OptimaLTStd-Bold' : 'OptimaLTStd-Demi';
          }
        }
        totalFixedFullBold++;
        fileModified = true;
      }
      continue;
    }

    // Case 2: Colon prefix bold
    const sourceText = String(cand.sourceText ?? '');
    const proposalText = String(cand.proposalText ?? cand.proposedText ?? '');
    const sourceColonIdx = sourceText.indexOf(':');
    const targetColonIdx = proposalText.indexOf(':');

    if (sourceColonIdx > 0 && targetColonIdx > 0 && sourceColonIdx < 60 && targetColonIdx < 60) {
      let sourcePrefixLen = 0;
      let sourcePrefixSpans = [];
      for (const s of sourceSpans) {
        if (sourcePrefixLen <= sourceColonIdx) sourcePrefixSpans.push(s);
        sourcePrefixLen += (s.displayOverride || s.text).length;
      }
      const prefixIsBold = sourcePrefixSpans.length > 0 && sourcePrefixSpans.every(s => (s.renderWeightOverride ?? mapPdfFont(s.font).weight) >= 600);
      if (prefixIsBold) {
        let targetPrefixLen = 0;
        let targetPrefixSegments = [];
        for (const seg of targetSegments) {
          if (targetPrefixLen <= targetColonIdx) targetPrefixSegments.push(seg);
          targetPrefixLen += seg.text.length;
        }
        const targetPrefixIsBold = targetPrefixSegments.length > 0 && targetPrefixSegments.every(s => s.weight >= 600);
        if (!targetPrefixIsBold && !isApproved && targetSegments.length === 1) {
          // Safe split of the single segment at targetColonIdx + 1
          const seg0 = targetSegments[0];
          const prefixText = seg0.text.slice(0, targetColonIdx + 1);
          const remainderText = seg0.text.slice(targetColonIdx + 1);

          targetSegments.length = 0;
          targetSegments.push({
            ...seg0,
            text: prefixText,
            weight: 700,
            font: seg0.font.includes('Optima') ? 'OptimaLTStd-Bold' : seg0.font,
          });
          if (remainderText) {
            targetSegments.push({
              ...seg0,
              text: remainderText,
              weight: 400,
              font: seg0.font.includes('Bold') ? 'OptimaLTStd' : seg0.font,
            });
          }
          totalFixedPrefixBold++;
          fileModified = true;
          continue;
        }
      }
    }

    // Case 3: Ambiguous mixed styles (flag for human review)
    const sourceHasMixed = sourceWeights.some(w => w >= 600) && sourceWeights.some(w => w < 600);
    const targetHasSingle = new Set(targetSegments.map(s => s.weight)).size === 1;
    if (sourceHasMixed && targetHasSingle && !isApproved) {
      if (!Array.isArray(cand.pendingTerms)) cand.pendingTerms = [];
      const pendingFlag = 'Pendência tipográfica: original EN possui formatação mista (negrito/itálico parcial) que requer conferência visual humana no editor.';
      if (!cand.pendingTerms.includes(pendingFlag)) {
        cand.pendingTerms.push(pendingFlag);
        totalAmbiguousFlagged++;
        fileModified = true;
      }
    }
  }

  if (fileModified) {
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }
}

console.log('=== AUDIT & SAFE CORRECTIONS FINISHED ===');
console.log('Total candidates analyzed:', totalAnalyzed);
console.log('Fixed Full-Block Bold headings/titles (unapproved):', totalFixedFullBold);
console.log('Fixed Colon-Prefix Bold steps/sections (unapproved):', totalFixedPrefixBold);
console.log('Ambiguous mixed-style cases flagged for human review:', totalAmbiguousFlagged);
console.log('Approved translations with divergence skipped (held for human review):', totalSkippedApproved);
