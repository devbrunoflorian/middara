import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'apps/web/public/translation-review/catalog.json');

if (!fs.existsSync(catalogPath)) {
  console.error(`Catalog not found at: ${catalogPath}`);
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

console.log('=== VERIFYING EDITORIAL CROSS-REFERENCES IN CATALOG ===\n');

let violations = 0;
let approvedLegacy = 0;

let approvedKeys = new Set();
try {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.join(root, 'apps/admin/apps-admin.db');
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    const reviews = db.prepare('SELECT span_key, approval_status FROM translation_reviews').all();
    reviews.filter(r => r.approval_status === 'approved').forEach(r => approvedKeys.add(r.span_key));
    const trans = db.prepare("SELECT span_key FROM translations WHERE language = 'pt-BR'").all();
    trans.forEach(t => {
      approvedKeys.add(t.span_key);
      approvedKeys.add(t.span_key.replace(/__pt-BR$/, ''));
      approvedKeys.add(t.span_key + '__pt-BR');
    });
  }
} catch (e) {
  // DB not accessible
}

for (const proposal of catalog.proposals ?? []) {
  for (const candidate of proposal.candidates ?? []) {
    const text = candidate.proposalText ?? '';
    const source = candidate.sourceText ?? '';
    
    const hasConsulte = /\bconsulte\b/iu.test(text);
    const hasVejaEm = /\bveja\s+em\s+(?:pág|p\.|pg\.|tabela|seção|diagrama|livro)/iu.test(text);
    
    if (hasConsulte || hasVejaEm) {
      const isEditorial = /\bsee\b/iu.test(source) || /\bconsulte\s+([A-ZÀ-Ú][^.,;]+,\s*(?:pág\.|p\.|pg\.)\s*\d+|\w+\s+\d+)/iu.test(text);
      if (isEditorial || hasVejaEm) {
        const isApproved = candidate.editorialStatus === 'approved' 
          || approvedKeys.has(candidate.spanKey) 
          || approvedKeys.has(candidate.spanKey?.replace(/__pt-BR$/, ''))
          || approvedKeys.has(candidate.spanKey + '__pt-BR');
        if (isApproved) {
          approvedLegacy++;
          console.log(`[APPROVED LEGACY] Page ${candidate.pageNumber} | ${candidate.reviewKey}`);
          console.log(`  Source: ${source.slice(0, 100)}`);
          console.log(`  Target: ${text.slice(0, 100)}`);
        } else {
          violations++;
          console.warn(`[VIOLATION - UNAPPROVED] Page ${candidate.pageNumber} | ${candidate.reviewKey}`);
          console.warn(`  Source: ${source}`);
          console.warn(`  Target: ${text}`);
          console.warn(`  Rule: Always use direct "Veja", never "Consulte" or "Veja em".`);
        }
        console.log('');
      }
    }
  }
}

console.log(`Verification Complete:`);
console.log(`  Unapproved violations: ${violations}`);
console.log(`  Approved legacy records flagged for human review: ${approvedLegacy}`);

if (violations > 0) {
  process.exit(1);
} else {
  console.log('All unapproved proposals follow the mandatory "Veja" rule.');
  process.exit(0);
}
