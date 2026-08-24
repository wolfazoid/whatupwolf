import { servableSources } from './sources';
import { fetchEdgarEvents, type FeedEvent } from './edgar';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * The whole /api/events response, kept out of the Astro route so it can be
 * tested with an injected fetch. The Cache-Control on success is what keeps
 * EDGAR under its rate limit: Cloudflare's edge serves visitor polls for
 * 60s (and stale for 5 min while revalidating), so the origin fetch runs
 * at most about once a minute per colo.
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
