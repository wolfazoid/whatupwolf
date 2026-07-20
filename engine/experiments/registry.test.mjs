import { describe, it, expect } from 'vitest';
import { EXPERIMENTS } from './registry.mjs';

// The registry is hand-edited data that the runner trusts without validating: a
// typo'd `kind` silently falls through to the digest pipeline, a `type` outside
// the content-collection enum only fails much later at `astro check`, and a
// monitor with no `target` reaches its probe as `probe(undefined)`. These assert
// the shape at test time instead, where a bad entry costs seconds not a run.
const KINDS = ['digest', 'monitor'];
// Mirrors the `type` enum in src/content.config.ts.
const TYPES = ['experiment', 'briefing', 'monitor', 'note', 'digest'];

describe('EXPERIMENTS registry', () => {
  it('is non-empty', () => {
    expect(Object.keys(EXPERIMENTS).length).toBeGreaterThan(0);
  });

  for (const [name, cfg] of Object.entries(EXPERIMENTS)) {
    describe(name, () => {
      it('has a kind the runner knows how to run', () => {
        expect(KINDS).toContain(cfg.kind);
      });
      it('has a type in the lab content enum', () => {
        expect(TYPES).toContain(cfg.type);
      });
      it('has a non-empty titlePrefix', () => {
        expect(typeof cfg.titlePrefix).toBe('string');
        expect(cfg.titlePrefix.length).toBeGreaterThan(0);
      });
      it('names a target when it is a monitor', () => {
        if (cfg.kind !== 'monitor') return;
        expect(typeof cfg.target).toBe('string');
        expect(cfg.target.length).toBeGreaterThan(0);
      });
    });
  }
});
