import { describe, expect, it } from 'vitest';
import { SOURCES, servableSources, type SourceDef } from './sources';

// Synthetic roster: one enabled per tier, one disabled per tier — so the
// matrix below distinguishes tier gating from enabled gating.
const roster: readonly SourceDef[] = [
  { id: 'edgar', tier: 'public', label: 'EDGAR', enabled: true },
  { id: 'fed-releases', tier: 'public', label: 'Fed releases', enabled: false },
  { id: 'benzinga', tier: 'private', label: 'Benzinga', enabled: true },
  { id: 'exchange-halts', tier: 'private', label: 'pretend-private', enabled: false },
];
const ids = (env: string | undefined) => servableSources(env, roster).map((s) => s.id);

describe('servableSources — fail closed', () => {
  it.each([undefined, '', 'true', 'TRUE', 'False', '0', '1', 'garbage'])(
    'env %j serves the public tier only',
    (env) => expect(ids(env as string | undefined)).toEqual(['edgar'])
  );

  it("exactly 'false' unlocks the private tier", () => {
    expect(ids('false')).toEqual(['edgar', 'benzinga']);
  });

  it('never returns a disabled source in either mode', () => {
    expect(ids(undefined)).not.toContain('fed-releases');
    expect(ids('false')).not.toContain('exchange-halts');
  });
});

describe('the real registry', () => {
  it('defines all four planned sources', () => {
    expect(SOURCES.map((s) => s.id).sort()).toEqual(
      ['benzinga', 'edgar', 'exchange-halts', 'fed-releases']
    );
  });

  it('v1 serves only edgar, in both builds', () => {
    expect(servableSources(undefined).map((s) => s.id)).toEqual(['edgar']);
    expect(servableSources('false').map((s) => s.id)).toEqual(['edgar']);
  });

  it('benzinga is private tier (licensed — personal consumption only)', () => {
    expect(SOURCES.find((s) => s.id === 'benzinga')?.tier).toBe('private');
  });
});
