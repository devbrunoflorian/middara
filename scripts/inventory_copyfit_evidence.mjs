// Read-only inventory of Copyfit V3 evidence for active proposal candidates.
// Classifies each active candidate as: complete, missing_counts, missing_geometry,
// or reusable/stale (older version of the same family has counts for the same unit).
// Usage: node scripts/inventory_copyfit_evidence.mjs [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/translation-review/catalog.json'), 'utf8'));
const queue = JSON.parse(fs.readFileSync(path.join(root, 'docs/translations/localization-exceptions.json'), 'utf8'));

const canon = v => Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
    : JSON.stringify(v);
const hash = v => createHash('sha256').update(canon(v)).digest('hex');
const familyPath = p => p.replace(/(?:-\d{4}-\d{2}-\d{2})?(?:-v\d+(?:-corrected)?)?\.json$/iu, '.json');
const counts = c => {
  const s = Number(c.sourcePdfVisualLineCount ?? c.copyfitMeasurement?.sourcePdfVisualLineCount);
  const t = Number(c.pageRendererVisualLineCount ?? c.copyfitMeasurement?.pageRendererVisualLineCount);
  return Number.isInteger(s) && s > 0 && Number.isInteger(t) && t > 0 ? { s, t } : null;
};

// Index every historical proposal file by family.
const history = new Map();
for (const rel of queue.sourceProposals ?? []) {
  if (!rel.toLowerCase().endsWith('.json')) continue;
  const abs = path.resolve(root, rel);
  if (!fs.existsSync(abs)) continue;
  let doc; try { doc = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { continue; }
  if (!Array.isArray(doc.candidates)) continue;
  const fam = familyPath(rel).replaceAll('\\', '/');
  if (!history.has(fam)) history.set(fam, []);
  history.get(fam).push({ rel: rel.replaceAll('\\', '/'), doc });
}

const result = { complete: [], missingCounts: [], missingGeometry: [], reusable: [], staleOnly: [] };
for (const proposal of catalog.proposals) {
  const fam = familyPath(proposal.proposalFile).replaceAll('\\', '/');
  const older = (history.get(fam) ?? []).filter(h => h.rel !== proposal.proposalFile);
  for (const c of proposal.candidates) {
    const id = { reviewKey: c.reviewKey, page: c.pageNumber, spanKey: c.spanKey, file: c.proposalFile };
    const hasCounts = c.copyfitSourcePdfLineCount && c.copyfitPageRendererLineCount;
    if (hasCounts && c.copyfitMeasurementFingerprint) { result.complete.push(id); continue; }
    if (hasCounts) { result.missingGeometry.push(id); continue; }
    // Look for older evidence for the same span.
    const prior = [];
    for (const h of older) {
      for (const oc of h.doc.candidates) {
        const key = String(oc.spanKey ?? oc.spanKeys?.[0] ?? '');
        if (key !== c.spanKey || !counts(oc)) continue;
        const same = {
          sourceText: String(oc.sourceText ?? '') === c.sourceText,
          proposalText: String(oc.proposalText ?? oc.proposedText ?? '') === c.proposalText,
          data: oc.data && hash(oc.data) === hash(c.data ?? null) || false,
          sourceBlockId: (oc.sourceBlockId ?? null) === c.sourceBlockId,
          sourceUnitId: (oc.sourceUnitId ?? null) === c.sourceUnitId,
          bboxes: hash(oc.sourceBboxes ?? []) === hash(c.sourceBboxes ?? []),
        };
        prior.push({ from: h.rel, counts: counts(oc), same, identical: Object.values(same).every(Boolean) });
      }
    }
    if (prior.length === 0) result.missingCounts.push(id);
    else if (prior.some(p => p.identical)) result.reusable.push({ ...id, prior });
    else result.staleOnly.push({ ...id, prior });
  }
}

const summary = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length]));
console.log('Active candidates:', catalog.candidateCount);
console.log(summary);
const byPage = {};
for (const k of ['missingCounts', 'staleOnly', 'reusable', 'missingGeometry']) {
  for (const i of result[k]) { byPage[i.page] ??= {}; byPage[i.page][k] = (byPage[i.page][k] ?? 0) + 1; }
}
console.log('Pages with gaps:', Object.keys(byPage).length);
const out = process.argv.indexOf('--json');
if (out > 0) fs.writeFileSync(path.resolve(root, process.argv[out + 1]), JSON.stringify({ summary, byPage, result }, null, 1));
