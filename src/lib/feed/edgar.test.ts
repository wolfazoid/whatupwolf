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
      filedAt: '2026-08-24T12:34:56-04:00',
      url: 'https://www.sec.gov/Archives/edgar/data/123456/000012345626000042-index.htm',
    });
  });

  it('handles the Form 4 reporting-person shape', () => {
    expect(events[1].form).toBe('4');
    expect(events[1].company).toBe('Doe Jane');
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
});
