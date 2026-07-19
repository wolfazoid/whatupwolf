import { useId, useMemo, useState } from 'react';
import {
  EMPTY_QUERY,
  describeQuery,
  filterLabItems,
  isFiltered,
  tagFacets,
  typeFacets,
  type LabItem,
  type LabQuery,
  type LevelVariants,
} from '../lib/lab-filter';
import { variantAttr, variantParts } from '../lib/tech-level';

export type { LabItem };

/**
 * The island is deliberately level-agnostic: it renders every reading and lets
 * the stylesheet reveal the chosen one. That keeps the visitor's level out of
 * React state entirely — no hydration mismatch, no re-render on switch, and
 * the mechanism stays identical to the static Astro pages.
 */
function Levelled({
  technical,
  levels,
}: {
  technical: string;
  levels?: LevelVariants;
}) {
  return (
    <>
      {variantParts({ technical, ...levels }).map((part) => (
        <span key={part.levels.join(' ')} data-variant={variantAttr(part.levels)}>
          {part.text}
        </span>
      ))}
    </>
  );
}

// Shared field chrome: paper-theme border, mono type, accent focus ring.
const FIELD =
  'chrome rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 ' +
  'text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]';

// Client island: filters the (statically-built) lab feed in the browser.
// The whole page is still pre-rendered — only this component hydrates.
export default function LabFilter({ items }: { items: LabItem[] }) {
  const [query, setQuery] = useState<LabQuery>(EMPTY_QUERY);
  const ids = useId();

  const tags = useMemo(() => tagFacets(items), [items]);
  const types = useMemo(() => typeFacets(items), [items]);
  const shown = useMemo(() => filterLabItems(items, query), [items, query]);

  const patch = (next: Partial<LabQuery>) => setQuery((q) => ({ ...q, ...next }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-[var(--color-line)] pb-4">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label className="chrome" htmlFor={`${ids}-search`}>
            search
          </label>
          <input
            id={`${ids}-search`}
            type="search"
            value={query.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="title or summary…"
            className={`${FIELD} w-full`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="chrome" htmlFor={`${ids}-type`}>
            type
          </label>
          <select
            id={`${ids}-type`}
            value={query.type ?? ''}
            onChange={(e) => patch({ type: e.target.value || null })}
            className={FIELD}
          >
            <option value="">all types</option>
            {types.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
        </div>

        {/* Tags are the engine's own vocabulary (#yaml-safety, #gh-cli). At the
            plain level a 30-long dropdown of them is noise, not a filter — that
            reader gets search and type instead. */}
        <div className="flex flex-col gap-1" data-variant="technical aware">
          <label className="chrome" htmlFor={`${ids}-tag`}>
            tag
          </label>
          <select
            id={`${ids}-tag`}
            value={query.tag ?? ''}
            onChange={(e) => patch({ tag: e.target.value || null })}
            className={FIELD}
          >
            <option value="">all tags</option>
            {tags.map((f) => (
              <option key={f.value} value={f.value}>
                #{f.value} ({f.count})
              </option>
            ))}
          </select>
        </div>

        {isFiltered(query) && (
          <button
            type="button"
            onClick={() => setQuery(EMPTY_QUERY)}
            className="chrome rounded px-2 py-1 underline underline-offset-2 hover:text-[var(--color-ink)]"
          >
            clear
          </button>
        )}
      </div>

      {/* Announced to screen readers as the filters change, so the result of a
          keystroke isn't purely visual. */}
      <p className="chrome mb-2" role="status" aria-live="polite">
        {shown.length} / {items.length} {items.length === 1 ? 'entry' : 'entries'}
        {isFiltered(query) && ` — ${describeQuery(query)}`}
      </p>

      {shown.length === 0 ? (
        <p className="chrome py-4">no entries match {describeQuery(query)}.</p>
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
              <Levelled technical={e.title} levels={e.titleLevels} />
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">
              <Levelled technical={e.summary} levels={e.summaryLevels} />
            </p>
            {e.tags.length > 0 && (
              <div className="chrome mt-2 flex flex-wrap gap-2" data-variant="technical aware">
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
