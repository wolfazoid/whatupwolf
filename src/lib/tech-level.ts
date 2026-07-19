// Tech level — the visitor-selectable depth of the site's copy.
//
// The site is static (Astro → Cloudflare), so there is no server and no
// per-visitor LLM call: all three readings of a piece of copy are authored
// ahead of time, shipped together in the HTML, and switched purely by CSS off
// a `data-level` attribute on <html>. This module is the pure core — the
// vocabulary, the fallback rules, and the variant-collapsing — kept out of the
// components so it can be unit-tested without a DOM.

export type TechLevel = 'technical' | 'aware' | 'plain';

export interface LevelDef {
  id: TechLevel;
  /** Shown on the switch itself — mono, lowercase, on-brand. */
  label: string;
  /** Shown as the switch's title/description for the selected level. */
  hint: string;
}

/** Deepest first: the switch reads left-to-right as "turn the detail down". */
export const LEVELS: LevelDef[] = [
  {
    id: 'technical',
    label: 'technical',
    hint: 'Full depth — file names, mechanisms, and trade-offs.',
  },
  {
    id: 'aware',
    label: 'tech-aware',
    hint: 'Concise and competent — what it does, without the internals.',
  },
  {
    id: 'plain',
    label: 'plain',
    hint: 'Plain language — the value of the work, no jargon.',
  },
];

/**
 * The site keeps its current depth for anyone who never touches the switch;
 * choosing a lighter reading is opt-in and remembered.
 */
export const DEFAULT_LEVEL: TechLevel = 'technical';

export const STORAGE_KEY = 'whatupwolf:tech-level';

const LEVEL_IDS: readonly TechLevel[] = LEVELS.map((l) => l.id);

export function isTechLevel(value: unknown): value is TechLevel {
  return typeof value === 'string' && (LEVEL_IDS as readonly string[]).includes(value);
}

/** Anything unrecognised — a corrupt localStorage value, a stale URL — reads
 *  as the default rather than blanking the page. */
export function normalizeLevel(value: unknown): TechLevel {
  return isTechLevel(value) ? value : DEFAULT_LEVEL;
}

/**
 * A piece of copy authored at up to three depths. Only `technical` is
 * required: it is the source the other two are written down from, and the
 * fallback when they haven't been.
 */
export interface LevelText {
  technical: string;
  aware?: string;
  plain?: string;
}

function authored(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? value! : null;
}

/**
 * Fills in the unauthored levels. `plain` steps down to `aware` first (one rung
 * closer than the technical source) and only then to `technical`, so a
 * half-translated entry degrades toward the lightest thing actually written.
 */
export function resolveLevelText(text: LevelText): Record<TechLevel, string> {
  const aware = authored(text.aware) ?? text.technical;
  return {
    technical: text.technical,
    aware,
    plain: authored(text.plain) ?? aware,
  };
}

/** One rendered element: the text, and every level it should be visible at. */
export interface VariantPart {
  levels: TechLevel[];
  text: string;
}

/**
 * Collapses the resolved readings into the minimum set of elements. Copy that
 * is the same at two levels ships once, tagged with both — so untranslated
 * content costs a single element rather than three identical copies.
 */
export function variantParts(text: LevelText): VariantPart[] {
  const resolved = resolveLevelText(text);
  const parts: VariantPart[] = [];
  for (const level of LEVEL_IDS) {
    const existing = parts.find((p) => p.text === resolved[level]);
    if (existing) existing.levels.push(level);
    else parts.push({ levels: [level], text: resolved[level] });
  }
  return parts;
}

/** The `data-variant` value. CSS matches it with `~=` so a part can carry
 *  several levels at once. */
export function variantAttr(levels: TechLevel[]): string {
  return levels.join(' ');
}
