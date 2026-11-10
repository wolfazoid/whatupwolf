// Pure string rendering for the /feed page's vanilla client script. Kept
// here (not inline in feed.astro) so the escaping rule is unit-testable —
// everything interpolated into row HTML goes through escapeHtml.
import type { FeedEventOut } from './events';
import { classifyItem } from './forms';

const CH: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => CH[c]);

const FILED_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
export function formatFiledAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : FILED_FMT.format(d);
}

const CLOCK_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false,
});
export const formatClock = (d: Date): string => CLOCK_FMT.format(d);

function itemBadges(items: string[]): string {
  return items
    .map((code) => {
      const def = classifyItem(code);
      const cls = def?.hot
        ? 'text-[var(--color-accent)] border-[var(--color-accent)]'
        : 'text-[var(--color-muted)] border-[var(--color-line)]';
      return `<span class="chrome shrink-0 rounded border px-1 ${cls}" title="${escapeHtml(def?.label ?? `Item ${code}`)}">${escapeHtml(code)}</span>`;
    })
    .join('\n  ');
}

export function renderEvents(events: FeedEventOut[]): string {
  if (!events.length) return '<li class="py-2 chrome">no filings</li>';
  return events
    .map(
      (e) => `<li class="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
  <span class="chrome shrink-0">${escapeHtml(formatFiledAt(e.filedAt))}</span>
  <span class="chrome shrink-0 rounded border border-[var(--color-line)] px-1">${escapeHtml(e.form)}</span>
  ${itemBadges(e.items)}${e.ticker ? `
  <span class="shrink-0 font-[var(--font-mono)] text-[var(--color-accent)]">${escapeHtml(e.ticker)}</span>` : ''}
  <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer"
     class="text-[var(--color-ink)] hover:text-[var(--color-accent)] transition-colors">${escapeHtml(e.company)}</a>
</li>`
    )
    .join('\n');
}
