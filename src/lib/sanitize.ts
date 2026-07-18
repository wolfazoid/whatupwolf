// Public-safe sanitizer for lab reports. Allowlist + fail-closed by design:
// emit ONLY the author-curated `public` block, then scan the emitted output
// against the report's registered secrets and THROW if any survives.
//
// NOTE: the body of `sanitize` is intentionally a stub. It is implemented by
// the lab engine itself as the first backlog item (see engine/BACKLOG.md).
// The failing tests in sanitize.test.ts define exactly what it must satisfy.

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

export class SanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SanitizationError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function sanitize(report: PrivateReport): PublicSnapshot {
  throw new Error('NotImplemented: sanitize() — to be built by the lab engine');
}
