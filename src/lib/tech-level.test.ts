import { describe, expect, test } from 'vitest';
import {
  DEFAULT_LEVEL,
  LEVELS,
  STORAGE_KEY,
  isTechLevel,
  normalizeLevel,
  resolveLevelText,
  variantAttr,
  variantParts,
} from './tech-level';

describe('level vocabulary', () => {
  test('exposes exactly three levels, deepest first', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['technical', 'aware', 'plain']);
  });

  test('every level carries a label and a hint for the switch UI', () => {
    for (const level of LEVELS) {
      expect(level.label.length).toBeGreaterThan(0);
      expect(level.hint.length).toBeGreaterThan(0);
    }
  });

  test('the default level is the deep technical content', () => {
    expect(DEFAULT_LEVEL).toBe('technical');
  });

  test('the storage key is namespaced to the site', () => {
    expect(STORAGE_KEY).toBe('whatupwolf:tech-level');
  });
});

describe('isTechLevel', () => {
  test('accepts the three known level ids', () => {
    expect(isTechLevel('technical')).toBe(true);
    expect(isTechLevel('aware')).toBe(true);
    expect(isTechLevel('plain')).toBe(true);
  });

  test('rejects anything else', () => {
    expect(isTechLevel('TECHNICAL')).toBe(false);
    expect(isTechLevel('')).toBe(false);
    expect(isTechLevel(null)).toBe(false);
    expect(isTechLevel(undefined)).toBe(false);
    expect(isTechLevel(3)).toBe(false);
  });
});

describe('normalizeLevel', () => {
  test('passes through a valid level', () => {
    expect(normalizeLevel('plain')).toBe('plain');
  });

  test('falls back to the default for junk, so a corrupt localStorage value is harmless', () => {
    expect(normalizeLevel('expert')).toBe(DEFAULT_LEVEL);
    expect(normalizeLevel(null)).toBe(DEFAULT_LEVEL);
  });
});

describe('resolveLevelText', () => {
  test('uses each authored variant when all three are present', () => {
    expect(
      resolveLevelText({ technical: 'deep', aware: 'lighter', plain: 'simple' }),
    ).toEqual({ technical: 'deep', aware: 'lighter', plain: 'simple' });
  });

  test('an unauthored aware variant falls back to the technical source', () => {
    expect(resolveLevelText({ technical: 'deep', plain: 'simple' })).toEqual({
      technical: 'deep',
      aware: 'deep',
      plain: 'simple',
    });
  });

  test('an unauthored plain variant falls back to aware before technical', () => {
    expect(resolveLevelText({ technical: 'deep', aware: 'lighter' })).toEqual({
      technical: 'deep',
      aware: 'lighter',
      plain: 'lighter',
    });
  });

  test('a technical-only source reads the same at every level', () => {
    expect(resolveLevelText({ technical: 'deep' })).toEqual({
      technical: 'deep',
      aware: 'deep',
      plain: 'deep',
    });
  });

  test('an empty-string variant counts as unauthored, not as blank copy', () => {
    expect(resolveLevelText({ technical: 'deep', aware: '   ' }).aware).toBe('deep');
  });
});

describe('variantParts', () => {
  test('emits one part per level when all three differ', () => {
    expect(
      variantParts({ technical: 'deep', aware: 'lighter', plain: 'simple' }),
    ).toEqual([
      { levels: ['technical'], text: 'deep' },
      { levels: ['aware'], text: 'lighter' },
      { levels: ['plain'], text: 'simple' },
    ]);
  });

  test('collapses identical text into a single part carrying both levels', () => {
    expect(variantParts({ technical: 'deep', plain: 'simple' })).toEqual([
      { levels: ['technical', 'aware'], text: 'deep' },
      { levels: ['plain'], text: 'simple' },
    ]);
  });

  test('untranslated copy collapses to one part covering every level', () => {
    expect(variantParts({ technical: 'deep' })).toEqual([
      { levels: ['technical', 'aware', 'plain'], text: 'deep' },
    ]);
  });

  test('non-adjacent levels sharing text still collapse into one part', () => {
    expect(
      variantParts({ technical: 'same', aware: 'different', plain: 'same' }),
    ).toEqual([
      { levels: ['technical', 'plain'], text: 'same' },
      { levels: ['aware'], text: 'different' },
    ]);
  });
});

describe('variantAttr', () => {
  test('renders levels as a space-separated token list for CSS ~= matching', () => {
    expect(variantAttr(['technical', 'aware'])).toBe('technical aware');
  });

  test('a single level renders as a bare token', () => {
    expect(variantAttr(['plain'])).toBe('plain');
  });
});
