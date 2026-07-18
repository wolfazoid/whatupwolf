// Public-safe sanitizer for lab reports — the pure implementation, in plain JS
// so engine .mjs code can import it directly. Allowlist + fail-closed by design:
// emit ONLY the author-curated `public` block, then scan the emitted output
// against the report's registered secrets and THROW if any survives.
//
// Types live alongside in sanitize.core.d.mts; src/lib/sanitize.ts re-exports
// this module for TypeScript callers.

export class SanitizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SanitizationError';
  }
}

// Collect every string the report has registered as secret: the client name,
// each registered URL (plus its bare hostname, since a leak often smuggles the
// host without the scheme), and each explicit secret. Empty/blank entries are
// dropped so they can't match trivially against the whole output.
function registeredSecrets(report) {
  const { client, urls = [], secrets = [] } = report.meta;
  const collected = [];
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

export function sanitize(report) {
  // Allowlist: copy ONLY the curated public fields — never `meta`, `findings`,
  // or any stray key — and omit the optional ones when absent so the result
  // never carries undefined keys.
  const { title, summary, body, tags } = report.public;
  const out = { title, summary };
  if (body !== undefined) out.body = body;
  if (tags !== undefined) out.tags = tags;

  // Fail closed: scan each allowlisted field's RAW string value against every
  // registered secret. Scanning JSON.stringify(out) would let a secret that
  // contains `"` or `\` evade the check, because JSON escaping rewrites those
  // characters (`"` -> `\"`, `\` -> `\\`) so the raw secret no longer appears
  // as a substring of the serialized form. The raw values carry no such escaping.
  const rawValues = [out.title, out.summary];
  if (out.body !== undefined) rawValues.push(out.body);
  if (out.tags !== undefined) rawValues.push(...out.tags);
  for (const secret of registeredSecrets(report)) {
    if (rawValues.some((value) => value.includes(secret))) {
      throw new SanitizationError(
        `Refusing to emit: registered secret leaked into public output`,
      );
    }
  }

  return out;
}
