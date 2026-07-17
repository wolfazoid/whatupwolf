import { useMemo, useState } from 'react';

// A serializable view of a lab entry — the Astro page passes plain objects
// (no Date instances) so this island can be sent across the SSR→client boundary.
export interface LabItem {
  id: string;
  title: string;
  ts: string;
  type: string;
  status: string;
  tags: string[];
  live: boolean;
  summary: string;
}

// Client island: filters the (statically-built) lab feed by tag, in the browser.
// The whole page is still pre-rendered — only this component hydrates.
export default function LabFilter({ items }: { items: LabItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  const allTags = useMemo(
    () => [...new Set(items.flatMap((i) => i.tags))].sort(),
    [items],
  );

  const shown = active ? items.filter((i) => i.tags.includes(active)) : items;

  const chip = (label: string, selected: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`chrome rounded px-2 py-0.5 transition-colors ${
        selected
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
          : 'hover:text-[var(--color-ink)]'
      }`}
    >
      {label === 'all' ? 'all' : `#${label}`}
    </button>
  );

  return (
    <div>
      <div className="chrome mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[var(--color-muted)]">filter:</span>
        {chip('all', active === null, () => setActive(null))}
        {allTags.map((t) => chip(t, active === t, () => setActive(t)))}
      </div>

      {shown.length === 0 ? (
        <p className="chrome py-4">no entries match #{active}.</p>
      ) : (
        shown.map((e) => (
          <a
            key={e.id}
            href={`/lab/${e.id}`}
            className="group block border-b border-[var(--color-line)] py-4"
          >
            <div className="chrome flex items-center gap-2">
              {e.live && <span className="live-dot" title="live — just updated" />}
              <span>{e.ts}</span>
              <span className="text-[var(--color-accent)]">[{e.type}]</span>
              <span>status: {e.status}</span>
            </div>
            <h3 className="mt-1 font-semibold tracking-tight transition-colors group-hover:text-[var(--color-accent)]">
              {e.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">
              {e.summary}
            </p>
            {e.tags.length > 0 && (
              <div className="chrome mt-2 flex flex-wrap gap-2">
                {e.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            )}
          </a>
        ))
      )}
    </div>
  );
}
