// Editorial signal config: which forms are material enough to serve, and
// which 8-K items are hot. Deliberately separate from sources.ts — that
// file is the LICENSING boundary (guard-protected); this one is signal
// curation and lives in the normal auto-merge zone.
//
// Form 4 is deliberately absent until direction parsing exists (v3):
// raw Form 4 streams mix 10b5-1 sells and option exercises with real
// buys. 424B5 (priced takedown) is in; 424B2/424B3 (structured-note and
// resale flood) are out — an S-3 is dilution capacity, the 424B5 is the
// trigger.

export const FORM_ALLOWLIST: readonly string[] = [
  '8-K', '8-K/A',
  'SC 13D', 'SC 13D/A',
  'S-3', 'S-3/A', '424B5',
  'NT 10-K', 'NT 10-Q',
  '25', '25-NSE',
];

export function isAllowlisted(form: string): boolean {
  return FORM_ALLOWLIST.includes(form.trim());
}

export interface ItemDef {
  code: string;
  label: string;
  hot: boolean;
}

// Known limitation (documented in the spec): 8.01 is the catch-all where
// material news gets buried precisely because it looks routine. Code-level
// classification cannot catch that; text analysis is a later enrichment.
export const ITEM_DEFS: readonly ItemDef[] = [
  { code: '4.02', label: 'Non-reliance on prior financials (restatement)', hot: true },
  { code: '1.03', label: 'Bankruptcy or receivership', hot: true },
  { code: '5.02', label: 'Executive or director departure/appointment', hot: true },
  { code: '1.01', label: 'Material agreement entered', hot: true },
  { code: '1.02', label: 'Material agreement terminated', hot: true },
  { code: '2.01', label: 'Acquisition or disposition completed', hot: true },
  { code: '2.02', label: 'Earnings release', hot: false },
  { code: '7.01', label: 'Reg FD disclosure', hot: false },
  { code: '8.01', label: 'Other events', hot: false },
  { code: '9.01', label: 'Financial statements and exhibits', hot: false },
];

export function classifyItem(code: string): ItemDef | undefined {
  return ITEM_DEFS.find((d) => d.code === code);
}
