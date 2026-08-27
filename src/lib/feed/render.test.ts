import { describe, expect, it } from 'vitest';
import { escapeHtml, formatFiledAt, renderEvents } from './render';
import type { FeedEvent } from './edgar';

const event = (over: Partial<FeedEvent> = {}): FeedEvent => ({
  id: 'urn:x',
  source: 'edgar',
  form: '8-K',
  company: 'ACME & CO',
  cik: '0000000000',
  filedAt: '2026-08-24T12:34:56-04:00',
  url: 'https://www.sec.gov/Archives/x-index.htm',
  ...over,
});

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<img src=x onerror="alert('&')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;&amp;&#39;)&quot;&gt;'
    );
  });
});

describe('formatFiledAt', () => {
  it('renders in America/Chicago', () => {
    // 12:34:56-04:00 (EDT) is 11:34 in Chicago (CDT).
    expect(formatFiledAt('2026-08-24T12:34:56-04:00')).toContain('11:34');
  });
  it('passes unparseable input through instead of showing Invalid Date', () => {
    expect(formatFiledAt('not-a-date')).toBe('not-a-date');
  });
});

describe('renderEvents', () => {
  it('renders one row per event with form badge and filing link', () => {
    const html = renderEvents([event()]);
    expect(html).toContain('8-K');
    expect(html).toContain('ACME &amp; CO');
    expect(html).toContain('href="https://www.sec.gov/Archives/x-index.htm"');
  });
  it('escapes hostile field content', () => {
    const html = renderEvents([event({ company: '<script>alert(1)</script>' })]);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
  it('renders an empty state, not an empty list', () => {
    expect(renderEvents([])).toContain('no filings');
  });
});
