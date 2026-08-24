// Licensing boundary, not a UI preference — see CLAUDE.md "Hard constraints".
// This module decides which sources reach which deploy. It must fail closed:
// if PUBLIC_FEED is missing or malformed, serve LESS, never more.

export type SourceTier = 'public' | 'private';

export interface SourceDef {
  id: 'edgar' | 'exchange-halts' | 'fed-releases' | 'benzinga';
  tier: SourceTier;
  label: string;
  enabled: boolean;
}

export const SOURCES: readonly SourceDef[] = [
  { id: 'edgar', tier: 'public', label: 'SEC EDGAR filings', enabled: true },
  { id: 'exchange-halts', tier: 'public', label: 'Exchange trading halts', enabled: false },
  { id: 'fed-releases', tier: 'public', label: 'Federal economic releases', enabled: false },
  // Benzinga stream via Alpaca. Licensed for personal consumption only —
  // serving it to visitors is redistribution.
  { id: 'benzinga', tier: 'private', label: 'Benzinga via Alpaca', enabled: false },
];

/**
 * Private-tier sources are served only when PUBLIC_FEED is exactly the
 * string 'false' (the tailnet build sets it; the public deploy sets
 * nothing, and absence IS the public configuration).
 */
export function servableSources(
  publicFeedEnv: string | undefined,
  sources: readonly SourceDef[] = SOURCES
): SourceDef[] {
  const includePrivate = publicFeedEnv === 'false';
  return sources.filter((s) => s.enabled && (s.tier === 'public' || includePrivate));
}
