// Public-safe sanitizer for lab reports. Allowlist + fail-closed by design:
// emit ONLY the author-curated `public` block, then scan the emitted output
// against the report's registered secrets and THROW if any survives.
//
// The implementation lives in sanitize.core.mjs as plain JS so the lab engine's
// .mjs code can import it without a build step. This module is the TypeScript
// entry point: same behavior, with types attached.

export { sanitize, SanitizationError } from './sanitize.core.mjs';
export type { PublicSnapshot, PrivateReport } from './sanitize.core.mjs';
