import { describe, expect, it } from 'vitest';
import { parseEdgarAtom } from './edgar';
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
