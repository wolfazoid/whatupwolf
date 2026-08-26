// Trimmed from a real browse-edgar?action=getcurrent&output=atom response.
// Third entry is deliberately malformed (no <updated>) and must be skipped.
export const FIXTURE_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Latest Filings - Sun, 24 Aug 2026 12:40:00 EDT</title>
<entry>
<title>8-K - ACME HOLDINGS &amp; CO (0000123456) (Filer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000012345626000042-index.htm"/>
<summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-08-24</summary>
<updated>2026-08-24T12:34:56-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
<id>urn:tag:sec.gov,2008:accession-number=0000123456-26-000042</id>
</entry>
<entry>
<title>4 - Doe Jane (0000987654) (Reporting)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/987654/000098765426000007-index.htm"/>
<summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-08-24</summary>
<updated>2026-08-24T12:30:00-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="4"/>
<id>urn:tag:sec.gov,2008:accession-number=0000987654-26-000007</id>
</entry>
<entry>
<title>10-Q - BROKEN ENTRY INC (0000111111) (Filer)</title>
<category scheme="https://www.sec.gov/" label="form type" term="10-Q"/>
<id>urn:tag:sec.gov,2008:accession-number=0000111111-26-000001</id>
</entry>
</feed>`;
