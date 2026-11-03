import type { DdlDialect } from './DiagramModel';

/**
 * A find / replace applied to the generated DDL — for what the generator doesn't cover
 * (e.g. GENERATED ALWAYS instead of BY DEFAULT, SERIAL, extra table options).
 */
export interface DdlReplacement {
  id: string;
  /** Only for this database; unset = every database */
  dialect?: DdlDialect;
  find: string;
  replace: string;
  /** `find` is a regular expression (flags g, m); `replace` may use $1 … */
  regex?: boolean;
  /** Stored only when false */
  enabled?: boolean;
  comment?: string;
}

/** The pattern to search for, or null when the rule is empty or its regular expression is invalid */
export function replacementPattern(rule: Pick<DdlReplacement, 'find' | 'regex'>): RegExp | null {
  if (!rule.find) { return null; }
  try {
    return new RegExp(rule.regex ? rule.find : rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
  } catch {
    return null;
  }
}

/** Applies the enabled rules for the dialect, in order; invalid rules are skipped */
export function applyDdlReplacements(text: string, rules: readonly DdlReplacement[] | undefined, dialect: DdlDialect): string {
  let out = text;
  for (const rule of rules ?? []) {
    if (rule.enabled === false || (rule.dialect && rule.dialect !== dialect)) { continue; }
    const pattern = replacementPattern(rule);
    if (!pattern) { continue; }
    // A literal replacement is taken as is ($ has no special meaning)
    out = rule.regex ? out.replace(pattern, rule.replace) : out.replace(pattern, () => rule.replace);
  }
  return out;
}
