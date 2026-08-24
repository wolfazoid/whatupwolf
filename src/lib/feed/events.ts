import { servableSources } from './sources';
import { fetchEdgarEvents, type FeedEvent } from './edgar';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * The whole /api/events response, kept out of the Astro route so it can be
 * tested with an injected fetch. The success Cache-Control reaches browsers
 * (15s) and any intermediate caches, but it does NOT put this response in
 * Cloudflare's edge cache — s-maxage on a Worker-generated response has no
 * such effect. The actual EDGAR rate-limit protection is the `cf.cacheTtl`
 * subrequest cache in `fetchEdgarEvents`. These headers are kept for
 * browsers/proxies and for a future non-Worker host.
 */
export async function eventsResponse(
  publicFeedEnv: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  try {
    const batches = await Promise.all(
      servableSources(publicFeedEnv).map((s) =>
        s.id === 'edgar' ? fetchEdgarEvents(fetchImpl) : Promise.resolve<FeedEvent[]>([])
      )
    );
    const events = batches.flat().sort((a, b) => b.filedAt.localeCompare(a.filedAt));
    return new Response(JSON.stringify({ events, asOf: new Date().toISOString() }), {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'upstream source unavailable' }), {
      status: 502,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
    });
  }
}
