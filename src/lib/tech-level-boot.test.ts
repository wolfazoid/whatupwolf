import { describe, expect, test } from 'vitest';
// Vite's `?raw` rather than node:fs — the repo has no @types/node, and this
// keeps `npm run check` clean without adding a dependency for one test.
import BASE from '../layouts/Base.astro?raw';
import { DEFAULT_LEVEL, LEVELS, STORAGE_KEY } from './tech-level';

// The level has to be on <html> before first paint, so Base.astro carries a
// blocking `is:inline` script. Inline means unbundled, which means it cannot
// import from this module — it re-types the storage key and the level ids as
// literals. These tests are the seam: if the vocabulary here changes and the
// boot script doesn't, the restored choice silently stops working (visitors
// get the default on every page load) and nothing else would catch it.
const inlineScript =
  BASE.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1] ?? '';

describe('the pre-paint boot script', () => {
  test('Base.astro has an inline (blocking, unbundled) script', () => {
    expect(inlineScript.trim().length).toBeGreaterThan(0);
  });

  test('reads the same storage key the switch writes', () => {
    expect(inlineScript).toContain(STORAGE_KEY);
  });

  test('recognises every level id', () => {
    for (const level of LEVELS) {
      expect(inlineScript).toContain(`'${level.id}'`);
    }
  });

  test('falls back to the default level', () => {
    expect(inlineScript).toContain(`'${DEFAULT_LEVEL}'`);
  });

  test('sets the attribute the stylesheet switches on', () => {
    expect(inlineScript).toMatch(/dataset\.level\b/);
  });

  test('reveals the switch, which CSS hides until JS confirms it works', () => {
    expect(inlineScript).toMatch(/dataset\.levelSwitch\b/);
  });
});
