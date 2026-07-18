// TypeScript surface for the plain-JS sanitizer in sanitize.core.mjs.
// These are the canonical sanitizer types; src/lib/sanitize.ts re-exports them.

export interface PublicSnapshot {
  title: string;
  summary: string;
  body?: string;
  tags?: string[];
}

export interface PrivateReport {
  meta: { client?: string; urls?: string[]; secrets?: string[] };
  findings: string;
  public: PublicSnapshot;
}

export declare class SanitizationError extends Error {
  constructor(message: string);
}

export declare function sanitize(report: PrivateReport): PublicSnapshot;
