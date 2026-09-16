// Trimmed from a real EDGAR filing index page, fetched 2026-08-26:
// https://www.sec.gov/Archives/edgar/data/314203/000110465926101630/0001104659-26-101630-index.htm
// (SEC Accession No. 0001104659-26-101630, an 8-K). The "Items" formGrouping
// below is copied verbatim; surrounding sections are trimmed for brevity but
// keep the real class names and structure. Confirmed shape: each item is its
// own "Item X.XX: <description>" run, joined with <br />, inside a single
// div.info — not the comma/and-joined prose ("items 2.02 and 9.01") seen on
// EDGAR's company filing *list* pages, which parseItemCodes also handles.
export const FIXTURE_INDEX_HTML = `
<div id="contentDiv">
<div class="formDiv">
   <div id="formHeader">
      <div id="formName">
         <strong>Form 8-K</strong> - Current report:
      </div>
      <div id="secNum">
         <strong><acronym title="Securities and Exchange Commission">SEC</acronym> Accession <acronym title="Number">No.</acronym></strong> 0001104659-26-101630
      </div>
   </div>
   <div class="formContent">
      <div class="formGrouping">
         <div class="infoHead">Filing Date</div>
         <div class="info">2026-08-26</div>
         <div class="infoHead">Accepted</div>
         <div class="info">2026-08-26 17:10:18</div>
         <div class="infoHead">Documents</div>
         <div class="info">15</div>
      </div>
      <div class="formGrouping">
         <div class="infoHead">Period of Report</div>
         <div class="info">2026-08-24</div>
      </div>
      <div class="formGrouping">
         <div class="infoHead">Items</div>
         <div class="info">Item 5.02: Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers: Compensatory Arrangements of Certain Officers<br />Item 7.01: Regulation FD Disclosure<br />Item 9.01: Financial Statements and Exhibits<br /></div>
      </div>
      <div style="clear:both"></div>
   </div>
</div>
</div>
`;
