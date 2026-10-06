import {
  getDefaultSymbolAliasPreferences,
  getEditorAliasConflicts,
  getSemanticSymbol,
  normalizeEditorAlias,
  type SymbolAliasPreferences,
} from './semanticSymbols';

const SETTINGS_URL = 'http://localhost:3000/api/symbol-alias-settings';
const SETTINGS_KEY = 'shared';

export interface SymbolAliasSettingsLoad {
  preferences: SymbolAliasPreferences;
  available: boolean;
  saved: boolean;
}

interface SymbolAliasSettingsDoc {
  id?: string | number;
  settingsKey?: string;
  aliases?: unknown;
}

function normalizePreferences(value: unknown): SymbolAliasPreferences {
  const defaults = getDefaultSymbolAliasPreferences();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const normalized = { ...defaults };
  for (const [id, rawAlias] of Object.entries(value)) {
    if (!getSemanticSymbol(id) || !defaults[id] || typeof rawAlias !== 'string') continue;
    const alias = normalizeEditorAlias(rawAlias);
    if (alias) normalized[id] = alias;
  }
  return normalized;
}

async function findSettings(): Promise<{ response: Response; doc: SymbolAliasSettingsDoc | undefined }> {
  const query = new URLSearchParams({ 'where[settingsKey][equals]': SETTINGS_KEY, limit: '1' });
  const response = await fetch(`${SETTINGS_URL}?${query}`);
  if (!response.ok) return { response, doc: undefined };
  const result = await response.json() as { docs?: SymbolAliasSettingsDoc[] };
  return { response, doc: result.docs?.[0] };
}

export async function loadSymbolAliasSettings(): Promise<SymbolAliasSettingsLoad> {
  try {
    const { response, doc } = await findSettings();
    if (!response.ok) return { preferences: getDefaultSymbolAliasPreferences(), available: false, saved: false };
    return {
      preferences: normalizePreferences(doc?.aliases),
      available: true,
      saved: !!doc,
    };
  } catch {
    return { preferences: getDefaultSymbolAliasPreferences(), available: false, saved: false };
  }
}

export type SymbolAliasSaveResult =
  | { ok: true; preferences: SymbolAliasPreferences }
  | { ok: false; reason: 'invalid' | 'conflict' | 'unavailable' | 'save-failed' | 'verification-failed'; aliases?: string[] };

export async function saveSymbolAliasSettings(preferences: SymbolAliasPreferences): Promise<SymbolAliasSaveResult> {
  const normalized = normalizePreferences(preferences);
  const invalid = Object.entries(preferences).some(([id, alias]) => !getSemanticSymbol(id) || !normalizeEditorAlias(alias));
  if (invalid) return { ok: false, reason: 'invalid' };
  const conflicts = getEditorAliasConflicts(normalized);
  if (conflicts.length) return { ok: false, reason: 'conflict', aliases: conflicts };

  try {
    const { response: lookupResponse, doc } = await findSettings();
    if (!lookupResponse.ok) return { ok: false, reason: 'unavailable' };
    const payload = { settingsKey: SETTINGS_KEY, aliases: normalized };
    const writeResponse = doc?.id !== undefined
      ? await fetch(`${SETTINGS_URL}/${encodeURIComponent(String(doc.id))}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
      : await fetch(SETTINGS_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
    if (!writeResponse.ok) return { ok: false, reason: 'save-failed' };

    // Verify durability with a fresh read so the UI only announces a saved alias
    // after Payload returns the same preferred value from its database record.
    const verified = await loadSymbolAliasSettings();
    if (!verified.available || !verified.saved
      || Object.entries(normalized).some(([id, alias]) => verified.preferences[id] !== alias)) {
      return { ok: false, reason: 'verification-failed' };
    }
    return { ok: true, preferences: verified.preferences };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
