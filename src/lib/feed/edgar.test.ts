import { describe, expect, it } from 'vitest';
import { parseEdgarAtom, fetchEdgarEvents, EDGAR_USER_AGENT } from './edgar';
import { FIXTURE_ATOM } from './edgar.fixture';

describe('parseEdgarAtom', () => {
  const events = parseEdgarAtom(FIXTURE_ATOM);

  it('parses well-formed entries and skips malformed ones', () => {
    expect(events).toHaveLength(2);
  });

  it('extracts the fields, decoding entities and stripping title decoration', () => {
    expect(events[0]).toEqual({
      id: 'urn:tag:sec.gov,2008:accession-number=0000123456-26-000042',
      source: 'edgar',
      form: '8-K',
      company: 'ACME HOLDINGS & CO',
      cik: '0000123456',
      filedAt: '2026-08-24T12:34:56-04:00',
      url: 'https://www.sec.gov/Archives/edgar/data/123456/000012345626000042-index.htm',
    });
  });

  it('captures the reporting-person CIK on Form 4 entries', () => {
    expect(events[1].cik).toBe('0000987654');
  });

  it('yields an empty cik when the title has no CIK parenthetical', () => {
    const atom = `<feed><entry>
<title>8-K - NO CIK CORP</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/x-index.htm"/>
<updated>2026-08-26T10:00:00-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000000-26-000001</id>
</entry></feed>`;
    const [event] = parseEdgarAtom(atom);
    expect(event.cik).toBe('');
    expect(event.company).toBe('NO CIK CORP');
  });

  it('returns [] on garbage input rather than throwing', () => {
    expect(parseEdgarAtom('')).toEqual([]);
    expect(parseEdgarAtom('<html>not a feed</html>')).toEqual([]);
  });
});

describe('fetchEdgarEvents', () => {
  it('hits getcurrent with the mandatory User-Agent and parses the body', async () => {
    let seenUrl = '';
    let seenUa = '';
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenUa = (init?.headers as Record<string, string>)['User-Agent'];
      return new Response(FIXTURE_ATOM, { status: 200 });
    }) as typeof fetch;

    const events = await fetchEdgarEvents(fetchImpl);
    expect(seenUrl).toContain('action=getcurrent');
    expect(seenUrl).toContain('output=atom');
    expect(seenUa).toBe(EDGAR_USER_AGENT);
    expect(EDGAR_USER_AGENT).toContain('wolf@wearefeasting.com');
    expect(events).toHaveLength(2);
  });

  it('throws on a non-200 so callers can fail the response', async () => {
    const fetchImpl = (async () => new Response('slow down', { status: 429 })) as typeof fetch;
    await expect(fetchEdgarEvents(fetchImpl)).rejects.toThrow('429');
  });

  it('sets the Cloudflare edge-cache hint on the subrequest, so visitor polls do not relay 1:1 to EDGAR', async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      seenInit = init;
      return new Response(FIXTURE_ATOM, { status: 200 });
    }) as typeof fetch;

    await fetchEdgarEvents(fetchImpl);
    expect((seenInit as any).cf).toEqual({ cacheTtl: 60, cacheEverything: true });
  });
});
