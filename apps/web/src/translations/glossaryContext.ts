import officialGlossaryMarkdown from '../../../../docs/translations/glossary.md?raw';
import type { TranslationGlossaryDecision } from '../translationReview';

export interface GlossaryMatch {
  source: string;
  target: string;
}

export interface PersistedGlossaryMatch extends GlossaryMatch {
  status: TranslationGlossaryDecision['decisionStatus'];
  category?: string;
  context?: string;
  conflictWithOfficial?: string;
}

interface GlossaryEntry extends GlossaryMatch {
  normalizedSource: string;
}

function stripMarkdownEmphasis(value: string): string {
  return value
    .trim()
    .replace(/\s*\*[^*]+\*\s*$/g, '')
    .replace(/\s*\([^)]+\)\s*$/g, '')
    .replace(/^\*\*(.*)\*\*$/, '$1')
    .replace(/^`(.*)`$/, '$1')
    .trim();
}

function parseGlossary(markdown: string): GlossaryEntry[] {
  return markdown.split(/\r?\n/).flatMap(line => {
    const cells = line.match(/^\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$/);
    if (!cells || /^:?-{3,}:?$/.test(cells[1]) || /^termo original/i.test(cells[1])) return [];
    const source = stripMarkdownEmphasis(cells[1]);
    const target = stripMarkdownEmphasis(cells[2]);
    if (!source || !target) return [];
    return [{ source, target, normalizedSource: source.toLocaleLowerCase('pt-BR') }];
  });
}

const OFFICIAL_GLOSSARY = parseGlossary(officialGlossaryMarkdown);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find literal EN glossary terms in source text. This does not infer inflections or translate. */
export function findGlossaryMatches(sourceText: string): GlossaryMatch[] {
  const candidates = OFFICIAL_GLOSSARY.flatMap(entry => {
    const expression = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(entry.source)}(?![\\p{L}\\p{N}])`, 'giu');
    const match = expression.exec(sourceText);
    return match ? [{
      start: match.index,
      end: match.index + match[0].length,
      entry,
    }] : [];
  }).sort((left, right) => left.start - right.start
    || right.end - right.start - (left.end - left.start));

  const selected: GlossaryMatch[] = [];
  const seen = new Set<string>();
  let lastEnd = -1;
  for (const candidate of candidates) {
    if (candidate.start < lastEnd || seen.has(candidate.entry.normalizedSource)) continue;
    selected.push({ source: candidate.entry.source, target: candidate.entry.target });
    seen.add(candidate.entry.normalizedSource);
    lastEnd = candidate.end;
  }
  return selected;
}

/** Find exact source phrases in the live Payload decision set; never rewrites text. */
export function findPersistedGlossaryMatches(
  sourceText: string,
  decisions: readonly TranslationGlossaryDecision[],
  officialMatches: readonly GlossaryMatch[] = [],
): PersistedGlossaryMatch[] {
  const candidates = decisions
    .filter(decision => decision.decisionStatus !== 'rejected')
    .flatMap(decision => {
      const flags = decision.semanticMetadata?.category === 'keyword_tag' ? 'gu' : 'giu';
      const expression = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(decision.sourceTerm)}(?![\\p{L}\\p{N}])`, flags);
      const match = expression.exec(sourceText);
      if (!match) return [];
      const official = officialMatches.find(item => item.source.toLocaleLowerCase('pt-BR') === decision.sourceTerm.toLocaleLowerCase('pt-BR'));
      return [{
        start: match.index,
        end: match.index + match[0].length,
        decision,
        conflictWithOfficial: official && official.target.toLocaleLowerCase('pt-BR') !== decision.targetTerm.toLocaleLowerCase('pt-BR')
          ? official.target
          : undefined,
      }];
    })
    .sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start));

  const selected: PersistedGlossaryMatch[] = [];
  const seen = new Set<string>();
  let lastEnd = -1;
  for (const candidate of candidates) {
    const normalized = candidate.decision.sourceTerm.toLocaleLowerCase('pt-BR');
    if (candidate.start < lastEnd || seen.has(normalized)) continue;
    selected.push({
      source: candidate.decision.sourceTerm,
      target: candidate.decision.targetTerm,
      status: candidate.decision.decisionStatus,
      category: candidate.decision.semanticMetadata?.category,
      context: candidate.decision.semanticMetadata?.context,
      conflictWithOfficial: candidate.conflictWithOfficial,
    });
    seen.add(normalized);
    lastEnd = candidate.end;
  }
  return selected;
}
