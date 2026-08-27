import { describe, expect, it } from 'vitest';
import { FORM_ALLOWLIST, isAllowlisted, classifyItem, ITEM_DEFS } from './forms';

describe('isAllowlisted', () => {
  it.each(['8-K', '8-K/A', 'SC 13D', 'SC 13D/A', 'S-3', 'S-3/A', '424B5', 'NT 10-K', 'NT 10-Q', '25', '25-NSE'])(
    'allows %s',
    (form) => expect(isAllowlisted(form)).toBe(true)
  );

  it.each(['4', '4/A', '424B2', '424B3', '10-Q', '10-K', 'SC 13G', '13F-HR', 'S-1', ''])(
    'rejects %s',
    (form) => expect(isAllowlisted(form)).toBe(false)
  );

  it('tolerates surrounding whitespace but not partial matches', () => {
    expect(isAllowlisted(' 8-K ')).toBe(true);
    expect(isAllowlisted('8-K12B')).toBe(false);
  });

  it('exports the exact allowlist for the composer and docs', () => {
    expect(FORM_ALLOWLIST).toHaveLength(11);
  });
});

describe('classifyItem', () => {
  it.each(['4.02', '1.03', '5.02', '1.01', '1.02', '2.01'])('marks %s hot', (code) => {
    expect(classifyItem(code)).toMatchObject({ code, hot: true });
  });

  it.each(['2.02', '7.01', '8.01', '9.01'])('marks %s routine', (code) => {
    expect(classifyItem(code)).toMatchObject({ code, hot: false });
  });

  it('returns undefined for unknown codes (renderer falls back to a plain badge)', () => {
    expect(classifyItem('3.01')).toBeUndefined();
  });

  it('gives every item a human label for tooltips', () => {
    for (const def of ITEM_DEFS) expect(def.label.length).toBeGreaterThan(5);
  });
});
