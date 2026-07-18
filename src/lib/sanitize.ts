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

// Collect every string the report has registered as secret: the client name,
// each registered URL (plus its bare hostname, since a leak often smuggles the
// host without the scheme), and each explicit secret. Empty/blank entries are
// dropped so they can't match trivially against the whole output.
function registeredSecrets(report: PrivateReport): string[] {
  const { client, urls = [], secrets = [] } = report.meta;
  const collected: string[] = [];
  if (client) collected.push(client);
  for (const url of urls) {
    if (!url) continue;
    collected.push(url);
    try {
      collected.push(new URL(url).hostname);
    } catch {
      // Not a parseable URL; the raw value above is still registered.
    }
  }
  collected.push(...secrets);
  return collected.map((s) => s.trim()).filter((s) => s.length > 0);
}

export function sanitize(report: PrivateReport): PublicSnapshot {
  // Allowlist: copy ONLY the curated public fields — never `meta`, `findings`,
  // or any stray key — and omit the optional ones when absent so the result
  // never carries undefined keys.
  const { title, summary, body, tags } = report.public;
  const out: PublicSnapshot = { title, summary };
  if (body !== undefined) out.body = body;
  if (tags !== undefined) out.tags = tags;

  // Fail closed: scan the emitted payload against every registered secret and
  // refuse to release it if any survived into a public field.
  const serialized = JSON.stringify(out);
  for (const secret of registeredSecrets(report)) {
    if (serialized.includes(secret)) {
      throw new SanitizationError(
        `Refusing to emit: registered secret leaked into public output`,
      );
    }
  }

  return out;
}
