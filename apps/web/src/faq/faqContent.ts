export interface FaqEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
}

/** Concise English summaries of selected entries from the official FAQ. */
export const FAQ_SOURCE_URL = 'https://middara.com/pages/faq';
export const FAQ_REVIEWED_ON = '2026-10-10';

export const EN_FAQ_ENTRIES: FaqEntry[] = [
  {
    id: 'reach-and-flanking',
    category: 'Abilities',
    question: 'How do Reach and flanking work together?',
    answer: 'Reach can put each attacker within Melee range. To flank, another ally must also be able to attack the same target from the opposite side or corner.',
  },
  {
    id: 'reach-break-attacks',
    category: 'Abilities',
    question: 'Can Reach extend a Break Attack?',
    answer: 'No. Reach does not extend Break Attack range; the official FAQ points to Provoke X for attacks made at a stated range.',
  },
  {
    id: 'sinful-privilege-push-pull',
    category: 'Abilities',
    question: 'Whose position controls a push or pull from Sinful Privilege?',
    answer: 'Measure the movement from the figure using Sinful Privilege, rather than from the ally involved in the effect.',
  },
  {
    id: 'illegal-equipped-items',
    category: 'General',
    question: 'What if equipped items no longer form a legal combination?',
    answer: 'End any current Action or Ability, then unequip items until the equipment combination follows the rules again.',
  },
  {
    id: 'unique-item-availability',
    category: 'General',
    question: 'When does an unpurchased Unique Item remain available?',
    answer: 'An unpurchased item remains available when returning to that same Story Round in the current Adventure. A purchased one is not replaced there until a different Story Round.',
  },
];

export interface ResolvedFaqContent {
  entries: FaqEntry[];
  sourceLocale: 'en';
  isFallback: boolean;
}

/** English is the source of truth. No automatic translation is applied. */
export function resolveFaqContent(locale: 'en' | 'pt-BR'): ResolvedFaqContent {
  return { entries: EN_FAQ_ENTRIES, sourceLocale: 'en', isFallback: locale === 'pt-BR' };
}
